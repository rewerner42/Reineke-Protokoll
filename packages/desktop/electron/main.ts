import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runMigrations,
  MeetingRepository,
  TranscriptRepository,
  ProtocolRepository,
  SpeakerRepository,
  ProtocolGenerator,
  createLLMProvider,
  renderProtocolMarkdown,
  assignSpeakerLabels,
} from '@reineke/shared';
import { BetterSqliteAdapter } from './services/BetterSqliteAdapter.js';
import { SettingsService } from './services/SettingsService.js';
import { WhisperService } from './services/WhisperService.js';
import { DiarizationService } from './services/DiarizationService.js';
import type {
  DiarizationStatus,
  IpcContract,
  WhisperModelInfo,
} from './types/ipc-contract.js';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

interface AppContext {
  db: BetterSqliteAdapter;
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  protocols: ProtocolRepository;
  speakers: SpeakerRepository;
  settings: SettingsService;
  whisper: WhisperService;
  diarization: DiarizationService;
  mainWindow: BrowserWindow | null;
}

let ctx: AppContext | null = null;

async function createMainWindow(context: AppContext): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  context.mainWindow = win;
  return win;
}

async function setupContext(): Promise<AppContext> {
  const userDataDir = app.getPath('userData');
  const dbPath = path.join(userDataDir, 'reineke.sqlite');
  const settingsPath = path.join(userDataDir, 'settings.json');
  const audioDir = path.join(userDataDir, 'recordings');
  const modelsDir = path.join(userDataDir, 'whisper-models');
  const diarizationModelsDir = path.join(userDataDir, 'diarization-models');

  const db = new BetterSqliteAdapter(dbPath);
  runMigrations(db);

  const meetingsRepo = new MeetingRepository(db);
  recoverOrphanedRecordings(meetingsRepo);

  const settingsService = new SettingsService(settingsPath);
  const settings = await settingsService.get();

  const whisper = new WhisperService({
    modelSize: settings.whisperModelSize,
    modelsDir,
    audioDir,
    language: settings.language,
  });

  const diarization = new DiarizationService({ modelsDir: diarizationModelsDir });

  return {
    db,
    meetings: meetingsRepo,
    transcripts: new TranscriptRepository(db),
    protocols: new ProtocolRepository(db),
    speakers: new SpeakerRepository(db),
    settings: settingsService,
    whisper,
    diarization,
    mainWindow: null,
  };
}

function recoverOrphanedRecordings(meetings: MeetingRepository): void {
  for (const m of meetings.list()) {
    if (m.status === 'recording' || m.status === 'diarizing') {
      try {
        meetings.update(m.id, {
          status: 'completed',
          endedAt: m.endedAt ?? m.updatedAt,
        });
      } catch (err) {
        console.error(`Konnte verwaiste Aufnahme ${m.id} nicht aufräumen:`, err);
      }
    }
  }
}

function registerIpc(context: AppContext): void {
  const handle = <K extends keyof IpcContract, M extends keyof IpcContract[K]>(
    channel: `${K & string}:${M & string}`,
    fn: (...args: unknown[]) => unknown,
  ) => {
    ipcMain.handle(channel, async (_event, ...args) => fn(...args));
  };

  // Meetings
  handle('meetings:create', async (input) => {
    const { title } = input as { title: string };
    return context.meetings.create({ title });
  });
  handle('meetings:list', async () => context.meetings.list());
  handle('meetings:get', async (id) => context.meetings.get(id as string));
  handle('meetings:delete', async (id) => {
    context.meetings.delete(id as string);
  });

  // Recording
  handle('recording:start', async (meetingId) => {
    const id = meetingId as string;
    await context.whisper.startMeeting(id);
    context.meetings.update(id, { status: 'recording' });
  });
  handle('recording:pushAudioChunk', async (meetingId, pcm16) => {
    await context.whisper.pushChunk(meetingId as string, Buffer.from(pcm16 as ArrayBuffer));
  });
  handle('recording:stop', async (meetingId) => {
    const id = meetingId as string;
    let result: Awaited<ReturnType<WhisperService['stopMeeting']>> | undefined;
    let stopError: unknown;
    try {
      result = await context.whisper.stopMeeting(id);
    } catch (err) {
      stopError = err;
      console.error(`recording:stop fehlgeschlagen für ${id}:`, err);
    }

    const audioPath = result?.audioPath ?? null;
    const settings = await context.settings.get();
    const willDiarize = audioPath !== null && settings.diarizationEnabled;

    context.meetings.update(id, {
      status: willDiarize ? 'diarizing' : 'completed',
      endedAt: new Date().toISOString(),
      audioPath,
      language: result?.detectedLanguage ?? null,
    });

    if (willDiarize) {
      void runDiarizationInBackground(context, id, audioPath as string);
    }

    if (stopError) throw stopError;
    return { audioPath };
  });

  // Whisper -> Renderer events + Persistierung
  context.whisper.on('segment', (segment) => {
    context.transcripts.insert({
      meetingId: segment.meetingId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      speakerLabel: segment.speakerLabel,
      isFinal: segment.isFinal,
    });
    context.mainWindow?.webContents.send('transcription:segment', segment);
  });
  context.whisper.on('language-detected', (info) => {
    const meeting = context.meetings.get(info.meetingId);
    if (meeting && meeting.language === null) {
      context.meetings.update(info.meetingId, { language: info.language });
    }
  });

  // Transcription
  handle('transcription:listForMeeting', async (meetingId) =>
    context.transcripts.listForMeeting(meetingId as string),
  );

  // Speakers
  handle('speakers:listForMeeting', async (meetingId) =>
    context.speakers.listForMeeting(meetingId as string),
  );
  handle('speakers:rename', async (meetingId, rawLabel, displayName) => {
    const trimmed = (displayName as string).trim();
    if (trimmed.length === 0) {
      context.speakers.delete(meetingId as string, rawLabel as string);
    } else {
      context.speakers.upsert(meetingId as string, rawLabel as string, trimmed);
    }
  });

  // Protocol
  handle('protocol:generate', async (meetingId) => {
    const id = meetingId as string;
    const settings = await context.settings.get();
    const apiKey = await context.settings.getApiKey(settings.llmProvider);
    if (!apiKey) {
      throw new Error(
        `Kein API-Key für ${settings.llmProvider} hinterlegt — bitte in den Einstellungen ergänzen.`,
      );
    }
    const provider = createLLMProvider({
      name: settings.llmProvider,
      apiKey,
      model: settings.llmProvider === 'claude' ? settings.claudeModel : settings.openaiModel,
    });
    const fallbackLanguage = settings.language === 'en' ? 'en' : 'de';
    const generator = new ProtocolGenerator({
      meetings: context.meetings,
      transcripts: context.transcripts,
      protocols: context.protocols,
      speakers: context.speakers,
      provider,
      fallbackLanguage,
    });
    return generator.generate(id);
  });
  handle('protocol:get', async (meetingId) =>
    context.protocols.getByMeetingId(meetingId as string),
  );
  handle('protocol:updateMarkdown', async (protocolId, markdown) => {
    context.protocols.updateMarkdown(protocolId as string, markdown as string);
  });
  handle('protocol:setTodoDone', async (todoId, done) => {
    context.protocols.setTodoDone(todoId as string, done as boolean);
  });
  handle('protocol:exportMarkdown', async (protocolId) => {
    const id = protocolId as string;
    const protocol = findProtocolById(context, id);
    if (!protocol) return null;
    const meeting = context.meetings.get(protocol.meetingId);
    if (!meeting) return null;
    const markdown = renderProtocolMarkdown(protocol, meeting);
    const result = await dialog.showSaveDialog(context.mainWindow ?? undefined as never, {
      title: 'Protokoll exportieren',
      defaultPath: `${meeting.title.replace(/\s+/g, '-')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, markdown, 'utf8');
    return { path: result.filePath };
  });

  // Settings
  handle('settings:get', async () => context.settings.get());
  handle('settings:set', async (patch) => {
    const newSettings = await context.settings.set(patch as never);
    return newSettings;
  });
  handle('settings:setApiKey', async (provider, key) => {
    await context.settings.setApiKey(provider as never, key as string);
  });
  handle('settings:hasApiKey', async (provider) =>
    context.settings.hasApiKey(provider as never),
  );

  // Whisper-Modelle
  handle('whisperModel:list', async (): Promise<WhisperModelInfo[]> => {
    const sizes: WhisperModelInfo[] = (['tiny', 'base', 'small', 'medium'] as const).map(
      (size) => ({
        size,
        downloaded: false,
        filePath: null,
        approxMb:
          size === 'tiny' ? 39 : size === 'base' ? 74 : size === 'small' ? 244 : 769,
      }),
    );
    return sizes;
  });
  handle('whisperModel:download', async () => {
    // nodejs-whisper lädt Modelle automatisch beim ersten Aufruf; expliziter
    // Download bleibt als Hook für künftige Erweiterungen.
  });
}

async function runDiarizationInBackground(
  context: AppContext,
  meetingId: string,
  audioPath: string,
): Promise<void> {
  sendDiarizationStatus(context, { meetingId, state: 'started' });
  try {
    const available = await context.diarization.isAvailable();
    if (!available) {
      console.warn(
        `Diarization für ${meetingId} übersprungen — sherpa-onnx-node oder Modelle fehlen.`,
      );
      context.meetings.update(meetingId, { status: 'completed' });
      sendDiarizationStatus(context, { meetingId, state: 'skipped' });
      return;
    }

    const spans = await context.diarization.diarize(audioPath);
    const segments = context.transcripts.listForMeeting(meetingId).filter((s) => s.isFinal);
    const updates = assignSpeakerLabels(
      segments.map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs })),
      spans,
    );
    context.transcripts.updateSpeakerLabels(updates);

    context.meetings.update(meetingId, { status: 'completed' });
    sendDiarizationStatus(context, { meetingId, state: 'completed' });
  } catch (err) {
    console.error(`Diarization fehlgeschlagen für ${meetingId}:`, err);
    try {
      context.meetings.update(meetingId, { status: 'completed' });
    } catch (updateErr) {
      console.error(`Konnte Status nach Diarization-Fehler nicht setzen:`, updateErr);
    }
    sendDiarizationStatus(context, {
      meetingId,
      state: 'failed',
      error: (err as Error).message,
    });
  }
}

function sendDiarizationStatus(context: AppContext, status: DiarizationStatus): void {
  context.mainWindow?.webContents.send('diarization:status', status);
}

function findProtocolById(
  context: AppContext,
  protocolId: string,
): ReturnType<ProtocolRepository['getByMeetingId']> {
  for (const meeting of context.meetings.list()) {
    const p = context.protocols.getByMeetingId(meeting.id);
    if (p && p.id === protocolId) return p;
  }
  return null;
}

app.whenReady().then(async () => {
  ctx = await setupContext();
  registerIpc(ctx);
  await createMainWindow(ctx);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0 && ctx) {
      await createMainWindow(ctx);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ctx?.db.close();
});

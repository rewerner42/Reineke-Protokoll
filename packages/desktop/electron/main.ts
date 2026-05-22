import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
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
  listOllamaModels,
} from '@reineke/shared';
import type { LLMProviderName, WhisperModelSize } from '@reineke/shared';
import { BetterSqliteAdapter } from './services/BetterSqliteAdapter.js';
import { SettingsService } from './services/SettingsService.js';
import { WhisperService } from './services/WhisperService.js';
import { DiarizationService } from './services/DiarizationService.js';
import { PdfExportService } from './services/PdfExportService.js';
import type {
  DiarizationStatus,
  IpcContract,
  WhisperModelInfo,
} from './types/ipc-contract.js';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'reineke-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

interface AppContext {
  db: BetterSqliteAdapter;
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  protocols: ProtocolRepository;
  speakers: SpeakerRepository;
  settings: SettingsService;
  whisper: WhisperService;
  diarization: DiarizationService;
  pdf: PdfExportService;
  userDataDir: string;
  mainWindow: BrowserWindow | null;
}

let ctx: AppContext | null = null;

async function createMainWindow(context: AppContext): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, '..', 'preload', 'preload.mjs');
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
    pdf: new PdfExportService(),
    userDataDir,
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

    if (result && result.finalSegments.length > 0) {
      context.transcripts.deleteProvisional(id);
      for (const raw of result.finalSegments) {
        const segment = context.transcripts.insert({
          meetingId: id,
          startMs: raw.startMs,
          endMs: raw.endMs,
          text: raw.text,
          speakerLabel: null,
          isFinal: true,
        });
        context.mainWindow?.webContents.send('transcription:segment', segment);
      }
    }

    context.meetings.update(id, {
      status: willDiarize ? 'diarizing' : 'completed',
      endedAt: new Date().toISOString(),
      audioPath,
      language: result?.detectedLanguage ?? null,
    });

    if (willDiarize && audioPath) {
      void runDiarizationInBackground(context, id, audioPath);
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
  handle('protocol:generate', async (meetingId, override) => {
    const id = meetingId as string;
    const settings = await context.settings.get();
    const ov = (override ?? {}) as {
      provider?: LLMProviderName;
      model?: string;
      ollamaBaseUrl?: string;
    };
    const providerName: LLMProviderName = ov.provider ?? settings.llmProvider;

    let apiKey = '';
    if (providerName !== 'ollama') {
      const key = await context.settings.getApiKey(providerName);
      if (!key) {
        throw new Error(
          `Kein API-Key für ${providerName} hinterlegt — bitte in den Einstellungen ergänzen.`,
        );
      }
      apiKey = key;
    }
    const defaultModel =
      providerName === 'claude'
        ? settings.claudeModel
        : providerName === 'openai'
          ? settings.openaiModel
          : settings.ollamaModel;
    const model = ov.model && ov.model.length > 0 ? ov.model : defaultModel;
    const baseUrl =
      providerName === 'ollama'
        ? ov.ollamaBaseUrl ?? settings.ollamaBaseUrl
        : undefined;
    const provider = createLLMProvider({ name: providerName, apiKey, model, baseUrl });
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
    const filePath = await pickSavePath(
      context,
      `${sanitizeName(meeting.title)}-protokoll.md`,
      'Protokoll exportieren',
      [{ name: 'Markdown', extensions: ['md'] }],
    );
    if (!filePath) return null;
    await fs.writeFile(filePath, markdown, 'utf8');
    return { path: filePath };
  });

  // Settings
  handle('settings:get', async () => context.settings.get());
  handle('settings:set', async (patch) => {
    const newSettings = await context.settings.set(patch as never);
    if ((patch as Partial<{ whisperModelSize: WhisperModelSize }>).whisperModelSize) {
      context.whisper.setModelSize(newSettings.whisperModelSize);
    }
    return newSettings;
  });
  handle('settings:setApiKey', async (provider, key) => {
    await context.settings.setApiKey(provider as never, key as string);
  });
  handle('settings:hasApiKey', async (provider) =>
    context.settings.hasApiKey(provider as never),
  );

  // Whisper-Modelle
  const APPROX_MB: Record<WhisperModelSize, number> = {
    tiny: 75,
    base: 142,
    small: 466,
    medium: 1462,
    'large-v3-turbo': 1624,
  };
  handle('whisperModel:list', async (): Promise<WhisperModelInfo[]> => {
    return (['tiny', 'base', 'small', 'medium', 'large-v3-turbo'] as const).map((size) => ({
      size,
      downloaded: context.whisper.isModelAvailable(size),
      filePath: null,
      approxMb: APPROX_MB[size],
    }));
  });
  handle('whisperModel:download', async (size) => {
    await context.whisper.downloadModel(size as WhisperModelSize);
  });

  context.whisper.on(
    'modelDownloadProgress',
    (info: { size: WhisperModelSize; percent: number }) => {
      context.mainWindow?.webContents.send('whisperModel:downloadProgress', info);
    },
  );

  // Ollama
  handle('ollama:listModels', async (baseUrl) => {
    return listOllamaModels(baseUrl as string);
  });

  // PDF + Transcript Export
  handle('pdf:exportProtocol', async (meetingId) => {
    const id = meetingId as string;
    const meeting = context.meetings.get(id);
    const protocol = context.protocols.getByMeetingId(id);
    if (!meeting || !protocol) return null;
    const settings = await context.settings.get();
    const filePath = await pickSavePath(
      context,
      `${sanitizeName(meeting.title)}-protokoll.pdf`,
      'Protokoll als PDF exportieren',
      [{ name: 'PDF', extensions: ['pdf'] }],
    );
    if (!filePath) return null;
    return context.pdf.exportProtocolToPath(meeting, protocol, settings, filePath);
  });

  handle('pdf:exportTranscript', async (meetingId) => {
    const id = meetingId as string;
    const meeting = context.meetings.get(id);
    if (!meeting) return null;
    const segments = context.transcripts.listForMeeting(id);
    const settings = await context.settings.get();
    const filePath = await pickSavePath(
      context,
      `${sanitizeName(meeting.title)}-transkript.pdf`,
      'Transkript als PDF exportieren',
      [{ name: 'PDF', extensions: ['pdf'] }],
    );
    if (!filePath) return null;
    return context.pdf.exportTranscriptToPath(meeting, segments, settings, filePath);
  });

  handle('transcript:exportMarkdown', async (meetingId) => {
    const id = meetingId as string;
    const meeting = context.meetings.get(id);
    if (!meeting) return null;
    const segments = context.transcripts.listForMeeting(id);
    const finals = segments.filter((s) => s.isFinal);
    const lines = [
      `# Transkript: ${meeting.title}`,
      '',
      `**Datum:** ${new Date(meeting.startedAt).toLocaleString('de-DE')}`,
      '',
      ...finals.map((s) => `${formatTsForMd(s.startMs)} ${s.text.trim()}`),
    ];
    const md = lines.join('\n');
    const filePath = await pickSavePath(
      context,
      `${sanitizeName(meeting.title)}-transkript.md`,
      'Transkript exportieren',
      [{ name: 'Markdown', extensions: ['md'] }],
    );
    if (!filePath) return null;
    await fs.writeFile(filePath, md, 'utf8');
    return { path: filePath };
  });

  handle('settings:uploadLogo', async () => {
    const result = await showOpenDialog(context, {
      title: 'Firmenlogo wählen',
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const srcPath = result.filePaths[0]!;
    const ext = path.extname(srcPath).toLowerCase();
    const destDir = path.join(context.userDataDir, 'branding');
    await fs.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, `logo${ext}`);
    await fs.copyFile(srcPath, destPath);
    await context.settings.set({ pdfLogoPath: destPath });
    return { path: destPath };
  });

  handle('settings:removeLogo', async () => {
    const settings = await context.settings.get();
    if (settings.pdfLogoPath) {
      await fs.unlink(settings.pdfLogoPath).catch(() => undefined);
    }
    await context.settings.set({ pdfLogoPath: null });
  });

  handle('settings:getLogoDataUrl', async () => {
    const settings = await context.settings.get();
    if (!settings.pdfLogoPath) return null;
    try {
      const buf = await fs.readFile(settings.pdfLogoPath);
      const ext = path.extname(settings.pdfLogoPath).slice(1).toLowerCase();
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'svg'
            ? 'image/svg+xml'
            : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });

  handle('settings:pickExportDir', async () => {
    const result = await showOpenDialog(context, {
      title: 'Standard-Speicherordner für Exporte wählen',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dir = result.filePaths[0]!;
    await context.settings.set({ exportDir: dir });
    return { path: dir };
  });
}

async function pickSavePath(
  context: AppContext,
  defaultFileName: string,
  title: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const settings = await context.settings.get();
  const baseDir =
    settings.exportDir ?? settings.lastExportDir ?? app.getPath('documents');
  const defaultPath = path.join(baseDir, defaultFileName);
  const opts: Electron.SaveDialogOptions = { title, defaultPath, filters };
  const result = context.mainWindow
    ? await dialog.showSaveDialog(context.mainWindow, opts)
    : await dialog.showSaveDialog(opts);
  if (result.canceled || !result.filePath) return null;
  if (!settings.exportDir) {
    await context.settings.set({ lastExportDir: path.dirname(result.filePath) });
  }
  return result.filePath;
}

async function showOpenDialog(
  context: AppContext,
  opts: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return context.mainWindow
    ? dialog.showOpenDialog(context.mainWindow, opts)
    : dialog.showOpenDialog(opts);
}

function sanitizeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

function formatTsForMd(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `\`[${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]\``;
  return `\`[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]\``;
}

function registerAudioProtocol(context: AppContext): void {
  const recordingsDir = path.join(context.userDataDir, 'recordings');
  protocol.handle('reineke-audio', async (request) => {
    const url = new URL(request.url);
    const fileName = path.basename(url.pathname);
    if (!/^[A-Za-z0-9_-]+\.wav$/.test(fileName)) {
      return new Response('forbidden', { status: 403 });
    }
    const filePath = path.join(recordingsDir, fileName);
    if (!filePath.startsWith(recordingsDir)) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      await fs.access(filePath);
    } catch {
      return new Response('not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
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
  registerAudioProtocol(ctx);
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

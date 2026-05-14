import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runMigrations,
  MeetingRepository,
  TranscriptRepository,
  ProtocolRepository,
  ProtocolGenerator,
  createLLMProvider,
  renderProtocolMarkdown,
  listOllamaModels,
} from '@reineke/shared';
import { BetterSqliteAdapter } from './services/BetterSqliteAdapter.js';
import { SettingsService } from './services/SettingsService.js';
import { WhisperService } from './services/WhisperService.js';
import { PdfExportService } from './services/PdfExportService.js';
import type { IpcContract, WhisperModelInfo } from './types/ipc-contract.js';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

interface AppContext {
  db: BetterSqliteAdapter;
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  protocols: ProtocolRepository;
  settings: SettingsService;
  whisper: WhisperService;
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

  const db = new BetterSqliteAdapter(dbPath);
  runMigrations(db);

  const settingsService = new SettingsService(settingsPath);
  const settings = await settingsService.get();

  const whisper = new WhisperService({
    modelSize: settings.whisperModelSize,
    modelsDir,
    audioDir,
    language: settings.language,
  });

  return {
    db,
    meetings: new MeetingRepository(db),
    transcripts: new TranscriptRepository(db),
    protocols: new ProtocolRepository(db),
    settings: settingsService,
    whisper,
    pdf: new PdfExportService(),
    userDataDir,
    mainWindow: null,
  };
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
    const result = await context.whisper.stopMeeting(id);

    if (result.finalSegments.length > 0) {
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
      status: 'completed',
      endedAt: new Date().toISOString(),
      audioPath: result.audioPath,
    });
    return { audioPath: result.audioPath };
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

  // Transcription
  handle('transcription:listForMeeting', async (meetingId) =>
    context.transcripts.listForMeeting(meetingId as string),
  );

  // Protocol
  handle('protocol:generate', async (meetingId) => {
    const id = meetingId as string;
    const settings = await context.settings.get();
    let apiKey = '';
    if (settings.llmProvider !== 'ollama') {
      const key = await context.settings.getApiKey(settings.llmProvider);
      if (!key) {
        throw new Error(
          `Kein API-Key für ${settings.llmProvider} hinterlegt — bitte in den Einstellungen ergänzen.`,
        );
      }
      apiKey = key;
    }
    const model =
      settings.llmProvider === 'claude'
        ? settings.claudeModel
        : settings.llmProvider === 'openai'
          ? settings.openaiModel
          : settings.ollamaModel;
    const provider = createLLMProvider({
      name: settings.llmProvider,
      apiKey,
      model,
      baseUrl: settings.llmProvider === 'ollama' ? settings.ollamaBaseUrl : undefined,
    });
    const generator = new ProtocolGenerator({
      meetings: context.meetings,
      transcripts: context.transcripts,
      protocols: context.protocols,
      provider,
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

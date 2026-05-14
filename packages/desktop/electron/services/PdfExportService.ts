import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  Meeting,
  Protocol,
  TranscriptSegment,
} from '@reineke/shared';
import { CLASSIFICATION_LABELS, formatGermanDate, formatDuration } from '@reineke/shared';

export class PdfExportService {
  async exportProtocolToPath(
    meeting: Meeting,
    protocol: Protocol,
    settings: AppSettings,
    filePath: string,
  ): Promise<{ path: string }> {
    const html = await renderProtocolHtml(meeting, protocol, settings);
    await writePdf(html, filePath);
    return { path: filePath };
  }

  async exportTranscriptToPath(
    meeting: Meeting,
    segments: TranscriptSegment[],
    settings: AppSettings,
    filePath: string,
  ): Promise<{ path: string }> {
    const html = await renderTranscriptHtml(meeting, segments, settings);
    await writePdf(html, filePath);
    return { path: filePath };
  }
}

async function writePdf(html: string, filePath: string): Promise<void> {
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    const dataUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
    await pdfWindow.loadURL(dataUrl);
    await new Promise((r) => setTimeout(r, 200));
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, pdfBuffer);
  } finally {
    pdfWindow.close();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function logoDataUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const buf = await fs.readFile(logoPath);
    const ext = path.extname(logoPath).slice(1).toLowerCase();
    const mime =
      ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function baseStyles(primaryColor: string): string {
  return `
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 24px 28px;
      font-size: 11pt;
      line-height: 1.5;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid ${primaryColor};
      padding-bottom: 14px;
      margin-bottom: 22px;
    }
    header .brand { display: flex; align-items: center; gap: 14px; }
    header img.logo { max-height: 56px; max-width: 200px; object-fit: contain; }
    header .company { font-weight: 600; color: ${primaryColor}; font-size: 13pt; }
    header .classification {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: white;
      background: ${primaryColor};
      padding: 6px 12px;
      border-radius: 4px;
    }
    h1 { font-size: 22pt; color: ${primaryColor}; margin: 0 0 4px 0; }
    .meta { color: #64748b; font-size: 10pt; margin-bottom: 24px; }
    h2 {
      font-size: 13pt;
      color: ${primaryColor};
      margin: 22px 0 8px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    h3 { font-size: 11pt; margin: 12px 0 4px 0; }
    p { margin: 6px 0; }
    ul { margin: 6px 0; padding-left: 22px; }
    li { margin: 3px 0; }
    .todo { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
    .todo:last-child { border-bottom: 0; }
    .todo .box { width: 12px; height: 12px; border: 1.5px solid #94a3b8; border-radius: 2px; margin-top: 4px; flex: 0 0 auto; }
    .todo .box.done { background: ${primaryColor}; border-color: ${primaryColor}; }
    .todo .meta-line { font-size: 9pt; color: #64748b; margin-top: 2px; }
    .empty { color: #94a3b8; font-style: italic; font-size: 10pt; }
    footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
    .transcript {
      white-space: pre-wrap;
      font-size: 10.5pt;
      line-height: 1.6;
      text-align: justify;
    }
    .segment-timestamp { color: #94a3b8; font-size: 9pt; font-family: monospace; margin-right: 8px; }
  `;
}

function renderHeader(settings: AppSettings, logoData: string | null): string {
  const classification = settings.pdfClassification;
  const classificationHtml =
    classification !== 'none'
      ? `<div class="classification">${escapeHtml(CLASSIFICATION_LABELS[classification])}</div>`
      : '';
  const logoHtml = logoData
    ? `<img class="logo" src="${logoData}" alt="Logo" />`
    : settings.pdfCompanyName
      ? `<div class="company">${escapeHtml(settings.pdfCompanyName)}</div>`
      : '';
  const companyText =
    logoData && settings.pdfCompanyName
      ? `<div class="company">${escapeHtml(settings.pdfCompanyName)}</div>`
      : '';
  return `<header><div class="brand">${logoHtml}${companyText}</div>${classificationHtml}</header>`;
}

function renderFooter(settings: AppSettings, modelInfo: string): string {
  const date = new Date().toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const company = settings.pdfCompanyName
    ? `${escapeHtml(settings.pdfCompanyName)} · `
    : '';
  return `<footer><div>${company}Erstellt mit Reineke-Protokoll · ${modelInfo}</div><div>${escapeHtml(date)}</div></footer>`;
}

async function renderProtocolHtml(
  meeting: Meeting,
  protocol: Protocol,
  settings: AppSettings,
): Promise<string> {
  const logo = await logoDataUrl(settings.pdfLogoPath);
  const headerHtml = renderHeader(settings, logo);

  const summary = escapeHtml(protocol.summary);

  const participantsHtml =
    protocol.participants.length === 0
      ? `<p class="empty">Keine Teilnehmer dokumentiert.</p>`
      : `<ul>${protocol.participants
          .map(
            (p) =>
              `<li><strong>${escapeHtml(p.name)}</strong>${p.role ? ` <span style="color:#64748b">— ${escapeHtml(p.role)}</span>` : ''}</li>`,
          )
          .join('')}</ul>`;

  const todosHtml =
    protocol.todos.length === 0
      ? `<p class="empty">Keine To-Dos.</p>`
      : protocol.todos
          .map((t) => {
            const metaParts: string[] = [];
            if (t.owner) metaParts.push(`Owner: ${escapeHtml(t.owner)}`);
            if (t.deadline) metaParts.push(`Frist: ${escapeHtml(t.deadline)}`);
            const meta =
              metaParts.length > 0
                ? `<div class="meta-line">${metaParts.join(' · ')}</div>`
                : '';
            return `<div class="todo"><div class="box${t.done ? ' done' : ''}"></div><div><div>${escapeHtml(t.description)}</div>${meta}</div></div>`;
          })
          .join('');

  const decisionsHtml =
    protocol.decisions.length === 0
      ? `<p class="empty">Keine Entscheidungen.</p>`
      : `<ul>${protocol.decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;

  const discussionHtml =
    protocol.discussionPoints.length === 0
      ? `<p class="empty">Keine Diskussionspunkte.</p>`
      : `<ul>${protocol.discussionPoints.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>Protokoll: ${escapeHtml(meeting.title)}</title>
<style>${baseStyles(settings.pdfPrimaryColor)}</style>
</head><body>
${headerHtml}
<h1>${escapeHtml(meeting.title)}</h1>
<div class="meta">${escapeHtml(formatGermanDate(meeting.startedAt))} · Dauer ${escapeHtml(formatDuration(meeting.startedAt, meeting.endedAt))}</div>

<h2>Zusammenfassung</h2><p>${summary}</p>
<h2>Teilnehmer</h2>${participantsHtml}
<h2>To-Dos</h2>${todosHtml}
<h2>Entscheidungen</h2>${decisionsHtml}
<h2>Diskussionspunkte</h2>${discussionHtml}

${renderFooter(settings, `${escapeHtml(protocol.llmProvider)} · ${escapeHtml(protocol.llmModel)}`)}
</body></html>`;
}

async function renderTranscriptHtml(
  meeting: Meeting,
  segments: TranscriptSegment[],
  settings: AppSettings,
): Promise<string> {
  const logo = await logoDataUrl(settings.pdfLogoPath);
  const headerHtml = renderHeader(settings, logo);
  const finals = segments.filter((s) => s.isFinal);
  const body =
    finals.length === 0
      ? `<p class="empty">Kein Transkript verfügbar.</p>`
      : `<div class="transcript">${finals
          .map((s) => {
            const ts = `${formatTs(s.startMs)} `;
            return `<span class="segment-timestamp">${escapeHtml(ts)}</span>${escapeHtml(s.text.trim())} `;
          })
          .join('')}</div>`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>Transkript – ${escapeHtml(meeting.title)}</title>
<style>${baseStyles(settings.pdfPrimaryColor)}</style>
</head><body>
${headerHtml}
<h1>Transkript – ${escapeHtml(meeting.title)}</h1>
<div class="meta">${escapeHtml(formatGermanDate(meeting.startedAt))} · Dauer ${escapeHtml(formatDuration(meeting.startedAt, meeting.endedAt))}</div>
${body}
${renderFooter(settings, 'Live-Transkription via Whisper')}
</body></html>`;
}

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `[${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
}

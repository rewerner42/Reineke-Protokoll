import { contextBridge, ipcRenderer } from 'electron';
import type { IpcContract } from './types/ipc-contract.js';
import type { TranscriptSegment } from '@reineke/shared';

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args);
}

const api: IpcContract = {
  meetings: {
    create: (input) => invoke('meetings:create', input),
    list: () => invoke('meetings:list'),
    get: (id) => invoke('meetings:get', id),
    delete: (id) => invoke('meetings:delete', id),
  },
  recording: {
    start: (id) => invoke('recording:start', id),
    pushAudioChunk: (id, pcm) => invoke('recording:pushAudioChunk', id, pcm),
    stop: (id) => invoke('recording:stop', id),
  },
  transcription: {
    listForMeeting: (id) => invoke('transcription:listForMeeting', id),
    onSegment: (cb) => {
      const listener = (_event: unknown, segment: TranscriptSegment): void => cb(segment);
      ipcRenderer.on('transcription:segment', listener);
      return () => ipcRenderer.removeListener('transcription:segment', listener);
    },
  },
  protocol: {
    generate: (id, override) => invoke('protocol:generate', id, override),
    get: (id) => invoke('protocol:get', id),
    updateMarkdown: (pid, md) => invoke('protocol:updateMarkdown', pid, md),
    setTodoDone: (tid, done) => invoke('protocol:setTodoDone', tid, done),
    exportMarkdown: (pid) => invoke('protocol:exportMarkdown', pid),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    setApiKey: (provider, key) => invoke('settings:setApiKey', provider, key),
    hasApiKey: (provider) => invoke('settings:hasApiKey', provider),
    uploadLogo: () => invoke('settings:uploadLogo'),
    removeLogo: () => invoke('settings:removeLogo'),
    getLogoDataUrl: () => invoke('settings:getLogoDataUrl'),
    pickExportDir: () => invoke('settings:pickExportDir'),
  },
  whisperModel: {
    list: () => invoke('whisperModel:list'),
    download: (size) => invoke('whisperModel:download', size),
    onDownloadProgress: (cb) => {
      const listener = (_e: unknown, p: { size: never; percent: number }): void => cb(p);
      ipcRenderer.on('whisperModel:downloadProgress', listener);
      return () => ipcRenderer.removeListener('whisperModel:downloadProgress', listener);
    },
  },
  ollama: {
    listModels: (baseUrl) => invoke('ollama:listModels', baseUrl),
  },
  pdf: {
    exportProtocol: (meetingId) => invoke('pdf:exportProtocol', meetingId),
    exportTranscript: (meetingId) => invoke('pdf:exportTranscript', meetingId),
  },
  transcript: {
    exportMarkdown: (meetingId) => invoke('transcript:exportMarkdown', meetingId),
  },
};

contextBridge.exposeInMainWorld('api', api);

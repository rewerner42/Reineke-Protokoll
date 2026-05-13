import type { IpcContract } from '../../electron/types/ipc-contract.js';

declare global {
  interface Window {
    api: IpcContract;
  }
}

export const api: IpcContract = window.api;

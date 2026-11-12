// The page's only door to the desktop: save slots and the close handshake. CommonJS, because
// sandboxed preloads cannot be modules.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pmoSaves', {
  list: (): Promise<string[]> => ipcRenderer.invoke('saves:list'),
  read: (slot: string): Promise<string | null> => ipcRenderer.invoke('saves:read', slot),
  write: (slot: string, text: string): Promise<void> =>
    ipcRenderer.invoke('saves:write', slot, text),
  remove: (slot: string): Promise<void> => ipcRenderer.invoke('saves:remove', slot),
});

contextBridge.exposeInMainWorld('pmoApp', {
  onCloseRequest: (cb: () => void) => {
    ipcRenderer.on('app:close-request', () => cb());
  },
  closeReady: () => ipcRenderer.send('app:close-ready'),
});

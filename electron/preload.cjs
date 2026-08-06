const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("usaMapDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  openTextFile: (kind) => ipcRenderer.invoke("file:open-text", kind),
  saveTextFile: (payload) => ipcRenderer.invoke("file:save-text", payload),
  saveBinaryFile: (payload) => ipcRenderer.invoke("file:save-binary", payload),
  openUserGuide: () => ipcRenderer.invoke("app:open-user-guide"),
  requestQuit: () => ipcRenderer.invoke("app:request-quit"),
});

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
  getMcpStatus: () => ipcRenderer.invoke("mcp:get-status"),
  getAutosaveProject: () => ipcRenderer.invoke("project:get-autosave"),
  autosaveProject: (payload) => ipcRenderer.invoke("project:autosave", payload),
  resetAutosaveTarget: () => ipcRenderer.invoke("project:reset-autosave-target"),
  onMcpCommand: (handler) => {
    const listener = (_event, request) => {
      Promise.resolve()
        .then(() => handler(request))
        .then((result) => ipcRenderer.send("mcp:response", { id: request.id, ok: true, result }))
        .catch((error) => ipcRenderer.send("mcp:response", {
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : "The map editor rejected the MCP request.",
        }));
    };
    ipcRenderer.on("mcp:command", listener);
    return () => ipcRenderer.removeListener("mcp:command", listener);
  },
  requestQuit: () => ipcRenderer.invoke("app:request-quit"),
});

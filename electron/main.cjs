const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const smokeTest = process.env.USA_MAP_STUDIO_SMOKE_TEST === "1";
const capturePath = process.env.USA_MAP_STUDIO_CAPTURE_PATH || "";
let mainWindow = null;
let quitting = false;

function filtersFor(kind) {
  if (kind === "csv") return [{ name: "CSV location lists", extensions: ["csv"] }];
  if (kind === "project") return [{ name: "USA Map Studio projects", extensions: ["json"] }];
  if (kind === "svg") return [{ name: "Scalable Vector Graphics", extensions: ["svg"] }];
  if (kind === "png") return [{ name: "Portable Network Graphics", extensions: ["png"] }];
  if (kind === "pptx") return [{ name: "PowerPoint Presentation", extensions: ["pptx"] }];
  return [{ name: "All files", extensions: ["*"] }];
}

function registerIpc() {
  ipcMain.handle("file:open-text", async (_event, kind) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === "csv" ? "Import location CSV" : "Open USA Map Studio project",
      properties: ["openFile"],
      filters: filtersFor(kind),
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    return {
      canceled: false,
      filePath,
      name: path.basename(filePath),
      text: await fs.readFile(filePath, "utf8"),
    };
  });

  ipcMain.handle("file:save-text", async (_event, payload) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: payload.kind === "project" ? "Save USA Map Studio project" : "Export SVG map",
      defaultPath: payload.defaultName,
      filters: filtersFor(payload.kind),
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, String(payload.text), "utf8");
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("file:save-binary", async (_event, payload) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Export ${String(payload.kind).toUpperCase()} map`,
      defaultPath: payload.defaultName,
      filters: filtersFor(payload.kind),
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const bytes = payload.bytes instanceof ArrayBuffer
      ? Buffer.from(payload.bytes)
      : Buffer.from(payload.bytes?.buffer ?? payload.bytes);
    await fs.writeFile(result.filePath, bytes);
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("app:open-user-guide", async () => {
    const guidePath = path.join(projectRoot, "docs", "USA-Map-Studio-User-Guide.pdf");
    try {
      await fs.access(guidePath);
      const error = await shell.openPath(guidePath);
      return { opened: error === "", path: guidePath };
    } catch {
      return { opened: false, path: guidePath };
    }
  });

  ipcMain.handle("app:request-quit", () => {
    quitting = true;
    app.quit();
  });
}

async function runSmoke(window) {
  const result = await window.webContents.executeJavaScript(`(() => {
    const shell = document.querySelector('[data-testid="studio-shell"]');
    const svg = document.querySelector('[data-testid="map-svg"]');
    const stage = document.querySelector('[data-testid="map-stage"]');
    const list = document.querySelector('[data-testid="location-list"]');
    const svgBounds = svg?.getBoundingClientRect();
    return {
      shell: Boolean(shell),
      map: Boolean(svg),
      stage: Boolean(stage),
      list: Boolean(list),
      locationRows: document.querySelectorAll('.location-row').length,
      statePaths: document.querySelectorAll('.map-state').length,
      width: Math.round(svgBounds?.width || 0),
      height: Math.round(svgBounds?.height || 0),
      documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      documentOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  })()`);
  const passed = result.shell && result.map && result.stage && result.list &&
    result.locationRows >= 8 && result.statePaths === 51 &&
    result.width > 400 && result.height > 240 &&
    !result.documentOverflowX && !result.documentOverflowY;
  console.log(`USA_MAP_STUDIO_SMOKE ${JSON.stringify({ passed, ...result })}`);
  if (!passed) process.exitCode = 1;
  app.quit();
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: "#f3f6f4",
    title: "USA Map Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: !smokeTest && !capturePath,
    },
  });
  mainWindow = window;
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = url.startsWith("file:") || url.startsWith("http://127.0.0.1:");
    if (!allowed) event.preventDefault();
  });
  window.on("close", (event) => {
    if (!quitting && process.platform === "darwin") {
      event.preventDefault();
      window.hide();
    }
  });

  const devUrl = process.env.USA_MAP_STUDIO_DEV_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(path.join(projectRoot, "dist", "index.html"));

  await new Promise((resolve) => setTimeout(resolve, smokeTest || capturePath ? 1100 : 120));
  if (smokeTest) {
    await runSmoke(window);
  } else if (capturePath) {
    const image = await window.webContents.capturePage();
    await fs.mkdir(path.dirname(capturePath), { recursive: true });
    await fs.writeFile(capturePath, image.toPNG());
    console.log(`USA_MAP_STUDIO_CAPTURE ${capturePath}`);
    app.quit();
  } else {
    window.show();
  }
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  app.on("activate", () => {
    if (mainWindow) mainWindow.show();
    else void createWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeTest || capturePath) app.quit();
});

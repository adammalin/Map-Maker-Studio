const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const smokeTest = process.env.USA_MAP_STUDIO_SMOKE_TEST === "1";
const capturePath = process.env.USA_MAP_STUDIO_CAPTURE_PATH || "";
const MCP_RUNTIME_FILE_NAME = "mcp-runtime.json";
const MCP_MAX_BODY_BYTES = 5_000_000;
const mcpToken = randomBytes(32).toString("hex");
let mainWindow = null;
let quitting = false;
let mcpServer = null;
let mcpAddress = null;
const pendingMcpCommands = new Map();

function mcpRuntimePath() {
  return path.join(app.getPath("userData"), MCP_RUNTIME_FILE_NAME);
}

function tokenMatches(value) {
  if (typeof value !== "string") return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(mcpToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function jsonResponse(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MCP_MAX_BODY_BYTES) throw new Error("The MCP request exceeds the 5 MB limit.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("The MCP request body is not valid JSON.");
  }
}

function dispatchMcpCommand(operation, input) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    return Promise.reject(new Error("USA Map Studio is still starting. Try the tool again in a moment."));
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingMcpCommands.delete(id);
      reject(new Error("USA Map Studio did not answer the MCP request in time."));
    }, 12_000);
    pendingMcpCommands.set(id, { resolve, reject, timer });
    mainWindow.webContents.send("mcp:command", { id, operation, input });
  });
}

async function handleMcpRequest(request, response) {
  if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1") {
    jsonResponse(response, 403, { error: "Only loopback MCP requests are accepted." });
    return;
  }
  if (!tokenMatches(request.headers["x-usa-map-studio-token"])) {
    jsonResponse(response, 403, { error: "USA Map Studio rejected the desktop session token." });
    return;
  }
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method !== "POST" || url.pathname !== "/command") {
    jsonResponse(response, 404, { error: "Unknown local MCP endpoint." });
    return;
  }
  try {
    const body = await readJsonBody(request);
    if (typeof body.operation !== "string" || !body.operation.trim()) {
      throw new Error("An MCP operation is required.");
    }
    const result = await dispatchMcpCommand(body.operation, body.input ?? {});
    jsonResponse(response, 200, { result });
  } catch (error) {
    jsonResponse(response, 400, {
      error: error instanceof Error ? error.message.slice(0, 700) : "The MCP request failed.",
    });
  }
}

async function startMcpBridge() {
  mcpServer = http.createServer((request, response) => {
    void handleMcpRequest(request, response);
  });
  mcpServer.on("clientError", (_error, socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    mcpServer.once("error", reject);
    mcpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = mcpServer.address();
  if (!address || typeof address === "string") throw new Error("The local MCP bridge did not receive a port.");
  mcpAddress = `http://127.0.0.1:${address.port}/`;
  const target = mcpRuntimePath();
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(temporary, `${JSON.stringify({
    version: 1,
    pid: process.pid,
    baseUrl: mcpAddress,
    token: mcpToken,
    startedAt: new Date().toISOString(),
  })}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
  try { await fs.chmod(target, 0o600); } catch { /* Windows does not implement POSIX modes. */ }
}

function stopMcpBridge() {
  for (const pending of pendingMcpCommands.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("USA Map Studio is closing."));
  }
  pendingMcpCommands.clear();
  if (mcpServer) mcpServer.close();
  mcpServer = null;
  mcpAddress = null;
  const target = mcpRuntimePath();
  try {
    const descriptor = JSON.parse(fsSync.readFileSync(target, "utf8"));
    if (descriptor?.pid === process.pid) fsSync.rmSync(target, { force: true });
  } catch {
    // A future app start safely replaces a stale or unreadable descriptor.
  }
}

function filtersFor(kind) {
  if (kind === "csv") return [{ name: "CSV location lists", extensions: ["csv"] }];
  if (kind === "project") return [{ name: "USA Map Studio projects", extensions: ["json"] }];
  if (kind === "svg") return [{ name: "Scalable Vector Graphics", extensions: ["svg"] }];
  if (kind === "png") return [{ name: "Portable Network Graphics", extensions: ["png"] }];
  if (kind === "pptx") return [{ name: "PowerPoint Presentation", extensions: ["pptx"] }];
  return [{ name: "All files", extensions: ["*"] }];
}

function registerIpc() {
  ipcMain.on("mcp:response", (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    const pending = pendingMcpCommands.get(payload?.id);
    if (!pending) return;
    pendingMcpCommands.delete(payload.id);
    clearTimeout(pending.timer);
    if (payload.ok) pending.resolve(payload.result);
    else pending.reject(new Error(typeof payload.error === "string" ? payload.error : "The map editor rejected the MCP request."));
  });

  ipcMain.handle("mcp:get-status", () => ({
    available: Boolean(mcpAddress),
    address: mcpAddress,
    runtimeFile: mcpRuntimePath(),
  }));

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
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      overflowElements: [...document.querySelectorAll('body *')]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > document.documentElement.clientWidth + 0.5 || bounds.left < -0.5;
        })
        .slice(0, 8)
        .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right) })),
      documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      documentOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      initialMapMode: document.querySelector('[data-workspace-view]')?.getAttribute('data-workspace-view') === 'map' &&
        document.querySelector('[data-testid="workspace-mode-heading"] strong')?.textContent === 'Map editor' &&
        !document.querySelector('.location-panel'),
    };
  })()`);
  await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-mode="locations"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const locationsMode = await window.webContents.executeJavaScript(`(() => ({
    view: document.querySelector('[data-workspace-view]')?.getAttribute('data-workspace-view'),
    heading: document.querySelector('[data-testid="workspace-mode-heading"] strong')?.textContent,
    panel: Boolean(document.querySelector('.location-panel')),
    list: Boolean(document.querySelector('[data-testid="location-list"]')),
    rows: document.querySelectorAll('.location-row').length,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);
  await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-mode="style"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const styleMode = await window.webContents.executeJavaScript(`(() => ({
    view: document.querySelector('[data-workspace-view]')?.getAttribute('data-workspace-view'),
    heading: document.querySelector('[data-testid="workspace-mode-heading"] strong')?.textContent,
    locationPanel: Boolean(document.querySelector('.location-panel')),
    mapInspector: Boolean(document.querySelector('[data-testid="map-inspector"]')),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);
  await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-mode="map"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const mapMode = await window.webContents.executeJavaScript(`(() => ({
    view: document.querySelector('[data-workspace-view]')?.getAttribute('data-workspace-view'),
    heading: document.querySelector('[data-testid="workspace-mode-heading"] strong')?.textContent,
    locationPanel: Boolean(document.querySelector('.location-panel')),
    locationInspector: Boolean(document.querySelector('[data-testid="location-inspector"]')),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);
  result.list = locationsMode.list;
  result.locationRows = locationsMode.rows;
  result.workspaceModesFunctional = result.initialMapMode &&
    locationsMode.view === "locations" && locationsMode.heading === "Location workspace" && locationsMode.panel && !locationsMode.overflowX &&
    styleMode.view === "style" && styleMode.heading === "Map style" && !styleMode.locationPanel && styleMode.mapInspector && !styleMode.overflowX &&
    mapMode.view === "map" && mapMode.heading === "Map editor" && !mapMode.locationPanel && mapMode.locationInspector && !mapMode.overflowX;
  await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-mode="locations"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await window.webContents.executeJavaScript(`document.querySelector('.location-row')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-mode="map"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const unauthorized = await fetch(new URL("command", mcpAddress), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "get_app_status", input: {} }),
  });
  const authorized = await fetch(new URL("command", mcpAddress), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-usa-map-studio-token": mcpToken,
    },
    body: JSON.stringify({ operation: "get_app_status", input: {} }),
  });
  const authorizedBody = await authorized.json();
  result.mcpBridge = authorized.ok && authorizedBody?.result?.app === "USA Map Studio";
  result.mcpUnauthorizedBlocked = unauthorized.status === 403;
  result.mcpLoopback = mcpAddress?.startsWith("http://127.0.0.1:") === true;
  const staged = await fetch(new URL("command", mcpAddress), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-usa-map-studio-token": mcpToken,
    },
    body: JSON.stringify({
      operation: "stage_map_style_update",
      input: {
        patch: { showCountyLines: true },
        expectedUpdatedAt: authorizedBody?.result?.project?.updatedAt,
        summary: "Smoke-test county line proposal",
      },
    }),
  });
  const stagedBody = await staged.json();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const reviewState = await window.webContents.executeJavaScript(`(() => ({
    banner: Boolean(document.querySelector('[data-testid="ai-proposal-banner"]')),
    dialog: Boolean(document.querySelector('[data-testid="ai-proposal-dialog"]')),
    countiesBeforeApply: document.querySelector('[aria-label="Map detail controls"] button')?.getAttribute('aria-pressed'),
  }))()`);
  result.mcpProposalStaged = staged.ok && stagedBody?.result?.applied === false &&
    stagedBody?.result?.saved === false && reviewState.banner && reviewState.dialog &&
    reviewState.countiesBeforeApply === "false";
  await window.webContents.executeJavaScript(`(() => {
    const apply = [...document.querySelectorAll('.ai-proposal-actions button')]
      .find((button) => button.textContent?.includes('Apply to working map'));
    apply?.click();
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const appliedState = await window.webContents.executeJavaScript(`(() => ({
    proposalGone: !document.querySelector('[data-testid="ai-proposal-banner"]'),
    countiesAfterApply: document.querySelector('[aria-label="Map detail controls"] button')?.getAttribute('aria-pressed'),
    dirty: document.querySelector('.save-status')?.textContent,
  }))()`);
  result.mcpProposalAppliedByUser = appliedState.proposalGone &&
    appliedState.countiesAfterApply === "true" && appliedState.dirty === "Unsaved";
  const currentResponse = await fetch(new URL("command", mcpAddress), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-usa-map-studio-token": mcpToken,
    },
    body: JSON.stringify({ operation: "get_current_project", input: {} }),
  });
  const currentBody = await currentResponse.json();
  const currentProject = currentBody?.result?.project;
  const customStage = await fetch(new URL("command", mcpAddress), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-usa-map-studio-token": mcpToken,
    },
    body: JSON.stringify({
      operation: "stage_custom_pin_import",
      input: {
        name: "Smoke-test triangle",
        svg: '<svg viewBox="0 0 24 24" onload="bad()"><script>bad()</script><path d="M12 1L23 23H1Z" fill="currentColor"/></svg>',
        assignLocationId: currentProject?.locations?.[0]?.id,
        expectedUpdatedAt: currentProject?.project?.updatedAt,
        summary: "Smoke-test embedded custom pin",
      },
    }),
  });
  const customStageBody = await customStage.json();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const customReviewState = await window.webContents.executeJavaScript(`(() => ({
    dialog: Boolean(document.querySelector('[data-testid="ai-proposal-dialog"]')),
    customPinsBeforeApply: document.querySelectorAll('.custom-pin-symbol').length,
    paletteFields: document.querySelectorAll('.brand-swatches').length,
    firstPaletteSwatches: document.querySelector('.brand-swatches')?.querySelectorAll('button').length || 0,
  }))()`);
  result.customPinProposalStaged = customStage.ok && customStageBody?.result?.applied === false &&
    customStageBody?.result?.removedSvgItems === 2 && customReviewState.dialog &&
    customReviewState.customPinsBeforeApply === 0;
  result.ornlPaletteAvailable = customReviewState.paletteFields >= 2 && customReviewState.firstPaletteSwatches === 15;
  await window.webContents.executeJavaScript(`(() => {
    const apply = [...document.querySelectorAll('.ai-proposal-actions button')]
      .find((button) => button.textContent?.includes('Apply to working map'));
    apply?.click();
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const customAppliedState = await window.webContents.executeJavaScript(`(async () => {
    const map = document.querySelector('[data-testid="map-svg"]');
    const clone = map?.cloneNode(true);
    clone?.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone?.setAttribute('width', '1200');
    clone?.setAttribute('height', '720');
    clone?.querySelectorAll('[data-editor-only]').forEach((element) => element.remove());
    const exportMarkup = clone ? new XMLSerializer().serializeToString(clone) : '';
    let rasterized = false;
    if (exportMarkup) {
      const url = URL.createObjectURL(new Blob([exportMarkup], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        context?.drawImage(image, 0, 0, 1200, 720);
        rasterized = Boolean(context);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return {
      proposalGone: !document.querySelector('[data-testid="ai-proposal-banner"]'),
      customPin: Boolean(document.querySelector('.custom-pin-symbol path')),
      exportMarkupIncludesCustomPin: /custom-pin-symbol/.test(exportMarkup) && /currentColor/.test(exportMarkup),
      customPinRasterized: rasterized,
    };
  })()`);
  const finalProjectResponse = await fetch(new URL("command", mcpAddress), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-usa-map-studio-token": mcpToken,
    },
    body: JSON.stringify({ operation: "get_current_project", input: {} }),
  });
  const finalProjectBody = await finalProjectResponse.json();
  const embeddedDesign = finalProjectBody?.result?.project?.customPins?.[0];
  result.customPinEmbedded = customAppliedState.proposalGone && customAppliedState.customPin &&
    finalProjectBody?.result?.project?.schemaVersion === 2 &&
    finalProjectBody?.result?.project?.locations?.[0]?.customPinId === embeddedDesign?.id &&
    typeof embeddedDesign?.svg === "string" && embeddedDesign.svg.includes("currentColor") &&
    !/script|onload/i.test(embeddedDesign.svg);
  result.customPinExports = customAppliedState.exportMarkupIncludesCustomPin && customAppliedState.customPinRasterized;
  if (capturePath) {
    await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-mode="locations"]')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await window.webContents.executeJavaScript(`(() => {
      const palette = document.querySelector('.brand-swatches');
      if (palette) palette.open = true;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const image = await window.webContents.capturePage();
    await fs.mkdir(path.dirname(capturePath), { recursive: true });
    await fs.writeFile(capturePath, image.toPNG());
  }
  const passed = result.shell && result.map && result.stage && result.list &&
    result.locationRows >= 8 && result.statePaths === 51 &&
    result.width > 400 && result.height > 240 &&
    !result.documentOverflowX && !result.documentOverflowY &&
    result.mcpBridge && result.mcpUnauthorizedBlocked && result.mcpLoopback &&
    result.workspaceModesFunctional && result.mcpProposalStaged && result.mcpProposalAppliedByUser &&
    result.customPinProposalStaged && result.customPinEmbedded && result.customPinExports &&
    result.ornlPaletteAvailable;
  console.log(`USA_MAP_STUDIO_SMOKE ${JSON.stringify({ passed, ...result })}`);
  app.exit(passed ? 0 : 1);
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
  try {
    await startMcpBridge();
  } catch (error) {
    console.error("The optional local MCP bridge could not start.", error);
  }
  await createWindow();
  app.on("activate", () => {
    if (mainWindow) mainWindow.show();
    else void createWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  stopMcpBridge();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeTest || capturePath) app.quit();
});

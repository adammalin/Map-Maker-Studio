import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RUNTIME_FILE_NAME = "mcp-runtime.json";
const REQUEST_TIMEOUT_MS = 15_000;

export class MapAppUnavailableError extends Error {
  constructor(message = "Open USA Map Studio, then try this tool again.") {
    super(message);
    this.name = "MapAppUnavailableError";
  }
}

export function defaultRuntimeFilePath() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "USA Map Studio", RUNTIME_FILE_NAME);
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "USA Map Studio", RUNTIME_FILE_NAME);
  }
  return path.join(os.homedir(), ".usa-map-studio", RUNTIME_FILE_NAME);
}

export function runtimeFilePath() {
  return process.env.USA_MAP_MCP_RUNTIME_FILE || defaultRuntimeFilePath();
}

export function readRuntimeDescriptor(runtimePath = runtimeFilePath()) {
  let stats;
  try {
    stats = fs.lstatSync(runtimePath);
  } catch {
    throw new MapAppUnavailableError();
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new MapAppUnavailableError("The USA Map Studio connection file is not a regular local file.");
  }
  if (process.platform !== "win32" && (stats.mode & 0o077) !== 0) {
    throw new MapAppUnavailableError(
      "The USA Map Studio connection file has unsafe permissions. Restart the app to repair it.",
    );
  }

  let descriptor;
  try {
    descriptor = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  } catch {
    throw new MapAppUnavailableError(
      "The USA Map Studio connection file could not be read. Restart the app and try again.",
    );
  }
  if (
    descriptor?.version !== 1 ||
    !Number.isInteger(descriptor.pid) ||
    typeof descriptor.baseUrl !== "string" ||
    typeof descriptor.token !== "string" ||
    descriptor.token.length < 32
  ) {
    throw new MapAppUnavailableError(
      "The USA Map Studio connection file is invalid. Restart the app and try again.",
    );
  }

  let baseUrl;
  try {
    baseUrl = new URL(descriptor.baseUrl);
  } catch {
    throw new MapAppUnavailableError();
  }
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1") {
    throw new MapAppUnavailableError(
      "USA Map Studio refused a desktop connection that was not loopback-only.",
    );
  }
  return { ...descriptor, baseUrl };
}

export class MapAppClient {
  constructor(options = {}) {
    this.runtimePath = options.runtimePath;
  }

  async command(operation, input = {}) {
    const descriptor = readRuntimeDescriptor(this.runtimePath);
    const url = new URL("command", descriptor.baseUrl);
    if (url.origin !== descriptor.baseUrl.origin) {
      throw new Error("USA Map Studio refused a non-local request target.");
    }
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "x-usa-map-studio-token": descriptor.token,
        },
        body: JSON.stringify({ operation, input }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new MapAppUnavailableError();
    }
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };
    if (!response.ok) {
      const message = body && typeof body.error === "string"
        ? body.error.slice(0, 700)
        : `USA Map Studio returned status ${response.status}.`;
      throw new Error(message);
    }
    return body.result;
  }
}

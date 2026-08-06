#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BEGIN_MARKER = "# BEGIN USA MAP STUDIO MCP - managed by setup";
const END_MARKER = "# END USA MAP STUDIO MCP - managed by setup";
const SERVER_TABLE = "[mcp_servers.usa_map_studio]";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, "..");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function defaultRuntimeFile() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "USA Map Studio", "mcp-runtime.json");
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "USA Map Studio", "mcp-runtime.json");
  }
  return path.join(os.homedir(), ".usa-map-studio", "mcp-runtime.json");
}

function managedBlock({ projectRoot, executablePath, runtimePath }) {
  const mcpServer = path.join(projectRoot, "mcp", "server.mjs");
  const enabledTools = [
    "get_app_status",
    "get_current_project",
    "list_locations",
    "validate_project",
    "stage_location_update",
    "stage_locations_add",
    "stage_locations_from_csv",
    "stage_locations_remove",
    "stage_map_style_update",
    "stage_custom_pin_import",
    "replace_project_draft",
  ];
  return [
    BEGIN_MARKER,
    SERVER_TABLE,
    `command = ${tomlString(executablePath)}`,
    `args = [${tomlString(mcpServer)}]`,
    `cwd = ${tomlString(projectRoot)}`,
    "enabled = true",
    "required = false",
    'default_tools_approval_mode = "writes"',
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 60",
    `enabled_tools = [${enabledTools.map(tomlString).join(", ")}]`,
    "",
    "[mcp_servers.usa_map_studio.env]",
    `USA_MAP_MCP_RUNTIME_FILE = ${tomlString(runtimePath ?? defaultRuntimeFile())}`,
    END_MARKER,
  ].join("\n");
}

function removeManagedBlock(source) {
  const start = source.indexOf(BEGIN_MARKER);
  if (start < 0) return { source, found: false };
  const endStart = source.indexOf(END_MARKER, start);
  if (endStart < 0) throw new Error("The USA Map Studio MCP configuration marker is incomplete.");
  const end = endStart + END_MARKER.length;
  const before = source.slice(0, start).replace(/[ \t]+$/gm, "").trimEnd();
  const after = source.slice(end).trimStart();
  return {
    source: [before, after].filter(Boolean).join("\n\n") + (before || after ? "\n" : ""),
    found: true,
  };
}

export function inspectMapMcpConfiguration({ configPath }) {
  const resolvedConfig = path.resolve(configPath);
  const source = fs.existsSync(resolvedConfig) ? fs.readFileSync(resolvedConfig, "utf8") : "";
  const hasStart = source.includes(BEGIN_MARKER);
  const hasEnd = source.includes(END_MARKER);
  return {
    configPath: resolvedConfig,
    installed: hasStart && hasEnd,
    needsRepair: hasStart !== hasEnd,
  };
}

function backupPath(configPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = `${configPath}.backup-${timestamp}`;
  let suffix = 1;
  while (fs.existsSync(candidate)) candidate = `${configPath}.backup-${timestamp}-${suffix++}`;
  return candidate;
}

function atomicWrite(target, contents) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch { /* Windows does not implement POSIX modes. */ }
}

export function configureMapMcp({
  action = "install",
  configPath,
  projectRoot,
  executablePath,
  runtimePath,
}) {
  const resolvedConfig = path.resolve(configPath);
  const resolvedProject = path.resolve(projectRoot);
  const resolvedExecutable = path.resolve(executablePath);
  if (!fs.existsSync(resolvedExecutable)) throw new Error(`Node.js was not found at ${resolvedExecutable}.`);
  const original = fs.existsSync(resolvedConfig) ? fs.readFileSync(resolvedConfig, "utf8") : "";
  const withoutManaged = removeManagedBlock(original);
  if (action === "install" && !withoutManaged.found && original.includes(SERVER_TABLE)) {
    throw new Error(
      "A manually configured usa_map_studio MCP server already exists. Remove or rename that table before using setup-managed integration.",
    );
  }
  const next = action === "remove"
    ? withoutManaged.source
    : `${withoutManaged.source.trimEnd()}${withoutManaged.source.trim() ? "\n\n" : ""}${managedBlock({
        projectRoot: resolvedProject,
        executablePath: resolvedExecutable,
        runtimePath: runtimePath ? path.resolve(runtimePath) : undefined,
      })}\n`;
  if (next === original) return { changed: false, configPath: resolvedConfig, backupPath: null };

  let savedBackup = null;
  if (original) {
    savedBackup = backupPath(resolvedConfig);
    fs.copyFileSync(resolvedConfig, savedBackup, fs.constants.COPYFILE_EXCL);
    try { fs.chmodSync(savedBackup, 0o600); } catch { /* Windows does not implement POSIX modes. */ }
  }
  atomicWrite(resolvedConfig, next);
  return { changed: true, configPath: resolvedConfig, backupPath: savedBackup };
}

async function main() {
  const action = process.argv[2] === "remove" ? "remove" : "install";
  const projectRoot = argumentValue("--project-root") ?? defaultProjectRoot;
  const executablePath = argumentValue("--executable") ?? process.execPath;
  const runtimePath = argumentValue("--runtime-file");
  const configPath = argumentValue("--config") ?? path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    "config.toml",
  );
  const result = configureMapMcp({ action, configPath, projectRoot, executablePath, runtimePath });
  const verb = action === "remove" ? "removed from" : "registered in";
  process.stdout.write(result.changed
    ? `USA Map Studio MCP ${verb} ${result.configPath}.\n${result.backupPath ? `Previous configuration backup: ${result.backupPath}\n` : ""}`
    : `USA Map Studio MCP configuration already matches ${result.configPath}.\n`);
}

function isCommandLineEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === new URL(process.argv[1], "file:").href;
  }
}

if (isCommandLineEntryPoint()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "MCP configuration failed."}\n`);
    process.exitCode = 1;
  });
}

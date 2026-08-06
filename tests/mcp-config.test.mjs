import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { configureMapMcp, inspectMapMcpConfiguration } from "../scripts/configure-map-mcp.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("MCP configuration install is idempotent and preserves unrelated Codex settings", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "usa-map-mcp-config-"));
  const configPath = path.join(directory, "config.toml");
  fs.writeFileSync(configPath, 'model = "gpt-5"\n\n[mcp_servers.existing]\ncommand = "existing"\n');
  const first = configureMapMcp({
    action: "install",
    configPath,
    projectRoot,
    executablePath: process.execPath,
    runtimePath: path.join(directory, "mcp-runtime.json"),
  });
  const second = configureMapMcp({
    action: "install",
    configPath,
    projectRoot,
    executablePath: process.execPath,
    runtimePath: path.join(directory, "mcp-runtime.json"),
  });
  const source = fs.readFileSync(configPath, "utf8");
  assert.equal(first.changed, true);
  assert.ok(first.backupPath && fs.existsSync(first.backupPath));
  assert.equal(second.changed, false);
  assert.match(source, /model = "gpt-5"/);
  assert.match(source, /\[mcp_servers\.existing\]/);
  assert.match(source, /\[mcp_servers\.usa_map_studio\]/);
  assert.match(source, /default_tools_approval_mode = "writes"/);
  assert.match(source, /replace_project_draft/);
  assert.equal(inspectMapMcpConfiguration({ configPath }).installed, true);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("MCP configuration removal deletes only the managed block", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "usa-map-mcp-remove-"));
  const configPath = path.join(directory, "config.toml");
  fs.writeFileSync(configPath, '[mcp_servers.existing]\ncommand = "existing"\n');
  configureMapMcp({
    action: "install",
    configPath,
    projectRoot,
    executablePath: process.execPath,
  });
  configureMapMcp({
    action: "remove",
    configPath,
    projectRoot,
    executablePath: process.execPath,
  });
  const source = fs.readFileSync(configPath, "utf8");
  assert.match(source, /\[mcp_servers\.existing\]/);
  assert.doesNotMatch(source, /usa_map_studio/);
  assert.equal(inspectMapMcpConfiguration({ configPath }).installed, false);
  fs.rmSync(directory, { recursive: true, force: true });
});

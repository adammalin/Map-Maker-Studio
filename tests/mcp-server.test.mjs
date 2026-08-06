import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMapStudioMcpServer } from "../mcp/server.mjs";
import { MapAppUnavailableError, readRuntimeDescriptor } from "../mcp/map-app-client.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("local MCP exposes bounded read and proposal tools with correct annotations", async () => {
  const calls = [];
  const fakeClient = {
    async command(operation, input) {
      calls.push({ operation, input });
      if (operation === "get_app_status") {
        return {
          app: "USA Map Studio",
          project: { id: "project-fixture", name: "Fixture map", updatedAt: "2026-08-06T12:00:00.000Z", locationCount: 2, layerCount: 2 },
          dirty: false,
          pendingProposal: null,
        };
      }
      return {
        proposal: {
          id: "map-proposal-fixture",
          summary: input.summary,
          proposedLocationCount: 2,
        },
        applied: false,
        saved: false,
      };
    },
  };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMapStudioMcpServer({ client: fakeClient });
  const client = new Client({ name: "usa-map-studio-test", version: "1.0.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), [
      "get_app_status",
      "get_current_project",
      "list_locations",
      "list_layers",
      "validate_project",
      "stage_location_update",
      "stage_locations_add",
      "stage_locations_from_csv",
      "stage_locations_remove",
      "stage_map_style_update",
      "stage_layer_create",
      "stage_layer_update",
      "stage_locations_assign_layer",
      "stage_shared_pin_style_update",
      "stage_layer_remove",
      "stage_custom_pin_import",
      "replace_project_draft",
    ]);
    assert.equal(listed.tools.find((tool) => tool.name === "get_current_project")?.annotations?.readOnlyHint, true);
    assert.equal(listed.tools.find((tool) => tool.name === "replace_project_draft")?.annotations?.readOnlyHint, false);
    assert.equal(listed.tools.find((tool) => tool.name === "stage_locations_remove")?.annotations?.destructiveHint, true);

    const status = await client.callTool({ name: "get_app_status", arguments: {} });
    assert.equal(status.structuredContent.project.name, "Fixture map");
    const staged = await client.callTool({
      name: "stage_map_style_update",
      arguments: {
        patch: { showCountyLines: true },
        expectedUpdatedAt: "2026-08-06T12:00:00.000Z",
        summary: "Show county lines",
      },
    });
    assert.equal(staged.structuredContent.applied, false);
    assert.match(staged.content[0].text, /working map and saved project file have not changed/i);
    assert.deepEqual(calls.map((call) => call.operation), ["get_app_status", "stage_map_style_update"]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("desktop runtime descriptor must be private, regular, and loopback-only", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "usa-map-mcp-runtime-"));
  const runtimePath = path.join(directory, "mcp-runtime.json");
  const descriptor = {
    version: 1,
    pid: process.pid,
    baseUrl: "http://127.0.0.1:45678/",
    token: "a".repeat(64),
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(runtimePath, JSON.stringify(descriptor), { mode: 0o600 });
  assert.equal(readRuntimeDescriptor(runtimePath).baseUrl.hostname, "127.0.0.1");

  fs.writeFileSync(runtimePath, JSON.stringify({ ...descriptor, baseUrl: "http://example.com/" }), { mode: 0o600 });
  assert.throws(() => readRuntimeDescriptor(runtimePath), MapAppUnavailableError);

  if (process.platform !== "win32") {
    fs.writeFileSync(runtimePath, JSON.stringify(descriptor), { mode: 0o600 });
    fs.chmodSync(runtimePath, 0o644);
    assert.throws(() => readRuntimeDescriptor(runtimePath), /unsafe permissions/i);
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test("STDIO MCP process reads the private runtime descriptor and reaches only its loopback app", async () => {
  const token = "b".repeat(64);
  const received = [];
  const fakeApp = http.createServer(async (request, response) => {
    if (request.headers["x-usa-map-studio-token"] !== token) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "bad token" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    received.push(body);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ result: {
      app: "USA Map Studio",
      project: { id: "project-live", name: "Live bridge fixture", updatedAt: "2026-08-06T13:00:00.000Z", locationCount: 3 },
      dirty: false,
      pendingProposal: null,
    } }));
  });
  await new Promise((resolve) => fakeApp.listen(0, "127.0.0.1", resolve));
  const address = fakeApp.address();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "usa-map-mcp-stdio-"));
  const runtimePath = path.join(directory, "mcp-runtime.json");
  fs.writeFileSync(runtimePath, JSON.stringify({
    version: 1,
    pid: process.pid,
    baseUrl: `http://127.0.0.1:${address.port}/`,
    token,
    startedAt: new Date().toISOString(),
  }), { mode: 0o600 });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "mcp", "server.mjs")],
    cwd: projectRoot,
    env: { ...process.env, USA_MAP_MCP_RUNTIME_FILE: runtimePath },
    stderr: "pipe",
  });
  const client = new Client({ name: "usa-map-stdio-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const status = await client.callTool({ name: "get_app_status", arguments: {} });
    assert.equal(status.structuredContent.project.name, "Live bridge fixture");
    assert.equal(received[0].operation, "get_app_status");
  } finally {
    await client.close();
    await new Promise((resolve) => fakeApp.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

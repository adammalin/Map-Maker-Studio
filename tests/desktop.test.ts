import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("Electron renderer keeps Node integration disabled", () => {
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /listen\(0, "127\.0\.0\.1"/);
  assert.match(main, /randomBytes\(32\)/);
  assert.match(main, /mode: 0o600/);
  assert.match(main, /mcpUnauthorizedBlocked/);
  assert.match(main, /async function atomicWriteText/);
  assert.match(main, /project:autosave/);
  assert.match(main, /project:reset-autosave-target/);
  assert.match(main, /usa-map-studio-isolated-/);
});

test("source setup scripts build and smoke-test without creating installers", () => {
  const mac = fs.readFileSync(path.join(root, "scripts", "setup-macos.zsh"), "utf8");
  const windows = fs.readFileSync(path.join(root, "scripts", "setup-windows.ps1"), "utf8");
  assert.match(mac, /npm run build/);
  assert.match(mac, /npm run desktop:smoke/);
  assert.match(windows, /run build/);
  assert.match(windows, /run desktop:smoke/);
  assert.match(mac, /pull --ff-only origin main/);
  assert.match(windows, /pull --ff-only origin main/);
  assert.match(mac, /USA_MAP_SETUP_UPDATE/);
  assert.match(windows, /USA_MAP_SETUP_UPDATE/);
  assert.match(mac, /configure-map-mcp\.mjs install/);
  assert.match(windows, /configure-map-mcp\.mjs.*install/);
  assert.doesNotMatch(`${mac}\n${windows}`, /maker-squirrel|maker-dmg|create-installer/i);
});

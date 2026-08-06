import path from "node:path";
import process from "node:process";
import { packager } from "@electron/packager";

const target = process.argv[2];
if (!new Set(["mac", "windows"]).has(target)) {
  console.error("Usage: node scripts/package-electron.mjs <mac|windows>");
  process.exit(1);
}

const platform = target === "mac" ? "darwin" : "win32";
const arch = target === "mac" ? (process.arch === "arm64" ? "arm64" : "x64") : "x64";
const outputs = await packager({
  dir: process.cwd(),
  name: "USA Map Studio",
  appVersion: "0.1.0",
  platform,
  arch,
  out: path.join(process.cwd(), "out"),
  overwrite: true,
  asar: true,
  prune: true,
  icon: undefined,
  osxSign: false,
  ignore: [
    /^\/tmp($|\/)/,
    /^\/tests($|\/)/,
    /^\/out($|\/)/,
    /^\/\.git($|\/)/,
    /^\/src($|\/)/,
  ],
});
console.log(outputs.join("\n"));

import assert from "node:assert/strict";
import test from "node:test";
import { svgToPowerPoint } from "../src/lib/export";

test("PowerPoint export produces an OOXML zip with a vector SVG map", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#f3f6f4"/><text x="60" y="60">Map export test</text></svg>';
  const bytes = new Uint8Array(await svgToPowerPoint(svg, "Map export test", "Test project"));
  assert.ok(bytes.byteLength > 20_000);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder("latin1").decode(bytes);
  assert.match(text, /ppt\/slides\/slide1\.xml/);
  assert.match(text, /ppt\/media\/image-\d+-\d+\.svg/);
});

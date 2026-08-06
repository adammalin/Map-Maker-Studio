import assert from "node:assert/strict";
import test from "node:test";
import { createCustomPinDesign, customPinInnerMarkup, customPinTransform, sanitizeCustomPinSvg } from "../src/lib/custom-pin";

test("custom SVG pin sanitizer keeps vector geometry and removes active or external content", () => {
  const source = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" onclick="alert(1)">
      <script>alert(1)</script>
      <circle cx="16" cy="16" r="12" fill="currentColor" />
      <image href="https://example.com/remote.png" width="32" height="32" />
      <a href="javascript:alert(1)"><path d="M4 4h8v8H4z" /></a>
    </svg>`;
  const result = sanitizeCustomPinSvg(source);
  assert.match(result.svg, /<circle/);
  assert.match(result.svg, /fill="currentColor"/);
  assert.doesNotMatch(result.svg, /<script|onclick|<image|javascript:|href="https?:/i);
  assert.ok(result.removedItems >= 4);
  assert.equal(result.viewBox, "0 0 32 32");
});

test("custom SVG pin helper creates a portable named asset and centered transform", () => {
  const { design } = createCustomPinDesign(
    '<svg width="20" height="10"><path d="M0 0h20v10H0z" fill="#00662c"/></svg>',
    "Lab marker.svg",
  );
  assert.equal(design.name, "Lab marker");
  assert.equal(design.viewBox, "0 0 20 10");
  assert.match(design.id, /^custom-pin-/);
  assert.match(customPinInnerMarkup(design), /<path/);
  assert.equal(customPinTransform(design.viewBox, 40), "scale(2) translate(-10 -5)");
});

test("custom SVG pins reject document declarations and files without vector shapes", () => {
  assert.throws(
    () => sanitizeCustomPinSvg('<!DOCTYPE svg><svg viewBox="0 0 10 10"><circle r="2"/></svg>'),
    /document type/i,
  );
  assert.throws(
    () => sanitizeCustomPinSvg('<svg viewBox="0 0 10 10"><text>Not a pin</text></svg>'),
    /supported visible vector shape/i,
  );
});

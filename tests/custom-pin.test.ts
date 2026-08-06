import assert from "node:assert/strict";
import test from "node:test";
import {
  createCustomPinDesign,
  customPinInnerMarkup,
  customPinTransform,
  sanitizeCustomPinSvg,
  scopedCustomPinInnerMarkup,
} from "../src/lib/custom-pin";

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

const illustratorGradientPin = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="pin_map_as_of_2026_ia2_Image" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 50.44 50.44">
  <defs>
    <style>
      .st0 { fill: url(#linear-gradient1); }
      .st1 { fill: url(#linear-gradient); }
      .st2 { fill: none; stroke: #f9a013; stroke-width: 1.5; stroke-linejoin: round; }
    </style>
    <linearGradient id="linear-gradient" x1="6949.53" y1="-3641.81" x2="6949.53" y2="-3591.37" gradientTransform="translate(6974.7539 3641.8081) scale(-1 1)" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f9a013"/>
      <stop offset=".56" stop-color="#f9ef1c"/>
      <stop offset="1" stop-color="#fefcee"/>
    </linearGradient>
    <linearGradient id="linear-gradient1" x1="25.22" y1="-100.83" x2="25.22" y2="-60.69" gradientTransform="translate(105.87 -.35) rotate(89.75) scale(1 -1)" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f9a013"/>
      <stop offset=".56" stop-color="#f9ef1c"/>
      <stop offset="1" stop-color="#fefcee"/>
    </linearGradient>
  </defs>
  <path class="st1" d="M0,25.22C0,11.29,11.29,0,25.22,0s25.22,11.29,25.22,25.22-11.29,25.22-25.22,25.22S0,39.15,0,25.22Z"/>
  <circle class="st0" cx="25.22" cy="25.22" r="20.07" transform="translate(-.11 50.33) rotate(-89.75)"/>
  <path class="st2" d="M10 25h30"/>
</svg>`;

test("Illustrator class styles retain gradients and strokes after SVG sanitization", () => {
  const sanitized = sanitizeCustomPinSvg(illustratorGradientPin);

  assert.doesNotMatch(sanitized.svg, /<style|class=/i);
  assert.match(sanitized.svg, /<path[^>]+fill="url\(#linear-gradient\)"/);
  assert.match(sanitized.svg, /<circle[^>]+fill="url\(#linear-gradient1\)"/);
  assert.match(sanitized.svg, /<path[^>]+fill="none"[^>]+stroke="#f9a013"[^>]+stroke-width="1\.5"/);
  assert.match(sanitized.svg, /gradientTransform="translate\(6974\.7539 3641\.8081\) scale\(-1 1\)"/);
});

test("custom pin references receive a unique scope for each rendered instance", () => {
  const { design } = createCustomPinDesign(illustratorGradientPin, "ITER_map_pin.svg");
  const first = scopedCustomPinInnerMarkup(design, "map-location-one");
  const second = scopedCustomPinInnerMarkup(design, "map-location-two");

  assert.match(first, /id="pin-map-location-one-linear-gradient"/);
  assert.match(first, /fill="url\(#pin-map-location-one-linear-gradient\)"/);
  assert.match(second, /id="pin-map-location-two-linear-gradient"/);
  assert.doesNotMatch(second, /pin-map-location-one-linear-gradient/);
});

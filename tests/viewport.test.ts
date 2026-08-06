import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  clampMapZoom,
  panToCanvasPoint,
  steppedMapZoom,
  visibleCanvasRect,
  zoomViewportAt,
} from "../src/lib/viewport";

function basePointAtScreen(viewport: { zoom: number; pan: { x: number; y: number } }, screen: { x: number; y: number }) {
  return {
    x: 600 + (screen.x - viewport.pan.x - 600) / viewport.zoom,
    y: 390 + (screen.y - viewport.pan.y - 390) / viewport.zoom,
  };
}

test("map zoom is clamped and stepped across the Illustrator-style range", () => {
  assert.equal(clampMapZoom(0.01), MIN_MAP_ZOOM);
  assert.equal(clampMapZoom(12), MAX_MAP_ZOOM);
  assert.equal(steppedMapZoom(1, 1), 1.2);
  assert.equal(steppedMapZoom(1, -1), 0.8333);
});

test("anchored zoom preserves the canvas point under the pointer", () => {
  const before = { zoom: 1.35, pan: { x: 84, y: -31 } };
  const anchor = { x: 917, y: 244 };
  const pointBefore = basePointAtScreen(before, anchor);
  const after = zoomViewportAt(before, 2.2, anchor);
  const pointAfter = basePointAtScreen(after, anchor);
  assert.ok(Math.abs(pointAfter.x - pointBefore.x) < 1e-9);
  assert.ok(Math.abs(pointAfter.y - pointBefore.y) < 1e-9);
});

test("navigator viewport rectangle follows zoom and pan", () => {
  assert.deepEqual(visibleCanvasRect({ zoom: 1, pan: { x: 0, y: 0 } }), { x: 0, y: 0, width: 1200, height: 720 });
  assert.deepEqual(visibleCanvasRect({ zoom: 2, pan: { x: 0, y: 0 } }), { x: 300, y: 195, width: 600, height: 360 });
  assert.deepEqual(visibleCanvasRect({ zoom: 2, pan: { x: 100, y: -50 } }), { x: 250, y: 220, width: 600, height: 360 });
});

test("clicking the navigator centers a canvas point in the main viewport", () => {
  const pan = panToCanvasPoint({ x: 910, y: 190 }, 2);
  const centered = basePointAtScreen({ zoom: 2, pan }, { x: 600, y: 360 });
  assert.deepEqual(centered, { x: 910, y: 190 });
});

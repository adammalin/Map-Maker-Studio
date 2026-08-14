import type { MapViewport } from "../types";

export const MAP_CANVAS_WIDTH = 1200;
export const MAP_CANVAS_HEIGHT = 720;
export const MAP_TRANSFORM_CENTER = { x: 600, y: 390 } as const;
export const MAP_VIEWPORT_CENTER = { x: MAP_CANVAS_WIDTH / 2, y: MAP_CANVAS_HEIGHT / 2 } as const;
export const MIN_MAP_ZOOM = 0.4;
export const MAX_MAP_ZOOM = 4;
export const MAP_ZOOM_FACTOR = 1.2;

export interface MapPoint {
  x: number;
  y: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampMapZoom(zoom: number): number {
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, zoom));
}

export function steppedMapZoom(zoom: number, direction: -1 | 1): number {
  const next = direction > 0 ? zoom * MAP_ZOOM_FACTOR : zoom / MAP_ZOOM_FACTOR;
  return clampMapZoom(Number(next.toFixed(4)));
}

export function zoomViewportAt(viewport: MapViewport, requestedZoom: number, anchor = MAP_VIEWPORT_CENTER): MapViewport {
  const nextZoom = clampMapZoom(requestedZoom);
  if (nextZoom === viewport.zoom) return viewport;
  const ratio = nextZoom / viewport.zoom;
  return {
    zoom: nextZoom,
    pan: {
      x: anchor.x - MAP_TRANSFORM_CENTER.x - ratio * (anchor.x - viewport.pan.x - MAP_TRANSFORM_CENTER.x),
      y: anchor.y - MAP_TRANSFORM_CENTER.y - ratio * (anchor.y - viewport.pan.y - MAP_TRANSFORM_CENTER.y),
    },
  };
}

export function visibleCanvasRect(viewport: MapViewport): CanvasRect {
  const left = MAP_TRANSFORM_CENTER.x + (0 - viewport.pan.x - MAP_TRANSFORM_CENTER.x) / viewport.zoom;
  const right = MAP_TRANSFORM_CENTER.x + (MAP_CANVAS_WIDTH - viewport.pan.x - MAP_TRANSFORM_CENTER.x) / viewport.zoom;
  const top = MAP_TRANSFORM_CENTER.y + (0 - viewport.pan.y - MAP_TRANSFORM_CENTER.y) / viewport.zoom;
  const bottom = MAP_TRANSFORM_CENTER.y + (MAP_CANVAS_HEIGHT - viewport.pan.y - MAP_TRANSFORM_CENTER.y) / viewport.zoom;
  const clippedLeft = Math.max(0, Math.min(MAP_CANVAS_WIDTH, left));
  const clippedRight = Math.max(0, Math.min(MAP_CANVAS_WIDTH, right));
  const clippedTop = Math.max(0, Math.min(MAP_CANVAS_HEIGHT, top));
  const clippedBottom = Math.max(0, Math.min(MAP_CANVAS_HEIGHT, bottom));
  return {
    x: Math.min(clippedLeft, clippedRight),
    y: Math.min(clippedTop, clippedBottom),
    width: Math.abs(clippedRight - clippedLeft),
    height: Math.abs(clippedBottom - clippedTop),
  };
}

export function panToCanvasPoint(point: MapPoint, zoom: number, viewportCenter = MAP_VIEWPORT_CENTER): MapPoint {
  return {
    x: viewportCenter.x - MAP_TRANSFORM_CENTER.x - zoom * (point.x - MAP_TRANSFORM_CENTER.x),
    y: viewportCenter.y - MAP_TRANSFORM_CENTER.y - zoom * (point.y - MAP_TRANSFORM_CENTER.y),
  };
}

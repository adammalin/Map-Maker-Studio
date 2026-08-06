import PptxGenJS from "pptxgenjs";
import type { Feature, Geometry } from "geojson";
import { STATE_BY_FIPS } from "../data/state-metadata";
import type { MapLocation, UsaMapProject } from "../types";
import { countyBoundaries, mapPath, projection, stateBoundaries, states } from "./map-geometry";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 720;
const SLIDE_WIDTH = 13.333333;
const SLIDE_HEIGHT = 7.5;
const CANVAS_SCALE = SLIDE_HEIGHT / CANVAS_HEIGHT;
const CANVAS_OFFSET_X = (SLIDE_WIDTH - CANVAS_WIDTH * CANVAS_SCALE) / 2;
const CUSTOM_GEOMETRY = "custGeom" as PptxGenJS.ShapeType;
const SHAPE = {
  diamond: "diamond" as PptxGenJS.ShapeType,
  ellipse: "ellipse" as PptxGenJS.ShapeType,
  line: "line" as PptxGenJS.ShapeType,
  rect: "rect" as PptxGenJS.ShapeType,
  star5: "star5" as PptxGenJS.ShapeType,
  teardrop: "teardrop" as PptxGenJS.ShapeType,
};

type CanvasPoint = [number, number];
type FreeformPoint = NonNullable<PptxGenJS.ShapeProps["points"]>[number];

interface ExportViewport {
  zoom: number;
  pan: { x: number; y: number };
}

interface ParsedSubpath {
  points: CanvasPoint[];
  closed: boolean;
}

const labelOffsets: Record<MapLocation["labelPosition"], { x: number; y: number; anchor: "start" | "middle" | "end" }> = {
  right: { x: 14, y: 4, anchor: "start" },
  left: { x: -14, y: 4, anchor: "end" },
  above: { x: 0, y: -16, anchor: "middle" },
  below: { x: 0, y: 24, anchor: "middle" },
};

export function prepareSvgMarkup(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", "1200");
  clone.setAttribute("height", "720");
  clone.querySelectorAll("[data-editor-only]").forEach((element) => element.remove());
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function svgDataUri(svgMarkup: string): string {
  const bytes = new TextEncoder().encode(svgMarkup);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function hex(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}

function canvasPointToSlide([x, y]: CanvasPoint): CanvasPoint {
  return [CANVAS_OFFSET_X + x * CANVAS_SCALE, y * CANVAS_SCALE];
}

function mapPointToSlide([x, y]: CanvasPoint, viewport: ExportViewport): CanvasPoint {
  const transformed: CanvasPoint = [
    viewport.pan.x + 600 + viewport.zoom * (x - 600),
    viewport.pan.y + 390 + viewport.zoom * (y - 390),
  ];
  return canvasPointToSlide(transformed);
}

function parsePathSubpaths(pathData: string): ParsedSubpath[] {
  const subpaths: ParsedSubpath[] = [];
  let current: ParsedSubpath | null = null;
  const commandPattern = /([MLZ])([^MLZ]*)/gi;
  let command: RegExpExecArray | null;
  while ((command = commandPattern.exec(pathData))) {
    const type = command[1].toUpperCase();
    if (type === "Z") {
      if (current) current.closed = true;
      continue;
    }
    const numbers = command[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      if (type === "M" && index === 0) {
        current = { points: [], closed: false };
        subpaths.push(current);
      }
      current?.points.push([numbers[index], numbers[index + 1]]);
    }
  }
  return subpaths.filter((subpath) => subpath.points.length >= (subpath.closed ? 3 : 2));
}

function squaredDistanceToSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint): number {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const ratio = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) {
      x = end[0];
      y = end[1];
    } else if (ratio > 0) {
      x += dx * ratio;
      y += dy * ratio;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyPoints(points: CanvasPoint[], tolerance: number): CanvasPoint[] {
  if (points.length <= 2) return points;
  const squaredTolerance = tolerance * tolerance;
  const retained = new Uint8Array(points.length);
  retained[0] = 1;
  retained[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let farthestIndex = -1;
    let farthestDistance = squaredTolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredDistanceToSegment(points[index], points[first], points[last]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex > -1) {
      retained[farthestIndex] = 1;
      stack.push([first, farthestIndex], [farthestIndex, last]);
    }
  }
  return points.filter((_, index) => retained[index] === 1);
}

function freeformFromPath(
  pathData: string,
  viewport: ExportViewport,
  tolerance: number,
): { x: number; y: number; w: number; h: number; points: FreeformPoint[] } | null {
  const subpaths = parsePathSubpaths(pathData)
    .map((subpath) => ({ ...subpath, points: simplifyPoints(subpath.points, tolerance) }))
    .filter((subpath) => subpath.points.length >= (subpath.closed ? 3 : 2));
  if (!subpaths.length) return null;

  const projected = subpaths.map((subpath) => ({
    closed: subpath.closed,
    points: subpath.points.map((point) => mapPointToSlide(point, viewport)),
  }));
  const allPoints = projected.flatMap((subpath) => subpath.points);
  const minX = Math.min(...allPoints.map(([x]) => x));
  const maxX = Math.max(...allPoints.map(([x]) => x));
  const minY = Math.min(...allPoints.map(([, y]) => y));
  const maxY = Math.max(...allPoints.map(([, y]) => y));
  const points: FreeformPoint[] = [];
  for (const subpath of projected) {
    subpath.points.forEach(([x, y], index) => {
      points.push({ x: x - minX, y: y - minY, ...(index === 0 ? { moveTo: true } : {}) });
    });
    if (subpath.closed) points.push({ close: true });
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(0.001, maxX - minX),
    h: Math.max(0.001, maxY - minY),
    points,
  };
}

function addFreeform(
  slide: PptxGenJS.Slide,
  pathData: string | null,
  viewport: ExportViewport,
  tolerance: number,
  options: Pick<PptxGenJS.ShapeProps, "fill" | "line" | "objectName">,
): void {
  if (!pathData) return;
  const geometry = freeformFromPath(pathData, viewport, tolerance);
  if (!geometry) return;
  slide.addShape(CUSTOM_GEOMETRY, { ...geometry, ...options });
}

function addMapPin(
  slide: PptxGenJS.Slide,
  location: MapLocation,
  center: CanvasPoint,
  size: number,
): void {
  const line = { color: "FFFFFF", width: Math.max(1.35, location.pinSize * 0.0975) };
  const fill = { color: hex(location.pinColor) };
  const objectName = `Pin - ${location.label}`;
  if (location.pinType === "pin") {
    const width = size * 0.75;
    slide.addShape(SHAPE.teardrop, {
      x: center[0] - width / 2,
      y: center[1] - size * 0.71,
      w: width,
      h: size,
      rotate: 45,
      fill,
      line,
      objectName,
    });
    slide.addShape(SHAPE.ellipse, {
      x: center[0] - size * 0.115,
      y: center[1] - size * 0.45,
      w: size * 0.23,
      h: size * 0.23,
      fill: { color: "FFFFFF" },
      line: { color: "FFFFFF", transparency: 100 },
      objectName: `Pin center - ${location.label}`,
    });
    return;
  }
  const shape = location.pinType === "circle"
    ? SHAPE.ellipse
    : location.pinType === "square"
      ? SHAPE.rect
      : location.pinType === "diamond"
        ? SHAPE.diamond
        : SHAPE.star5;
  const multiplier = location.pinType === "star" ? 1.36 : location.pinType === "diamond" ? 1.24 : 0.96;
  const extent = size * multiplier;
  slide.addShape(shape, {
    x: center[0] - extent / 2,
    y: center[1] - extent / 2,
    w: extent,
    h: extent,
    fill,
    line,
    objectName,
  });
}

function customPinSvg(svg: string, color: string): string {
  return svg.replace(/currentColor/gi, color);
}

export async function svgToPng(svgMarkup: string, scale = 2): Promise<ArrayBuffer> {
  const image = new Image();
  image.decoding = "async";
  const source = svgDataUri(svgMarkup);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The SVG preview could not be rasterized."));
    image.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1200 * scale;
  canvas.height = 720 * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is not available.");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, 1200, 720);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png");
  });
  return blob.arrayBuffer();
}

export async function projectToPowerPoint(
  project: UsaMapProject,
  viewport: ExportViewport = { zoom: 1, pan: { x: 0, y: 0 } },
): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "USA Map Studio";
  pptx.company = "USA Map Studio";
  pptx.subject = "Editable PowerPoint export of a USA Map Studio project";
  pptx.title = project.map.title || project.project.name;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  const slide = pptx.addSlide();
  slide.background = { color: hex(project.map.backgroundColor) };
  slide.addShape(SHAPE.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: SLIDE_HEIGHT,
    fill: { color: hex(project.map.backgroundColor) },
    line: { color: hex(project.map.backgroundColor), transparency: 100 },
    objectName: "Map background",
  });

  const [titleX, titleY] = canvasPointToSlide([54, 27]);
  slide.addText(project.map.title, {
    x: titleX,
    y: titleY,
    w: 11.4,
    h: 0.34,
    margin: 0,
    fontFace: "Aptos Display",
    fontSize: 21,
    bold: true,
    color: "00454D",
    breakLine: false,
    objectName: "Map title",
  });
  if (project.map.subtitle) {
    const [subtitleX, subtitleY] = canvasPointToSlide([54, 60]);
    slide.addText(project.map.subtitle, {
      x: subtitleX,
      y: subtitleY,
      w: 11.4,
      h: 0.22,
      margin: 0,
      fontFace: "Aptos",
      fontSize: 9.75,
      bold: true,
      color: "526966",
      breakLine: false,
      objectName: "Map subtitle",
    });
  }

  for (const state of states.features) {
    const pathData = mapPath(state as Feature<Geometry>);
    addFreeform(slide, pathData, viewport, 0.38, {
      fill: { color: hex(project.map.stateColors[state.properties.STATEFP] ?? project.map.landColor) },
      line: { color: hex(project.map.landColor), transparency: 100, width: 0.1 },
      objectName: `State - ${state.properties.STUSPS} - ${state.properties.NAME}`,
    });
  }

  if (project.map.showCountyLines) {
    addFreeform(slide, mapPath(countyBoundaries), viewport, 0.58, {
      fill: { color: "FFFFFF", transparency: 100 },
      line: { color: hex(project.map.countyBorderColor), transparency: 28, width: 0.34 },
      objectName: "County boundaries",
    });
  }
  addFreeform(slide, mapPath(stateBoundaries), viewport, 0.32, {
    fill: { color: "FFFFFF", transparency: 100 },
    line: { color: hex(project.map.borderColor), width: Math.max(0.2, project.map.borderWidth * 0.75) },
    objectName: "State boundaries",
  });

  if (project.map.showStateLabels) {
    for (const state of states.features) {
      const [x, y] = mapPath.centroid(state as Feature<Geometry>);
      const metadata = STATE_BY_FIPS.get(state.properties.STATEFP);
      if (!metadata || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const [slideX, slideY] = mapPointToSlide([x, y], viewport);
      slide.addText(metadata.abbreviation, {
        x: slideX - 0.16,
        y: slideY - 0.08,
        w: 0.32,
        h: 0.16,
        margin: 0,
        align: "center",
        valign: "middle",
        fontFace: "Aptos",
        fontSize: Math.max(5.5, 6.4 * viewport.zoom),
        bold: true,
        color: hex(project.map.labelColor),
        outline: { color: hex(project.map.labelHaloColor), size: 1.5 },
        objectName: `State label - ${metadata.abbreviation}`,
      });
    }
  }

  const customPins = new Map(project.customPins.map((design) => [design.id, design]));
  for (const location of project.locations) {
    const point = projection([location.longitude, location.latitude]);
    if (!point) continue;
    const center = mapPointToSlide(point, viewport);
    const pinSize = location.pinSize * CANVAS_SCALE * viewport.zoom;
    const customPin = location.customPinId ? customPins.get(location.customPinId) : undefined;
    if (customPin) {
      slide.addImage({
        data: svgDataUri(customPinSvg(customPin.svg, location.pinColor)),
        x: center[0] - pinSize / 2,
        y: center[1] - pinSize / 2,
        w: pinSize,
        h: pinSize,
        objectName: `Custom pin - ${location.label}`,
      });
    } else {
      addMapPin(slide, location, center, pinSize);
    }
    if (project.map.showLocationLabels && location.showLabel) {
      const offset = labelOffsets[location.labelPosition];
      const offsetX = offset.x + (offset.anchor === "start" ? location.pinSize * 0.25 : offset.anchor === "end" ? -location.pinSize * 0.25 : 0);
      const [anchorX, anchorY] = mapPointToSlide([point[0] + offsetX, point[1] + offset.y], viewport);
      const width = Math.max(0.72, Math.min(2.8, location.label.length * 0.075 * viewport.zoom));
      const x = offset.anchor === "start" ? anchorX : offset.anchor === "end" ? anchorX - width : anchorX - width / 2;
      slide.addText(location.label, {
        x,
        y: anchorY - 0.1,
        w: width,
        h: 0.2,
        margin: 0,
        align: offset.anchor === "middle" ? "center" : offset.anchor === "start" ? "left" : "right",
        valign: "middle",
        fontFace: "Aptos",
        fontSize: Math.max(7, 8.6 * viewport.zoom),
        bold: true,
        color: hex(location.labelColor),
        outline: { color: hex(project.map.labelHaloColor), size: 2 },
        objectName: `Location label - ${location.label}`,
      });
    }
  }

  if (project.map.showLegend) {
    const [legendX, legendY] = canvasPointToSlide([54, 660]);
    const legendWidth = 286 * CANVAS_SCALE;
    const legendHeight = 34 * CANVAS_SCALE;
    slide.addShape(SHAPE.rect, {
      x: legendX,
      y: legendY,
      w: legendWidth,
      h: legendHeight,
      fill: { color: "FFFFFF" },
      line: { color: "C8D3CE", width: 0.75 },
      objectName: "Legend background",
    });
    slide.addShape(SHAPE.ellipse, {
      x: legendX + 0.135,
      y: legendY + 0.125,
      w: 0.1,
      h: 0.1,
      fill: { color: "00662C" },
      line: { color: "00662C", transparency: 100 },
      objectName: "Legend location symbol",
    });
    slide.addText(`${project.locations.length} mapped location${project.locations.length === 1 ? "" : "s"}`, {
      x: legendX + 0.32,
      y: legendY + 0.085,
      w: 1.22,
      h: 0.17,
      margin: 0,
      fontFace: "Aptos",
      fontSize: 7.1,
      bold: true,
      color: "373A36",
      objectName: "Legend location count",
    });
    slide.addShape(SHAPE.line, {
      x: legendX + 1.54,
      y: legendY + 0.177,
      w: 0.2,
      h: 0,
      line: { color: hex(project.map.borderColor), width: 1.05 },
      objectName: "Legend boundary symbol",
    });
    slide.addText("2025 Census geography", {
      x: legendX + 1.82,
      y: legendY + 0.09,
      w: 1.08,
      h: 0.16,
      margin: 0,
      fontFace: "Aptos",
      fontSize: 6.4,
      bold: true,
      color: "526966",
      objectName: "Legend geography source",
    });
  }

  slide.addNotes("[Sources]\nBoundary and place-coordinate data: U.S. Census Bureau 2025 Cartographic Boundary and Gazetteer files.\nMap composition: USA Map Studio project export.\nEditability: states, boundary layers, text, standard pins, and legend elements are separate PowerPoint objects. Imported custom SVG pins remain separate movable vector objects.");
  return pptx.write({ outputType: "arraybuffer" }) as Promise<ArrayBuffer>;
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

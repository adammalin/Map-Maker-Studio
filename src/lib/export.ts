import PptxGenJS from "pptxgenjs";
import type { Feature, Geometry } from "geojson";
import { STATE_BY_FIPS } from "../data/state-metadata";
import type { MapLocation, UsaMapProject } from "../types";
import type { EffectivePinStyle } from "./layers";
import { effectivePinStyle, materializeEffectivePinStyles, visibleLocations } from "./layers";
import { countyBoundaries, mapPath, projection, stateBoundaries, states } from "./map-geometry";
import { calloutBox, calloutConnector, measureCallout } from "./callouts";

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
  style: EffectivePinStyle,
  center: CanvasPoint,
  size: number,
  objectPrefix: string,
): void {
  const line = { color: "FFFFFF", width: Math.max(1.35, style.pinSize * 0.0975) };
  const fill = { color: hex(style.pinColor) };
  const objectName = `${objectPrefix}Pin - ${location.label}`;
  if (style.pinType === "pin") {
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
      objectName: `${objectPrefix}Pin center - ${location.label}`,
    });
    return;
  }
  const shape = style.pinType === "circle"
    ? SHAPE.ellipse
    : style.pinType === "square"
      ? SHAPE.rect
      : style.pinType === "diamond"
        ? SHAPE.diamond
        : SHAPE.star5;
  const multiplier = style.pinType === "star" ? 1.36 : style.pinType === "diamond" ? 1.24 : 0.96;
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

function customPinSlideExtent(viewBox: string, maxExtent: number): { width: number; height: number } {
  const [, , sourceWidth, sourceHeight] = viewBox.split(/[\s,]+/).map(Number);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { width: maxExtent, height: maxExtent };
  }
  const scale = maxExtent / Math.max(sourceWidth, sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

function addLeaderSegment(
  slide: PptxGenJS.Slide,
  start: CanvasPoint,
  end: CanvasPoint,
  viewport: ExportViewport,
  color: string,
  width: number,
  objectName: string,
): void {
  const first = mapPointToSlide(start, viewport);
  const second = mapPointToSlide(end, viewport);
  const x = Math.min(first[0], second[0]);
  const y = Math.min(first[1], second[1]);
  const w = Math.max(0.001, Math.abs(second[0] - first[0]));
  const h = Math.max(0.001, Math.abs(second[1] - first[1]));
  slide.addShape(SHAPE.line, {
    x,
    y,
    w,
    h,
    flipV: (second[0] - first[0]) * (second[1] - first[1]) < 0,
    line: { color: hex(color), width: Math.max(0.25, width * 0.75) },
    objectName,
  });
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
  project = materializeEffectivePinStyles(project);
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
  for (const [layerIndex, layer] of project.layers.entries()) {
    if (!layer.visible) continue;
    const objectPrefix = `[Layer ${layerIndex + 1}: ${layer.name}] `;
    for (const location of project.locations.filter((candidate) => candidate.layerId === layer.id && candidate.visible)) {
      const point = projection([location.longitude, location.latitude]);
      if (!point) continue;
      const style = effectivePinStyle(project, location);
      const center = mapPointToSlide(point, viewport);
      const pinSize = style.pinSize * CANVAS_SCALE * viewport.zoom;
      const customPin = style.customPinId ? customPins.get(style.customPinId) : undefined;
      if (customPin) {
        const extent = customPinSlideExtent(customPin.viewBox, pinSize);
        slide.addImage({
          data: svgDataUri(customPinSvg(customPin.svg, style.pinColor)),
          x: center[0] - extent.width / 2,
          y: center[1] - extent.height / 2,
          w: extent.width,
          h: extent.height,
          objectName: `${objectPrefix}Custom pin - ${location.label}`,
        });
      } else {
        addMapPin(slide, location, style, center, pinSize, objectPrefix);
      }
      if (project.map.showLocationLabels && location.callout.visible) {
        const metrics = measureCallout(location.callout);
        const connector = calloutConnector(point, location.callout, metrics, style.pinSize * 0.55);
        if (connector.visible) {
          connector.points.slice(0, -1).forEach((start, segmentIndex) => {
            addLeaderSegment(
              slide,
              start,
              connector.points[segmentIndex + 1],
              viewport,
              location.callout.leaderColor,
              location.callout.leaderWidth,
              `${objectPrefix}Leader line ${segmentIndex + 1} - ${location.label}`,
            );
          });
        }
        const box = calloutBox(point, location.callout, metrics);
        for (const row of metrics.rows) {
          const rowLeft = location.callout.anchor === "start"
            ? box.left
            : location.callout.anchor === "end"
              ? box.right - row.width
              : point[0] + location.callout.offsetX - row.width / 2;
          const [rowX, rowY] = mapPointToSlide([rowLeft, box.top + row.y], viewport);
          slide.addText(row.label.text, {
            x: rowX,
            y: rowY,
            w: Math.max(0.08, row.width * CANVAS_SCALE * viewport.zoom + 0.02),
            h: Math.max(0.08, row.height * CANVAS_SCALE * viewport.zoom),
            margin: 0,
            align: location.callout.anchor === "middle" ? "center" : location.callout.anchor === "start" ? "left" : "right",
            valign: "top",
            fontFace: row.label.fontFamily,
            fontSize: Math.max(4.5, row.label.fontSize * 0.75 * viewport.zoom),
            bold: row.label.fontWeight >= 600,
            color: hex(row.label.color),
            breakLine: false,
            objectName: `${objectPrefix}${row.label.role[0].toUpperCase()}${row.label.role.slice(1)} label - ${row.label.text}`,
          });
        }
      }
    }
  }

  if (project.map.showLegend) {
    const mappedLocations = visibleLocations(project);
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
      fill: { color: hex(project.sharedPinStyle.enabled ? project.sharedPinStyle.pinColor : "#00662c") },
      line: { color: "00662C", transparency: 100 },
      objectName: "Legend location symbol",
    });
    slide.addText(`${mappedLocations.length} visible location${mappedLocations.length === 1 ? "" : "s"}`, {
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

  const layerNotes = project.layers.map((layer, index) => `Layer ${index + 1}: ${layer.name} (${layer.visible ? "visible" : "hidden"})`).join("\n");
  slide.addNotes(`[Sources]\nBoundary and place-coordinate data: U.S. Census Bureau 2025 Cartographic Boundary and Gazetteer files.\nMap composition: USA Map Studio project export.\n${layerNotes}\nEditability: states, boundaries, text, standard pins, and legend elements are separate PowerPoint objects. Visible location objects are prefixed with their layer name in PowerPoint's Selection Pane. Imported custom SVG pins remain separate movable vector objects.`);
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

import { projection } from "./map-geometry";
import { effectivePinStyle, visibleLocations } from "./layers";
import type {
  LabelPosition,
  LocationCallout,
  LocationLabel,
  LocationLabelMode,
  LocationLabelRole,
  MapLocation,
  UsaMapProject,
} from "../types";

export interface CalloutRowMetrics {
  label: LocationLabel;
  width: number;
  height: number;
  y: number;
}

export interface CalloutMetrics {
  width: number;
  height: number;
  rows: CalloutRowMetrics[];
}

export interface CalloutBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CalloutConnector {
  visible: boolean;
  style: "straight" | "elbow";
  points: Array<[number, number]>;
}

export interface CalloutOverlap {
  firstLocationId: string;
  secondLocationId: string;
}

export interface LeaderLineCrossing {
  firstLocationId: string;
  secondLocationId: string;
}

interface ConnectorSegment {
  locationId: string;
  start: [number, number];
  end: [number, number];
}

const FONT_WIDTH_FACTORS: Record<string, number> = {
  narrow: 0.34,
  regular: 0.56,
  wide: 0.82,
};

const LEGACY_OFFSETS: Record<LabelPosition, Pick<LocationCallout, "offsetX" | "offsetY" | "anchor">> = {
  right: { offsetX: 18, offsetY: 0, anchor: "start" },
  left: { offsetX: -18, offsetY: 0, anchor: "end" },
  above: { offsetX: 0, offsetY: -22, anchor: "middle" },
  below: { offsetX: 0, offsetY: 28, anchor: "middle" },
};

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function createLocationLabel(
  role: LocationLabelRole,
  text: string,
  partial: Partial<LocationLabel> = {},
): LocationLabel {
  const company = role === "company";
  return {
    id: partial.id ?? createId("label"),
    role,
    text: text.replace(/\s+/g, " ").trim(),
    visible: partial.visible ?? true,
    fontFamily: partial.fontFamily ?? "Aptos",
    fontSize: partial.fontSize ?? (company ? 9.5 : 11.5),
    fontWeight: partial.fontWeight ?? (company ? 600 : 800),
    color: partial.color ?? "#373a36",
  };
}

export function createDefaultCallout(
  cityLabel: string,
  partial: Partial<LocationCallout> = {},
): LocationCallout {
  return {
    visible: partial.visible ?? true,
    labels: partial.labels ?? [createLocationLabel("city", cityLabel)],
    offsetX: partial.offsetX ?? 18,
    offsetY: partial.offsetY ?? 0,
    anchor: partial.anchor ?? "start",
    placementMode: partial.placementMode ?? "auto",
    locked: partial.locked ?? false,
    leaderLine: partial.leaderLine ?? "auto",
    leaderColor: partial.leaderColor ?? "#526966",
    leaderWidth: partial.leaderWidth ?? 1,
  };
}

export function calloutFromLegacyLocation(location: Pick<MapLocation, "id" | "label" | "showLabel" | "labelColor" | "labelPosition">): LocationCallout {
  const offset = LEGACY_OFFSETS[location.labelPosition] ?? LEGACY_OFFSETS.right;
  return createDefaultCallout(location.label, {
    visible: location.showLabel,
    labels: [createLocationLabel("city", location.label, {
      id: `label-${location.id}-city`,
      color: location.labelColor,
    })],
    ...offset,
  });
}

export function visibleCalloutLabels(callout: LocationCallout): LocationLabel[] {
  if (!callout.visible) return [];
  return callout.labels.filter((label) => label.visible && label.text.trim());
}

export function materializeLabelDisplay(
  project: UsaMapProject,
  context: { selectedLayerId?: string | null; selectedLocationId?: string | null } = {},
): UsaMapProject {
  const mode: LocationLabelMode = project.map.locationLabelMode ?? (project.map.showLocationLabels ? "city" : "pins");
  const showLabels = mode !== "pins";
  return {
    ...project,
    map: { ...project.map, showLocationLabels: showLabels, locationLabelMode: mode },
    locations: project.locations.map((location) => {
      const inScope = mode === "selected-layer"
        ? location.layerId === context.selectedLayerId
        : mode === "selected-location"
          ? location.id === context.selectedLocationId
          : true;
      const allowedRoles = mode === "city"
        ? new Set<LocationLabelRole>(["city"])
        : mode === "city-company"
          ? new Set<LocationLabelRole>(["city", "company"])
          : null;
      return {
        ...location,
        callout: {
          ...location.callout,
          visible: showLabels && inScope && location.callout.visible,
          labels: location.callout.labels.map((label) => ({
            ...label,
            visible: label.visible && (!allowedRoles || allowedRoles.has(label.role)),
          })),
        },
      };
    }),
  };
}

function characterWidth(character: string): number {
  if (/\s/.test(character)) return 0.3;
  if (/[ilI1.,'`:;]/.test(character)) return FONT_WIDTH_FACTORS.narrow;
  if (/[MW@%&#QGO]/.test(character)) return FONT_WIDTH_FACTORS.wide;
  return FONT_WIDTH_FACTORS.regular;
}

export function estimateLabelWidth(label: LocationLabel): number {
  const weightAdjustment = label.fontWeight >= 700 ? 1.035 : 1;
  return Math.max(
    label.fontSize * 1.8,
    Array.from(label.text).reduce((width, character) => width + characterWidth(character), 0)
      * label.fontSize
      * weightAdjustment,
  );
}

export function measureCallout(callout: LocationCallout): CalloutMetrics {
  const labels = visibleCalloutLabels(callout);
  let y = 0;
  const rows = labels.map((label, index) => {
    const height = label.fontSize * 1.22;
    const row = { label, width: estimateLabelWidth(label), height, y };
    y += height + (index === labels.length - 1 ? 0 : 1.5);
    return row;
  });
  return {
    width: Math.max(0, ...rows.map((row) => row.width)),
    height: y,
    rows,
  };
}

export function calloutBox(
  pin: [number, number],
  callout: Pick<LocationCallout, "offsetX" | "offsetY" | "anchor">,
  metrics: Pick<CalloutMetrics, "width" | "height">,
): CalloutBox {
  const anchorX = pin[0] + callout.offsetX;
  const centerY = pin[1] + callout.offsetY;
  const left = callout.anchor === "start"
    ? anchorX
    : callout.anchor === "end"
      ? anchorX - metrics.width
      : anchorX - metrics.width / 2;
  const top = centerY - metrics.height / 2;
  return {
    left,
    top,
    right: left + metrics.width,
    bottom: top + metrics.height,
    width: metrics.width,
    height: metrics.height,
  };
}

function nearestPointOnBox(pin: [number, number], box: CalloutBox): [number, number] {
  const x = Math.max(box.left, Math.min(box.right, pin[0]));
  const y = Math.max(box.top, Math.min(box.bottom, pin[1]));
  if (x !== pin[0] || y !== pin[1]) return [x, y];
  const edges = [
    { point: [box.left, pin[1]] as [number, number], distance: pin[0] - box.left },
    { point: [box.right, pin[1]] as [number, number], distance: box.right - pin[0] },
    { point: [pin[0], box.top] as [number, number], distance: pin[1] - box.top },
    { point: [pin[0], box.bottom] as [number, number], distance: box.bottom - pin[1] },
  ];
  return edges.sort((a, b) => a.distance - b.distance)[0].point;
}

export function calloutConnector(
  pin: [number, number],
  callout: LocationCallout,
  metrics = measureCallout(callout),
  pinRadius = 0,
): CalloutConnector {
  const box = calloutBox(pin, callout, metrics);
  const end = nearestPointOnBox(pin, box);
  const distance = Math.hypot(end[0] - pin[0], end[1] - pin[1]);
  const style = callout.leaderLine === "elbow" ? "elbow" : "straight";
  const visible = callout.leaderLine !== "none"
    && (callout.leaderLine !== "auto" || distance >= 20);
  if (!visible) return { visible: false, style, points: [] };
  const ratio = distance > 0 ? Math.min(pinRadius, Math.max(0, distance - 1)) / distance : 0;
  const start: [number, number] = [
    pin[0] + (end[0] - pin[0]) * ratio,
    pin[1] + (end[1] - pin[1]) * ratio,
  ];
  if (style === "straight") return { visible: true, style, points: [start, end] };
  const horizontalFirst = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]);
  const bend: [number, number] = horizontalFirst ? [end[0], start[1]] : [start[0], end[1]];
  return { visible: true, style, points: [start, bend, end] };
}

function boxesOverlap(first: CalloutBox, second: CalloutBox, padding = 4): boolean {
  return !(
    first.right + padding <= second.left
    || second.right + padding <= first.left
    || first.bottom + padding <= second.top
    || second.bottom + padding <= first.top
  );
}

function boxOutsidePenalty(box: CalloutBox, bottomBoundary: number): number {
  const left = Math.max(0, 24 - box.left);
  const right = Math.max(0, box.right - 1176);
  const top = Math.max(0, 90 - box.top);
  const bottom = Math.max(0, box.bottom - bottomBoundary);
  return (left + right + top + bottom) * 50_000;
}

function candidates(metrics: CalloutMetrics, pinSize: number): Array<Pick<LocationCallout, "offsetX" | "offsetY" | "anchor">> {
  const side = pinSize * 0.55 + 10;
  const vertical = pinSize * 0.55 + 8 + metrics.height / 2;
  const farSide = side + Math.max(22, metrics.width * 0.16);
  const farVertical = vertical + 22;
  return [
    { offsetX: side, offsetY: 0, anchor: "start" },
    { offsetX: -side, offsetY: 0, anchor: "end" },
    { offsetX: 0, offsetY: -vertical, anchor: "middle" },
    { offsetX: 0, offsetY: vertical, anchor: "middle" },
    { offsetX: side, offsetY: -vertical, anchor: "start" },
    { offsetX: side, offsetY: vertical, anchor: "start" },
    { offsetX: -side, offsetY: -vertical, anchor: "end" },
    { offsetX: -side, offsetY: vertical, anchor: "end" },
    { offsetX: farSide, offsetY: -farVertical, anchor: "start" },
    { offsetX: farSide, offsetY: farVertical, anchor: "start" },
    { offsetX: -farSide, offsetY: -farVertical, anchor: "end" },
    { offsetX: -farSide, offsetY: farVertical, anchor: "end" },
  ];
}

function railCandidates(
  point: [number, number],
  metrics: CalloutMetrics,
  bottomBoundary: number,
): Array<Pick<LocationCallout, "offsetX" | "offsetY" | "anchor">> {
  const spacing = Math.max(18, metrics.height + 7);
  const top = 96 + metrics.height / 2;
  const bottom = bottomBoundary - metrics.height / 2;
  const candidates: Array<Pick<LocationCallout, "offsetX" | "offsetY" | "anchor">> = [];
  for (let y = top; y <= bottom; y += spacing) {
    candidates.push(
      { offsetX: 34 - point[0], offsetY: y - point[1], anchor: "start" },
      { offsetX: 1166 - point[0], offsetY: y - point[1], anchor: "end" },
    );
  }
  return candidates;
}

interface ProjectedCallout {
  location: MapLocation;
  point: [number, number];
  metrics: CalloutMetrics;
  pinSize: number;
}

function projectedCallouts(project: UsaMapProject): ProjectedCallout[] {
  if (!project.map.showLocationLabels) return [];
  return visibleLocations(project)
    .map((location) => {
      const point = projection([location.longitude, location.latitude]);
      const metrics = measureCallout(location.callout);
      return point && metrics.rows.length
        ? { location, point, metrics, pinSize: effectivePinStyle(project, location).pinSize }
        : null;
    })
    .filter((entry): entry is ProjectedCallout => Boolean(entry));
}

export function findCalloutOverlaps(project: UsaMapProject): CalloutOverlap[] {
  const entries = projectedCallouts(project).map((entry) => ({
    ...entry,
    box: calloutBox(entry.point, entry.location.callout, entry.metrics),
  }));
  const overlaps: CalloutOverlap[] = [];
  const bottomBoundary = project.map.showLegend ? 642 : 696;
  for (const entry of entries) {
    if (entry.box.left < 24 || entry.box.right > 1176 || entry.box.top < 90 || entry.box.bottom > bottomBoundary) {
      overlaps.push({ firstLocationId: entry.location.id, secondLocationId: "__canvas-boundary__" });
    }
  }
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      if (boxesOverlap(entries[first].box, entries[second].box, 3)) {
        overlaps.push({
          firstLocationId: entries[first].location.id,
          secondLocationId: entries[second].location.id,
        });
      }
    }
  }
  return overlaps;
}

function connectorSegments(locationId: string, connector: CalloutConnector): ConnectorSegment[] {
  if (!connector.visible) return [];
  return connector.points.slice(1).map((point, index) => ({
    locationId,
    start: connector.points[index],
    end: point,
  }));
}

function segmentsCross(first: ConnectorSegment, second: ConnectorSegment): boolean {
  const orientation = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const firstStart = orientation(first.start, first.end, second.start);
  const firstEnd = orientation(first.start, first.end, second.end);
  const secondStart = orientation(second.start, second.end, first.start);
  const secondEnd = orientation(second.start, second.end, first.end);
  const epsilon = 0.001;
  return firstStart * firstEnd < -epsilon && secondStart * secondEnd < -epsilon;
}

function projectedConnectorSegments(entry: ProjectedCallout): ConnectorSegment[] {
  return connectorSegments(
    entry.location.id,
    calloutConnector(entry.point, entry.location.callout, entry.metrics, entry.pinSize * 0.55),
  );
}

export function findLeaderLineCrossings(project: UsaMapProject): LeaderLineCrossing[] {
  const segments = projectedCallouts(project).flatMap(projectedConnectorSegments);
  const pairs = new Set<string>();
  const crossings: LeaderLineCrossing[] = [];
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      if (segments[first].locationId === segments[second].locationId || !segmentsCross(segments[first], segments[second])) continue;
      const ids = [segments[first].locationId, segments[second].locationId].sort();
      const key = ids.join("::");
      if (pairs.has(key)) continue;
      pairs.add(key);
      crossings.push({ firstLocationId: ids[0], secondLocationId: ids[1] });
    }
  }
  return crossings;
}

export function arrangeProjectCallouts(
  project: UsaMapProject,
  options: { includeLocked?: boolean } = {},
): { project: UsaMapProject; overlaps: CalloutOverlap[]; crossings: LeaderLineCrossing[] } {
  const next = structuredClone(project);
  const entries = projectedCallouts(next);
  const locationById = new Map(next.locations.map((location) => [location.id, location]));
  const fixed = entries.filter(({ location }) => location.callout.locked && !options.includeLocked);
  const fixedIds = new Set(fixed.map((entry) => entry.location.id));
  const movable = entries
    .filter(({ location }) => !fixedIds.has(location.id))
    .sort((first, second) => first.point[1] - second.point[1] || first.point[0] - second.point[0]);
  const occupied = fixed.map((entry) => calloutBox(entry.point, entry.location.callout, entry.metrics));
  const occupiedSegments = fixed.flatMap(projectedConnectorSegments);
  const pins = entries.map((entry) => ({
    id: entry.location.id,
    box: {
      left: entry.point[0] - entry.pinSize * 0.62,
      right: entry.point[0] + entry.pinSize * 0.62,
      top: entry.point[1] - entry.pinSize * 0.72,
      bottom: entry.point[1] + entry.pinSize * 0.72,
      width: entry.pinSize * 1.24,
      height: entry.pinSize * 1.44,
    },
  }));
  const bottomBoundary = next.map.showLegend ? 642 : 696;

  for (const entry of movable) {
    const ranked = [...candidates(entry.metrics, entry.pinSize), ...railCandidates(entry.point, entry.metrics, bottomBoundary)].map((candidate, index) => {
      const box = calloutBox(entry.point, candidate, entry.metrics);
      const labelHits = occupied.filter((other) => boxesOverlap(box, other, 5)).length;
      const pinHits = pins.filter((pin) => pin.id !== entry.location.id && boxesOverlap(box, pin.box, 2)).length;
      const candidateCallout = { ...entry.location.callout, ...candidate };
      const candidateSegments = connectorSegments(
        entry.location.id,
        calloutConnector(entry.point, candidateCallout, entry.metrics, entry.pinSize * 0.55),
      );
      const crossingHits = candidateSegments.reduce(
        (count, segment) => count + occupiedSegments.filter((other) => segmentsCross(segment, other)).length,
        0,
      );
      const distance = Math.hypot(candidate.offsetX, candidate.offsetY);
      return {
        candidate,
        box,
        candidateSegments,
        score: boxOutsidePenalty(box, bottomBoundary) + labelHits * 100_000 + crossingHits * 35_000 + pinHits * 20_000 + distance + index * 0.01,
      };
    }).sort((first, second) => first.score - second.score);
    const best = ranked[0];
    const location = locationById.get(entry.location.id);
    if (!best || !location) continue;
    location.callout = {
      ...location.callout,
      ...best.candidate,
      placementMode: "auto",
      locked: false,
    };
    occupied.push(best.box);
    occupiedSegments.push(...best.candidateSegments);
  }

  return {
    project: next,
    overlaps: findCalloutOverlaps(next),
    crossings: findLeaderLineCrossings(next),
  };
}

export function enableProjectLocationLabels(project: UsaMapProject): {
  project: UsaMapProject;
  revealedAll: boolean;
  overlaps: CalloutOverlap[];
  crossings: LeaderLineCrossing[];
} {
  const withLabelsEnabled: UsaMapProject = {
    ...project,
    map: {
      ...project.map,
      showLocationLabels: true,
      locationLabelMode: project.map.locationLabelMode === "pins" ? "city" : project.map.locationLabelMode,
    },
  };
  if (project.locations.some((location) => location.callout.visible)) {
    return {
      project: withLabelsEnabled,
      revealedAll: false,
      overlaps: findCalloutOverlaps(withLabelsEnabled),
      crossings: findLeaderLineCrossings(withLabelsEnabled),
    };
  }

  const revealed: UsaMapProject = {
    ...withLabelsEnabled,
    locations: withLabelsEnabled.locations.map((location) => ({
      ...location,
      showLabel: true,
      callout: { ...location.callout, visible: true },
    })),
  };
  const arranged = arrangeProjectCallouts(revealed);
  return { ...arranged, revealedAll: true };
}

export function primaryCalloutText(location: MapLocation): string {
  return visibleCalloutLabels(location.callout)[0]?.text || location.label;
}

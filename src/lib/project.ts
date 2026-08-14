import { createLocation, createMapLayer, DEFAULT_LAYER_ID } from "../data/default-project";
import { normalizeState } from "../data/state-metadata";
import { sanitizeCustomPinSvg } from "./custom-pin";
import { calloutFromLegacyLocation, createDefaultCallout, createLocationLabel } from "./callouts";
import {
  PROJECT_SCHEMA,
  PROJECT_SCHEMA_VERSION,
  type CustomPinDesign,
  type CalloutAnchor,
  type CalloutPlacementMode,
  type LabelPosition,
  type LeaderLineStyle,
  type LocationCallout,
  type LocationLabel,
  type LocationLabelRole,
  type LocationLabelWeight,
  type MapLayer,
  type MapLocation,
  type MapViewport,
  type PinType,
  type SharedPinStyle,
  type UsaMapProject,
} from "../types";
import { materializeEffectivePinStyles, sharedPinStyleFromLocation } from "./layers";

const PIN_TYPES = new Set<PinType>(["pin", "circle", "square", "diamond", "star"]);
const LABEL_POSITIONS = new Set<LabelPosition>(["right", "left", "above", "below"]);
const CALLOUT_ANCHORS = new Set<CalloutAnchor>(["start", "middle", "end"]);
const CALLOUT_PLACEMENT_MODES = new Set<CalloutPlacementMode>(["auto", "manual"]);
const LEADER_LINE_STYLES = new Set<LeaderLineStyle>(["auto", "none", "straight", "elbow"]);
const LABEL_ROLES = new Set<LocationLabelRole>(["city", "company", "custom"]);
const LABEL_WEIGHTS = new Set<LocationLabelWeight>([400, 500, 600, 700, 800]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function fileSafeName(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "usa-map";
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/**
 * Merge an editor or MCP patch while keeping default place names in sync.
 * Explicitly customized display labels remain untouched.
 */
export function mergeLocationPatch(existing: MapLocation, patch: Partial<MapLocation>): MapLocation {
  const placeChanged = patch.city !== undefined || patch.state !== undefined;
  const next: MapLocation = { ...existing, ...patch, id: existing.id };
  if (!placeChanged) return next;

  const previousCanonical = `${existing.city}, ${existing.state}`;
  const nextCanonical = `${next.city}, ${next.state}`;
  if (patch.label === undefined && existing.label.trim() === previousCanonical) {
    next.label = nextCanonical;
  }
  if (patch.callout !== undefined) return next;

  next.callout = {
    ...existing.callout,
    labels: existing.callout.labels.map((label) => {
      if (label.role !== "city") return label;
      if (label.text.trim() === existing.label.trim()) return { ...label, text: next.label };
      if (label.text.trim() === previousCanonical) return { ...label, text: nextCanonical };
      return label;
    }),
  };
  return next;
}

function numberWithin(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function colorValue(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

function normalizeCustomPin(value: unknown, index: number): CustomPinDesign {
  if (!value || typeof value !== "object") throw new Error(`Custom pin ${index + 1} is not an object.`);
  const input = value as Partial<CustomPinDesign>;
  const id = stringValue(input.id).trim();
  const name = stringValue(input.name).trim();
  if (!id) throw new Error(`Custom pin ${index + 1} is missing an ID.`);
  if (!name) throw new Error(`Custom pin ${index + 1} is missing a name.`);
  const sanitized = sanitizeCustomPinSvg(stringValue(input.svg));
  return {
    id,
    name: name.slice(0, 120),
    svg: sanitized.svg,
    viewBox: sanitized.viewBox,
    createdAt: stringValue(input.createdAt, new Date().toISOString()),
  };
}

function normalizeLayer(value: unknown, index: number): MapLayer {
  if (!value || typeof value !== "object") throw new Error(`Layer ${index + 1} is not an object.`);
  const input = value as Partial<MapLayer>;
  const id = stringValue(input.id).trim();
  const name = stringValue(input.name).trim();
  if (!id) throw new Error(`Layer ${index + 1} is missing an ID.`);
  if (!name) throw new Error(`Layer ${index + 1} is missing a name.`);
  return createMapLayer(name.slice(0, 120), {
    id,
    description: stringValue(input.description).slice(0, 500),
    visible: input.visible !== false,
    createdAt: stringValue(input.createdAt, new Date().toISOString()),
  });
}

function normalizeLocationLabel(value: unknown, index: number, locationId: string): LocationLabel {
  if (!value || typeof value !== "object") throw new Error(`Label ${index + 1} for ${locationId} is not an object.`);
  const input = value as Partial<LocationLabel>;
  const role = LABEL_ROLES.has(input.role as LocationLabelRole) ? input.role as LocationLabelRole : "custom";
  const weightValue = Number(input.fontWeight);
  const fontWeight = LABEL_WEIGHTS.has(weightValue as LocationLabelWeight)
    ? weightValue as LocationLabelWeight
    : role === "company" ? 600 : 800;
  return createLocationLabel(role, stringValue(input.text).slice(0, 500), {
    id: stringValue(input.id, `label-${locationId}-${index + 1}`).trim() || `label-${locationId}-${index + 1}`,
    visible: input.visible !== false,
    fontFamily: stringValue(input.fontFamily, "Aptos").trim().slice(0, 100) || "Aptos",
    fontSize: numberWithin(input.fontSize, role === "company" ? 9.5 : 11.5, 6, 32),
    fontWeight,
    color: colorValue(input.color, "#373a36"),
  });
}

function normalizeCallout(value: unknown, legacy: Pick<MapLocation, "id" | "label" | "showLabel" | "labelColor" | "labelPosition">): LocationCallout {
  if (!value || typeof value !== "object") return calloutFromLegacyLocation(legacy);
  const input = value as Partial<LocationCallout>;
  const labels = Array.isArray(input.labels)
    ? input.labels.map((label, index) => normalizeLocationLabel(label, index, legacy.id))
    : [createLocationLabel("city", legacy.label, { id: `label-${legacy.id}-city`, color: legacy.labelColor })];
  if (labels.length > 20) throw new Error(`${legacy.label} contains more than 20 callout labels.`);
  const labelIds = new Set<string>();
  for (const label of labels) {
    if (labelIds.has(label.id)) throw new Error(`Label ID ${label.id} appears more than once for ${legacy.label}.`);
    labelIds.add(label.id);
  }
  const fallback = createDefaultCallout(legacy.label);
  return {
    visible: input.visible !== false,
    labels,
    offsetX: numberWithin(input.offsetX, fallback.offsetX, -1_200, 1_200),
    offsetY: numberWithin(input.offsetY, fallback.offsetY, -720, 720),
    anchor: CALLOUT_ANCHORS.has(input.anchor as CalloutAnchor) ? input.anchor as CalloutAnchor : fallback.anchor,
    placementMode: CALLOUT_PLACEMENT_MODES.has(input.placementMode as CalloutPlacementMode)
      ? input.placementMode as CalloutPlacementMode
      : fallback.placementMode,
    locked: input.locked === true,
    leaderLine: LEADER_LINE_STYLES.has(input.leaderLine as LeaderLineStyle)
      ? input.leaderLine as LeaderLineStyle
      : fallback.leaderLine,
    leaderColor: colorValue(input.leaderColor, fallback.leaderColor),
    leaderWidth: numberWithin(input.leaderWidth, fallback.leaderWidth, 0.25, 5),
  };
}

function normalizeLocation(
  value: unknown,
  index: number,
  customPinIds: ReadonlySet<string>,
  layerIds: ReadonlySet<string>,
  legacyLayerId: string | null,
): MapLocation {
  if (!value || typeof value !== "object") throw new Error(`Location ${index + 1} is not an object.`);
  const input = value as Partial<MapLocation>;
  const city = stringValue(input.city).trim();
  const state = normalizeState(stringValue(input.state));
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const customPinId = stringValue(input.customPinId).trim() || null;
  const layerId = legacyLayerId ?? stringValue(input.layerId).trim();
  const id = stringValue(input.id) || `location-imported-${index + 1}`;
  if (!city) throw new Error(`Location ${index + 1} is missing a city.`);
  if (!state) throw new Error(`Location ${index + 1} is missing a state.`);
  if (!Number.isFinite(latitude) || latitude < 15 || latitude > 75) {
    throw new Error(`Location ${index + 1} has an invalid latitude.`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > -60) {
    throw new Error(`Location ${index + 1} has an invalid longitude.`);
  }
  if (customPinId && !customPinIds.has(customPinId)) {
    throw new Error(`Location ${index + 1} references a custom pin that is not embedded in this project.`);
  }
  if (!layerId || !layerIds.has(layerId)) {
    throw new Error(`Location ${index + 1} references a layer that is not embedded in this project.`);
  }
  const label = stringValue(input.label, `${city}, ${state}`).replace(/\s+/g, " ").trim() || `${city}, ${state}`;
  const showLabel = typeof input.showLabel === "boolean" ? input.showLabel : true;
  const labelColor = colorValue(input.labelColor, "#373a36");
  const labelPosition = LABEL_POSITIONS.has(input.labelPosition as LabelPosition)
    ? input.labelPosition as LabelPosition
    : "right";
  const callout = normalizeCallout(input.callout, { id, label, showLabel, labelColor, labelPosition });
  return createLocation({
    ...input,
    id,
    layerId,
    visible: input.visible !== false,
    city,
    state,
    latitude,
    longitude,
    label,
    showLabel: callout.visible,
    pinType: PIN_TYPES.has(input.pinType as PinType) ? input.pinType as PinType : "pin",
    customPinId,
    pinColor: colorValue(input.pinColor, "#00662c"),
    pinSize: numberWithin(input.pinSize, 16, 6, 40),
    labelColor,
    labelPosition,
    callout,
    notes: stringValue(input.notes),
    customData: input.customData && typeof input.customData === "object" ? input.customData : {},
  });
}

function normalizeSharedPinStyle(
  value: unknown,
  customPinIds: ReadonlySet<string>,
  fallbackLocation?: MapLocation,
): SharedPinStyle {
  const fallback = sharedPinStyleFromLocation(fallbackLocation);
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<SharedPinStyle>;
  const customPinId = stringValue(input.customPinId).trim() || null;
  if (customPinId && !customPinIds.has(customPinId)) {
    throw new Error("The shared pin style references a custom pin that is not embedded in this project.");
  }
  return {
    enabled: input.enabled === true,
    pinType: PIN_TYPES.has(input.pinType as PinType) ? input.pinType as PinType : fallback.pinType,
    customPinId,
    pinColor: colorValue(input.pinColor, fallback.pinColor),
    pinSize: numberWithin(input.pinSize, fallback.pinSize, 6, 40),
  };
}

function normalizeViewport(value: unknown): MapViewport {
  if (!value || typeof value !== "object") return { zoom: 1, pan: { x: 0, y: 0 } };
  const input = value as Partial<MapViewport>;
  const pan = input.pan && typeof input.pan === "object" ? input.pan : { x: 0, y: 0 };
  return {
    zoom: numberWithin(input.zoom, 1, 0.4, 4),
    pan: {
      x: numberWithin(pan.x, 0, -10_000, 10_000),
      y: numberWithin(pan.y, 0, -10_000, 10_000),
    },
  };
}

export function parseProjectText(text: string): UsaMapProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The project file is empty.");
  const input = parsed as Partial<UsaMapProject>;
  if (input.schema !== PROJECT_SCHEMA) throw new Error("This is not a USA Map Studio project file.");
  const sourceSchemaVersion = Number(input.schemaVersion);
  if (![1, 2, 3, 4, PROJECT_SCHEMA_VERSION].includes(sourceSchemaVersion)) {
    throw new Error(`Project schema ${String(input.schemaVersion)} is not supported by this version.`);
  }
  if (!input.project || !input.map || !Array.isArray(input.locations)) {
    throw new Error("The project file is missing required project, map, or location data.");
  }
  const now = new Date().toISOString();
  const customPins = (Array.isArray(input.customPins) ? input.customPins : []).map(normalizeCustomPin);
  const customPinIds = new Set<string>();
  for (const design of customPins) {
    if (customPinIds.has(design.id)) throw new Error(`Custom pin ID ${design.id} appears more than once.`);
    customPinIds.add(design.id);
  }
  const legacyLayer = sourceSchemaVersion < 3
    ? createMapLayer("Layer 1 - Locations", {
      id: DEFAULT_LAYER_ID,
      description: "Migrated from an earlier USA Map Studio project",
      createdAt: stringValue(input.project.createdAt, now),
    })
    : null;
  const layers = legacyLayer
    ? [legacyLayer]
    : (Array.isArray(input.layers) ? input.layers : []).map(normalizeLayer);
  if (layers.length === 0) throw new Error("The project must contain at least one layer.");
  const layerIds = new Set<string>();
  for (const layer of layers) {
    if (layerIds.has(layer.id)) throw new Error(`Layer ID ${layer.id} appears more than once.`);
    layerIds.add(layer.id);
  }
  const locations = input.locations.map((location, index) => normalizeLocation(
    location,
    index,
    customPinIds,
    layerIds,
    legacyLayer?.id ?? null,
  ));
  return materializeEffectivePinStyles({
    schema: PROJECT_SCHEMA,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: {
      id: stringValue(input.project.id, `project-imported-${Date.now()}`),
      name: stringValue(input.project.name, "Imported map"),
      createdAt: stringValue(input.project.createdAt, now),
      updatedAt: now,
    },
    map: {
      title: stringValue(input.map.title, "United States map"),
      subtitle: stringValue(input.map.subtitle),
      backgroundColor: colorValue(input.map.backgroundColor, "#f3f6f4"),
      landColor: colorValue(input.map.landColor, "#e7f0f1"),
      borderColor: colorValue(input.map.borderColor, "#00454d"),
      countyBorderColor: colorValue(input.map.countyBorderColor, "#9ab1ad"),
      labelColor: colorValue(input.map.labelColor, "#373a36"),
      labelHaloColor: colorValue(input.map.labelHaloColor, "#ffffff"),
      borderWidth: numberWithin(input.map.borderWidth, 1.25, 0.25, 5),
      showCountyLines: Boolean(input.map.showCountyLines),
      showStateLabels: Boolean(input.map.showStateLabels),
      showLocationLabels: input.map.showLocationLabels !== false,
      showLegend: input.map.showLegend !== false,
      stateColors: Object.fromEntries(
        Object.entries(input.map.stateColors ?? {}).filter(([, color]) => isHexColor(color)),
      ),
    },
    viewport: normalizeViewport(input.viewport),
    layers,
    sharedPinStyle: normalizeSharedPinStyle(
      sourceSchemaVersion >= 3 ? input.sharedPinStyle : undefined,
      customPinIds,
      locations[0],
    ),
    customPins,
    locations,
  });
}

export function serializeProject(project: UsaMapProject): string {
  const snapshot = materializeEffectivePinStyles(project);
  return `${JSON.stringify({
    ...snapshot,
    project: { ...snapshot.project, updatedAt: new Date().toISOString() },
  }, null, 2)}\n`;
}

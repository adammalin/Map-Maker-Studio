import { createLocation, createMapLayer, DEFAULT_LAYER_ID } from "../data/default-project";
import { normalizeState } from "../data/state-metadata";
import { sanitizeCustomPinSvg } from "./custom-pin";
import {
  PROJECT_SCHEMA,
  PROJECT_SCHEMA_VERSION,
  type CustomPinDesign,
  type LabelPosition,
  type MapLayer,
  type MapLocation,
  type PinType,
  type SharedPinStyle,
  type UsaMapProject,
} from "../types";
import { materializeEffectivePinStyles, sharedPinStyleFromLocation } from "./layers";

const PIN_TYPES = new Set<PinType>(["pin", "circle", "square", "diamond", "star"]);
const LABEL_POSITIONS = new Set<LabelPosition>(["right", "left", "above", "below"]);
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
  return createLocation({
    ...input,
    id: stringValue(input.id) || `location-imported-${index + 1}`,
    layerId,
    visible: input.visible !== false,
    city,
    state,
    latitude,
    longitude,
    label: stringValue(input.label, `${city}, ${state}`),
    showLabel: typeof input.showLabel === "boolean" ? input.showLabel : true,
    pinType: PIN_TYPES.has(input.pinType as PinType) ? input.pinType as PinType : "pin",
    customPinId,
    pinColor: colorValue(input.pinColor, "#00662c"),
    pinSize: numberWithin(input.pinSize, 16, 6, 40),
    labelColor: colorValue(input.labelColor, "#373a36"),
    labelPosition: LABEL_POSITIONS.has(input.labelPosition as LabelPosition)
      ? input.labelPosition as LabelPosition
      : "right",
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
  if (![1, 2, 3, PROJECT_SCHEMA_VERSION].includes(sourceSchemaVersion)) {
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

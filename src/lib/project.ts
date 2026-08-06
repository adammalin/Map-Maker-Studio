import { createLocation } from "../data/default-project";
import { normalizeState } from "../data/state-metadata";
import {
  PROJECT_SCHEMA,
  PROJECT_SCHEMA_VERSION,
  type LabelPosition,
  type MapLocation,
  type PinType,
  type UsaMapProject,
} from "../types";

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

function normalizeLocation(value: unknown, index: number): MapLocation {
  if (!value || typeof value !== "object") throw new Error(`Location ${index + 1} is not an object.`);
  const input = value as Partial<MapLocation>;
  const city = stringValue(input.city).trim();
  const state = normalizeState(stringValue(input.state));
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!city) throw new Error(`Location ${index + 1} is missing a city.`);
  if (!state) throw new Error(`Location ${index + 1} is missing a state.`);
  if (!Number.isFinite(latitude) || latitude < 15 || latitude > 75) {
    throw new Error(`Location ${index + 1} has an invalid latitude.`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > -60) {
    throw new Error(`Location ${index + 1} has an invalid longitude.`);
  }
  return createLocation({
    ...input,
    id: stringValue(input.id) || `location-imported-${index + 1}`,
    city,
    state,
    latitude,
    longitude,
    label: stringValue(input.label, `${city}, ${state}`),
    showLabel: typeof input.showLabel === "boolean" ? input.showLabel : true,
    pinType: PIN_TYPES.has(input.pinType as PinType) ? input.pinType as PinType : "pin",
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
  if (input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Project schema ${String(input.schemaVersion)} is not supported by this version.`);
  }
  if (!input.project || !input.map || !Array.isArray(input.locations)) {
    throw new Error("The project file is missing required project, map, or location data.");
  }
  const now = new Date().toISOString();
  return {
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
    locations: input.locations.map(normalizeLocation),
  };
}

export function serializeProject(project: UsaMapProject): string {
  return `${JSON.stringify({
    ...project,
    project: { ...project.project, updatedAt: new Date().toISOString() },
  }, null, 2)}\n`;
}

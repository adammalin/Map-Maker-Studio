import Papa from "papaparse";
import { createLocation } from "../data/default-project";
import { normalizeState } from "../data/state-metadata";
import type { ImportResult, LabelPosition, MapLocation, PinType } from "../types";
import { resolveCity } from "./geocoder";
import { isHexColor } from "./project";

const aliases = {
  city: ["city", "place", "town", "location", "locationname", "name"],
  state: ["state", "statecode", "stateabbr", "region"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lon", "lng", "long"],
  label: ["label", "displaylabel", "displayname", "maplabel"],
  visible: ["visible", "showlocation", "locationvisible", "showpin", "pinvisible"],
  showLabel: ["showlabel", "labelvisible", "displaylabelonmap"],
  pinType: ["pintype", "markertype", "symbol", "marker"],
  pinColor: ["pincolor", "markercolor", "color"],
  pinSize: ["pinsize", "markersize", "size"],
  labelColor: ["labelcolor", "textcolor"],
  labelPosition: ["labelposition", "labelplacement"],
  notes: ["notes", "note", "description"],
} as const;

const knownHeaders: Set<string> = new Set(Object.values(aliases).flat());

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function valueFor(row: Record<string, unknown>, names: readonly string[]): string {
  for (const [key, value] of Object.entries(row)) {
    if (names.includes(normalizeHeader(key)) && value !== undefined && value !== null) {
      return String(value).trim();
    }
  }
  return "";
}

function parseBoolean(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  return !["false", "0", "no", "n", "off", "hide", "hidden"].includes(value.toLowerCase());
}

function parsePinType(value: string): PinType {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (["circle", "dot"].includes(normalized)) return "circle";
  if (["square", "box"].includes(normalized)) return "square";
  if (["diamond", "rhombus"].includes(normalized)) return "diamond";
  if (["star", "asterisk"].includes(normalized)) return "star";
  return "pin";
}

function parseLabelPosition(value: string): LabelPosition {
  return ["left", "above", "below"].includes(value.toLowerCase())
    ? value.toLowerCase() as LabelPosition
    : "right";
}

function customDataFor(row: Record<string, unknown>): MapLocation["customData"] {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => !knownHeaders.has(normalizeHeader(key)) && value !== "" && value != null)
      .map(([key, value]) => [key, typeof value === "number" || typeof value === "boolean" ? value : String(value)]),
  );
}

export function parseLocationsCsv(text: string, options: { layerId?: string } = {}): ImportResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.some((error) => error.type === "Quotes")) {
    throw new Error(`CSV parsing failed: ${parsed.errors[0]?.message ?? "Malformed quoted value."}`);
  }

  const locations: MapLocation[] = [];
  const issues: ImportResult["issues"] = [];
  parsed.data.forEach((row, index) => {
    const rowNumber = index + 2;
    const city = valueFor(row, aliases.city);
    const state = normalizeState(valueFor(row, aliases.state));
    if (!city && !state) return;
    if (!city || !state) {
      issues.push({ row: rowNumber, city, state, reason: "City and state are both required." });
      return;
    }

    const latitudeText = valueFor(row, aliases.latitude);
    const longitudeText = valueFor(row, aliases.longitude);
    const suppliedCoordinates = latitudeText !== "" || longitudeText !== "";
    let latitude = Number(latitudeText);
    let longitude = Number(longitudeText);
    if (!suppliedCoordinates) {
      const match = resolveCity(city, state);
      if (!match) {
        issues.push({ row: rowNumber, city, state, reason: "No offline Census place match. Add latitude and longitude." });
        return;
      }
      latitude = match.latitude;
      longitude = match.longitude;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      issues.push({ row: rowNumber, city, state, reason: "Latitude and longitude must both be valid numbers." });
      return;
    }

    const label = valueFor(row, aliases.label) || `${city}, ${state}`;
    const pinColorValue = valueFor(row, aliases.pinColor);
    const labelColorValue = valueFor(row, aliases.labelColor);
    const pinSizeValue = Number(valueFor(row, aliases.pinSize));
    locations.push(createLocation({
      layerId: options.layerId,
      city,
      state,
      latitude,
      longitude,
      label,
      visible: parseBoolean(valueFor(row, aliases.visible), true),
      showLabel: parseBoolean(valueFor(row, aliases.showLabel), true),
      pinType: parsePinType(valueFor(row, aliases.pinType)),
      pinColor: isHexColor(pinColorValue) ? pinColorValue : "#00662c",
      pinSize: Number.isFinite(pinSizeValue) ? Math.min(40, Math.max(6, pinSizeValue)) : 16,
      labelColor: isHexColor(labelColorValue) ? labelColorValue : "#373a36",
      labelPosition: parseLabelPosition(valueFor(row, aliases.labelPosition)),
      notes: valueFor(row, aliases.notes),
      customData: customDataFor(row),
    }));
  });

  return { locations, issues, totalRows: parsed.data.length };
}

export const CSV_TEMPLATE = [
  "city,state,latitude,longitude,label,visible,show_label,pin_type,pin_color,pin_size,label_color,label_position,notes",
  "Oak Ridge,TN,,,Oak Ridge,true,true,pin,#00662c,18,#373a36,right,Coordinates resolved offline",
  "Seattle,WA,47.6062,-122.3321,Seattle,true,true,circle,#006ba6,15,#373a36,above,Coordinates supplied",
].join("\n");

import { parseLocationsCsv } from "./csv";
import { parseProjectText } from "./project";
import type { AiMapProposal, MapLocation, MapSettings, UsaMapProject } from "../types";

export interface ProposalBuildResult {
  proposal: AiMapProposal;
  importIssues?: Array<{ row: number; city: string; state: string; reason: string }>;
}

const MAP_KEYS = new Set<keyof MapSettings>([
  "title",
  "subtitle",
  "backgroundColor",
  "landColor",
  "borderColor",
  "countyBorderColor",
  "labelColor",
  "labelHaloColor",
  "borderWidth",
  "showCountyLines",
  "showStateLabels",
  "showLocationLabels",
  "showLegend",
  "stateColors",
]);

const LOCATION_KEYS = new Set<keyof MapLocation>([
  "city",
  "state",
  "latitude",
  "longitude",
  "label",
  "showLabel",
  "pinType",
  "pinColor",
  "pinSize",
  "labelColor",
  "labelPosition",
  "notes",
  "customData",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 240) : fallback;
}

function assertFresh(input: Record<string, unknown>, current: UsaMapProject): void {
  if (input.expectedUpdatedAt !== current.project.updatedAt) {
    throw new Error(
      "The open project changed after it was read. Read get_current_project again and prepare a fresh proposal.",
    );
  }
}

function normalizeCandidate(candidate: UsaMapProject, current: UsaMapProject): UsaMapProject {
  const parsed = parseProjectText(JSON.stringify(candidate));
  parsed.project.id = current.project.id;
  parsed.project.createdAt = current.project.createdAt;
  const ids = new Set<string>();
  for (const location of parsed.locations) {
    if (ids.has(location.id)) throw new Error(`Location ID ${location.id} appears more than once.`);
    ids.add(location.id);
  }
  return parsed;
}

function proposal(
  current: UsaMapProject,
  proposed: UsaMapProject,
  operation: string,
  summary: string,
  details: string[],
): AiMapProposal {
  return {
    id: `map-proposal-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
    operation,
    summary,
    details,
    createdAt: new Date().toISOString(),
    baseUpdatedAt: current.project.updatedAt,
    current: structuredClone(current),
    proposed,
  };
}

function knownPatch<T extends object>(
  value: unknown,
  allowed: ReadonlySet<keyof T>,
  label: string,
): Partial<T> {
  const source = record(value, label);
  const entries = Object.entries(source).filter(([key]) => allowed.has(key as keyof T));
  if (!entries.length) throw new Error(`${label} does not contain any supported fields.`);
  return Object.fromEntries(entries) as Partial<T>;
}

export function buildMcpProposal(
  operation: string,
  inputValue: unknown,
  current: UsaMapProject,
): ProposalBuildResult {
  const input = record(inputValue ?? {}, "Tool input");
  assertFresh(input, current);
  const requestedSummary = text(input.summary, "AI-prepared map update");

  if (operation === "replace_project_draft") {
    const supplied = record(input.project, "Project");
    const next = normalizeCandidate(supplied as unknown as UsaMapProject, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Replace ${current.locations.length} current locations with ${next.locations.length} proposed locations.`,
        "Preserve this project's stable ID and creation date.",
      ]),
    };
  }

  if (operation === "stage_location_update") {
    const locationId = text(input.locationId, "");
    const existing = current.locations.find((location) => location.id === locationId);
    if (!existing) throw new Error("The requested location was not found in the open project.");
    const patch = knownPatch<MapLocation>(input.patch, LOCATION_KEYS, "Location patch");
    const candidate = structuredClone(current);
    candidate.locations = candidate.locations.map((location) =>
      location.id === locationId ? { ...location, ...patch, id: location.id } : location,
    );
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Update ${existing.label} (${existing.city}, ${existing.state}).`,
        `Review ${Object.keys(patch).join(", ")}.`,
      ]),
    };
  }

  if (operation === "stage_locations_add") {
    if (!Array.isArray(input.locations) || input.locations.length === 0) {
      throw new Error("At least one location is required.");
    }
    if (input.locations.length > 2_000) throw new Error("A single proposal can add at most 2,000 locations.");
    const additions = input.locations.map((item, index) => {
      const location = record(item, `Location ${index + 1}`);
      return {
        ...location,
        id: typeof location.id === "string" && location.id.trim()
          ? location.id.trim()
          : `location-ai-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`}`,
      };
    }) as unknown as MapLocation[];
    const next = normalizeCandidate({ ...structuredClone(current), locations: [...current.locations, ...additions] }, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Add ${additions.length} location${additions.length === 1 ? "" : "s"}.`,
        `The proposed project will contain ${next.locations.length} locations.`,
      ]),
    };
  }

  if (operation === "stage_locations_from_csv") {
    const csv = typeof input.csv === "string" ? input.csv : "";
    if (!csv.trim()) throw new Error("CSV contents are required.");
    if (csv.length > 4_500_000) throw new Error("CSV contents exceed the 4.5 MB tool limit.");
    const mode = input.mode === "replace" ? "replace" : "add";
    const imported = parseLocationsCsv(csv);
    if (!imported.locations.length) {
      throw new Error("The CSV did not contain any locations that could be mapped.");
    }
    const candidate = structuredClone(current);
    candidate.locations = mode === "replace"
      ? imported.locations
      : [...candidate.locations, ...imported.locations];
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `${mode === "replace" ? "Replace the current list with" : "Add"} ${imported.locations.length} resolved CSV location${imported.locations.length === 1 ? "" : "s"}.`,
        imported.issues.length
          ? `${imported.issues.length} unresolved or malformed row${imported.issues.length === 1 ? " was" : "s were"} excluded and reported.`
          : "Every nonblank CSV row resolved successfully.",
      ]),
      importIssues: imported.issues,
    };
  }

  if (operation === "stage_locations_remove") {
    if (!Array.isArray(input.locationIds) || input.locationIds.length === 0) {
      throw new Error("At least one location ID is required.");
    }
    const ids = new Set(input.locationIds.filter((id): id is string => typeof id === "string"));
    const removed = current.locations.filter((location) => ids.has(location.id));
    if (!removed.length) throw new Error("None of the requested locations were found.");
    const candidate = structuredClone(current);
    candidate.locations = candidate.locations.filter((location) => !ids.has(location.id));
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Remove ${removed.length} location${removed.length === 1 ? "" : "s"}.`,
        removed.slice(0, 6).map((location) => location.label).join(", ") + (removed.length > 6 ? ", and more" : ""),
      ]),
    };
  }

  if (operation === "stage_map_style_update") {
    const patch = knownPatch<MapSettings>(input.patch, MAP_KEYS, "Map style patch");
    const candidate = structuredClone(current);
    candidate.map = { ...candidate.map, ...patch };
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Review ${Object.keys(patch).join(", ")}.`,
        "Locations and project identity remain unchanged.",
      ]),
    };
  }

  throw new Error(`Unsupported MCP operation: ${operation}`);
}

export function validateProjectCandidate(value: unknown): UsaMapProject {
  return parseProjectText(JSON.stringify(value));
}

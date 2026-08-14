import { parseLocationsCsv } from "./csv";
import { mergeLocationPatch, parseProjectText } from "./project";
import { createCustomPinDesign } from "./custom-pin";
import { createMapLayer } from "../data/default-project";
import { applySharedPinStylePatch } from "./layers";
import { arrangeProjectCallouts } from "./callouts";
import type { AiMapProposal, MapLayer, MapLocation, MapSettings, SharedPinStyle, UsaMapProject } from "../types";

export interface ProposalBuildResult {
  proposal: AiMapProposal;
  importIssues?: Array<{ row: number; city: string; state: string; reason: string }>;
  removedSvgItems?: number;
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
  "layerId",
  "visible",
  "city",
  "state",
  "latitude",
  "longitude",
  "label",
  "showLabel",
  "pinType",
  "customPinId",
  "pinColor",
  "pinSize",
  "labelColor",
  "labelPosition",
  "callout",
  "notes",
  "customData",
]);

const LAYER_KEYS = new Set<keyof MapLayer>(["name", "description", "visible"]);
const SHARED_PIN_STYLE_KEYS = new Set<keyof SharedPinStyle>([
  "enabled",
  "pinType",
  "customPinId",
  "pinColor",
  "pinSize",
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

function layerById(current: UsaMapProject, value: unknown): MapLayer {
  const layerId = text(value, "");
  const layer = current.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error("The requested layer was not found in the open project.");
  return layer;
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

function locationWithLegacyLabelPatch(existing: MapLocation, patch: Partial<MapLocation>): MapLocation {
  const next = mergeLocationPatch(existing, patch);
  if (patch.callout) return next;
  let callout = { ...next.callout, labels: next.callout.labels.map((label) => ({ ...label })) };
  if (typeof patch.showLabel === "boolean") callout.visible = patch.showLabel;
  const primaryIndex = Math.max(0, callout.labels.findIndex((label) => label.role === "city"));
  if (callout.labels[primaryIndex]) {
    if (typeof patch.label === "string") callout.labels[primaryIndex].text = patch.label;
    if (typeof patch.labelColor === "string") callout.labels[primaryIndex].color = patch.labelColor;
  }
  if (patch.labelPosition) {
    const offsets = {
      right: { offsetX: 18, offsetY: 0, anchor: "start" as const },
      left: { offsetX: -18, offsetY: 0, anchor: "end" as const },
      above: { offsetX: 0, offsetY: -22, anchor: "middle" as const },
      below: { offsetX: 0, offsetY: 28, anchor: "middle" as const },
    };
    callout = { ...callout, ...offsets[patch.labelPosition], placementMode: "manual", locked: true };
  }
  return { ...next, callout, showLabel: callout.visible };
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
        `Replace ${current.layers.length} current layers with ${next.layers.length} proposed layers.`,
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
      location.id === locationId ? locationWithLegacyLabelPatch(location, patch) : location,
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
    const fallbackLayer = typeof input.layerId === "string" ? layerById(current, input.layerId) : current.layers[0];
    const additions = input.locations.map((item, index) => {
      const location = record(item, `Location ${index + 1}`);
      const targetLayer = typeof location.layerId === "string" ? layerById(current, location.layerId) : fallbackLayer;
      return {
        ...location,
        layerId: targetLayer.id,
        id: typeof location.id === "string" && location.id.trim()
          ? location.id.trim()
          : `location-ai-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`}`,
      };
    }) as unknown as MapLocation[];
    const normalized = normalizeCandidate({ ...structuredClone(current), locations: [...current.locations, ...additions] }, current);
    const next = normalizeCandidate(arrangeProjectCallouts(normalized).project, current);
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
    const targetLayer = typeof input.layerId === "string" ? layerById(current, input.layerId) : current.layers[0];
    const mode = input.mode === "replace" || input.mode === "replace_layer" ? "replace_layer" : "add";
    const imported = parseLocationsCsv(csv, { layerId: targetLayer.id });
    if (!imported.locations.length) {
      throw new Error("The CSV did not contain any locations that could be mapped.");
    }
    const candidate = structuredClone(current);
    candidate.locations = mode === "replace_layer"
      ? [...candidate.locations.filter((location) => location.layerId !== targetLayer.id), ...imported.locations]
      : [...candidate.locations, ...imported.locations];
    const next = normalizeCandidate(arrangeProjectCallouts(normalizeCandidate(candidate, current)).project, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `${mode === "replace_layer" ? `Replace ${targetLayer.name} with` : `Add to ${targetLayer.name}`} ${imported.locations.length} resolved CSV location${imported.locations.length === 1 ? "" : "s"}.`,
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

  if (operation === "stage_layer_create") {
    const name = text(input.name, "");
    if (!name) throw new Error("A layer name is required.");
    const layer = createMapLayer(name, {
      description: text(input.description, ""),
      visible: input.visible !== false,
    });
    const candidate = structuredClone(current);
    candidate.layers.push(layer);
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Create ${layer.name} as layer ${next.layers.length}.`,
        "The new layer starts empty and can be targeted by later location proposals.",
      ]),
    };
  }

  if (operation === "stage_layer_update") {
    const existing = layerById(current, input.layerId);
    const patch = knownPatch<MapLayer>(input.patch, LAYER_KEYS, "Layer patch");
    const candidate = structuredClone(current);
    candidate.layers = candidate.layers.map((layer) => layer.id === existing.id ? { ...layer, ...patch, id: layer.id } : layer);
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Update layer ${existing.name}.`,
        `Review ${Object.keys(patch).join(", ")}.`,
      ]),
    };
  }

  if (operation === "stage_layer_remove") {
    const existing = layerById(current, input.layerId);
    if (current.layers.length === 1) throw new Error("The only layer in a project cannot be removed.");
    const removedLocations = current.locations.filter((location) => location.layerId === existing.id);
    const candidate = structuredClone(current);
    candidate.layers = candidate.layers.filter((layer) => layer.id !== existing.id);
    candidate.locations = candidate.locations.filter((location) => location.layerId !== existing.id);
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Remove layer ${existing.name}.`,
        `Also remove its ${removedLocations.length} location${removedLocations.length === 1 ? "" : "s"}.`,
      ]),
    };
  }

  if (operation === "stage_locations_assign_layer") {
    const targetLayer = layerById(current, input.layerId);
    if (!Array.isArray(input.locationIds) || input.locationIds.length === 0) throw new Error("At least one location ID is required.");
    const ids = new Set(input.locationIds.filter((id): id is string => typeof id === "string"));
    const found = current.locations.filter((location) => ids.has(location.id));
    if (found.length !== ids.size) throw new Error("One or more requested locations were not found.");
    const candidate = structuredClone(current);
    candidate.locations = candidate.locations.map((location) => ids.has(location.id) ? { ...location, layerId: targetLayer.id } : location);
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Assign ${found.length} location${found.length === 1 ? "" : "s"} to ${targetLayer.name}.`,
        "Coordinates, labels, and saved per-location styles remain unchanged.",
      ]),
    };
  }

  if (operation === "stage_shared_pin_style_update") {
    const patch = knownPatch<SharedPinStyle>(input.patch, SHARED_PIN_STYLE_KEYS, "Shared pin style patch");
    const candidate = applySharedPinStylePatch(structuredClone(current), patch);
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Review shared pin ${Object.keys(patch).join(", ")}.`,
        next.sharedPinStyle.enabled
          ? `All ${next.locations.length} locations will render with one effective pin style across every layer.`
          : "Per-location pin styles will be used.",
      ]),
    };
  }

  if (operation === "stage_custom_pin_import") {
    const svg = typeof input.svg === "string" ? input.svg : "";
    const name = text(input.name, "Custom pin");
    const assignLocationId = typeof input.assignLocationId === "string" ? input.assignLocationId : "";
    const assignToAll = input.assignToAll === true;
    if (assignToAll && assignLocationId) {
      throw new Error("Choose either one location or all locations for the custom pin assignment, not both.");
    }
    if (assignLocationId && !current.locations.some((location) => location.id === assignLocationId)) {
      throw new Error("The location selected for the custom pin was not found.");
    }
    const { design, removedItems } = createCustomPinDesign(svg, `${name}.svg`);
    const candidate = structuredClone(current);
    candidate.customPins = [...candidate.customPins, design];
    if (assignToAll) {
      candidate.locations = candidate.locations.map((location) => ({ ...location, customPinId: design.id }));
      candidate.sharedPinStyle = { ...candidate.sharedPinStyle, enabled: true, customPinId: design.id };
    } else if (assignLocationId) {
      candidate.locations = candidate.locations.map((location) =>
        location.id === assignLocationId ? { ...location, customPinId: design.id } : location,
      );
    }
    const next = normalizeCandidate(candidate, current);
    return {
      proposal: proposal(current, next, operation, requestedSummary, [
        `Embed ${design.name} as a sanitized custom SVG pin.`,
        assignToAll
          ? `Assign it to all ${candidate.locations.length} locations.`
          : assignLocationId
            ? "Assign it to one selected location."
            : "Add it to the project pin library without assigning it yet.",
        removedItems ? `Remove ${removedItems} unsupported or unsafe SVG item${removedItems === 1 ? "" : "s"}.` : "No SVG elements or attributes needed removal.",
      ]),
      removedSvgItems: removedItems,
    };
  }

  throw new Error(`Unsupported MCP operation: ${operation}`);
}

export function validateProjectCandidate(value: unknown): UsaMapProject {
  return parseProjectText(JSON.stringify(value));
}

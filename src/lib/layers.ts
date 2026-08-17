import type { MapLayer, MapLocation, PinType, SharedPinStyle, UsaMapProject } from "../types";

export interface EffectivePinStyle {
  pinType: PinType;
  customPinId: string | null;
  pinColor: string;
  pinSize: number;
}

export function effectivePinStyle(
  project: Pick<UsaMapProject, "sharedPinStyle">,
  location: MapLocation,
): EffectivePinStyle {
  const style = project.sharedPinStyle;
  return style.enabled
    ? {
      pinType: style.pinType,
      customPinId: style.customPinId,
      pinColor: style.pinColor,
      pinSize: style.pinSize,
    }
    : {
      pinType: location.pinType,
      customPinId: location.customPinId,
      pinColor: location.pinColor,
      pinSize: location.pinSize,
    };
}

export function visibleLayerIds(layers: MapLayer[]): Set<string> {
  return new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id));
}

export function visibleLocations(project: UsaMapProject): MapLocation[] {
  const visible = visibleLayerIds(project.layers);
  return project.locations.filter((location) => location.visible && visible.has(location.layerId));
}

export function uniqueCityCount(locations: Iterable<Pick<MapLocation, "city" | "state">>): number {
  const cityKeys = new Set<string>();
  for (const location of locations) {
    const city = location.city.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const state = location.state.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    cityKeys.add(`${city}|${state}`);
  }
  return cityKeys.size;
}

export function layerName(project: Pick<UsaMapProject, "layers">, layerId: string): string {
  return project.layers.find((layer) => layer.id === layerId)?.name ?? "Unknown layer";
}

export function svgLayerId(layer: MapLayer): string {
  const safe = layer.name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "layer";
  return `map-layer-${safe}-${layer.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
}

export function sharedPinStyleFromLocation(location?: MapLocation): SharedPinStyle {
  return {
    enabled: false,
    pinType: location?.pinType ?? "pin",
    customPinId: location?.customPinId ?? null,
    pinColor: location?.pinColor ?? "#00662c",
    pinSize: location?.pinSize ?? 16,
  };
}

function locationWithPinStyle(location: MapLocation, style: EffectivePinStyle): MapLocation {
  return {
    ...location,
    pinType: style.pinType,
    customPinId: style.customPinId,
    pinColor: style.pinColor,
    pinSize: style.pinSize,
  };
}

/**
 * Applies a shared-style edit and mirrors the visible result into every
 * location. The shared style remains the editing contract, while the mirrored
 * values keep project JSON and every export consumer in sync with the canvas.
 */
export function applySharedPinStylePatch(
  project: UsaMapProject,
  patch: Partial<SharedPinStyle>,
): UsaMapProject {
  const sharedPinStyle = { ...project.sharedPinStyle, ...patch };
  const leavingSharedMode = project.sharedPinStyle.enabled && sharedPinStyle.enabled === false;
  if (!sharedPinStyle.enabled && !leavingSharedMode) {
    return { ...project, sharedPinStyle };
  }
  return {
    ...project,
    sharedPinStyle,
    locations: project.locations.map((location) => locationWithPinStyle(location, sharedPinStyle)),
  };
}

/**
 * Produces an immutable export/save snapshot whose per-location pin fields are
 * exactly the effective styles rendered on the canvas.
 */
export function materializeEffectivePinStyles(project: UsaMapProject): UsaMapProject {
  return {
    ...project,
    sharedPinStyle: { ...project.sharedPinStyle },
    locations: project.locations.map((location) => locationWithPinStyle(location, effectivePinStyle(project, location))),
  };
}

export type PinEditingScope = "all" | "single";

export function setPinEditingScope(
  project: UsaMapProject,
  scope: PinEditingScope,
  referenceLocationId?: string | null,
): UsaMapProject {
  if (scope === "single") {
    if (!project.sharedPinStyle.enabled) return project;
    const style = project.sharedPinStyle;
    return {
      ...project,
      sharedPinStyle: { ...style, enabled: false },
      locations: project.locations.map((location) => locationWithPinStyle(location, style)),
    };
  }

  if (project.sharedPinStyle.enabled) return project;
  const reference = project.locations.find((location) => location.id === referenceLocationId) ?? project.locations[0];
  return {
    ...project,
    sharedPinStyle: reference
      ? { ...sharedPinStyleFromLocation(reference), enabled: true }
      : { ...project.sharedPinStyle, enabled: true },
  };
}

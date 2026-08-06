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

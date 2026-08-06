import type { MapLocation, UsaMapProject } from "../types";
import { PROJECT_SCHEMA, PROJECT_SCHEMA_VERSION } from "../types";

const sampleLocations: Array<Pick<MapLocation, "city" | "state" | "latitude" | "longitude" | "pinColor">> = [
  { city: "Seattle", state: "WA", latitude: 47.6062, longitude: -122.3321, pinColor: "#00662c" },
  { city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194, pinColor: "#00b38f" },
  { city: "Denver", state: "CO", latitude: 39.7392, longitude: -104.9903, pinColor: "#006ba6" },
  { city: "Oak Ridge", state: "TN", latitude: 36.0104, longitude: -84.2696, pinColor: "#fe5000" },
  { city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298, pinColor: "#00454d" },
  { city: "Atlanta", state: "GA", latitude: 33.749, longitude: -84.388, pinColor: "#7dba00" },
  { city: "Washington", state: "DC", latitude: 38.9072, longitude: -77.0369, pinColor: "#b50094" },
  { city: "New York", state: "NY", latitude: 40.7128, longitude: -74.006, pinColor: "#4e008e" },
];

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function createLocation(
  partial: Partial<MapLocation> & Pick<MapLocation, "city" | "state" | "latitude" | "longitude">,
): MapLocation {
  const label = partial.label?.trim() || `${partial.city}, ${partial.state}`;
  return {
    id: partial.id ?? createId("location"),
    city: partial.city,
    state: partial.state,
    latitude: partial.latitude,
    longitude: partial.longitude,
    label,
    showLabel: partial.showLabel ?? true,
    pinType: partial.pinType ?? "pin",
    customPinId: partial.customPinId ?? null,
    pinColor: partial.pinColor ?? "#00662c",
    pinSize: partial.pinSize ?? 16,
    labelColor: partial.labelColor ?? "#373a36",
    labelPosition: partial.labelPosition ?? "right",
    notes: partial.notes ?? "",
    customData: partial.customData ?? {},
  };
}

export function createDefaultProject(): UsaMapProject {
  const timestamp = new Date().toISOString();
  return {
    schema: PROJECT_SCHEMA,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: {
      id: createId("project"),
      name: "National locations",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    map: {
      title: "Locations across the United States",
      subtitle: "Accurate city coordinates with configurable pins and labels",
      backgroundColor: "#f3f6f4",
      landColor: "#e7f0f1",
      borderColor: "#00454d",
      countyBorderColor: "#9ab1ad",
      labelColor: "#373a36",
      labelHaloColor: "#ffffff",
      borderWidth: 1.25,
      showCountyLines: false,
      showStateLabels: false,
      showLocationLabels: true,
      showLegend: true,
      stateColors: {},
    },
    customPins: [],
    locations: sampleLocations.map((location) => createLocation(location)),
  };
}

export function createBlankProject(name = "Untitled map"): UsaMapProject {
  const project = createDefaultProject();
  project.project.name = name;
  project.map.title = name;
  project.map.subtitle = "";
  project.locations = [];
  return project;
}

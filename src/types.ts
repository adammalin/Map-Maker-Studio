export const PROJECT_SCHEMA = "usa-map-studio/project";
export const PROJECT_SCHEMA_VERSION = 6;

export type PinType = "pin" | "circle" | "square" | "diamond" | "star";
export type LabelPosition = "right" | "left" | "above" | "below";
export type CalloutAnchor = "start" | "middle" | "end";
export type CalloutPlacementMode = "auto" | "manual";
export type LeaderLineStyle = "auto" | "none" | "straight" | "elbow";
export type LocationLabelRole = "city" | "company" | "custom";
export type LocationLabelWeight = 400 | 500 | 600 | 700 | 800;
export type LocationLabelMode = "pins" | "city" | "city-company" | "selected-layer" | "selected-location";

export interface LocationLabel {
  id: string;
  role: LocationLabelRole;
  text: string;
  visible: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: LocationLabelWeight;
  color: string;
}

export interface LocationCallout {
  visible: boolean;
  labels: LocationLabel[];
  offsetX: number;
  offsetY: number;
  anchor: CalloutAnchor;
  placementMode: CalloutPlacementMode;
  locked: boolean;
  leaderLine: LeaderLineStyle;
  leaderColor: string;
  leaderWidth: number;
}

export interface CustomPinDesign {
  id: string;
  name: string;
  svg: string;
  viewBox: string;
  createdAt: string;
}

export interface MapLayer {
  id: string;
  name: string;
  description: string;
  visible: boolean;
  createdAt: string;
}

export interface SharedPinStyle {
  enabled: boolean;
  pinType: PinType;
  customPinId: string | null;
  pinColor: string;
  pinSize: number;
}

export interface MapLocation {
  id: string;
  layerId: string;
  visible: boolean;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  label: string;
  showLabel: boolean;
  pinType: PinType;
  customPinId: string | null;
  pinColor: string;
  pinSize: number;
  labelColor: string;
  labelPosition: LabelPosition;
  callout: LocationCallout;
  notes: string;
  customData: Record<string, string | number | boolean | null>;
}

export interface MapSettings {
  title: string;
  subtitle: string;
  backgroundColor: string;
  landColor: string;
  borderColor: string;
  countyBorderColor: string;
  labelColor: string;
  labelHaloColor: string;
  borderWidth: number;
  showCountyLines: boolean;
  showStateLabels: boolean;
  showLocationLabels: boolean;
  locationLabelMode: LocationLabelMode;
  showLegend: boolean;
  stateColors: Record<string, string>;
}

export interface MapViewport {
  zoom: number;
  pan: {
    x: number;
    y: number;
  };
}

export interface UsaMapProject {
  schema: typeof PROJECT_SCHEMA;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  project: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  map: MapSettings;
  viewport: MapViewport;
  layers: MapLayer[];
  sharedPinStyle: SharedPinStyle;
  customPins: CustomPinDesign[];
  locations: MapLocation[];
}

export interface PlaceRecord {
  city: string;
  fullName: string;
  state: string;
  latitude: number;
  longitude: number;
  geoid: string;
}

export interface ImportIssue {
  row: number;
  city: string;
  state: string;
  reason: string;
}

export interface ImportResult {
  locations: MapLocation[];
  issues: ImportIssue[];
  totalRows: number;
}

export interface DesktopFileResult {
  canceled: boolean;
  filePath?: string;
  name?: string;
  text?: string;
}

export interface DesktopSaveResult {
  canceled: boolean;
  filePath?: string;
}

export interface ProjectSnapshot {
  id: string;
  label: string;
  createdAt: string;
  projectName: string;
  locationCount: number;
  layerCount: number;
  filePath: string;
}

export interface UsaMapDesktopApi {
  isDesktop: true;
  platform: string;
  versions: { electron: string; chrome: string };
  openTextFile(kind: "csv" | "project"): Promise<DesktopFileResult>;
  saveTextFile(payload: {
    kind: "svg" | "project";
    defaultName: string;
    text: string;
  }): Promise<DesktopSaveResult>;
  saveBinaryFile(payload: {
    kind: "png" | "pptx";
    defaultName: string;
    bytes: ArrayBuffer;
  }): Promise<DesktopSaveResult>;
  openUserGuide(): Promise<{ opened: boolean; path: string }>;
  getMcpStatus(): Promise<{
    available: boolean;
    address: string | null;
    runtimeFile: string;
  }>;
  getAutosaveProject(): Promise<{
    text: string;
    projectFilePath: string | null;
    recoveryPath: string;
  } | null>;
  autosaveProject(payload: {
    text: string;
  }): Promise<{
    projectFilePath: string | null;
    recoveryPath: string;
  }>;
  listProjectSnapshots(): Promise<ProjectSnapshot[]>;
  createProjectSnapshot(payload: { text: string; label: string }): Promise<ProjectSnapshot>;
  readProjectSnapshot(id: string): Promise<{ text: string; snapshot: ProjectSnapshot }>;
  resetAutosaveTarget(): Promise<{ reset: true }>;
  onMcpCommand(
    handler: (request: DesktopMcpCommand) => Promise<unknown> | unknown,
  ): () => void;
  requestQuit(): Promise<void>;
}

export interface DesktopMcpCommand {
  id: string;
  operation: string;
  input?: Record<string, unknown>;
}

export interface AiMapProposal {
  id: string;
  operation: string;
  summary: string;
  details: string[];
  createdAt: string;
  baseUpdatedAt: string;
  current: UsaMapProject;
  proposed: UsaMapProject;
}

declare global {
  interface Window {
    usaMapDesktop?: UsaMapDesktopApi;
  }
}

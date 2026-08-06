export const PROJECT_SCHEMA = "usa-map-studio/project";
export const PROJECT_SCHEMA_VERSION = 1;

export type PinType = "pin" | "circle" | "square" | "diamond" | "star";
export type LabelPosition = "right" | "left" | "above" | "below";

export interface MapLocation {
  id: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  label: string;
  showLabel: boolean;
  pinType: PinType;
  pinColor: string;
  pinSize: number;
  labelColor: string;
  labelPosition: LabelPosition;
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
  showLegend: boolean;
  stateColors: Record<string, string>;
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

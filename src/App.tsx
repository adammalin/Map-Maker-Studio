import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOut,
  BracketsCurly,
  CheckCircle,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileArrowUp,
  FileCsv,
  FloppyDisk,
  FolderOpen,
  ImageSquare,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  Minus,
  PaintBrush,
  Plus,
  PresentationChart,
  Question,
  Robot,
  Sparkle,
  SquaresFour,
  Stack,
  WarningDiamond,
  X,
} from "@phosphor-icons/react";
import { createBlankProject, createDefaultProject, createLocation, createMapLayer } from "./data/default-project";
import { parseLocationsCsv, CSV_TEMPLATE } from "./lib/csv";
import { downloadBlob, prepareSvgMarkup, projectToPowerPoint, svgToPng } from "./lib/export";
import { fileSafeName, parseProjectText, serializeProject } from "./lib/project";
import { buildMcpProposal, validateProjectCandidate } from "./lib/mcp-proposals";
import { createCustomPinDesign } from "./lib/custom-pin";
import {
  applySharedPinStylePatch,
  effectivePinStyle,
  layerName,
  materializeEffectivePinStyles,
  setPinEditingScope as applyPinEditingScope,
} from "./lib/layers";
import type { AiMapProposal, ImportResult, MapLayer, MapLocation, MapSettings, SharedPinStyle, UsaMapProject } from "./types";
import { MapCanvas } from "./components/MapCanvas";
import { MapMiniMap } from "./components/MapMiniMap";
import { KeyboardShortcutsDialog } from "./components/KeyboardShortcutsDialog";
import { Inspector } from "./components/Inspector";
import { ImportDialog } from "./components/ImportDialog";
import { AiProposalDialog } from "./components/AiProposalDialog";
import { LayerInspector, LayerPanel } from "./components/LayerPanel";
import { steppedMapZoom, zoomViewportAt } from "./lib/viewport";

interface HistoryState {
  past: UsaMapProject[];
  present: UsaMapProject;
  future: UsaMapProject[];
}

interface PendingImport {
  result: ImportResult;
  fileName: string;
}

type ExportKind = "svg" | "png" | "pptx";
type WorkspaceMode = "map" | "locations" | "layers" | "style" | "export";

const WORKSPACE_MODE_COPY: Record<WorkspaceMode, { title: string; description: string }> = {
  map: { title: "Map editor", description: "Select and refine pins directly on the canvas" },
  locations: { title: "Location workspace", description: "Search, import, organize, and edit mapped places" },
  layers: { title: "Layer workspace", description: "Separate audiences, control visibility, and keep pin styling consistent" },
  style: { title: "Map style", description: "Control geography, labels, state fills, and the legend" },
  export: { title: "Export preview", description: "Review the composition and choose an output format" },
};

const APP_VERSION = "0.5.1";

export function App() {
  const [history, setHistory] = useState<HistoryState>({ past: [], present: createDefaultProject(), future: [] });
  const [dirty, setDirty] = useState(false);
  const [autosaveReady, setAutosaveReady] = useState(!window.usaMapDesktop);
  const [autosaveStatus, setAutosaveStatus] = useState<"loading" | "pending" | "saving" | "saved" | "error">(window.usaMapDesktop ? "loading" : "saved");
  const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(history.present.locations[0]?.id ?? null);
  const [selectedLayerId, setSelectedLayerId] = useState(history.present.layers[0].id);
  const [selectedStateFips, setSelectedStateFips] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("Sample locations are loaded. Import a CSV or begin editing the map.");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [pendingAiProposal, setPendingAiProposal] = useState<AiMapProposal | null>(null);
  const [aiProposalOpen, setAiProposalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<WorkspaceMode>("map");
  const svgRef = useRef<SVGSVGElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | null>(null);
  const autosaveSequence = useRef(0);
  const project = history.present;
  const workspaceCopy = WORKSPACE_MODE_COPY[activeSidebar];

  const selectedLocation = project.locations.find((location) => location.id === selectedLocationId) ?? null;
  const selectedLayer = project.layers.find((layer) => layer.id === selectedLayerId) ?? project.layers[0];
  const filteredLocations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return project.locations;
    return project.locations.filter((location) =>
      [location.label, location.city, location.state, location.notes, layerName(project, location.layerId)]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [project, searchQuery]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 7000);
  }, []);

  const commitProject = useCallback((updater: (current: UsaMapProject) => UsaMapProject) => {
    setHistory((current) => {
      const next = updater(structuredClone(current.present));
      next.project.updatedAt = new Date().toISOString();
      return { past: [...current.past.slice(-49), current.present], present: next, future: [] };
    });
    setDirty(true);
    setAutosaveStatus("pending");
  }, []);

  function replaceProject(next: UsaMapProject, saved = false) {
    setHistory({ past: [], present: next, future: [] });
    setSelectedLocationId(next.locations[0]?.id ?? null);
    setSelectedLayerId(next.layers[0].id);
    setSelectedStateFips(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDirty(!saved);
    setAutosaveStatus(saved ? "saved" : "pending");
  }

  function undo() {
    setHistory((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] };
    });
    setDirty(true);
  }

  function redo() {
    setHistory((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      return { past: [...current.past, current.present], present: next, future: current.future.slice(1) };
    });
    setDirty(true);
  }

  function updateMap(patch: Partial<MapSettings>) {
    commitProject((current) => ({ ...current, map: { ...current.map, ...patch } }));
  }

  function updateLocation(id: string, patch: Partial<MapLocation>) {
    commitProject((current) => ({
      ...current,
      locations: current.locations.map((location) => location.id === id ? { ...location, ...patch } : location),
    }));
  }

  function updateLayer(id: string, patch: Partial<MapLayer>) {
    commitProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer),
    }));
  }

  function updateSharedPinStyle(patch: Partial<SharedPinStyle>) {
    if (typeof patch.enabled === "boolean" && Object.keys(patch).length === 1) {
      setPinEditingScope(patch.enabled ? "all" : "single");
      return;
    }
    commitProject((current) => applySharedPinStylePatch(current, patch));
  }

  function setPinEditingScope(scope: "all" | "single") {
    if ((scope === "all") === project.sharedPinStyle.enabled) return;
    commitProject((current) => applyPinEditingScope(current, scope, selectedLocationId));
    showNotice(scope === "all"
      ? "All pins editing is on. Pin style changes now apply to every location."
      : "Single-pin editing is on. The current shared appearance was preserved for every location.");
  }

  function addLayer() {
    const layer = createMapLayer(`Layer ${project.layers.length + 1}`);
    commitProject((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedLayerId(layer.id);
    setSelectedLocationId(null);
    setSelectedStateFips(null);
    setActiveSidebar("layers");
    showNotice(`${layer.name} was added. Rename it and import or assign locations.`);
  }

  function moveSelectedLayer(direction: -1 | 1) {
    const index = project.layers.findIndex((layer) => layer.id === selectedLayerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= project.layers.length) return;
    commitProject((current) => {
      const layers = [...current.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { ...current, layers };
    });
  }

  function removeSelectedLayer() {
    if (!selectedLayer || project.layers.length === 1) return;
    const count = project.locations.filter((location) => location.layerId === selectedLayer.id).length;
    if (!window.confirm(`Delete ${selectedLayer.name} and its ${count} location${count === 1 ? "" : "s"}? Undo will remain available.`)) return;
    const index = project.layers.findIndex((layer) => layer.id === selectedLayer.id);
    const remainingLayers = project.layers.filter((layer) => layer.id !== selectedLayer.id);
    commitProject((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== selectedLayer.id),
      locations: current.locations.filter((location) => location.layerId !== selectedLayer.id),
    }));
    setSelectedLayerId(remainingLayers[Math.min(index, remainingLayers.length - 1)].id);
    setSelectedLocationId(null);
    showNotice(`${selectedLayer.name} and ${count} location${count === 1 ? "" : "s"} were removed.`);
  }

  function addLocation() {
    const location = createLocation({ layerId: selectedLayer.id, city: "Oak Ridge", state: "TN", latitude: 36.0104, longitude: -84.2696 });
    commitProject((current) => ({ ...current, locations: [...current.locations, location] }));
    setSelectedLocationId(location.id);
    setSelectedStateFips(null);
    setActiveSidebar("locations");
    showNotice("A new location was added. Resolve a city or enter exact coordinates in the inspector.");
  }

  function activateWorkspace(mode: WorkspaceMode) {
    setActiveSidebar(mode);
    if (mode === "locations") {
      setSelectedStateFips(null);
      if (!selectedLocationId && project.locations.length) setSelectedLocationId(project.locations[0].id);
    } else if (mode === "style") {
      setSelectedLocationId(null);
    } else if (mode === "layers") {
      setSelectedLocationId(null);
      setSelectedStateFips(null);
      if (!project.layers.some((layer) => layer.id === selectedLayerId)) setSelectedLayerId(project.layers[0].id);
    } else if (mode === "map") {
      setSelectedStateFips(null);
      if (!selectedLocationId && project.locations.length) setSelectedLocationId(project.locations[0].id);
    }
  }

  function duplicateSelectedLocation() {
    if (!selectedLocation) return;
    const copy = createLocation({
      ...selectedLocation,
      id: undefined,
      label: `${selectedLocation.label} copy`,
      latitude: selectedLocation.latitude + 0.18,
      longitude: selectedLocation.longitude + 0.18,
    });
    commitProject((current) => ({ ...current, locations: [...current.locations, copy] }));
    setSelectedLocationId(copy.id);
    showNotice("Location duplicated.");
  }

  function removeLocation(id: string) {
    const locationIndex = project.locations.findIndex((location) => location.id === id);
    if (locationIndex < 0) return;
    const removedLocation = project.locations[locationIndex];
    const remainingLocations = project.locations.filter((location) => location.id !== id);
    commitProject((current) => ({ ...current, locations: current.locations.filter((location) => location.id !== id) }));
    if (selectedLocationId === id) {
      setSelectedLocationId(remainingLocations[Math.min(locationIndex, remainingLocations.length - 1)]?.id ?? null);
    }
    showNotice(`${removedLocation.label} was removed. Undo is available.`);
  }

  function removeSelectedLocation() {
    if (selectedLocation) removeLocation(selectedLocation.id);
  }

  function importCustomPin(svg: string, fileName: string) {
    try {
      const { design, removedItems } = createCustomPinDesign(svg, fileName);
      const applyToAll = project.sharedPinStyle.enabled || !selectedLocationId;
      const affectedCount = applyToAll ? project.locations.length : 1;
      commitProject((current) => ({
        ...current,
        customPins: [...current.customPins, design],
        sharedPinStyle: applyToAll
          ? { ...current.sharedPinStyle, enabled: true, customPinId: design.id }
          : current.sharedPinStyle,
        locations: current.locations.map((location) =>
          applyToAll || location.id === selectedLocationId ? { ...location, customPinId: design.id } : location,
        ),
      }));
      showNotice(
        `${design.name} was embedded in the project and applied to ${applyToAll ? `all ${affectedCount} locations` : "the selected location"}.${removedItems ? ` ${removedItems} unsupported or unsafe SVG item${removedItems === 1 ? " was" : "s were"} removed.` : ""}`,
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The custom SVG pin could not be imported.");
    }
  }

  function applyCustomPinToAll(id: string) {
    const design = project.customPins.find((candidate) => candidate.id === id);
    if (!design) return;
    commitProject((current) => ({
      ...current,
      sharedPinStyle: { ...current.sharedPinStyle, enabled: true, customPinId: id },
      locations: current.locations.map((location) => ({ ...location, customPinId: id })),
    }));
    showNotice(`${design.name} was applied to all ${project.locations.length} locations.`);
  }

  function removeCustomPin(id: string) {
    const design = project.customPins.find((candidate) => candidate.id === id);
    if (!design) return;
    const usageCount = project.locations.filter((location) => location.customPinId === id).length;
    if (!window.confirm(`Remove ${design.name} from this project? ${usageCount} location${usageCount === 1 ? "" : "s"} will return to their saved built-in pin type.`)) return;
    commitProject((current) => ({
      ...current,
      customPins: current.customPins.filter((candidate) => candidate.id !== id),
      sharedPinStyle: current.sharedPinStyle.customPinId === id
        ? { ...current.sharedPinStyle, customPinId: null }
        : current.sharedPinStyle,
      locations: current.locations.map((location) =>
        location.customPinId === id ? { ...location, customPinId: null } : location,
      ),
    }));
    showNotice(`${design.name} was removed from the project.`);
  }

  async function openCsv() {
    if (window.usaMapDesktop) {
      const result = await window.usaMapDesktop.openTextFile("csv");
      if (!result.canceled && result.text != null) reviewCsv(result.text, result.name ?? "Imported CSV");
      return;
    }
    csvInputRef.current?.click();
  }

  function reviewCsv(text: string, fileName: string) {
    try {
      setPendingImport({ result: parseLocationsCsv(text), fileName });
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The CSV could not be read.");
    }
  }

  async function openProject() {
    if (dirty && !window.confirm("Open another project and replace the current unsaved map?")) return;
    if (window.usaMapDesktop) {
      const result = await window.usaMapDesktop.openTextFile("project");
      if (!result.canceled && result.text != null) loadProjectText(result.text, result.name ?? "Project file", result.filePath ?? null);
      return;
    }
    projectInputRef.current?.click();
  }

  function loadProjectText(text: string, fileName: string, filePath: string | null = null) {
    try {
      replaceProject(parseProjectText(text), true);
      setProjectFilePath(filePath);
      showNotice(`${fileName} opened successfully.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The project could not be opened.");
    }
  }

  async function saveProject() {
    const text = serializeProject(project);
    const defaultName = `${fileSafeName(project.project.name)}.usmap.json`;
    if (window.usaMapDesktop) {
      const result = await window.usaMapDesktop.saveTextFile({ kind: "project", defaultName, text });
      if (!result.canceled) {
        setProjectFilePath(result.filePath ?? null);
        await window.usaMapDesktop.autosaveProject({ text });
        setDirty(false);
        setAutosaveStatus("saved");
        showNotice(`Project saved to ${result.filePath}.`);
      }
      return;
    }
    downloadBlob(defaultName, new Blob([text], { type: "application/json" }));
    setDirty(false);
    showNotice("Project JSON downloaded.");
  }

  async function exportMap(kind: ExportKind) {
    if (!svgRef.current || exporting) return;
    setExporting(kind);
    try {
      const svg = prepareSvgMarkup(svgRef.current);
      const exportProject = materializeEffectivePinStyles(project);
      const stem = fileSafeName(exportProject.project.name);
      if (kind === "svg") {
        const defaultName = `${stem}.svg`;
        if (window.usaMapDesktop) {
          const result = await window.usaMapDesktop.saveTextFile({ kind: "svg", defaultName, text: svg });
          if (!result.canceled) showNotice(`SVG exported to ${result.filePath}.`);
        } else {
          downloadBlob(defaultName, new Blob([svg], { type: "image/svg+xml" }));
          showNotice("SVG downloaded.");
        }
      } else {
        const bytes = kind === "png"
          ? await svgToPng(svg, 2)
          : await projectToPowerPoint(exportProject, { zoom, pan });
        const defaultName = `${stem}.${kind}`;
        if (window.usaMapDesktop) {
          const result = await window.usaMapDesktop.saveBinaryFile({ kind, defaultName, bytes });
          if (!result.canceled) showNotice(`${kind.toUpperCase()} exported to ${result.filePath}.`);
        } else {
          const mime = kind === "png" ? "image/png" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
          downloadBlob(defaultName, new Blob([bytes], { type: mime }));
          showNotice(`${kind.toUpperCase()} downloaded.`);
        }
      }
    } catch (error) {
      showNotice(error instanceof Error ? error.message : `The ${kind.toUpperCase()} export failed.`);
    } finally {
      setExporting(null);
    }
  }

  async function openGuide() {
    if (window.usaMapDesktop) {
      const result = await window.usaMapDesktop.openUserGuide();
      showNotice(result.opened ? "User guide opened." : `User guide not found at ${result.path}.`);
    } else {
      window.open("./docs/USA-Map-Studio-User-Guide.pdf", "_blank", "noopener,noreferrer");
    }
  }

  function zoomTo(requestedZoom: number) {
    const next = zoomViewportAt({ zoom, pan }, requestedZoom);
    setZoom(next.zoom);
    setPan(next.pan);
  }

  function zoomByStep(direction: -1 | 1) {
    zoomTo(steppedMapZoom(zoom, direction));
  }

  function fitMapView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  async function newProject() {
    if (dirty && !window.confirm("Start a new map and discard the current unsaved changes?")) return;
    if (window.usaMapDesktop) await window.usaMapDesktop.resetAutosaveTarget();
    setProjectFilePath(null);
    replaceProject(createBlankProject(), false);
    showNotice("New blank project created.");
  }

  function applyAiProposal() {
    if (!pendingAiProposal) return;
    if (project.project.updatedAt !== pendingAiProposal.baseUpdatedAt) {
      showNotice("This AI proposal is stale. Reject it and ask the AI to read the current project again.");
      return;
    }
    const applied = pendingAiProposal;
    commitProject(() => structuredClone(applied.proposed));
    setSelectedLocationId(applied.proposed.locations[0]?.id ?? null);
    setSelectedLayerId(applied.proposed.layers[0].id);
    setSelectedStateFips(null);
    setPendingAiProposal(null);
    setAiProposalOpen(false);
    showNotice("AI proposal applied. Review the map while autosave updates the project JSON and recovery copy.");
  }

  function rejectAiProposal() {
    setPendingAiProposal(null);
    setAiProposalOpen(false);
    showNotice("AI proposal rejected. The working map was not changed.");
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const target = event.target;
      const editingText = target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject();
      } else if (command && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openProject();
      } else if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void newProject();
      } else if (editingText) {
        return;
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.code === "Space" && !command && !event.altKey) {
        event.preventDefault();
        setSpacePressed(true);
      } else if (!command && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        zoomByStep(1);
      } else if (!command && (event.key === "-" || event.key === "_")) {
        event.preventDefault();
        zoomByStep(-1);
      } else if (!command && event.key === "0") {
        event.preventDefault();
        fitMapView();
      } else if (!command && event.key === "1") {
        event.preventDefault();
        zoomTo(1);
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        setShortcutsOpen(false);
      } else if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    const resetSpace = () => setSpacePressed(false);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", resetSpace);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", resetSpace);
    };
  });

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    const desktop = window.usaMapDesktop;
    if (!desktop) return;
    let canceled = false;
    void desktop.getAutosaveProject()
      .then((recovery) => {
        if (canceled || !recovery) return;
        const recovered = parseProjectText(recovery.text);
        replaceProject(recovered, true);
        setProjectFilePath(recovery.projectFilePath);
        showNotice(recovery.projectFilePath
          ? `Autosaved project restored from ${recovery.projectFilePath}.`
          : "The latest autosaved JSON recovery project was restored.");
      })
      .catch((error) => {
        if (!canceled) showNotice(error instanceof Error ? error.message : "The autosaved project could not be restored.");
      })
      .finally(() => {
        if (!canceled) {
          setAutosaveReady(true);
          setAutosaveStatus("saved");
        }
      });
    return () => { canceled = true; };
  }, [showNotice]);

  useEffect(() => {
    const desktop = window.usaMapDesktop;
    if (!desktop || !autosaveReady) return;
    const sequence = ++autosaveSequence.current;
    setAutosaveStatus("pending");
    const timer = window.setTimeout(() => {
      setAutosaveStatus("saving");
      const text = serializeProject(project);
      void desktop.autosaveProject({ text })
        .then((result) => {
          if (autosaveSequence.current !== sequence) return;
          setProjectFilePath(result.projectFilePath);
          setDirty(false);
          setAutosaveStatus("saved");
        })
        .catch((error) => {
          if (autosaveSequence.current !== sequence) return;
          setDirty(true);
          setAutosaveStatus("error");
          showNotice(error instanceof Error ? `Autosave failed: ${error.message}` : "Autosave failed.");
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [autosaveReady, project, showNotice]);

  useEffect(() => {
    const desktop = window.usaMapDesktop;
    if (!desktop?.onMcpCommand) return;
    return desktop.onMcpCommand(async ({ operation, input = {} }) => {
      if (operation === "get_app_status") {
        return {
          app: "USA Map Studio",
          version: APP_VERSION,
          project: {
            id: project.project.id,
            name: project.project.name,
            updatedAt: project.project.updatedAt,
            locationCount: project.locations.length,
            layerCount: project.layers.length,
            visibleLayerCount: project.layers.filter((layer) => layer.visible).length,
          },
          dirty,
          autosave: {
            enabled: Boolean(window.usaMapDesktop),
            ready: autosaveReady,
            status: autosaveStatus,
            hasProjectFile: Boolean(projectFilePath),
          },
          pendingProposal: pendingAiProposal
            ? { id: pendingAiProposal.id, summary: pendingAiProposal.summary, createdAt: pendingAiProposal.createdAt }
            : null,
        };
      }
      if (operation === "get_current_project") {
        return { project: structuredClone(project), dirty };
      }
      if (operation === "list_locations") {
        const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
        const requestedLayerId = typeof input.layerId === "string" ? input.layerId : "";
        const layerMatches = requestedLayerId
          ? project.locations.filter((location) => location.layerId === requestedLayerId)
          : project.locations;
        const matches = query
          ? layerMatches.filter((location) =>
              [location.id, location.label, location.city, location.state, location.notes]
                .some((value) => value.toLowerCase().includes(query)),
            )
          : layerMatches;
        return {
          locations: structuredClone(matches.slice(0, 500)),
          total: matches.length,
          truncated: matches.length > 500,
          projectUpdatedAt: project.project.updatedAt,
        };
      }
      if (operation === "list_layers") {
        return {
          layers: project.layers.map((layer, index) => ({
            ...structuredClone(layer),
            order: index,
            locationCount: project.locations.filter((location) => location.layerId === layer.id).length,
          })),
          projectUpdatedAt: project.project.updatedAt,
        };
      }
      if (operation === "validate_project") {
        const candidate = input.project === undefined ? project : validateProjectCandidate(input.project);
        return {
          valid: true,
          project: {
            id: candidate.project.id,
            name: candidate.project.name,
            locationCount: candidate.locations.length,
            layerCount: candidate.layers.length,
            updatedAt: candidate.project.updatedAt,
          },
        };
      }
      if (pendingAiProposal) {
        throw new Error("A map proposal is already waiting for review. Apply or reject it in USA Map Studio first.");
      }
      const result = buildMcpProposal(operation, input, project);
      setPendingAiProposal(result.proposal);
      setAiProposalOpen(true);
      showNotice(`AI proposal ready: ${result.proposal.summary}. Nothing has been applied or saved.`);
      return {
        proposal: {
          id: result.proposal.id,
          operation: result.proposal.operation,
          summary: result.proposal.summary,
          details: result.proposal.details,
          createdAt: result.proposal.createdAt,
          baseUpdatedAt: result.proposal.baseUpdatedAt,
          proposedLocationCount: result.proposal.proposed.locations.length,
        },
        importIssues: result.importIssues ?? [],
        removedSvgItems: result.removedSvgItems ?? 0,
        applied: false,
        saved: false,
      };
    });
  }, [autosaveReady, autosaveStatus, dirty, pendingAiProposal, project, projectFilePath, showNotice]);

  return (
    <div className="studio-shell" data-testid="studio-shell">
      <header className="topbar">
        <div className="product-mark" aria-label="USA Map Studio">
          <span className="product-mark__tile"><MapTrifold size={23} weight="bold" /></span>
          <span><strong>USA Map Studio</strong><small>Local map workspace</small></span>
        </div>
        <label className="global-search">
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search locations</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onFocus={() => activateWorkspace("locations")}
            onChange={(event) => { setSearchQuery(event.target.value); activateWorkspace("locations"); }}
            placeholder="Search cities, labels, states, or notes"
          />
          <kbd>/</kbd>
        </label>
        <div className="topbar__status">
          <input className="project-name" value={project.project.name} aria-label="Project name" onChange={(event) => commitProject((current) => ({ ...current, project: { ...current.project, name: event.target.value } }))} />
          <span className="version-chip">v{APP_VERSION}</span>
          <span className={`save-status ${autosaveStatus === "error" || dirty ? "save-status--dirty" : "save-status--saved"}`}>
            {autosaveStatus === "loading" ? "Loading…" : autosaveStatus === "pending" ? "Save pending" : autosaveStatus === "saving" ? "Saving…" : autosaveStatus === "error" ? "Autosave failed" : projectFilePath ? "Autosaved" : window.usaMapDesktop ? "Recovery saved" : dirty ? "Unsaved" : "Saved"}
          </span>
          <span className="validation-status"><CheckCircle size={16} weight="bold" /> {project.locations.length} mapped</span>
          {window.usaMapDesktop ? <button type="button" className="topbar__quit" onClick={() => void window.usaMapDesktop?.requestQuit()} aria-label="Quit USA Map Studio"><X size={15} weight="bold" /></button> : null}
        </div>
      </header>

      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar__section">
          <p className="sidebar__label">Workspace</p>
          <button type="button" data-workspace-mode="map" aria-current={activeSidebar === "map" ? "page" : undefined} className={activeSidebar === "map" ? "is-active" : ""} onClick={() => activateWorkspace("map")}><SquaresFour size={19} /><span>Map editor</span></button>
          <button type="button" data-workspace-mode="locations" aria-current={activeSidebar === "locations" ? "page" : undefined} className={activeSidebar === "locations" ? "is-active" : ""} onClick={() => activateWorkspace("locations")}><ListBullets size={19} /><span>Locations</span><span className="nav-count">{project.locations.length}</span></button>
          <button type="button" data-workspace-mode="layers" aria-current={activeSidebar === "layers" ? "page" : undefined} className={activeSidebar === "layers" ? "is-active" : ""} onClick={() => activateWorkspace("layers")}><Stack size={19} /><span>Layers</span><span className="nav-count">{project.layers.length}</span></button>
          <button type="button" data-workspace-mode="style" aria-current={activeSidebar === "style" ? "page" : undefined} className={activeSidebar === "style" ? "is-active" : ""} onClick={() => activateWorkspace("style")}><PaintBrush size={19} /><span>Map style</span></button>
          <button type="button" data-workspace-mode="export" aria-current={activeSidebar === "export" ? "page" : undefined} className={activeSidebar === "export" ? "is-active" : ""} onClick={() => activateWorkspace("export")}><DownloadSimple size={19} /><span>Export</span></button>
        </div>
        <div className="sidebar__section">
          <p className="sidebar__label">Project</p>
          <button type="button" onClick={() => void newProject()}><Plus size={19} /><span>New project</span></button>
          <button type="button" onClick={() => void openProject()}><FolderOpen size={19} /><span>Open project</span></button>
          <button type="button" onClick={() => void saveProject()}><FloppyDisk size={19} /><span>Save project</span></button>
          <button type="button" onClick={() => void openCsv()}><FileCsv size={19} /><span>Import CSV</span></button>
        </div>
        <div className="sidebar__section">
          <p className="sidebar__label">Resources</p>
          <button type="button" onClick={() => { downloadBlob("usa-map-studio-template.csv", new Blob([CSV_TEMPLATE], { type: "text/csv" })); showNotice("CSV template downloaded."); }}><FileArrowUp size={19} /><span>CSV template</span></button>
          <button type="button" onClick={() => void openGuide()}><Question size={19} /><span>User guide</span></button>
          {window.usaMapDesktop ? <button type="button" className={pendingAiProposal ? "has-pending-proposal" : ""} onClick={() => pendingAiProposal ? setAiProposalOpen(true) : showNotice("Local AI control is ready. Connect through the installed USA Map Studio MCP server.")}><Robot size={19} /><span>Local AI control</span>{pendingAiProposal ? <span className="nav-count">1</span> : null}</button> : null}
        </div>
        <div className="sidebar__summary">
          <p>Active project</p>
          <strong>{project.project.name}</strong>
          <span>{project.locations.length} locations</span>
          <span>{project.layers.length} layers · {project.layers.filter((layer) => layer.visible).length} visible</span>
          <span>{Object.keys(project.map.stateColors).length} state overrides</span>
          <span>2025 Census geography</span>
        </div>
      </aside>

      <main className="workspace">
        {pendingAiProposal ? (
          <section className="ai-proposal-banner" aria-live="polite" data-testid="ai-proposal-banner">
            <span><Robot size={17} weight="bold" /> AI proposal waiting</span>
            <p>{pendingAiProposal.summary} · Not applied or saved.</p>
            <button type="button" className="button button--secondary" onClick={() => setAiProposalOpen(true)}>Review changes</button>
          </section>
        ) : null}
        {notice ? (
          <section className="prototype-notice" aria-live="polite">
            <span><Sparkle size={16} /> Ready</span><p>{notice}</p><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={16} /></button>
          </section>
        ) : null}
        <section className="editor-panel" aria-label="USA map editor">
          <div className="canvas-toolbar">
            <div className="canvas-toolbar__mode">
              <span data-testid="workspace-mode-heading"><strong>{workspaceCopy.title}</strong><small>{workspaceCopy.description}</small></span>
              <div role="group" aria-label="Map detail controls">
                <button type="button" className={project.map.showCountyLines ? "is-active" : ""} aria-pressed={project.map.showCountyLines} onClick={() => updateMap({ showCountyLines: !project.map.showCountyLines })}>Counties</button>
                <button type="button" className={project.map.showStateLabels ? "is-active" : ""} aria-pressed={project.map.showStateLabels} onClick={() => updateMap({ showStateLabels: !project.map.showStateLabels })}>State labels</button>
                <button type="button" className={project.map.showLocationLabels ? "is-active" : ""} aria-pressed={project.map.showLocationLabels} onClick={() => updateMap({ showLocationLabels: !project.map.showLocationLabels })}>Pin labels</button>
              </div>
            </div>
            <div className="zoom-status" data-testid="zoom-status" aria-label={`Map zoom ${Math.round(zoom * 100)} percent`}><strong>{Math.round(zoom * 100)}%</strong><small>Space + drag to pan · scroll to zoom</small></div>
            <div className="toolbar-actions">
              <div className="viewport-controls" role="group" aria-label="Canvas zoom controls">
                <button type="button" data-testid="zoom-out" onClick={() => zoomByStep(-1)} disabled={zoom <= 0.4} aria-label="Zoom out" title="Zoom out (−)"><Minus size={16} weight="bold" /></button>
                <button type="button" data-testid="zoom-in" onClick={() => zoomByStep(1)} disabled={zoom >= 4} aria-label="Zoom in" title="Zoom in (+)"><Plus size={16} weight="bold" /></button>
                <button type="button" data-testid="zoom-actual" onClick={() => zoomTo(1)} aria-label="Actual size" title="Actual size (1)"><span>100</span></button>
                <button type="button" data-testid="zoom-fit" onClick={fitMapView} aria-label="Fit map in view" title="Fit map in view (0)"><ArrowsOut size={16} /></button>
                <button type="button" data-testid="keyboard-shortcuts" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><Question size={16} /></button>
              </div>
              <div className="toolbar-actions__history">
                <button type="button" className="button button--secondary button--history" onClick={undo} disabled={!history.past.length} aria-label="Undo"><ArrowCounterClockwise size={17} /></button>
                <button type="button" className="button button--secondary button--history" onClick={redo} disabled={!history.future.length} aria-label="Redo"><ArrowClockwise size={17} /></button>
              </div>
              <button type="button" className="button button--primary" onClick={() => void exportMap("png")} disabled={exporting !== null}><DownloadSimple size={17} /> {exporting ? "Exporting…" : "Quick PNG"}</button>
            </div>
          </div>

          <div className={`editor-body editor-body--${activeSidebar}`} data-workspace-view={activeSidebar}>
            {activeSidebar === "layers" ? (
              <LayerPanel
                layers={project.layers}
                locations={project.locations}
                selectedLayerId={selectedLayer.id}
                onSelectLayer={setSelectedLayerId}
                onAddLayer={addLayer}
                onToggleLayer={(id) => {
                  const layer = project.layers.find((candidate) => candidate.id === id);
                  if (layer) updateLayer(id, { visible: !layer.visible });
                }}
              />
            ) : null}
            {activeSidebar === "locations" ? <aside className="location-panel" aria-label="Map locations">
              <div className="panel-heading"><div><small>Data</small><h2>Locations</h2></div><button type="button" className="icon-button icon-button--primary" onClick={addLocation} aria-label="Add location"><Plus size={18} weight="bold" /></button></div>
              <div className="location-panel__actions"><button type="button" className="button button--secondary" onClick={() => void openCsv()}><FileCsv size={16} /> Import CSV</button><button type="button" className="button button--secondary" onClick={addLocation}><MapPin size={16} /> Add pin</button></div>
              <div className="location-list" data-testid="location-list">
                {filteredLocations.length ? filteredLocations.map((location, index) => {
                  const pinStyle = effectivePinStyle(project, location);
                  const layer = project.layers.find((candidate) => candidate.id === location.layerId);
                  return (
                  <div key={location.id} className={`location-row${location.id === selectedLocationId ? " is-active" : ""}${layer?.visible === false ? " is-layer-hidden" : ""}${location.visible ? "" : " is-location-hidden"}`}>
                    <button type="button" className="location-row__select" onClick={() => { setSelectedLocationId(location.id); setSelectedStateFips(null); }}>
                      <span className="location-row__marker" style={{ background: pinStyle.pinColor }}>{index + 1}</span>
                      <span><strong>{location.label}</strong><small>{location.city}, {location.state} · {layer?.name ?? "Unknown layer"} · {pinStyle.customPinId ? project.customPins.find((design) => design.id === pinStyle.customPinId)?.name ?? "custom SVG" : pinStyle.pinType}</small></span>
                      {!location.visible || !location.showLabel || layer?.visible === false ? <span className="location-row__hidden">{!location.visible ? "Location hidden" : layer?.visible === false ? "Layer hidden" : "Label hidden"}</span> : null}
                    </button>
                    <button type="button" className="location-row__visibility" onClick={() => updateLocation(location.id, { visible: !location.visible })} aria-label={`${location.visible ? "Hide" : "Show"} ${location.label}`} title={`${location.visible ? "Hide" : "Show"} ${location.label}`} aria-pressed={location.visible}>
                      {location.visible ? <Eye size={15} weight="bold" /> : <EyeSlash size={15} />}
                    </button>
                    <button type="button" className="location-row__remove" onClick={() => removeLocation(location.id)} aria-label={`Remove ${location.label}`} title={`Remove ${location.label}`}>
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                  );
                }) : (
                  <div className="empty-list"><MagnifyingGlass size={24} /><strong>No matching locations</strong><span>Clear the search or import another CSV.</span></div>
                )}
              </div>
              <div className="location-panel__footer"><span>{filteredLocations.length} shown</span><span>{project.locations.length} total</span></div>
            </aside> : null}

            <div className="map-stage" data-testid="map-stage">
              <div className="map-stage__badge"><MapTrifold size={15} weight="bold" /> Vector preview</div>
              <MapCanvas
                ref={svgRef}
                project={project}
                selectedLocationId={selectedLocationId}
                selectedStateFips={selectedStateFips}
                zoom={zoom}
                pan={pan}
                spacePressed={spacePressed}
                onSelectLocation={(id) => {
                  setSelectedLocationId(id);
                  if (id) {
                    setSelectedStateFips(null);
                    if (activeSidebar === "style" || activeSidebar === "layers" || activeSidebar === "export") setActiveSidebar("map");
                  }
                }}
                onSelectState={(fips) => {
                  setSelectedStateFips(fips);
                  if (fips) {
                    setSelectedLocationId(null);
                    setActiveSidebar("style");
                  }
                }}
                onMoveLocation={(id, latitude, longitude) => updateLocation(id, { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) })}
                onPanChange={setPan}
                onZoomChange={setZoom}
              />
              <MapMiniMap project={project} zoom={zoom} pan={pan} onPanChange={setPan} />
              <div className="map-stage__footer"><span>1200 × 720 export canvas</span><span>Albers USA projection</span><span>Space + drag to pan · drag pins to refine</span></div>
            </div>

            {activeSidebar === "export" ? (
              <aside className="inspector export-panel" aria-label="Export options">
                <div className="inspector__heading"><span><DownloadSimple size={18} weight="bold" /></span><div><small>Publish &amp; share</small><h2>Export map</h2></div></div>
                <div className="inspector__body">
                  <p className="export-intro">Every export uses the same 1200 × 720 composition currently visible on the canvas.</p>
                  <button type="button" className="export-option" onClick={() => void exportMap("svg")} disabled={exporting !== null}><BracketsCurly size={24} /><span><strong>SVG</strong><small>Scalable vector map for design tools and the web</small></span></button>
                  <button type="button" className="export-option" onClick={() => void exportMap("png")} disabled={exporting !== null}><ImageSquare size={24} /><span><strong>PNG</strong><small>2400 × 1440 transparent-safe raster image</small></span></button>
                  <button type="button" className="export-option" onClick={() => void exportMap("pptx")} disabled={exporting !== null}><PresentationChart size={24} /><span><strong>PowerPoint</strong><small>Editable map objects with the visible pin size and viewport</small></span></button>
                  <button type="button" className="export-option" onClick={() => void saveProject()}><FloppyDisk size={24} /><span><strong>Project JSON</strong><small>Complete editable project for later import</small></span></button>
                  <section className="export-note"><CheckCircle size={18} weight="fill" /><span><strong>Consistent output</strong>Selection outlines and editor controls are excluded from exported files.</span></section>
                </div>
              </aside>
            ) : activeSidebar === "layers" ? (
              <LayerInspector
                layer={selectedLayer}
                layers={project.layers}
                locationCount={project.locations.filter((location) => location.layerId === selectedLayer.id).length}
                sharedPinStyle={project.sharedPinStyle}
                customPins={project.customPins}
                onUpdateLayer={(patch) => updateLayer(selectedLayer.id, patch)}
                onUpdateSharedPinStyle={updateSharedPinStyle}
                onMoveLayer={moveSelectedLayer}
                onRemoveLayer={removeSelectedLayer}
              />
            ) : (
              <Inspector
                location={selectedLocation}
                map={project.map}
                selectedStateFips={selectedStateFips}
                customPins={project.customPins}
                layers={project.layers}
                sharedPinStyle={project.sharedPinStyle}
                onUpdateLocation={(patch) => selectedLocation && updateLocation(selectedLocation.id, patch)}
                onUpdateSharedPinStyle={updateSharedPinStyle}
                onSetPinEditingScope={setPinEditingScope}
                onUpdateMap={updateMap}
                onDuplicateLocation={duplicateSelectedLocation}
                onRemoveLocation={removeSelectedLocation}
                onSelectState={(fips) => { setSelectedStateFips(fips); setSelectedLocationId(null); }}
                onImportCustomPin={importCustomPin}
                onApplyCustomPinToAll={applyCustomPinToAll}
                onRemoveCustomPin={removeCustomPin}
                onNotice={showNotice}
              />
            )}
          </div>
        </section>
      </main>

      <input ref={csvInputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void file.text().then((text) => reviewCsv(text, file.name));
        event.currentTarget.value = "";
      }} />
      <input ref={projectInputRef} className="sr-only" type="file" accept=".json,.usmap.json,application/json" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void file.text().then((text) => loadProjectText(text, file.name, null));
        event.currentTarget.value = "";
      }} />
      {pendingImport ? (
        <ImportDialog
          result={pendingImport.result}
          fileName={pendingImport.fileName}
          layers={project.layers}
          targetLayerId={selectedLayer.id}
          onTargetLayerChange={setSelectedLayerId}
          onClose={() => setPendingImport(null)}
          onAdd={() => {
            const locations = pendingImport.result.locations.map((location) => ({ ...location, layerId: selectedLayer.id }));
            commitProject((current) => ({ ...current, locations: [...current.locations, ...locations] }));
            setSelectedLocationId(pendingImport.result.locations[0]?.id ?? null);
            setActiveSidebar("locations");
            showNotice(`Added ${pendingImport.result.locations.length} locations to ${selectedLayer.name}${pendingImport.result.issues.length ? `; ${pendingImport.result.issues.length} rows need correction` : ""}.`);
            setPendingImport(null);
          }}
          onReplaceLayer={() => {
            const locations = pendingImport.result.locations.map((location) => ({ ...location, layerId: selectedLayer.id }));
            commitProject((current) => ({ ...current, locations: [...current.locations.filter((location) => location.layerId !== selectedLayer.id), ...locations] }));
            setSelectedLocationId(pendingImport.result.locations[0]?.id ?? null);
            setActiveSidebar("locations");
            showNotice(`Replaced ${selectedLayer.name} with ${pendingImport.result.locations.length} locations.`);
            setPendingImport(null);
          }}
        />
      ) : null}
      {pendingAiProposal && aiProposalOpen ? (
        <AiProposalDialog
          proposal={pendingAiProposal}
          stale={project.project.updatedAt !== pendingAiProposal.baseUpdatedAt}
          onApply={applyAiProposal}
          onReject={rejectAiProposal}
          onReviewLater={() => setAiProposalOpen(false)}
        />
      ) : null}
      {shortcutsOpen ? <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}

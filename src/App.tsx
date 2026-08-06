import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOut,
  BracketsCurly,
  CheckCircle,
  DownloadSimple,
  FileArrowUp,
  FileCsv,
  FloppyDisk,
  FolderOpen,
  ImageSquare,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  PaintBrush,
  Plus,
  PresentationChart,
  Question,
  Robot,
  Sparkle,
  SquaresFour,
  WarningDiamond,
  X,
} from "@phosphor-icons/react";
import { createBlankProject, createDefaultProject, createLocation } from "./data/default-project";
import { parseLocationsCsv, CSV_TEMPLATE } from "./lib/csv";
import { downloadBlob, prepareSvgMarkup, svgToPng, svgToPowerPoint } from "./lib/export";
import { fileSafeName, parseProjectText, serializeProject } from "./lib/project";
import { buildMcpProposal, validateProjectCandidate } from "./lib/mcp-proposals";
import { createCustomPinDesign } from "./lib/custom-pin";
import type { AiMapProposal, ImportResult, MapLocation, MapSettings, UsaMapProject } from "./types";
import { MapCanvas } from "./components/MapCanvas";
import { Inspector } from "./components/Inspector";
import { ImportDialog } from "./components/ImportDialog";
import { AiProposalDialog } from "./components/AiProposalDialog";

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
type WorkspaceMode = "map" | "locations" | "style" | "export";

const WORKSPACE_MODE_COPY: Record<WorkspaceMode, { title: string; description: string }> = {
  map: { title: "Map editor", description: "Select and refine pins directly on the canvas" },
  locations: { title: "Location workspace", description: "Search, import, organize, and edit mapped places" },
  style: { title: "Map style", description: "Control geography, labels, state fills, and the legend" },
  export: { title: "Export preview", description: "Review the composition and choose an output format" },
};

const APP_VERSION = "0.2.1";

export function App() {
  const [history, setHistory] = useState<HistoryState>({ past: [], present: createDefaultProject(), future: [] });
  const [dirty, setDirty] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(history.present.locations[0]?.id ?? null);
  const [selectedStateFips, setSelectedStateFips] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("Sample locations are loaded. Import a CSV or begin editing the map.");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [pendingAiProposal, setPendingAiProposal] = useState<AiMapProposal | null>(null);
  const [aiProposalOpen, setAiProposalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<WorkspaceMode>("map");
  const svgRef = useRef<SVGSVGElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | null>(null);
  const project = history.present;
  const workspaceCopy = WORKSPACE_MODE_COPY[activeSidebar];

  const selectedLocation = project.locations.find((location) => location.id === selectedLocationId) ?? null;
  const filteredLocations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return project.locations;
    return project.locations.filter((location) =>
      [location.label, location.city, location.state, location.notes].some((value) => value.toLowerCase().includes(query)),
    );
  }, [project.locations, searchQuery]);

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
  }, []);

  function replaceProject(next: UsaMapProject, saved = false) {
    setHistory({ past: [], present: next, future: [] });
    setSelectedLocationId(next.locations[0]?.id ?? null);
    setSelectedStateFips(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDirty(!saved);
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

  function addLocation() {
    const location = createLocation({ city: "Oak Ridge", state: "TN", latitude: 36.0104, longitude: -84.2696 });
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

  function removeSelectedLocation() {
    if (!selectedLocation) return;
    const nextSelection = project.locations.find((location) => location.id !== selectedLocation.id)?.id ?? null;
    commitProject((current) => ({ ...current, locations: current.locations.filter((location) => location.id !== selectedLocation.id) }));
    setSelectedLocationId(nextSelection);
    showNotice(`${selectedLocation.label} was removed.`);
  }

  function importCustomPin(svg: string, fileName: string) {
    try {
      const { design, removedItems } = createCustomPinDesign(svg, fileName);
      const targetLocationId = selectedLocation?.id ?? null;
      commitProject((current) => ({
        ...current,
        customPins: [...current.customPins, design],
        locations: current.locations.map((location) =>
          location.id === targetLocationId ? { ...location, customPinId: design.id } : location,
        ),
      }));
      showNotice(
        `${design.name} was embedded in the project${targetLocationId ? " and applied to the selected location" : ""}.${removedItems ? ` ${removedItems} unsupported or unsafe SVG item${removedItems === 1 ? " was" : "s were"} removed.` : ""}`,
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The custom SVG pin could not be imported.");
    }
  }

  function removeCustomPin(id: string) {
    const design = project.customPins.find((candidate) => candidate.id === id);
    if (!design) return;
    const usageCount = project.locations.filter((location) => location.customPinId === id).length;
    if (!window.confirm(`Remove ${design.name} from this project? ${usageCount} location${usageCount === 1 ? "" : "s"} will return to their saved built-in pin type.`)) return;
    commitProject((current) => ({
      ...current,
      customPins: current.customPins.filter((candidate) => candidate.id !== id),
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
      if (!result.canceled && result.text != null) loadProjectText(result.text, result.name ?? "Project file");
      return;
    }
    projectInputRef.current?.click();
  }

  function loadProjectText(text: string, fileName: string) {
    try {
      replaceProject(parseProjectText(text), true);
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
        setDirty(false);
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
      const stem = fileSafeName(project.project.name);
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
          : await svgToPowerPoint(svg, project.map.title, project.project.name);
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

  function newProject() {
    if (dirty && !window.confirm("Start a new map and discard the current unsaved changes?")) return;
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
    setSelectedStateFips(null);
    setPendingAiProposal(null);
    setAiProposalOpen(false);
    showNotice("AI proposal applied to the working map. Review it, then save the project when ready.");
  }

  function rejectAiProposal() {
    setPendingAiProposal(null);
    setAiProposalOpen(false);
    showNotice("AI proposal rejected. The working map was not changed.");
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

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
          },
          dirty,
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
        const matches = query
          ? project.locations.filter((location) =>
              [location.id, location.label, location.city, location.state, location.notes]
                .some((value) => value.toLowerCase().includes(query)),
            )
          : project.locations;
        return {
          locations: structuredClone(matches.slice(0, 500)),
          total: matches.length,
          truncated: matches.length > 500,
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
  }, [dirty, pendingAiProposal, project, showNotice]);

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
          <span className={`save-status ${dirty ? "save-status--dirty" : "save-status--saved"}`}>{dirty ? "Unsaved" : "Saved"}</span>
          <span className="validation-status"><CheckCircle size={16} weight="bold" /> {project.locations.length} mapped</span>
          {window.usaMapDesktop ? <button type="button" className="topbar__quit" onClick={() => void window.usaMapDesktop?.requestQuit()} aria-label="Quit USA Map Studio"><X size={15} weight="bold" /></button> : null}
        </div>
      </header>

      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar__section">
          <p className="sidebar__label">Workspace</p>
          <button type="button" data-workspace-mode="map" aria-current={activeSidebar === "map" ? "page" : undefined} className={activeSidebar === "map" ? "is-active" : ""} onClick={() => activateWorkspace("map")}><SquaresFour size={19} /><span>Map editor</span></button>
          <button type="button" data-workspace-mode="locations" aria-current={activeSidebar === "locations" ? "page" : undefined} className={activeSidebar === "locations" ? "is-active" : ""} onClick={() => activateWorkspace("locations")}><ListBullets size={19} /><span>Locations</span><span className="nav-count">{project.locations.length}</span></button>
          <button type="button" data-workspace-mode="style" aria-current={activeSidebar === "style" ? "page" : undefined} className={activeSidebar === "style" ? "is-active" : ""} onClick={() => activateWorkspace("style")}><PaintBrush size={19} /><span>Map style</span></button>
          <button type="button" data-workspace-mode="export" aria-current={activeSidebar === "export" ? "page" : undefined} className={activeSidebar === "export" ? "is-active" : ""} onClick={() => activateWorkspace("export")}><DownloadSimple size={19} /><span>Export</span></button>
        </div>
        <div className="sidebar__section">
          <p className="sidebar__label">Project</p>
          <button type="button" onClick={newProject}><Plus size={19} /><span>New project</span></button>
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
            <div className="zoom-status" aria-label={`Map zoom ${Math.round(zoom * 100)} percent`}><strong>{Math.round(zoom * 100)}%</strong><small>Scroll map to zoom · drag background to pan</small></div>
            <div className="toolbar-actions">
              <div className="toolbar-actions__history">
                <button type="button" className="button button--secondary button--history" onClick={undo} disabled={!history.past.length} aria-label="Undo"><ArrowCounterClockwise size={17} /></button>
                <button type="button" className="button button--secondary button--history" onClick={redo} disabled={!history.future.length} aria-label="Redo"><ArrowClockwise size={17} /></button>
              </div>
              <button type="button" className="button button--secondary" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><ArrowsOut size={17} /> Fit view</button>
              <button type="button" className="button button--primary" onClick={() => void exportMap("png")} disabled={exporting !== null}><DownloadSimple size={17} /> {exporting ? "Exporting…" : "Quick PNG"}</button>
            </div>
          </div>

          <div className={`editor-body editor-body--${activeSidebar}`} data-workspace-view={activeSidebar}>
            {activeSidebar === "locations" ? <aside className="location-panel" aria-label="Map locations">
              <div className="panel-heading"><div><small>Data</small><h2>Locations</h2></div><button type="button" className="icon-button icon-button--primary" onClick={addLocation} aria-label="Add location"><Plus size={18} weight="bold" /></button></div>
              <div className="location-panel__actions"><button type="button" className="button button--secondary" onClick={() => void openCsv()}><FileCsv size={16} /> Import CSV</button><button type="button" className="button button--secondary" onClick={addLocation}><MapPin size={16} /> Add pin</button></div>
              <div className="location-list" data-testid="location-list">
                {filteredLocations.length ? filteredLocations.map((location, index) => (
                  <button key={location.id} type="button" className={`location-row${location.id === selectedLocationId ? " is-active" : ""}`} onClick={() => { setSelectedLocationId(location.id); setSelectedStateFips(null); }}>
                    <span className="location-row__marker" style={{ background: location.pinColor }}>{index + 1}</span>
                    <span><strong>{location.label}</strong><small>{location.city}, {location.state} · {location.customPinId ? project.customPins.find((design) => design.id === location.customPinId)?.name ?? "custom SVG" : location.pinType}</small></span>
                    {!location.showLabel ? <span className="location-row__hidden">Hidden</span> : null}
                  </button>
                )) : (
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
                onSelectLocation={(id) => {
                  setSelectedLocationId(id);
                  if (id) {
                    setSelectedStateFips(null);
                    if (activeSidebar === "style" || activeSidebar === "export") setActiveSidebar("map");
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
              <div className="map-stage__footer"><span>1200 × 720 export canvas</span><span>Albers USA projection</span><span>Drag pins to refine</span></div>
            </div>

            {activeSidebar === "export" ? (
              <aside className="inspector export-panel" aria-label="Export options">
                <div className="inspector__heading"><span><DownloadSimple size={18} weight="bold" /></span><div><small>Publish &amp; share</small><h2>Export map</h2></div></div>
                <div className="inspector__body">
                  <p className="export-intro">Every export uses the same 1200 × 720 composition currently visible on the canvas.</p>
                  <button type="button" className="export-option" onClick={() => void exportMap("svg")} disabled={exporting !== null}><BracketsCurly size={24} /><span><strong>SVG</strong><small>Scalable vector map for design tools and the web</small></span></button>
                  <button type="button" className="export-option" onClick={() => void exportMap("png")} disabled={exporting !== null}><ImageSquare size={24} /><span><strong>PNG</strong><small>2400 × 1440 transparent-safe raster image</small></span></button>
                  <button type="button" className="export-option" onClick={() => void exportMap("pptx")} disabled={exporting !== null}><PresentationChart size={24} /><span><strong>PowerPoint</strong><small>One-slide 16:9 deck with a vector map</small></span></button>
                  <button type="button" className="export-option" onClick={() => void saveProject()}><FloppyDisk size={24} /><span><strong>Project JSON</strong><small>Complete editable project for later import</small></span></button>
                  <section className="export-note"><CheckCircle size={18} weight="fill" /><span><strong>Consistent output</strong>Selection outlines and editor controls are excluded from exported files.</span></section>
                </div>
              </aside>
            ) : (
              <Inspector
                location={selectedLocation}
                map={project.map}
                selectedStateFips={selectedStateFips}
                customPins={project.customPins}
                onUpdateLocation={(patch) => selectedLocation && updateLocation(selectedLocation.id, patch)}
                onUpdateMap={updateMap}
                onDuplicateLocation={duplicateSelectedLocation}
                onRemoveLocation={removeSelectedLocation}
                onSelectState={(fips) => { setSelectedStateFips(fips); setSelectedLocationId(null); }}
                onImportCustomPin={importCustomPin}
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
        if (file) void file.text().then((text) => loadProjectText(text, file.name));
        event.currentTarget.value = "";
      }} />
      {pendingImport ? (
        <ImportDialog
          result={pendingImport.result}
          fileName={pendingImport.fileName}
          onClose={() => setPendingImport(null)}
          onAdd={() => {
            commitProject((current) => ({ ...current, locations: [...current.locations, ...pendingImport.result.locations] }));
            setSelectedLocationId(pendingImport.result.locations[0]?.id ?? null);
            setActiveSidebar("locations");
            showNotice(`Added ${pendingImport.result.locations.length} locations${pendingImport.result.issues.length ? `; ${pendingImport.result.issues.length} rows need correction` : ""}.`);
            setPendingImport(null);
          }}
          onReplace={() => {
            commitProject((current) => ({ ...current, locations: pendingImport.result.locations }));
            setSelectedLocationId(pendingImport.result.locations[0]?.id ?? null);
            setActiveSidebar("locations");
            showNotice(`Replaced the list with ${pendingImport.result.locations.length} locations.`);
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
    </div>
  );
}

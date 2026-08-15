import { findCalloutOverlaps, findLeaderLineCrossings, visibleCalloutLabels } from "./callouts";
import { visibleLocations } from "./layers";
import type { UsaMapProject } from "../types";

export type PreflightStatus = "pass" | "warning" | "error" | "info";

export interface PreflightCheck {
  id: string;
  status: PreflightStatus;
  title: string;
  detail: string;
}

export interface ExportPreflightReport {
  checks: PreflightCheck[];
  errors: number;
  warnings: number;
}

export function buildExportPreflight(project: UsaMapProject, unavailableFonts: string[] = []): ExportPreflightReport {
  const visible = visibleLocations(project);
  const visibleLayers = project.layers.filter((layer) => layer.visible);
  const hiddenLayers = project.layers.filter((layer) => !layer.visible);
  const overlaps = findCalloutOverlaps(project);
  const boundaryIssues = overlaps.filter((overlap) => overlap.secondLocationId === "__canvas-boundary__");
  const collisionIssues = overlaps.filter((overlap) => overlap.secondLocationId !== "__canvas-boundary__");
  const crossings = findLeaderLineCrossings(project);
  const visibleCallouts = visible.filter((location) => location.callout.visible && visibleCalloutLabels(location.callout).length > 0);
  const hiddenCallouts = visible.filter((location) => !location.callout.visible);
  const companyMode = project.map.locationLabelMode === "city-company"
    || project.map.locationLabelMode === "selected-layer"
    || project.map.locationLabelMode === "selected-location";
  const missingCompanies = companyMode
    ? visibleCallouts.filter((location) => !location.callout.labels.some((label) => label.role === "company" && label.visible && label.text.trim()))
    : [];
  const checks: PreflightCheck[] = [
    {
      id: "visible-locations",
      status: visible.length ? "pass" : "error",
      title: visible.length ? `${visible.length} visible locations` : "No visible locations",
      detail: visible.length ? "Visible layer and location settings will be honored." : "The export would contain geography but no pins.",
    },
    {
      id: "layers",
      status: visibleLayers.length ? hiddenLayers.length ? "info" : "pass" : "error",
      title: `${visibleLayers.length} of ${project.layers.length} layers visible`,
      detail: hiddenLayers.length ? `Hidden and omitted: ${hiddenLayers.map((layer) => layer.name).join(", ")}.` : "Every layer is included.",
    },
    {
      id: "label-mode",
      status: project.map.locationLabelMode === "pins" ? "info" : "pass",
      title: `Label view: ${project.map.locationLabelMode.replaceAll("-", " ")}`,
      detail: project.map.locationLabelMode === "pins" ? "This export intentionally contains pins without callouts." : `${visibleCallouts.length} callouts will be exported.`,
    },
    {
      id: "hidden-callouts",
      status: hiddenCallouts.length && project.map.locationLabelMode !== "pins" ? "warning" : "pass",
      title: hiddenCallouts.length && project.map.locationLabelMode !== "pins" ? `${hiddenCallouts.length} visible pins have hidden callouts` : "Per-location label visibility checked",
      detail: hiddenCallouts.length && project.map.locationLabelMode !== "pins" ? "Those pins remain visible, but their labels are omitted." : "No unexpected hidden callouts were found in the active label view.",
    },
    {
      id: "company-data",
      status: missingCompanies.length ? "warning" : "pass",
      title: missingCompanies.length ? `${missingCompanies.length} displayed locations lack Company names` : "Company data checked",
      detail: companyMode ? (missingCompanies.length ? "Add Company values in the bulk data editor or use the City-only view." : "Every displayed callout includes Company data.") : "Company rows are not requested by the active label view.",
    },
    {
      id: "label-collisions",
      status: collisionIssues.length ? "warning" : "pass",
      title: collisionIssues.length ? `${collisionIssues.length} label collisions remain` : "No label collisions detected",
      detail: collisionIssues.length ? "Run Arrange labels or move the flagged callouts manually." : "Callout text boxes do not overlap.",
    },
    {
      id: "canvas-bounds",
      status: boundaryIssues.length ? "warning" : "pass",
      title: boundaryIssues.length ? `${boundaryIssues.length} callouts extend outside the safe canvas` : "All callouts are inside the safe canvas",
      detail: boundaryIssues.length ? "Move the flagged callouts inward before exporting." : "No callout clipping was detected.",
    },
    {
      id: "leader-crossings",
      status: crossings.length ? "warning" : "pass",
      title: crossings.length ? `${crossings.length} leader-line crossings detected` : "No leader-line crossings detected",
      detail: crossings.length ? "Crossings can be acceptable in dense national views, but should be reviewed at export size." : "Leader routing is clear.",
    },
    {
      id: "fonts",
      status: unavailableFonts.length ? "warning" : "pass",
      title: unavailableFonts.length ? `${unavailableFonts.length} label fonts may substitute` : "Label fonts available",
      detail: unavailableFonts.length ? unavailableFonts.join(", ") : "The active label fonts are available in the running app.",
    },
    {
      id: "powerpoint-editability",
      status: "pass",
      title: "Editable PowerPoint structure enabled",
      detail: "States, boundaries, pins, leader lines, and label rows export as separate editable objects.",
    },
  ];
  return {
    checks,
    errors: checks.filter((check) => check.status === "error").length,
    warnings: checks.filter((check) => check.status === "warning").length,
  };
}

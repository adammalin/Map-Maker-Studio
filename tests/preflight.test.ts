import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { buildExportPreflight } from "../src/lib/preflight";

test("export preflight reports missing Company data only when the active label view requests it", () => {
  const project = createDefaultProject();
  project.map.locationLabelMode = "city";
  const cityReport = buildExportPreflight(project);
  assert.equal(cityReport.checks.find((check) => check.id === "company-data")?.status, "pass");

  project.map.locationLabelMode = "city-company";
  const companyReport = buildExportPreflight(project);
  assert.equal(companyReport.checks.find((check) => check.id === "company-data")?.status, "warning");
});

test("export preflight blocks silent empty-map exports with an explicit error", () => {
  const project = createDefaultProject();
  project.layers.forEach((layer) => { layer.visible = false; });
  const report = buildExportPreflight(project);

  assert.ok(report.errors >= 1);
  assert.equal(report.checks.find((check) => check.id === "visible-locations")?.status, "error");
});

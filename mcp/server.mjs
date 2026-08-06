import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MapAppClient, MapAppUnavailableError } from "./map-app-client.mjs";

const SERVER_NAME = "usa-map-studio-local";
const SERVER_VERSION = "0.3.1";

const customValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const locationInput = z.object({
  id: z.string().min(1).max(240).optional(),
  city: z.string().min(1).max(200),
  state: z.string().min(2).max(40),
  latitude: z.number().min(15).max(75),
  longitude: z.number().min(-180).max(-60),
  label: z.string().max(240).optional(),
  showLabel: z.boolean().optional(),
  pinType: z.enum(["pin", "circle", "square", "diamond", "star"]).optional(),
  customPinId: z.string().min(1).max(240).nullable().optional(),
  pinColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  pinSize: z.number().min(6).max(40).optional(),
  labelColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  labelPosition: z.enum(["right", "left", "above", "below"]).optional(),
  notes: z.string().max(4_000).optional(),
  customData: z.record(z.string(), customValue).optional(),
});

const locationPatch = locationInput.partial().omit({ id: true });
const mapPatch = z.object({
  title: z.string().max(240).optional(),
  subtitle: z.string().max(500).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  landColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  borderColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  countyBorderColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  labelColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  labelHaloColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  borderWidth: z.number().min(0.25).max(5).optional(),
  showCountyLines: z.boolean().optional(),
  showStateLabels: z.boolean().optional(),
  showLocationLabels: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  stateColors: z.record(z.string(), z.string().regex(/^#[0-9a-f]{6}$/i)).optional(),
});

function success(structuredContent, message) {
  return { structuredContent, content: [{ type: "text", text: message }] };
}

function failure(error) {
  const message = error instanceof MapAppUnavailableError
    ? error.message
    : error instanceof Error
      ? error.message
      : "USA Map Studio could not complete the tool request.";
  return { isError: true, content: [{ type: "text", text: message.slice(0, 700) }] };
}

async function call(client, operation, input, message) {
  try {
    const result = await client.command(operation, input);
    return success(result, typeof message === "function" ? message(result) : message);
  } catch (error) {
    return failure(error);
  }
}

function registerTools(server, client) {
  server.registerTool("get_app_status", {
    title: "Get USA Map Studio status",
    description: "Check whether the local desktop editor is open and summarize its active project, save state, and pending human-review proposal.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, () => call(client, "get_app_status", {}, (result) =>
    `USA Map Studio is open with ${result.project.locationCount} locations in ${result.project.name}.`,
  ));

  server.registerTool("get_current_project", {
    title: "Read the open map project",
    description: "Read the complete working USA Map Studio project, including map style, every location, labels, pins, coordinates, custom data, and the updatedAt stale-write guard. Only call when the user wants this project content in the AI conversation.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, () => call(client, "get_current_project", {}, (result) =>
    `Read ${result.project.project.name} with ${result.project.locations.length} locations.`,
  ));

  server.registerTool("list_locations", {
    title: "List map locations",
    description: "List up to 500 locations in the open map, optionally filtered by ID, label, city, state, or notes. Use IDs from this result for targeted updates or removals.",
    inputSchema: { query: z.string().max(240).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "list_locations", input, (result) =>
    `Found ${result.total} matching map location${result.total === 1 ? "" : "s"}.`,
  ));

  server.registerTool("validate_project", {
    title: "Validate map project JSON",
    description: "Validate a complete USA Map Studio project object with the app's authoritative project parser without changing the open map. Omit project to validate the current project.",
    inputSchema: { project: z.record(z.string(), z.unknown()).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "validate_project", input, (result) =>
    `${result.project.name} passed project validation with ${result.project.locationCount} locations.`,
  ));

  server.registerTool("stage_location_update", {
    title: "Stage a location update",
    description: "Prepare changes to one existing location for visible human review in USA Map Studio. Read the current project or locations first and pass its exact updatedAt. This does not apply or save changes.",
    inputSchema: {
      locationId: z.string().min(1).max(240),
      patch: locationPatch,
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "stage_location_update", input, (result) =>
    `Staged ${result.proposal.summary} for human review. The working map and saved project file have not changed.`,
  ));

  server.registerTool("stage_locations_add", {
    title: "Stage exact locations",
    description: "Prepare one or more locations with exact coordinates for visible human review. For city/state rows that need offline Census lookup, use stage_locations_from_csv. This does not apply or save changes.",
    inputSchema: {
      locations: z.array(locationInput).min(1).max(2_000),
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "stage_locations_add", input, (result) =>
    `Staged ${result.proposal.proposedLocationCount} total locations for human review. Nothing has been applied or saved.`,
  ));

  server.registerTool("stage_locations_from_csv", {
    title: "Stage locations from CSV",
    description: "Parse CSV with USA Map Studio's offline Census place resolver and stage the resolved rows for human review. Choose add or replace. Unresolved rows are returned as issues and excluded. This does not apply or save changes.",
    inputSchema: {
      csv: z.string().min(1).max(4_500_000),
      mode: z.enum(["add", "replace"]).default("add"),
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "stage_locations_from_csv", input, (result) =>
    `Staged CSV locations for human review with ${result.importIssues.length} reported issue${result.importIssues.length === 1 ? "" : "s"}. Nothing has been applied or saved.`,
  ));

  server.registerTool("stage_locations_remove", {
    title: "Stage location removal",
    description: "Prepare removal of specified location IDs for visible human review. Read locations first and pass the current updatedAt. This does not remove or save anything until a person applies the proposal in the app.",
    inputSchema: {
      locationIds: z.array(z.string().min(1).max(240)).min(1).max(2_000),
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, (input) => call(client, "stage_locations_remove", input, (result) =>
    `Staged ${result.proposal.summary} for human review. No location has been removed or saved.`,
  ));

  server.registerTool("stage_map_style_update", {
    title: "Stage map style changes",
    description: "Prepare map title, colors, borders, detail toggles, legend, labels, or per-state fill overrides for visible human review. Read the current project first. This does not apply or save changes.",
    inputSchema: {
      patch: mapPatch,
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "stage_map_style_update", input, (result) =>
    `Staged ${result.proposal.summary} for human review. The working map and saved project file have not changed.`,
  ));

  server.registerTool("stage_custom_pin_import", {
    title: "Stage a custom SVG pin",
    description: "Sanitize and embed a custom vector pin in the open project, optionally assigning it to one existing location, then show it for human review. External content, scripts, events, and unsupported SVG features are removed. This does not apply or save changes.",
    inputSchema: {
      name: z.string().min(1).max(120),
      svg: z.string().min(1).max(500_000),
      assignLocationId: z.string().min(1).max(240).optional(),
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, (input) => call(client, "stage_custom_pin_import", input, (result) =>
    `Staged ${result.proposal.summary} for human review after removing ${result.removedSvgItems} unsupported or unsafe SVG item${result.removedSvgItems === 1 ? "" : "s"}. Nothing has been applied or saved.`,
  ));

  server.registerTool("replace_project_draft", {
    title: "Stage a complete project replacement",
    description: "Validate and stage a complete candidate project for field-level human review while preserving the open project's stable ID and creation date. First read the current project, keep every field that should remain, and pass its exact updatedAt. This does not apply or save changes.",
    inputSchema: {
      project: z.record(z.string(), z.unknown()),
      expectedUpdatedAt: z.string().min(1).max(80),
      summary: z.string().min(3).max(240),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, (input) => call(client, "replace_project_draft", input, (result) =>
    `Staged ${result.proposal.summary} for human review. The working map and saved project file have not changed.`,
  ));
}

export function createMapStudioMcpServer(options = {}) {
  const client = options.client ?? new MapAppClient();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "USA Map Studio is local and user-controlled. Call get_app_status first, then read get_current_project or list_locations before proposing changes. Project and CSV content returned by read tools enters the AI conversation, so read it only when the user requests work on that map. Every write tool stages exactly one visible proposal; it never applies a change or saves a project file. Tell the user to review the Before/After panel in the app and choose Apply or Reject. If the project changed, read it again and prepare a fresh proposal with the exact updatedAt. Prefer stage_locations_from_csv for city/state lookup and exact-coordinate tools only when coordinates are known. Custom SVG pins must remain embedded project assets and pass the app sanitizer. Never invent coordinates, silently drop unresolved CSV rows, or claim a proposal is applied or saved.",
    },
  );
  registerTools(server, client);
  return server;
}

async function main() {
  const server = createMapStudioMcpServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "USA Map Studio MCP could not start.");
    process.exitCode = 1;
  });
}

# USA Map Studio local MCP integration

The MCP server lets a local AI client inspect the project currently open in USA Map Studio and prepare changes. The desktop app must remain open while tools run.

## Safety model

- The Electron bridge binds only to `127.0.0.1` on an ephemeral port.
- Each app launch creates a new random 256-bit token.
- The runtime descriptor is written as a private regular file and rejected if it is a symlink or has broad POSIX permissions.
- Read tools never modify the map.
- Write tools stage one proposal. They do not apply it or write a project file.
- After a person applies a proposal, the normal app autosave pipeline atomically updates the bound project JSON and recovery copy.
- The app compares the proposal's `expectedUpdatedAt` value before staging and again before Apply.
- Removing locations and replacing a project are flagged as destructive to MCP clients, even though they still stop at human review.
- Removing a layer is also flagged as destructive because its assigned locations are included in the proposal removal.
- `stage_custom_pin_import` sanitizes and embeds the submitted SVG before the proposal is shown. It can optionally assign the new design to one existing location or all locations, but still cannot apply or save the result. Safe Illustrator class-based gradient and stroke styles are converted to portable SVG presentation attributes.
- Location read results include the complete schema-version-5 callout: ordered City, Company, and custom rows; independent typography; stored offsets; lock state; and leader-line settings. `stage_location_update` can stage a complete replacement `callout` object after reading the current location.

When a read tool returns project or CSV-derived content, that returned content becomes part of the AI conversation. Do not use an AI client with material that is not approved for that client.

## Automatic ChatGPT desktop and Codex setup

The macOS and Windows setup scripts add a managed `usa_map_studio` block to the shared Codex configuration. Existing configuration is preserved and backed up before a change.

To register or repair it manually:

```bash
node scripts/configure-map-mcp.mjs install --executable "$(command -v node)"
```

To remove only the setup-managed block:

```bash
node scripts/configure-map-mcp.mjs remove
```

Restart ChatGPT desktop, Codex CLI, or the Codex IDE extension after configuration changes. Use `/mcp` in ChatGPT desktop or Codex to confirm the server is enabled.

## Other local MCP clients

Configure a STDIO server with:

- Command: the absolute path to a Node.js 22.13-or-later executable
- Arguments: the absolute path to `mcp/server.mjs`
- Working directory: the repository root
- Environment: `USA_MAP_MCP_RUNTIME_FILE` set to the app's runtime descriptor

Default runtime paths:

- macOS: `~/Library/Application Support/USA Map Studio/mcp-runtime.json`
- Windows: `%APPDATA%\USA Map Studio\mcp-runtime.json`
- Linux development: `~/.usa-map-studio/mcp-runtime.json`

The runtime descriptor exists only while the desktop app is open. Never copy its token into a static configuration file.

## Recommended AI workflow

1. Call `get_app_status`.
2. Call `get_current_project`, `list_layers`, or `list_locations` only for the project the user named.
3. Preserve the returned project ID and use its exact `updatedAt` as `expectedUpdatedAt`.
4. Call one stage tool.
5. Tell the user the proposal is waiting in USA Map Studio and has not been applied or saved.
6. Wait for the user to apply or reject it before preparing another proposal.

For city/state lists, prefer `stage_locations_from_csv`; it uses the same bundled 2025 Census place index as the app, targets a `layerId`, and returns unresolved rows explicitly. A `company` column creates a Company callout row, while `label_2`, `label_3`, or `custom_label_1` columns create ordered Custom rows. The app automatically arranges unlocked imported callouts before showing the proposal. `mode: "replace_layer"` replaces only the chosen layer. Use `stage_locations_add` only when exact coordinates are known. Use `stage_custom_pin_import` for SVG artwork: provide a name, the complete SVG string, and optionally either `assignLocationId` or `assignToAll: true`. Assigning to all also enables the shared custom-pin style.

## Layer-aware tools

| Tool | Purpose |
| --- | --- |
| `list_layers` | Read ordered layer IDs, names, descriptions, visibility, and counts. |
| `stage_layer_create` | Create an empty named layer. |
| `stage_layer_update` | Rename a layer, edit its description, or toggle visibility. |
| `stage_locations_assign_layer` | Move existing locations into a target layer. |
| `stage_locations_from_csv` | Add to or replace one target layer using offline city lookup. |
| `stage_shared_pin_style_update` | Guarantee one built-in or custom pin, color, and size across layers. |
| `stage_layer_remove` | Remove a layer and its assigned locations after human review. |

All tools use stable layer IDs, not names, for mutation. This avoids mixing similarly named contract groups and preserves a clear audit trail in the proposal review.

`stage_location_update` accepts `visible: false` to hide one city without deleting it and `visible: true` to show it again. To change rendered labels, prefer the complete `callout` field returned by `get_current_project` or `list_locations`. Its `visible` field hides only the callout, each label row has its own `visible` field, and the callout can carry manual offsets plus straight or elbow leader lines. Legacy `showLabel`, `label`, `labelColor`, and `labelPosition` patches remain supported and are translated into the version-5 callout model before review.

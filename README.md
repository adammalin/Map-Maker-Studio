# USA Map Studio

USA Map Studio is a local-first Electron desktop editor for building accurate maps of the United States from CSV location lists. It renders the 50 states and District of Columbia from bundled 2025 U.S. Census geography, resolves named places against an offline 32,350-place index, and exports SVG, PNG, PowerPoint, or a complete project JSON file.

## What the app can do

- Import CSV rows using `city` and `state`, exact `latitude` and `longitude`, or both.
- Resolve city/state-only rows locally with no geocoding service or API key.
- Edit pin type, pin color, size, label, label visibility, label placement, notes, and coordinates.
- Import reusable custom SVG pin artwork. Sanitized vector markup is embedded in the project JSON so the design travels with the file; SVGs using `currentColor` follow the location's pin color.
- Choose colors from named ORNL Primary, Secondary, and Accent swatches in every color field, or keep using the native picker and exact hex values. The swatches are a draft aid and do not replace communications review.
- Switch between distinct workspaces: Map editor maximizes the canvas, Locations opens the searchable location manager, Map style focuses the global/state appearance inspector, and Export shows output choices.
- Style the map canvas, default state fill, individual state colors, state lines, optional county lines, state abbreviations, label halo, and legend.
- Pan and zoom the live map, select a state for a fill override, and drag pins to refine coordinates.
- Save and reopen a versioned `.usmap.json` project containing the complete map configuration and every location.
- Export a scalable SVG, a 2400 x 1440 PNG, or a one-slide 16:9 PowerPoint whose states, boundary layers, text, standard pins, and legend are separate editable objects. Imported custom SVG pins remain separate movable vector objects.
- Let ChatGPT desktop, Codex, or another local MCP client inspect the open project and stage visible map-change proposals for human review.

The interface deliberately follows the clear hierarchy and square-edged desktop design language of OrgChart Studio while remaining a separate product.

Current application version: **0.3.0**.

## Documentation

- [USA Map Studio User Guide (PDF)](docs/USA-Map-Studio-User-Guide.pdf) - installation commands, workspace modes, CSV import, custom SVG pins, ORNL color swatches, exports, and local MCP control.
- [Project file format](docs/PROJECT-FORMAT.md) - schema version 2, embedded custom pins, validation, and version 1 migration.
- [Local MCP integration](docs/MCP.md) - security model, setup, client configuration, and the review-first workflow.
- [Editable PowerPoint example](examples/usa-map-studio-editable-export.pptx) - a generated sample for checking the PowerPoint Selection Pane and direct object editing.

The committed PDF intentionally lives under `docs/` so the repository, setup scripts, and packaged desktop app all resolve the same guide.

## macOS setup - no signed installer

Requirements: macOS 12 or later and internet access during first setup. The script uses an existing compatible Node.js runtime or downloads a private pinned copy into `.runtime`.

```zsh
git clone https://github.com/adammalin/Map-Maker-Studio.git "$HOME/Map-Maker-Studio"
cd "$HOME/Map-Maker-Studio"
/bin/zsh scripts/setup-macos.zsh
```

For later launches, double-click `Start-USA-Map-Studio.command` or run:

```zsh
/bin/zsh scripts/start-macos.zsh
```

## Windows setup - no signed installer

Open PowerShell as a normal user. Do not use Run as administrator.

```powershell
git clone https://github.com/adammalin/Map-Maker-Studio.git "$env:USERPROFILE\Map-Maker-Studio"
Set-Location "$env:USERPROFILE\Map-Maker-Studio"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-windows.ps1"
```

For later launches, double-click `Start-USA-Map-Studio.cmd` or run `scripts\start-windows.ps1` from PowerShell.

The setup scripts install exact dependency versions, build the renderer, and run a hidden Electron smoke test. They do not create DMG, PKG, MSI, EXE, or Squirrel installers and do not disable operating-system security controls.

By default, setup also registers the `usa_map_studio` STDIO MCP server in the shared ChatGPT desktop/Codex configuration at `~/.codex/config.toml` (or its Windows equivalent). Set `USA_MAP_SETUP_MCP=skip` before running setup to skip that optional step.

## Local AI control with MCP

Keep USA Map Studio open while using its tools. The integration uses a loopback-only HTTP bridge, an ephemeral port, and a random session token written to a private runtime file. CSV and project data remain on the computer unless an MCP read tool returns them to the AI conversation.

The MCP server exposes read tools for app status, the complete current project, locations, and validation. Change tools cover exact locations, offline CSV import, custom SVG pin import, removals, location fields, map style, and complete project replacement. Every change tool creates one visible proposal in the app:

1. Ask the AI to read the current project or location list.
2. Ask it to prepare a change.
3. In USA Map Studio, open **Local AI control** or the proposal banner.
4. Compare Before and After, then choose **Apply to working map** or **Reject proposal**.
5. If applied, review the canvas and choose **Save project** when ready.

Applying a proposal changes only the working map and preserves Undo. It does not silently overwrite a `.usmap.json` file. If the map changes after a proposal is prepared, the app marks it stale and requires a fresh proposal.

After setup, restart ChatGPT desktop or Codex and use `/mcp` to confirm `usa_map_studio`. Manual commands are also available:

```bash
npm run mcp:install
npm run mcp:remove
```

Other local MCP clients can launch `mcp/server.mjs` with Node.js from this project directory and set `USA_MAP_MCP_RUNTIME_FILE` to the runtime file shown by the app. ChatGPT web cannot reach this private desktop bridge directly; a future hosted plugin would be a separate deployment and security boundary.

## CSV format

The smallest supported file is:

```csv
city,state
Oak Ridge,TN
Seattle,WA
```

Supported headers are flexible and case-insensitive. The canonical columns are:

| Column | Required | Purpose |
| --- | --- | --- |
| `city` | Yes | Place name. |
| `state` | Yes | Two-letter abbreviation or full state name. |
| `latitude`, `longitude` | No | Exact coordinates. If both are blank, the app resolves the place offline. |
| `label` | No | Visible label; defaults to `City, ST`. |
| `show_label` | No | `true`/`false`, `yes`/`no`, or `1`/`0`. |
| `pin_type` | No | `pin`, `circle`, `square`, `diamond`, or `star`. |
| `pin_color` | No | Six-digit hex color such as `#00662c`. |
| `pin_size` | No | Size from 6 through 40. |
| `label_color` | No | Six-digit label color. |
| `label_position` | No | `right`, `left`, `above`, or `below`. |
| `notes` | No | Editor-only context stored in the project. |

Unknown CSV columns are retained under each location's `customData` object in project JSON. Start with [examples/sample-cities.csv](examples/sample-cities.csv) or download a template from the app.

## Project files

Project files use the `.usmap.json` suffix and include a schema identifier and version. The format is documented in [docs/PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md). Opening a project validates its schema, colors, coordinates, and required fields before replacing the current canvas.

Imported pin designs live in the project-level `customPins` library as sanitized SVG strings, and locations select them by ID. There are no source-file path dependencies, so a saved project can be moved to another supported computer without losing its pin artwork. Schema version 1 files remain supported and migrate in memory to version 2 when opened.

## Development and verification

```bash
npm install
npm run build
npm test
npm run desktop:smoke
```

Run all checks together with `npm run test:all`. Create unsigned application folders - not installers - with `npm run package:mac` or `npm run package:windows`.

Run `npm run sample:pptx` to regenerate the committed editable PowerPoint example from the default project.

To regenerate the committed PDF guide, install the small documentation dependency with `python3 -m pip install -r requirements-docs.txt`, then run `npm run guide`.

## Data sources and privacy

State and county boundaries come from the U.S. Census Bureau 2025 Cartographic Boundary Files at 1:5,000,000 scale. Place coordinates come from the 2025 National Places Gazetteer File. The transformed data are bundled in `src/data`, so normal editing, import, lookup, rendering, and export are local operations.

Project and CSV content are not sent to a service by the application. PowerPoint, SVG, PNG, and JSON exports are written only where the user chooses.

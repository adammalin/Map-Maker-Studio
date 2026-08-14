# USA Map Studio

USA Map Studio is a local-first Electron desktop editor for building accurate maps of the United States from CSV location lists. It renders the 50 states and District of Columbia from bundled 2025 U.S. Census geography, resolves named places against an offline 32,350-place index, and exports SVG, PNG, PowerPoint, or a complete project JSON file.

## What the app can do

- Import CSV rows using `city` and `state`, exact `latitude` and `longitude`, or both. A `company` column and numbered `label_2`, `label_3`, and similar columns become additional callout rows.
- Resolve city/state-only rows locally with no geocoding service or API key.
- Create, rename, reorder, hide, show, and delete named location layers. Every location belongs to exactly one layer, and CSV imports target a specific layer without disturbing the others.
- Hide or show any individual city without deleting it. Hidden locations remain in the list and project JSON but are omitted from the map and every export.
- Choose **All pins** or **This pin** directly in the location inspector. All pins is the default and applies type, custom SVG, color, and size changes everywhere; This pin preserves the current appearance and edits only the selected location.
- Add City, Company, and custom label rows to each location. Every exported row is one editable line with independent text, visibility, font family, exact numeric font size, weight, and color controls.
- Drag each multi-row callout as one unit, lock manual placements, choose automatic/straight/elbow/no leader lines, and run **Arrange labels** to resolve collisions. Dense layouts can use automatically selected edge rails, and unresolved or out-of-bounds callouts are flagged for review.
- Import reusable custom SVG pin artwork for all pins or only the selected pin, according to the active editing scope. Sanitized vector markup is embedded in the project JSON so the design travels with the file; safe Illustrator gradient and stroke styles are retained, and SVGs using `currentColor` follow the effective pin color.
- Choose colors from named ORNL Primary, Secondary, and Accent swatches in every color field, or keep using the native picker and exact hex values. The swatches are a draft aid and do not replace communications review.
- Switch between distinct workspaces: Map editor maximizes the canvas, Locations opens the searchable location manager, Layers controls organization and visibility, Map style focuses the global/state appearance inspector, and Export shows output choices.
- Style the map canvas, default state fill, individual state colors, state lines, optional county lines, state abbreviations, label halo, and legend.
- Navigate the live map with Illustrator-style controls: hold Space and drag from anywhere to pan, scroll or use the dedicated buttons to zoom from 40% through 400%, use `0` for Fit and `1` for 100%, and recenter with the interactive navigator minimap.
- Use familiar project shortcuts for Save (`Cmd/Ctrl+S`), Open (`Cmd/Ctrl+O`), New (`Cmd/Ctrl+N`), Undo/Redo, location search (`/`), and the in-app keyboard reference (`?`). Text fields keep their normal editing behavior.
- Select a state for a fill override, drag pins without Space held to refine coordinates, or drag a callout to place its labels manually.
- Save and reopen a versioned `.usmap.json` project containing the complete map configuration, exact zoom/pan export framing, ordered layers, layer/location visibility, shared style, every label row and callout position, and every location.
- Autosave every project-changing action. After a project is opened or saved, the same `.usmap.json` file is updated atomically; until a user-selected path exists, the app maintains an internal JSON recovery file and restores it on launch.
- Export the exact visible composition, including the effective All pins/This pin size, callout positions, leader lines, and current zoom/pan viewport, as a scalable SVG, a 2400 x 1440 PNG, or a one-slide 16:9 PowerPoint. PowerPoint states, boundary layers, every label row, leader lines, standard pins, and legend remain separate editable objects; custom SVG pins remain separate movable vector objects and preserve their source aspect ratio. SVG uses named layer groups, and visible PowerPoint location objects are prefixed with their layer name in the Selection Pane.
- Let ChatGPT desktop, Codex, or another local MCP client inspect the open project and stage visible map-change proposals for human review.

The interface deliberately follows the clear hierarchy and square-edged desktop design language of OrgChart Studio while remaining a separate product.

Current application version: **0.6.0**. The pre-callout baseline is preserved as the [v0.5.1 release](https://github.com/adammalin/Map-Maker-Studio/releases/tag/v0.5.1).

## Documentation

- [USA Map Studio User Guide (PDF)](docs/USA-Map-Studio-User-Guide.pdf) - installation commands, Illustrator-style canvas navigation and shortcuts, workspace modes, CSV import, custom SVG pins, ORNL color swatches, exports, and local MCP control.
- [Project file format](docs/PROJECT-FORMAT.md) - schema version 5 viewport, layers, multi-row label callouts, per-location visibility, shared pin styling, embedded custom pins, validation, and earlier-version migration.
- [Local MCP integration](docs/MCP.md) - security model, setup, client configuration, and the review-first workflow.
- [Editable PowerPoint example](examples/usa-map-studio-editable-export.pptx) - a generated sample for checking the PowerPoint Selection Pane and direct object editing.

The committed PDF intentionally lives under `docs/` so the repository, setup scripts, and packaged desktop app all resolve the same guide.

## macOS setup - no signed installer

Requirements: macOS 12 or later, [Git](https://git-scm.com/downloads), and internet access during first setup. The script uses an existing compatible Node.js runtime or downloads a private pinned copy into `.runtime`.

```zsh
git clone https://github.com/adammalin/Map-Maker-Studio.git "$HOME/Map-Maker-Studio"
cd "$HOME/Map-Maker-Studio"
/bin/zsh scripts/setup-macos.zsh
```

For later launches, double-click `Start-USA-Map-Studio.command` in the cloned folder or paste this command from any directory:

```zsh
/bin/zsh "$HOME/Map-Maker-Studio/Start-USA-Map-Studio.command"
```

## Windows setup - no signed installer

Requirements: Windows 10 or 11, [Git](https://git-scm.com/downloads), and internet access during first setup. Open PowerShell as a normal user; do not use Run as administrator.

```powershell
git clone https://github.com/adammalin/Map-Maker-Studio.git "$env:USERPROFILE\Map-Maker-Studio"
Set-Location "$env:USERPROFILE\Map-Maker-Studio"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-windows.ps1"
```

For later launches, double-click `Start-USA-Map-Studio.cmd` in the cloned folder or paste this command from any directory:

```powershell
& "$env:USERPROFILE\Map-Maker-Studio\Start-USA-Map-Studio.cmd"
```

To update either platform, close USA Map Studio and rerun the same setup command used for installation. A clean `main` checkout safely fast-forwards to the latest public release before rebuilding and testing.

The setup scripts first check `origin/main` and safely fast-forward a clean `main` checkout, then install exact dependency versions, build the renderer, and run a hidden Electron smoke test. This makes rerunning setup an update-and-rebuild workflow instead of rebuilding an old clone. Local changes are never overwritten: update is skipped when the checkout is dirty or on another branch. Set `USA_MAP_SETUP_UPDATE=skip` before setup when deliberately building the source already on disk. The scripts do not create DMG, PKG, MSI, EXE, or Squirrel installers and do not disable operating-system security controls.

By default, setup also registers the `usa_map_studio` STDIO MCP server in the shared ChatGPT desktop/Codex configuration at `~/.codex/config.toml` (or its Windows equivalent). Set `USA_MAP_SETUP_MCP=skip` before running setup to skip that optional step.

## Local AI control with MCP

Keep USA Map Studio open while using its tools. The integration uses a loopback-only HTTP bridge, an ephemeral port, and a random session token written to a private runtime file. CSV and project data remain on the computer unless an MCP read tool returns them to the AI conversation.

The MCP server exposes read tools for app status, the complete current project, layers, locations, and validation. Change tools cover layer creation/rename/visibility/removal, layer assignments, shared pin styling, exact locations, multi-row label callouts, target-layer CSV import, custom SVG pin import, removals, location fields, map style, and complete project replacement. Every change tool creates one visible proposal in the app:

1. Ask the AI to read the current project or location list.
2. Ask it to prepare a change.
3. In USA Map Studio, open **Local AI control** or the proposal banner.
4. Compare Before and After, then choose **Apply to working map** or **Reject proposal**.
5. If applied, review the canvas and watch the autosave status. Use **Save project** only when you need to choose or change the project file path.

Applying a proposal changes the working map and preserves Undo. The normal autosave pipeline then updates the bound `.usmap.json` project file and the internal recovery JSON. If the project does not have a file path yet, only the recovery JSON is updated. If the map changes after a proposal is prepared, the app marks it stale and requires a fresh proposal.

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
| `company` | No | Adds a Company row beneath the City row and stores the company in `customData`. Aliases include `company_name`, `organization`, and `manufacturer`. |
| `label` | No | City label row; defaults to `City, ST`. |
| `label_2`, `label_3`, ... | No | Adds ordered custom label rows to the same callout. `custom_label_1` and similar names are also accepted. |
| `visible` | No | Whether the complete location appears on the map and in exports; defaults to `true`. |
| `show_label` | No | Shows or hides the complete callout using `true`/`false`, `yes`/`no`, or `1`/`0`. |
| `pin_type` | No | `pin`, `circle`, `square`, `diamond`, or `star`. |
| `pin_color` | No | Six-digit hex color such as `#00662c`. |
| `pin_size` | No | Size from 6 through 40. |
| `label_color` | No | Six-digit color used to initialize the City row. |
| `label_position` | No | Legacy initial placement: `right`, `left`, `above`, or `below`. Use the editor for collision arrangement and exact callout placement. |
| `notes` | No | Editor-only context stored in the project. |

Unknown CSV columns are retained under each location's `customData` object in project JSON. Start with [examples/sample-cities.csv](examples/sample-cities.csv) or download a template from the app.

The CSV does not need a layer column. Choose the target layer in the import review dialog, then choose **Add locations** or **Replace target layer**. Replacing affects only that layer.

## Project files

Project files use the `.usmap.json` suffix and include a schema identifier and version. The format is documented in [docs/PROJECT-FORMAT.md](docs/PROJECT-FORMAT.md). Opening a project validates its schema, colors, coordinates, and required fields before replacing the current canvas. Once opened or saved, project-changing actions automatically update that file using an atomic temporary-file replacement. A separate internal recovery JSON is maintained and restored after an interrupted or ordinary relaunch.

Imported pin designs live in the project-level `customPins` library as sanitized SVG strings, and locations or the shared pin style select them by ID. There are no source-file path dependencies, so a saved project can be moved to another supported computer without losing its pin artwork. Schema versions 1 through 4 remain supported and migrate in memory to schema version 5 when opened; a version 4 label becomes the first City row without losing its text, visibility, color, or placement.

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

# USA Map Studio

USA Map Studio is a local-first Electron desktop editor for building accurate maps of the United States from CSV location lists. It renders the 50 states and District of Columbia from bundled 2025 U.S. Census geography, resolves named places against an offline 32,350-place index, and exports SVG, PNG, PowerPoint, or a complete project JSON file.

## What the app can do

- Import CSV rows using `city` and `state`, exact `latitude` and `longitude`, or both.
- Resolve city/state-only rows locally with no geocoding service or API key.
- Edit pin type, pin color, size, label, label visibility, label placement, notes, and coordinates.
- Style the map canvas, default state fill, individual state colors, state lines, optional county lines, state abbreviations, label halo, and legend.
- Pan and zoom the live map, select a state for a fill override, and drag pins to refine coordinates.
- Save and reopen a versioned `.usmap.json` project containing the complete map configuration and every location.
- Export a scalable SVG, a 2400 x 1440 PNG, or a one-slide 16:9 PowerPoint with the map retained as vector artwork.

The interface deliberately follows the clear hierarchy and square-edged desktop design language of OrgChart Studio while remaining a separate product.

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

## Development and verification

```bash
npm install
npm run build
npm test
npm run desktop:smoke
```

Run all checks together with `npm run test:all`. Create unsigned application folders - not installers - with `npm run package:mac` or `npm run package:windows`.

To regenerate the committed PDF guide, install the small documentation dependency with `python3 -m pip install -r requirements-docs.txt`, then run `npm run guide`.

## Data sources and privacy

State and county boundaries come from the U.S. Census Bureau 2025 Cartographic Boundary Files at 1:5,000,000 scale. Place coordinates come from the 2025 National Places Gazetteer File. The transformed data are bundled in `src/data`, so normal editing, import, lookup, rendering, and export are local operations.

Project and CSV content are not sent to a service by the application. PowerPoint, SVG, PNG, and JSON exports are written only where the user chooses.

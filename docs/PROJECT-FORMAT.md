# USA Map Studio project format

USA Map Studio project files are UTF-8 JSON documents normally saved with the `.usmap.json` suffix.

## Envelope

```json
{
  "schema": "usa-map-studio/project",
  "schemaVersion": 5,
  "project": {},
  "map": {},
  "layers": [],
  "sharedPinStyle": {},
  "customPins": [],
  "locations": []
}
```

`schema` identifies the file type. `schemaVersion` allows later app versions to migrate or reject unsupported files explicitly.

## Project metadata

`project` includes a stable `id`, the user-facing `name`, and ISO 8601 `createdAt` and `updatedAt` timestamps.

## Map settings

`map` contains:

- `title` and `subtitle`
- `backgroundColor`, `landColor`, `borderColor`, and `countyBorderColor`
- `labelColor` and `labelHaloColor`
- `borderWidth`
- `showCountyLines`, `showStateLabels`, `showLocationLabels`, and `showLegend`
- `stateColors`, keyed by two-character state FIPS code for individual state overrides

Colors are stored as six-digit hex values.

## Layers

`layers` is an ordered, non-empty array. Each layer contains:

- stable `id`
- user-facing `name`
- optional `description`
- `visible`, which controls the canvas plus SVG, PNG, and PowerPoint export
- ISO 8601 `createdAt`

Array order controls pin stacking. Every location references exactly one layer by `layerId`; dangling layer references are rejected. SVG exports retain one named `<g>` for each visible layer. PowerPoint has no Illustrator-style layer model, so each visible location object's Selection Pane name is prefixed with its layer number and name. Hidden layers remain in project JSON but are omitted from rendered exports.

## Shared pin style

`sharedPinStyle` contains `enabled`, `pinType`, `customPinId`, `pinColor`, and `pinSize`. When `enabled` is `true`, the inspector is in **All pins** mode and this project-wide style overrides the corresponding saved fields on every location at render and export time. Each shared-style edit is also mirrored into every location immediately so autosaved JSON and export consumers carry the same visible type, custom SVG, color, and size. This is the default for new projects and guarantees that separate data layers can look identical. When the user switches to **This pin**, the app first copies the current shared appearance into every location, then sets `enabled` to `false`; later type, custom SVG, color, and size edits affect only the selected location without changing the other pins.

## Custom SVG pin library

`customPins` is a project-level array. Each imported design contains a stable `id`, user-facing `name`, sanitized `svg` string, normalized `viewBox`, and `createdAt` timestamp. The SVG content is embedded directly in JSON; the project never depends on the original SVG file path.

On import and project load, the app permits a bounded set of static SVG vector elements and attributes. It converts safe Illustrator class-based fill, gradient, and stroke declarations into portable presentation attributes, while removing scripts, event handlers, unsafe or unsupported styles, embedded raster images, external references, XML entities, and unsupported content. Files larger than 500 KB or with excessive element count/depth are rejected. `currentColor` is preserved so one design can follow the effective pin color.

## Locations

Each location contains:

- stable `id`
- `layerId`, referencing one object in `layers`
- `visible`, controlling the complete pin and callout on the canvas and in every export
- `city` and two-letter `state`
- numeric `latitude` and `longitude`
- legacy-compatible `label` and `showLabel` fields used by older project and MCP clients
- `pinType`, `pinColor`, and `pinSize`
- `customPinId`, either `null` for a built-in pin or the ID of a design in `customPins`
- `labelColor` and `labelPosition`
- `callout`, containing the current multi-row label system
- `notes`
- `customData` for CSV columns not used by the standard schema

Supported pin types are `pin`, `circle`, `square`, `diamond`, and `star`. The older `label`, `showLabel`, `labelColor`, and `labelPosition` fields remain in version 5 files for compatibility, but `callout` is the authoritative rendered label model. `visible` remains independent of `callout.visible`: hiding a location removes its pin and complete callout from rendered output while preserving all data; hiding only the callout leaves the pin visible.

## Multi-row label callouts

Every location's `callout` stores:

- `visible`
- ordered `labels`
- `offsetX` and `offsetY` in the 1200 x 720 map coordinate system
- horizontal `anchor`: `start`, `middle`, or `end`
- `placementMode`: `auto` or `manual`
- `locked`, which prevents **Arrange labels** from moving the callout
- `leaderLine`: `auto`, `none`, `straight`, or `elbow`
- `leaderColor` and `leaderWidth`

Each object in `labels` stores a stable `id`, semantic `role` (`city`, `company`, or `custom`), `text`, `visible`, `fontFamily`, `fontSize`, `fontWeight`, and six-digit hex `color`. Supported weights are 400, 500, 600, 700, and 800. Font sizes are 6 through 32 map pixels. A callout can contain up to 20 label rows.

```json
{
  "visible": true,
  "labels": [
    {
      "id": "label-example-city",
      "role": "city",
      "text": "Oak Ridge, TN",
      "visible": true,
      "fontFamily": "Aptos",
      "fontSize": 11.5,
      "fontWeight": 800,
      "color": "#373a36"
    },
    {
      "id": "label-example-company",
      "role": "company",
      "text": "Example Manufacturing",
      "visible": true,
      "fontFamily": "Arial",
      "fontSize": 9.5,
      "fontWeight": 600,
      "color": "#00454d"
    }
  ],
  "offsetX": 24,
  "offsetY": -18,
  "anchor": "start",
  "placementMode": "manual",
  "locked": true,
  "leaderLine": "elbow",
  "leaderColor": "#526966",
  "leaderWidth": 1
}
```

Dragging a callout writes its exact offsets, sets `placementMode` to `manual`, and locks it. Automatic arrangement moves only unlocked callouts, tests positions around each pin, and can use left or right edge rails for dense areas. Remaining label-to-label collisions and callouts that enter the title, legend, or canvas edge are reported as layout issues. The resolved positions are stored in JSON and reused directly by SVG, PNG, and PowerPoint export rather than being recomputed during export.

## Autosave and recovery

The JSON schema is the same for manual saves and autosaves. In the desktop app:

- Opening or saving a project binds the editor to that `.usmap.json` path.
- Every project-changing action is serialized after a short debounce and atomically replaces both the bound project file and the internal recovery JSON.
- A new unsaved project writes only the internal recovery JSON until the user chooses **Save project**.
- On launch, the latest valid recovery JSON and its bound path are restored automatically.
- New project clears the previous external-file binding before its first autosave, preventing a new map from overwriting the prior project file.

Atomic replacement writes a private temporary file beside the destination and renames it only after the complete JSON is present, reducing the chance of a partial file after interruption.

## Compatibility

Version 0.6.0 writes schema version 5 and reads schema versions 1 through 4. Canvas zoom and pan are editor-view state rather than project data, so they do not alter rendered coordinates or the portable JSON schema; rendered exports still reproduce the active viewport. Version 1 and 2 projects migrate with one visible `Layer 1 - Locations`; every existing location is assigned to it. Version 1 also receives an empty `customPins` library and `null` custom-pin references. Locations from schema versions 1 through 3 default to `visible: true` when that field is absent. A version 4 location's single label becomes its first City callout row, preserving label text, visibility, color, and right/left/above/below placement. The app rejects unrelated JSON, unsupported schema versions, missing core objects, invalid coordinates, duplicate layer, custom-pin, or per-location label IDs, excessive label rows, dangling layer or custom-pin references, and malformed required fields instead of silently dropping data.

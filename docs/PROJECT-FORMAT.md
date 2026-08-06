# USA Map Studio project format

USA Map Studio project files are UTF-8 JSON documents normally saved with the `.usmap.json` suffix.

## Envelope

```json
{
  "schema": "usa-map-studio/project",
  "schemaVersion": 2,
  "project": {},
  "map": {},
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

## Custom SVG pin library

`customPins` is a project-level array. Each imported design contains a stable `id`, user-facing `name`, sanitized `svg` string, normalized `viewBox`, and `createdAt` timestamp. The SVG content is embedded directly in JSON; the project never depends on the original SVG file path.

On import and project load, the app permits a bounded set of static SVG vector elements and attributes. It removes scripts, event handlers, styles, embedded raster images, external references, XML entities, and unsupported content before rendering. Files larger than 500 KB or with excessive element count/depth are rejected. `currentColor` is preserved so one design can follow each location's `pinColor`.

## Locations

Each location contains:

- stable `id`
- `city` and two-letter `state`
- numeric `latitude` and `longitude`
- `label` and `showLabel`
- `pinType`, `pinColor`, and `pinSize`
- `customPinId`, either `null` for a built-in pin or the ID of a design in `customPins`
- `labelColor` and `labelPosition`
- `notes`
- `customData` for CSV columns not used by the standard schema

Supported pin types are `pin`, `circle`, `square`, `diamond`, and `star`. Supported label positions are `right`, `left`, `above`, and `below`.

## Compatibility

Version 0.2.1 writes schema version 2 and also reads schema version 1. A version 1 project migrates in memory with an empty `customPins` library and `null` custom-pin references; it is not rewritten until the user saves. The app rejects unrelated JSON, unsupported schema versions, missing core objects, invalid coordinates, duplicate custom-pin IDs, dangling custom-pin references, and malformed required fields instead of silently dropping data.

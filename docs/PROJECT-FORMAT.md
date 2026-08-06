# USA Map Studio project format

USA Map Studio project files are UTF-8 JSON documents normally saved with the `.usmap.json` suffix.

## Envelope

```json
{
  "schema": "usa-map-studio/project",
  "schemaVersion": 1,
  "project": {},
  "map": {},
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

## Locations

Each location contains:

- stable `id`
- `city` and two-letter `state`
- numeric `latitude` and `longitude`
- `label` and `showLabel`
- `pinType`, `pinColor`, and `pinSize`
- `labelColor` and `labelPosition`
- `notes`
- `customData` for CSV columns not used by the standard schema

Supported pin types are `pin`, `circle`, `square`, `diamond`, and `star`. Supported label positions are `right`, `left`, `above`, and `below`.

## Compatibility

Version 0.1.0 reads schema version 1. It rejects unrelated JSON, unsupported schema versions, missing core objects, invalid coordinates, and malformed required fields instead of silently dropping data.

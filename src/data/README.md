# Bundled geography data

USA Map Studio bundles local geography data so map rendering and city lookup do not require a web service.

- `us-states-2025.topo.json` and `us-counties-2025.topo.json` were converted from the U.S. Census Bureau 2025 Cartographic Boundary Files at 1:5,000,000 scale. The app retains the 50 states and District of Columbia.
- `us-places-2025.json` was generated from the U.S. Census Bureau 2025 National Places Gazetteer File with `scripts/build-city-index.mjs`. It contains representative latitude and longitude points for 32,350 named places in the 50 states and District of Columbia.

Source pages:

- https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html
- https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html

U.S. Census Bureau data are public-domain works of the United States government. Review the Census source pages for current technical notes.

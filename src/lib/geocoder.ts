import placesData from "../data/us-places-2025.json";
import { normalizeState } from "../data/state-metadata";
import type { PlaceRecord } from "../types";

const places = placesData as PlaceRecord[];

function normalizePlaceName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const placeIndex = new Map<string, PlaceRecord>();
for (const place of places) {
  const state = normalizeState(place.state);
  const keys = [place.city, place.fullName].map((name) => `${state}|${normalizePlaceName(name)}`);
  for (const key of keys) {
    if (!placeIndex.has(key)) placeIndex.set(key, place);
  }
}

export function resolveCity(city: string, state: string): PlaceRecord | null {
  const normalizedState = normalizeState(state);
  if (!normalizedState || !city.trim()) return null;
  return placeIndex.get(`${normalizedState}|${normalizePlaceName(city)}`) ?? null;
}

export function searchPlaces(query: string, limit = 8): PlaceRecord[] {
  const [rawCity, rawState = ""] = query.split(",", 2);
  const cityQuery = normalizePlaceName(rawCity);
  if (cityQuery.length < 2) return [];
  const stateQueryRaw = normalizePlaceName(rawState);
  const stateQuery = normalizeState(stateQueryRaw);
  const prefixMatches: PlaceRecord[] = [];
  const containsMatches: PlaceRecord[] = [];
  for (const place of places) {
    const name = normalizePlaceName(place.city);
    if (stateQuery && place.state !== stateQuery) continue;
    if (name.startsWith(cityQuery)) prefixMatches.push(place);
    else if (name.includes(cityQuery)) containsMatches.push(place);
    if (prefixMatches.length >= limit) break;
  }
  return [...prefixMatches, ...containsMatches].slice(0, limit);
}

export function placeCount(): number {
  return places.length;
}

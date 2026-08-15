import { CheckSquare, Eye, EyeSlash, Table, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { STATES } from "../data/state-metadata";
import type { MapLayer, MapLocation } from "../types";

interface LocationDataTableDialogProps {
  locations: MapLocation[];
  layers: MapLayer[];
  onUpdateLocation(id: string, patch: Partial<MapLocation>): void;
  onUpdatePlace(id: string, city: string, state: string): boolean;
  onUpdateCompany(id: string, company: string): void;
  onBulkUpdate(ids: string[], patch: { layerId?: string; visible?: boolean; calloutVisible?: boolean }): void;
  onSelectLocation(id: string): void;
  onClose(): void;
}

function companyFor(location: MapLocation): string {
  return location.callout.labels.find((label) => label.role === "company")?.text
    ?? (typeof location.customData.company === "string" ? location.customData.company : "");
}

export function LocationDataTableDialog({
  locations,
  layers,
  onUpdateLocation,
  onUpdatePlace,
  onUpdateCompany,
  onBulkUpdate,
  onSelectLocation,
  onClose,
}: LocationDataTableDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [bulkLayerId, setBulkLayerId] = useState(layers[0]?.id ?? "");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return locations;
    return locations.filter((location) => [location.city, location.state, location.label, companyFor(location)]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [locations, query]);
  const selected = [...selectedIds].filter((id) => locations.some((location) => location.id === id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((location) => selectedIds.has(location.id));

  function toggleAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filtered.forEach((location) => next.delete(location.id));
      else filtered.forEach((location) => next.add(location.id));
      return next;
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog dialog--wide location-data-dialog" role="dialog" aria-modal="true" aria-labelledby="location-data-title" data-testid="location-data-table-dialog">
        <header className="dialog__header">
          <span className="dialog__icon"><Table size={22} weight="bold" /></span>
          <div><small>Bulk data editor</small><h2 id="location-data-title">Locations and labels</h2><p>Edit City, Company, layer, and visibility without opening each pin.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close location data table"><X size={18} /></button>
        </header>
        <div className="location-data-toolbar">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter cities or companies" aria-label="Filter location table" />
          <strong>{selected.length} selected</strong>
          <select value={bulkLayerId} onChange={(event) => setBulkLayerId(event.target.value)} aria-label="Bulk target layer">{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select>
          <button type="button" className="button button--secondary" disabled={!selected.length} onClick={() => onBulkUpdate(selected, { layerId: bulkLayerId })}>Assign layer</button>
          <button type="button" className="icon-button" disabled={!selected.length} onClick={() => onBulkUpdate(selected, { visible: true })} aria-label="Show selected locations" title="Show selected locations"><Eye size={16} /></button>
          <button type="button" className="icon-button" disabled={!selected.length} onClick={() => onBulkUpdate(selected, { visible: false })} aria-label="Hide selected locations" title="Hide selected locations"><EyeSlash size={16} /></button>
          <button type="button" className="button button--secondary" disabled={!selected.length} onClick={() => onBulkUpdate(selected, { calloutVisible: true })}>Show labels</button>
          <button type="button" className="button button--secondary" disabled={!selected.length} onClick={() => onBulkUpdate(selected, { calloutVisible: false })}>Hide labels</button>
        </div>
        <div className="location-data-table" role="region" aria-label="Editable location data">
          <div className="location-data-table__head" role="row">
            <label><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} /><span className="sr-only">Select all filtered rows</span></label>
            <span>City</span><span>State</span><span>Company</span><span>Layer</span><span>Pin</span><span>Label</span><span>Open</span>
          </div>
          {filtered.map((location) => (
            <div className="location-data-table__row" role="row" key={location.id}>
              <label><input type="checkbox" checked={selectedIds.has(location.id)} onChange={() => setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(location.id)) next.delete(location.id); else next.add(location.id);
                return next;
              })} /><span className="sr-only">Select {location.label}</span></label>
              <input defaultValue={location.city} onBlur={(event) => {
                const city = event.target.value.trim();
                if (city && city !== location.city && !onUpdatePlace(location.id, city, location.state)) event.target.value = location.city;
              }} aria-label={`City for ${location.label}`} />
              <select value={location.state} onChange={(event) => { if (!onUpdatePlace(location.id, location.city, event.target.value)) event.target.value = location.state; }} aria-label={`State for ${location.label}`}>{STATES.map((state) => <option key={state.fips} value={state.abbreviation}>{state.abbreviation}</option>)}</select>
              <input defaultValue={companyFor(location)} onBlur={(event) => onUpdateCompany(location.id, event.target.value.trim())} placeholder="Company name" aria-label={`Company for ${location.label}`} />
              <select value={location.layerId} onChange={(event) => onUpdateLocation(location.id, { layerId: event.target.value })} aria-label={`Layer for ${location.label}`}>{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select>
              <input type="checkbox" checked={location.visible} onChange={(event) => onUpdateLocation(location.id, { visible: event.target.checked })} aria-label={`Show pin for ${location.label}`} />
              <input type="checkbox" checked={location.callout.visible} onChange={(event) => onUpdateLocation(location.id, { callout: { ...location.callout, visible: event.target.checked }, showLabel: event.target.checked })} aria-label={`Show label for ${location.label}`} />
              <button type="button" className="icon-button" onClick={() => { onSelectLocation(location.id); onClose(); }} aria-label={`Open ${location.label}`}><CheckSquare size={16} /></button>
            </div>
          ))}
        </div>
        <footer className="dialog__footer"><span>{filtered.length} shown · {locations.length} total</span><button type="button" className="button button--primary" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}

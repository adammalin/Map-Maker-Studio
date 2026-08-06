import {
  ArrowsClockwise,
  Copy,
  MapPin,
  PaintBrush,
  Trash,
} from "@phosphor-icons/react";
import { resolveCity } from "../lib/geocoder";
import { STATE_BY_FIPS, STATES } from "../data/state-metadata";
import type { MapLocation, MapSettings } from "../types";

interface InspectorProps {
  location: MapLocation | null;
  map: MapSettings;
  selectedStateFips: string | null;
  onUpdateLocation(patch: Partial<MapLocation>): void;
  onUpdateMap(patch: Partial<MapSettings>): void;
  onDuplicateLocation(): void;
  onRemoveLocation(): void;
  onSelectState(fips: string | null): void;
  onNotice(message: string): void;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-field__control">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex color`} />
      </span>
    </label>
  );
}

export function Inspector({
  location,
  map,
  selectedStateFips,
  onUpdateLocation,
  onUpdateMap,
  onDuplicateLocation,
  onRemoveLocation,
  onSelectState,
  onNotice,
}: InspectorProps) {
  if (location) {
    return (
      <aside className="inspector" aria-label="Location inspector" data-testid="location-inspector">
        <div className="inspector__heading">
          <span><MapPin size={18} weight="bold" /></span>
          <div><small>Selected location</small><h2>{location.label}</h2></div>
        </div>
        <div className="inspector__body">
          <section className="form-section">
            <h3>Place</h3>
            <label><span>City</span><input value={location.city} onChange={(event) => onUpdateLocation({ city: event.target.value })} /></label>
            <label><span>State</span>
              <select value={location.state} onChange={(event) => onUpdateLocation({ state: event.target.value })}>
                {STATES.map((state) => <option key={state.fips} value={state.abbreviation}>{state.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="button button--secondary button--full"
              onClick={() => {
                const match = resolveCity(location.city, location.state);
                if (!match) {
                  onNotice("No offline Census place match was found. Enter coordinates directly.");
                  return;
                }
                onUpdateLocation({ latitude: match.latitude, longitude: match.longitude });
                onNotice(`Coordinates updated from the 2025 Census place index for ${match.fullName}.`);
              }}
            >
              <ArrowsClockwise size={16} /> Resolve coordinates
            </button>
            <div className="field-row">
              <label><span>Latitude</span><input type="number" step="0.000001" value={location.latitude} onChange={(event) => onUpdateLocation({ latitude: Number(event.target.value) })} /></label>
              <label><span>Longitude</span><input type="number" step="0.000001" value={location.longitude} onChange={(event) => onUpdateLocation({ longitude: Number(event.target.value) })} /></label>
            </div>
            <p className="form-hint">Drag the pin on the map for a visual adjustment, or enter exact coordinates.</p>
          </section>
          <section className="form-section">
            <h3>Pin</h3>
            <label><span>Type</span>
              <select value={location.pinType} onChange={(event) => onUpdateLocation({ pinType: event.target.value as MapLocation["pinType"] })}>
                <option value="pin">Map pin</option><option value="circle">Circle</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="star">Star</option>
              </select>
            </label>
            <ColorField label="Color" value={location.pinColor} onChange={(pinColor) => onUpdateLocation({ pinColor })} />
            <label><span>Size <em>{location.pinSize}px</em></span><input type="range" min="6" max="40" value={location.pinSize} onChange={(event) => onUpdateLocation({ pinSize: Number(event.target.value) })} /></label>
          </section>
          <section className="form-section">
            <h3>Label</h3>
            <label className="toggle-row"><span>Show this label</span><input type="checkbox" checked={location.showLabel} onChange={(event) => onUpdateLocation({ showLabel: event.target.checked })} /></label>
            <label><span>Text</span><input value={location.label} onChange={(event) => onUpdateLocation({ label: event.target.value })} /></label>
            <label><span>Position</span>
              <select value={location.labelPosition} onChange={(event) => onUpdateLocation({ labelPosition: event.target.value as MapLocation["labelPosition"] })}>
                <option value="right">Right</option><option value="left">Left</option><option value="above">Above</option><option value="below">Below</option>
              </select>
            </label>
            <ColorField label="Text color" value={location.labelColor} onChange={(labelColor) => onUpdateLocation({ labelColor })} />
            <label><span>Notes</span><textarea rows={3} value={location.notes} onChange={(event) => onUpdateLocation({ notes: event.target.value })} /></label>
          </section>
          <div className="inspector__actions">
            <button type="button" className="button button--secondary" onClick={onDuplicateLocation}><Copy size={16} /> Duplicate</button>
            <button type="button" className="button button--danger" onClick={onRemoveLocation}><Trash size={16} /> Remove</button>
          </div>
        </div>
      </aside>
    );
  }

  const selectedState = selectedStateFips ? STATE_BY_FIPS.get(selectedStateFips) : null;
  const stateColor = selectedStateFips ? map.stateColors[selectedStateFips] ?? map.landColor : map.landColor;
  return (
    <aside className="inspector" aria-label="Map style inspector" data-testid="map-inspector">
      <div className="inspector__heading">
        <span><PaintBrush size={18} weight="bold" /></span>
        <div><small>Map appearance</small><h2>{selectedState ? selectedState.name : "Canvas style"}</h2></div>
      </div>
      <div className="inspector__body">
        <section className="form-section">
          <h3>Heading</h3>
          <label><span>Title</span><input value={map.title} onChange={(event) => onUpdateMap({ title: event.target.value })} /></label>
          <label><span>Subtitle</span><textarea rows={2} value={map.subtitle} onChange={(event) => onUpdateMap({ subtitle: event.target.value })} /></label>
        </section>
        <section className="form-section">
          <h3>Geography</h3>
          <ColorField label="Canvas" value={map.backgroundColor} onChange={(backgroundColor) => onUpdateMap({ backgroundColor })} />
          <ColorField label="Default state fill" value={map.landColor} onChange={(landColor) => onUpdateMap({ landColor })} />
          <ColorField label="State lines" value={map.borderColor} onChange={(borderColor) => onUpdateMap({ borderColor })} />
          <label><span>Line weight <em>{map.borderWidth.toFixed(2)}px</em></span><input type="range" min="0.25" max="4" step="0.25" value={map.borderWidth} onChange={(event) => onUpdateMap({ borderWidth: Number(event.target.value) })} /></label>
          <label className="toggle-row"><span>County lines</span><input type="checkbox" checked={map.showCountyLines} onChange={(event) => onUpdateMap({ showCountyLines: event.target.checked })} /></label>
          {map.showCountyLines ? <ColorField label="County lines" value={map.countyBorderColor} onChange={(countyBorderColor) => onUpdateMap({ countyBorderColor })} /> : null}
          <label className="toggle-row"><span>State abbreviations</span><input type="checkbox" checked={map.showStateLabels} onChange={(event) => onUpdateMap({ showStateLabels: event.target.checked })} /></label>
        </section>
        <section className="form-section">
          <h3>Labels &amp; legend</h3>
          <label className="toggle-row"><span>Location labels</span><input type="checkbox" checked={map.showLocationLabels} onChange={(event) => onUpdateMap({ showLocationLabels: event.target.checked })} /></label>
          <label className="toggle-row"><span>Map legend</span><input type="checkbox" checked={map.showLegend} onChange={(event) => onUpdateMap({ showLegend: event.target.checked })} /></label>
          <ColorField label="State label color" value={map.labelColor} onChange={(labelColor) => onUpdateMap({ labelColor })} />
          <ColorField label="Label halo" value={map.labelHaloColor} onChange={(labelHaloColor) => onUpdateMap({ labelHaloColor })} />
        </section>
        <section className="form-section form-section--accent">
          <h3>State color override</h3>
          <label><span>State</span>
            <select value={selectedStateFips ?? ""} onChange={(event) => onSelectState(event.target.value || null)}>
              <option value="">Choose a state</option>
              {STATES.map((state) => <option key={state.fips} value={state.fips}>{state.name}</option>)}
            </select>
          </label>
          {selectedStateFips ? (
            <>
              <ColorField label={`${selectedState?.abbreviation ?? "State"} fill`} value={stateColor} onChange={(color) => onUpdateMap({ stateColors: { ...map.stateColors, [selectedStateFips]: color } })} />
              <button type="button" className="button button--secondary button--full" onClick={() => {
                const next = { ...map.stateColors };
                delete next[selectedStateFips];
                onUpdateMap({ stateColors: next });
              }}>Use default fill</button>
            </>
          ) : <p className="form-hint">Click a state on the map or choose one here to give it a custom fill.</p>}
        </section>
      </div>
    </aside>
  );
}

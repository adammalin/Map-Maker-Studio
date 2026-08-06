import {
  ArrowsClockwise,
  Copy,
  MapPin,
  PaintBrush,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useRef } from "react";
import { ORNL_SWATCH_GROUPS } from "../data/ornl-palette";
import { scopedCustomPinInnerMarkup } from "../lib/custom-pin";
import { resolveCity } from "../lib/geocoder";
import { STATE_BY_FIPS, STATES } from "../data/state-metadata";
import { effectivePinStyle } from "../lib/layers";
import type { CustomPinDesign, MapLayer, MapLocation, MapSettings, SharedPinStyle } from "../types";

interface InspectorProps {
  location: MapLocation | null;
  map: MapSettings;
  selectedStateFips: string | null;
  customPins: CustomPinDesign[];
  layers: MapLayer[];
  sharedPinStyle: SharedPinStyle;
  onUpdateLocation(patch: Partial<MapLocation>): void;
  onUpdateMap(patch: Partial<MapSettings>): void;
  onDuplicateLocation(): void;
  onRemoveLocation(): void;
  onSelectState(fips: string | null): void;
  onImportCustomPin(svg: string, fileName: string): void;
  onApplyCustomPinToAll(id: string): void;
  onRemoveCustomPin(id: string): void;
  onNotice(message: string): void;
}

export function ColorField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange(value: string): void; disabled?: boolean }) {
  return (
    <div className="color-field">
      <span>{label}</span>
      <span className="color-field__control">
        <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={`${label} color picker`} />
        <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex color`} />
      </span>
      <details className="brand-swatches">
        <summary>ORNL color swatches</summary>
        <div className="brand-swatches__groups">
          {ORNL_SWATCH_GROUPS.map((group) => (
            <section key={group.name}>
              <small>{group.name}</small>
              <div>
                {group.colors.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    className={value.toLowerCase() === color.value ? "is-active" : ""}
                    style={{ background: color.value }}
                    title={`${color.name} · ${color.value.toUpperCase()}`}
                    aria-label={`Use ${color.name} ${color.value} for ${label}`}
                    disabled={disabled}
                    onClick={() => onChange(color.value)}
                  />
                ))}
              </div>
            </section>
          ))}
          <p>Built-in draft aid. Keep accent colors subordinate and verify contrast for the final use.</p>
        </div>
      </details>
    </div>
  );
}

export function Inspector({
  location,
  map,
  selectedStateFips,
  customPins,
  layers,
  sharedPinStyle,
  onUpdateLocation,
  onUpdateMap,
  onDuplicateLocation,
  onRemoveLocation,
  onSelectState,
  onImportCustomPin,
  onApplyCustomPinToAll,
  onRemoveCustomPin,
  onNotice,
}: InspectorProps) {
  const svgInputRef = useRef<HTMLInputElement>(null);
  if (location) {
    const effectiveStyle = effectivePinStyle({ sharedPinStyle }, location);
    const selectedCustomPin = effectiveStyle.customPinId
      ? customPins.find((design) => design.id === effectiveStyle.customPinId) ?? null
      : null;
    const pinTypeValue = selectedCustomPin ? `custom:${selectedCustomPin.id}` : effectiveStyle.pinType;
    return (
      <aside className="inspector" aria-label="Location inspector" data-testid="location-inspector">
        <div className="inspector__heading">
          <span><MapPin size={18} weight="bold" /></span>
          <div><small>Selected location</small><h2>{location.label}</h2></div>
        </div>
        <div className="inspector__body">
          <section className="form-section">
            <h3>Place</h3>
            <label><span>Layer</span>
              <select value={location.layerId} onChange={(event) => onUpdateLocation({ layerId: event.target.value })}>
                {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
              </select>
            </label>
            <label className="toggle-row"><span>Show this location on map and exports</span><input type="checkbox" checked={location.visible} onChange={(event) => onUpdateLocation({ visible: event.target.checked })} /></label>
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
            {sharedPinStyle.enabled ? <p className="shared-style-note"><strong>Shared pin style is on.</strong> Every layer uses the same pin. Change it in the Layers workspace.</p> : null}
            <label><span>Type</span>
              <select disabled={sharedPinStyle.enabled} value={pinTypeValue} onChange={(event) => {
                const next = event.target.value;
                if (next.startsWith("custom:")) onUpdateLocation({ customPinId: next.slice(7) });
                else onUpdateLocation({ pinType: next as MapLocation["pinType"], customPinId: null });
              }}>
                <optgroup label="Built-in pins">
                  <option value="pin">Map pin</option><option value="circle">Circle</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="star">Star</option>
                </optgroup>
                {customPins.length ? (
                  <optgroup label="Custom SVG pins">
                    {customPins.map((design) => <option key={design.id} value={`custom:${design.id}`}>{design.name}</option>)}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <ColorField disabled={sharedPinStyle.enabled} label="Color" value={effectiveStyle.pinColor} onChange={(pinColor) => onUpdateLocation({ pinColor })} />
            <label><span>Size <em>{effectiveStyle.pinSize}px</em></span><input disabled={sharedPinStyle.enabled} type="range" min="6" max="40" value={effectiveStyle.pinSize} onChange={(event) => onUpdateLocation({ pinSize: Number(event.target.value) })} /></label>
            <input
              ref={svgInputRef}
              className="sr-only"
              type="file"
              accept=".svg,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then((svg) => onImportCustomPin(svg, file.name));
                event.currentTarget.value = "";
              }}
            />
            <button type="button" className="button button--secondary button--full" onClick={() => svgInputRef.current?.click()}>
              <UploadSimple size={16} /> Import custom SVG pin
            </button>
            {selectedCustomPin ? (
              <section className="custom-pin-card">
                <svg className="custom-pin-card__preview" viewBox={selectedCustomPin.viewBox} role="img" aria-label={`${selectedCustomPin.name} custom pin preview`} style={{ color: effectiveStyle.pinColor }}>
                  <g dangerouslySetInnerHTML={{ __html: scopedCustomPinInnerMarkup(selectedCustomPin, `preview-${location.id}`) }} />
                </svg>
                <span><strong>{selectedCustomPin.name}</strong><small>Embedded in project JSON</small></span>
                <button className="custom-pin-card__delete" type="button" onClick={() => onRemoveCustomPin(selectedCustomPin.id)} aria-label={`Remove ${selectedCustomPin.name}`} title="Delete this custom pin design"><Trash size={15} /></button>
                <button className="button button--secondary custom-pin-card__apply" type="button" onClick={() => onApplyCustomPinToAll(selectedCustomPin.id)}>
                  <MapPin size={15} /> Apply to all locations
                </button>
              </section>
            ) : (
              <p className="form-hint">Imported SVGs are sanitized, embedded in the project, and available to every location. Shapes using <code>currentColor</code> follow the selected pin color.</p>
            )}
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

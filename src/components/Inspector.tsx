import {
  ArrowsClockwise,
  Copy,
  MapPin,
  PaintBrush,
  Plus,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useRef } from "react";
import { ORNL_SWATCH_GROUPS } from "../data/ornl-palette";
import { scopedCustomPinInnerMarkup } from "../lib/custom-pin";
import { resolveCity } from "../lib/geocoder";
import { STATE_BY_FIPS, STATES } from "../data/state-metadata";
import { effectivePinStyle } from "../lib/layers";
import { createLocationLabel } from "../lib/callouts";
import type { CustomPinDesign, LocationLabel, LocationLabelMode, MapLayer, MapLocation, MapSettings, SharedPinStyle } from "../types";

const CALLOUT_FONTS = ["Aptos", "Arial", "Helvetica", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana"];

interface InspectorProps {
  location: MapLocation | null;
  map: MapSettings;
  selectedStateFips: string | null;
  customPins: CustomPinDesign[];
  layers: MapLayer[];
  sharedPinStyle: SharedPinStyle;
  overlapCount: number;
  onUpdateLocation(patch: Partial<MapLocation>): void;
  onUpdateSharedPinStyle(patch: Partial<SharedPinStyle>): void;
  onSetPinEditingScope(scope: "all" | "single"): void;
  onArrangeCallouts(): void;
  onApplyLabelStyleToRole(label: LocationLabel): void;
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
  overlapCount,
  onUpdateLocation,
  onUpdateSharedPinStyle,
  onSetPinEditingScope,
  onArrangeCallouts,
  onApplyLabelStyleToRole,
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
    const updatePinStyle = sharedPinStyle.enabled ? onUpdateSharedPinStyle : onUpdateLocation;
    const updateCallout = (patch: Partial<MapLocation["callout"]>) => {
      const callout = { ...location.callout, ...patch };
      onUpdateLocation({ callout, ...(typeof patch.visible === "boolean" ? { showLabel: patch.visible } : {}) });
    };
    const updateLabel = (id: string, patch: Partial<LocationLabel>) => {
      updateCallout({ labels: location.callout.labels.map((label) => label.id === id ? { ...label, ...patch } : label) });
    };
    const moveLabel = (id: string, direction: -1 | 1) => {
      const index = location.callout.labels.findIndex((label) => label.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= location.callout.labels.length) return;
      const labels = [...location.callout.labels];
      [labels[index], labels[target]] = [labels[target], labels[index]];
      updateCallout({ labels });
    };
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
            <div className="pin-edit-scope" role="group" aria-label="Pin editing scope">
              <button type="button" data-testid="pin-scope-all" className={sharedPinStyle.enabled ? "is-active" : ""} aria-pressed={sharedPinStyle.enabled} onClick={() => onSetPinEditingScope("all")}>All pins</button>
              <button type="button" data-testid="pin-scope-single" className={sharedPinStyle.enabled ? "" : "is-active"} aria-pressed={!sharedPinStyle.enabled} onClick={() => onSetPinEditingScope("single")}>This pin</button>
            </div>
            <p className="shared-style-note">
              {sharedPinStyle.enabled
                ? <><strong>Editing all pins.</strong> Type, color, and size changes apply to every location.</>
                : <><strong>Editing only this pin.</strong> Other locations keep their current appearance.</>}
            </p>
            <label><span>Type</span>
              <select value={pinTypeValue} onChange={(event) => {
                const next = event.target.value;
                if (next.startsWith("custom:")) updatePinStyle({ customPinId: next.slice(7) });
                else updatePinStyle({ pinType: next as MapLocation["pinType"], customPinId: null });
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
            <ColorField label="Color" value={effectiveStyle.pinColor} onChange={(pinColor) => updatePinStyle({ pinColor })} />
            <label><span>Size <em>{effectiveStyle.pinSize}px</em></span>
              <span className="range-with-value">
                <input type="range" min="6" max="40" value={effectiveStyle.pinSize} onChange={(event) => updatePinStyle({ pinSize: Number(event.target.value) })} />
                <input type="number" min="6" max="40" step="1" value={effectiveStyle.pinSize} aria-label="Pin size" onChange={(event) => updatePinStyle({ pinSize: Math.min(40, Math.max(6, Number(event.target.value) || 6)) })} />
              </span>
            </label>
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
          <section className="form-section callout-editor">
            <div className="form-section__heading">
              <h3>Labels &amp; callout</h3>
              <button
                type="button"
                className="mini-action"
                onClick={() => {
                  const role = location.callout.labels.some((label) => label.role === "company") ? "custom" : "company";
                  updateCallout({ labels: [...location.callout.labels, createLocationLabel(role, "")] });
                }}
              ><Plus size={14} /> Add</button>
            </div>
            <label className="toggle-row"><span>Show this callout</span><input type="checkbox" checked={location.callout.visible} onChange={(event) => updateCallout({ visible: event.target.checked })} /></label>
            <div className={`callout-status${overlapCount ? " callout-status--warning" : ""}`}>
              <span>{overlapCount ? `${overlapCount} label layout issue${overlapCount === 1 ? "" : "s"}` : "No label overlaps detected"}</span>
              <button type="button" className="button button--secondary" onClick={onArrangeCallouts}><ArrowsClockwise size={15} /> Arrange labels</button>
            </div>
            <label className="toggle-row"><span>Lock this callout position</span><input type="checkbox" checked={location.callout.locked} onChange={(event) => updateCallout({ locked: event.target.checked })} /></label>
            <p className="form-hint">Drag the callout on the canvas for manual placement; dragging locks it automatically. Unlock it before arranging if the automatic layout should move it again.</p>
            <div className="field-row">
              <label><span>Leader line</span>
                <select value={location.callout.leaderLine} onChange={(event) => updateCallout({ leaderLine: event.target.value as MapLocation["callout"]["leaderLine"] })}>
                  <option value="auto">Automatic</option><option value="none">None</option><option value="straight">Straight</option><option value="elbow">Elbow</option>
                </select>
              </label>
              <label><span>Line width <em>{location.callout.leaderWidth.toFixed(2)}</em></span>
                <span className="range-with-value">
                  <input type="range" min="0.25" max="5" step="0.25" value={location.callout.leaderWidth} onChange={(event) => updateCallout({ leaderWidth: Number(event.target.value) })} />
                  <input type="number" min="0.25" max="5" step="0.25" value={location.callout.leaderWidth} aria-label="Leader line width" onChange={(event) => updateCallout({ leaderWidth: Math.min(5, Math.max(0.25, Number(event.target.value) || 0.25)) })} />
                </span>
              </label>
            </div>
            {location.callout.leaderLine !== "none" ? <ColorField label="Leader color" value={location.callout.leaderColor} onChange={(leaderColor) => updateCallout({ leaderColor })} /> : null}
            <div className="callout-label-list">
              {location.callout.labels.map((label, index) => (
                <article className="callout-label-card" key={label.id}>
                  <header>
                    <label className="callout-label-role"><span>Label type</span>
                      <select value={label.role} onChange={(event) => updateLabel(label.id, { role: event.target.value as LocationLabel["role"] })}>
                        <option value="city">City</option><option value="company">Company</option><option value="custom">Custom</option>
                      </select>
                    </label>
                    <span className="callout-label-actions">
                      <button type="button" disabled={index === 0} onClick={() => moveLabel(label.id, -1)} aria-label={`Move ${label.role} label up`}>↑</button>
                      <button type="button" disabled={index === location.callout.labels.length - 1} onClick={() => moveLabel(label.id, 1)} aria-label={`Move ${label.role} label down`}>↓</button>
                      <button type="button" onClick={() => updateCallout({ labels: location.callout.labels.filter((candidate) => candidate.id !== label.id) })} aria-label={`Remove ${label.role} label`}><Trash size={13} /></button>
                    </span>
                  </header>
                  <label className="toggle-row"><span>Show label row</span><input type="checkbox" checked={label.visible} onChange={(event) => updateLabel(label.id, { visible: event.target.checked })} /></label>
                  <label><span>Text</span><input value={label.text} placeholder={label.role === "company" ? "Company name" : label.role === "city" ? "City name" : "Label text"} onChange={(event) => updateLabel(label.id, { text: event.target.value })} /></label>
                  <div className="field-row">
                    <label><span>Font</span><select value={label.fontFamily} onChange={(event) => updateLabel(label.id, { fontFamily: event.target.value })}>{CALLOUT_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
                    <label><span>Weight</span><select value={label.fontWeight} onChange={(event) => updateLabel(label.id, { fontWeight: Number(event.target.value) as LocationLabel["fontWeight"] })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label>
                  </div>
                  <label><span>Size <em>{label.fontSize.toFixed(1)} px</em></span>
                    <span className="range-with-value">
                      <input type="range" min="6" max="32" step="0.5" value={label.fontSize} onChange={(event) => updateLabel(label.id, { fontSize: Number(event.target.value) })} />
                      <input type="number" min="6" max="32" step="0.5" value={label.fontSize} aria-label={`${label.role} label size`} onChange={(event) => updateLabel(label.id, { fontSize: Math.min(32, Math.max(6, Number(event.target.value) || 6)) })} />
                    </span>
                  </label>
                  <ColorField label="Text color" value={label.color} onChange={(color) => updateLabel(label.id, { color })} />
                  <button type="button" className="button button--secondary button--full" onClick={() => onApplyLabelStyleToRole(label)}>Apply style to all {label.role} labels</button>
                </article>
              ))}
              {!location.callout.labels.length ? <p className="form-hint">This callout has no label rows. Add a City, Company, or Custom label.</p> : null}
            </div>
            <p className="form-hint">Each visible row exports as its own editable text object. Add another row instead of inserting a line break.</p>
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
          <label className="toggle-row"><span>Location labels</span><input type="checkbox" checked={map.locationLabelMode !== "pins"} onChange={(event) => onUpdateMap({ locationLabelMode: event.target.checked ? "city" : "pins" })} /></label>
          <label className="field-row"><span>Label view</span><select value={map.locationLabelMode} onChange={(event) => onUpdateMap({ locationLabelMode: event.target.value as LocationLabelMode })}><option value="pins">Pins only</option><option value="city">City names</option><option value="city-company">City + Company</option><option value="selected-layer">Selected layer labels</option><option value="selected-location">Selected location label</option></select></label>
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

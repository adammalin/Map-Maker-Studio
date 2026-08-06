import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeSlash,
  MapPin,
  Plus,
  Stack,
  Trash,
} from "@phosphor-icons/react";
import type { CustomPinDesign, MapLayer, MapLocation, SharedPinStyle } from "../types";
import { ColorField } from "./Inspector";

interface LayerPanelProps {
  layers: MapLayer[];
  locations: MapLocation[];
  selectedLayerId: string;
  onSelectLayer(id: string): void;
  onAddLayer(): void;
  onToggleLayer(id: string): void;
}

export function LayerPanel({
  layers,
  locations,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onToggleLayer,
}: LayerPanelProps) {
  return (
    <aside className="layer-panel" aria-label="Map layers" data-testid="layer-panel">
      <div className="panel-heading">
        <div><small>Organization</small><h2>Layers</h2></div>
        <button type="button" className="icon-button icon-button--primary" onClick={onAddLayer} aria-label="Add layer"><Plus size={18} weight="bold" /></button>
      </div>
      <p className="layer-panel__intro">Visibility affects the canvas and every export. Layer order controls pin stacking.</p>
      <div className="layer-list">
        {layers.map((layer, index) => {
          const count = locations.filter((location) => location.layerId === layer.id).length;
          const visibleCount = locations.filter((location) => location.layerId === layer.id && location.visible).length;
          return (
            <div key={layer.id} className={`layer-row${layer.id === selectedLayerId ? " is-active" : ""}${layer.visible ? "" : " is-hidden"}`}>
              <button type="button" className="layer-row__visibility" onClick={() => onToggleLayer(layer.id)} aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} aria-pressed={layer.visible}>
                {layer.visible ? <Eye size={17} weight="bold" /> : <EyeSlash size={17} />}
              </button>
              <button type="button" className="layer-row__select" onClick={() => onSelectLayer(layer.id)}>
                <span className="layer-row__index">{index + 1}</span>
                <span><strong>{layer.name}</strong><small>{visibleCount} shown · {count} total</small></span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="location-panel__footer"><span>{layers.filter((layer) => layer.visible).length} visible</span><span>{layers.length} total</span></div>
    </aside>
  );
}

interface LayerInspectorProps {
  layer: MapLayer;
  layers: MapLayer[];
  locationCount: number;
  sharedPinStyle: SharedPinStyle;
  customPins: CustomPinDesign[];
  onUpdateLayer(patch: Partial<MapLayer>): void;
  onUpdateSharedPinStyle(patch: Partial<SharedPinStyle>): void;
  onMoveLayer(direction: -1 | 1): void;
  onRemoveLayer(): void;
}

export function LayerInspector({
  layer,
  layers,
  locationCount,
  sharedPinStyle,
  customPins,
  onUpdateLayer,
  onUpdateSharedPinStyle,
  onMoveLayer,
  onRemoveLayer,
}: LayerInspectorProps) {
  const selectedCustomPin = sharedPinStyle.customPinId
    ? customPins.find((design) => design.id === sharedPinStyle.customPinId) ?? null
    : null;
  const typeValue = selectedCustomPin ? `custom:${selectedCustomPin.id}` : sharedPinStyle.pinType;
  const layerIndex = layers.findIndex((candidate) => candidate.id === layer.id);
  return (
    <aside className="inspector" aria-label="Layer inspector" data-testid="layer-inspector">
      <div className="inspector__heading">
        <span><Stack size={18} weight="bold" /></span>
        <div><small>Selected layer</small><h2>{layer.name}</h2></div>
      </div>
      <div className="inspector__body">
        <section className="form-section">
          <h3>Layer details</h3>
          <label><span>Name</span><input value={layer.name} onChange={(event) => onUpdateLayer({ name: event.target.value })} /></label>
          <label><span>Description</span><textarea rows={3} value={layer.description} onChange={(event) => onUpdateLayer({ description: event.target.value })} /></label>
          <label className="toggle-row"><span>Visible on map and exports</span><input type="checkbox" checked={layer.visible} onChange={(event) => onUpdateLayer({ visible: event.target.checked })} /></label>
          <p className="form-hint">{locationCount} location{locationCount === 1 ? "" : "s"} assigned to this layer.</p>
          <div className="layer-order-actions">
            <button type="button" className="button button--secondary" disabled={layerIndex <= 0} onClick={() => onMoveLayer(-1)}><ArrowUp size={16} /> Move up</button>
            <button type="button" className="button button--secondary" disabled={layerIndex < 0 || layerIndex >= layers.length - 1} onClick={() => onMoveLayer(1)}><ArrowDown size={16} /> Move down</button>
          </div>
        </section>
        <section className="form-section form-section--accent">
          <h3>Shared pin style</h3>
          <label className="toggle-row"><span>Use one pin across all layers</span><input data-testid="shared-pin-style-toggle" type="checkbox" checked={sharedPinStyle.enabled} onChange={(event) => onUpdateSharedPinStyle({ enabled: event.target.checked })} /></label>
          <p className="form-hint">Turn this on when every layer must use exactly the same symbol, color, and size.</p>
          <label><span>Type</span>
            <select value={typeValue} onChange={(event) => {
              const next = event.target.value;
              if (next.startsWith("custom:")) onUpdateSharedPinStyle({ customPinId: next.slice(7) });
              else onUpdateSharedPinStyle({ pinType: next as SharedPinStyle["pinType"], customPinId: null });
            }}>
              <optgroup label="Built-in pins">
                <option value="pin">Map pin</option><option value="circle">Circle</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="star">Star</option>
              </optgroup>
              {customPins.length ? <optgroup label="Custom SVG pins">{customPins.map((design) => <option key={design.id} value={`custom:${design.id}`}>{design.name}</option>)}</optgroup> : null}
            </select>
          </label>
          <ColorField label="Color" value={sharedPinStyle.pinColor} onChange={(pinColor) => onUpdateSharedPinStyle({ pinColor })} />
          <label><span>Size <em>{sharedPinStyle.pinSize}px</em></span><input type="range" min="6" max="40" value={sharedPinStyle.pinSize} onChange={(event) => onUpdateSharedPinStyle({ pinSize: Number(event.target.value) })} /></label>
          <div className="success-notice"><MapPin size={17} weight="fill" /> The shared style is stored in project JSON and used by SVG, PNG, and PowerPoint exports.</div>
        </section>
        <button type="button" className="button button--danger button--full" disabled={layers.length === 1} onClick={onRemoveLayer}><Trash size={16} /> Delete layer and its locations</button>
      </div>
    </aside>
  );
}

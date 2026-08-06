import { forwardRef, useMemo, useRef } from "react";
import type { Feature, Geometry } from "geojson";
import { STATE_BY_FIPS } from "../data/state-metadata";
import { customPinTransform, scopedCustomPinInnerMarkup } from "../lib/custom-pin";
import { effectivePinStyle, svgLayerId, visibleLocations } from "../lib/layers";
import { countyBoundaries, mapPath as path, projection, stateBoundaries, states } from "../lib/map-geometry";
import type { CustomPinDesign, MapLocation, UsaMapProject } from "../types";
import type { EffectivePinStyle } from "../lib/layers";

interface MapCanvasProps {
  project: UsaMapProject;
  selectedLocationId: string | null;
  selectedStateFips: string | null;
  zoom: number;
  pan: { x: number; y: number };
  onSelectLocation(id: string | null): void;
  onSelectState(fips: string | null): void;
  onMoveLocation(id: string, latitude: number, longitude: number): void;
  onPanChange(pan: { x: number; y: number }): void;
  onZoomChange(zoom: number): void;
}

const labelOffsets: Record<MapLocation["labelPosition"], { x: number; y: number; anchor: "start" | "middle" | "end" }> = {
  right: { x: 14, y: 4, anchor: "start" },
  left: { x: -14, y: 4, anchor: "end" },
  above: { x: 0, y: -16, anchor: "middle" },
  below: { x: 0, y: 24, anchor: "middle" },
};

function starPoints(radius: number): string {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const currentRadius = index % 2 === 0 ? radius : radius * 0.43;
    return `${Math.cos(angle) * currentRadius},${Math.sin(angle) * currentRadius}`;
  }).join(" ");
}

function PinSymbol({ location, style, customPin }: { location: MapLocation; style: EffectivePinStyle; customPin?: CustomPinDesign }) {
  const size = style.pinSize;
  if (customPin) {
    return (
      <g
        className="custom-pin-symbol"
        data-custom-pin-id={customPin.id}
        transform={customPinTransform(customPin.viewBox, size)}
        style={{ color: style.pinColor }}
        pointerEvents="none"
        dangerouslySetInnerHTML={{ __html: scopedCustomPinInnerMarkup(customPin, `map-${location.id}`) }}
      />
    );
  }
  const common = {
    fill: style.pinColor,
    stroke: "#ffffff",
    strokeWidth: Math.max(1.8, size * 0.13),
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (style.pinType === "circle") {
    return <circle r={size * 0.48} {...common} />;
  }
  if (style.pinType === "square") {
    return <rect x={-size * 0.46} y={-size * 0.46} width={size * 0.92} height={size * 0.92} {...common} />;
  }
  if (style.pinType === "diamond") {
    return <polygon points={`0,${-size * 0.62} ${size * 0.52},0 0,${size * 0.62} ${-size * 0.52},0`} {...common} />;
  }
  if (style.pinType === "star") {
    return <polygon points={starPoints(size * 0.68)} {...common} />;
  }
  return (
    <g transform={`translate(0 ${-size * 0.42}) scale(${size / 24})`}>
      <path d="M0 24C-3.3 19.5-9 13.4-9 7.1A9 9 0 0 1 9 7.1C9 13.4 3.3 19.5 0 24Z" {...common} />
      <circle cy="7" r="3.2" fill="#ffffff" stroke="none" />
    </g>
  );
}

export const MapCanvas = forwardRef<SVGSVGElement, MapCanvasProps>(function MapCanvas(
  {
    project,
    selectedLocationId,
    selectedStateFips,
    zoom,
    pan,
    onSelectLocation,
    onSelectState,
    onMoveLocation,
    onPanChange,
    onZoomChange,
  },
  forwardedRef,
) {
  const draggingLocation = useRef<string | null>(null);
  const panning = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const projectedLayers = useMemo(() => project.layers.map((layer) => ({
    layer,
    locations: layer.visible
      ? project.locations
        .filter((location) => location.layerId === layer.id && location.visible)
        .map((location) => ({
          location,
          style: effectivePinStyle(project, location),
          point: projection([location.longitude, location.latitude]),
        }))
        .filter((entry): entry is { location: MapLocation; style: EffectivePinStyle; point: [number, number] } => Boolean(entry.point))
      : [],
  })), [project]);
  const mappedLocations = visibleLocations(project);
  const customPins = useMemo(
    () => new Map(project.customPins.map((design) => [design.id, design])),
    [project.customPins],
  );

  const groupTransform = `translate(${pan.x} ${pan.y}) translate(600 390) scale(${zoom}) translate(-600 -390)`;

  function pointerToMap(event: React.PointerEvent<SVGSVGElement>): [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect();
    const displayX = (event.clientX - bounds.left) * (1200 / bounds.width);
    const displayY = (event.clientY - bounds.top) * (720 / bounds.height);
    return [
      (displayX - pan.x - 600 * (1 - zoom)) / zoom,
      (displayY - pan.y - 390 * (1 - zoom)) / zoom,
    ];
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (draggingLocation.current) {
      const coordinate = projection.invert?.(pointerToMap(event));
      if (coordinate) onMoveLocation(draggingLocation.current, coordinate[1], coordinate[0]);
      return;
    }
    if (panning.current?.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const scaleX = 1200 / bounds.width;
      const scaleY = 720 / bounds.height;
      onPanChange({
        x: panning.current.originX + (event.clientX - panning.current.startX) * scaleX,
        y: panning.current.originY + (event.clientY - panning.current.startY) * scaleY,
      });
    }
  }

  function stopPointerAction(event: React.PointerEvent<SVGSVGElement>) {
    draggingLocation.current = null;
    panning.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <svg
      ref={forwardedRef}
      className="map-svg"
      data-testid="map-svg"
      viewBox="0 0 1200 720"
      role="img"
      aria-labelledby="map-title map-description"
      onPointerMove={handlePointerMove}
      onPointerUp={stopPointerAction}
      onPointerCancel={stopPointerAction}
      onWheel={(event) => {
        event.preventDefault();
        onZoomChange(Math.min(2.6, Math.max(0.72, zoom + (event.deltaY < 0 ? 0.1 : -0.1))));
      }}
    >
      <title id="map-title">{project.map.title || project.project.name}</title>
      <desc id="map-description">United States map with {mappedLocations.length} visible plotted locations across {project.layers.filter((layer) => layer.visible).length} visible layers.</desc>
      <rect
        width="1200"
        height="720"
        fill={project.map.backgroundColor}
        data-pan-surface="true"
        onPointerDown={(event) => {
          event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
          panning.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: pan.x,
            originY: pan.y,
          };
          onSelectLocation(null);
          onSelectState(null);
        }}
      />
      <text x="54" y="47" fill="#00454d" fontFamily="Aptos Display, Arial, sans-serif" fontSize="28" fontWeight="800">
        {project.map.title}
      </text>
      {project.map.subtitle ? (
        <text x="54" y="73" fill="#526966" fontFamily="Aptos, Arial, sans-serif" fontSize="13" fontWeight="600">
          {project.map.subtitle}
        </text>
      ) : null}
      <g transform={groupTransform}>
        <g aria-label="States">
          {states.features.map((state) => {
            const fips = state.properties.STATEFP;
            const selected = fips === selectedStateFips;
            return (
              <path
                key={fips}
                d={path(state as Feature<Geometry>) ?? undefined}
                fill={project.map.stateColors[fips] ?? project.map.landColor}
                stroke={selected ? "#fe5000" : "none"}
                strokeWidth={selected ? 3.4 : 0}
                vectorEffect="non-scaling-stroke"
                className="map-state"
                role="button"
                aria-label={`${state.properties.NAME} map styling`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectLocation(null);
                  onSelectState(fips);
                }}
              />
            );
          })}
          {project.map.showCountyLines ? (
            <path
              d={path(countyBoundaries) ?? undefined}
              fill="none"
              stroke={project.map.countyBorderColor}
              strokeWidth="0.45"
              opacity="0.72"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          ) : null}
          <path
            d={path(stateBoundaries) ?? undefined}
            fill="none"
            stroke={project.map.borderColor}
            strokeWidth={project.map.borderWidth}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {project.map.showStateLabels ? states.features.map((state) => {
            const [x, y] = path.centroid(state as Feature<Geometry>);
            const metadata = STATE_BY_FIPS.get(state.properties.STATEFP);
            if (!metadata || !Number.isFinite(x) || !Number.isFinite(y)) return null;
            return (
              <g key={`label-${metadata.fips}`} aria-hidden="true" pointerEvents="none">
                <text
                  data-label-halo="true"
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={project.map.labelHaloColor}
                  stroke={project.map.labelHaloColor}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  fontFamily="Aptos, Arial, sans-serif"
                  fontSize="8.5"
                  fontWeight="800"
                  letterSpacing="0.05em"
                >
                  {metadata.abbreviation}
                </text>
                <text
                  data-label-text="true"
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={project.map.labelColor}
                  stroke="none"
                  fontFamily="Aptos, Arial, sans-serif"
                  fontSize="8.5"
                  fontWeight="800"
                  letterSpacing="0.05em"
                >
                  {metadata.abbreviation}
                </text>
              </g>
            );
          }) : null}
        </g>
        <g aria-label="Location layers" data-map-layers="true">
          {projectedLayers.map(({ layer, locations }) => layer.visible ? (
            <g
              key={layer.id}
              id={svgLayerId(layer)}
              aria-label={layer.name}
              data-map-layer="true"
              data-layer-id={layer.id}
              data-layer-name={layer.name}
            >
          {locations.map(({ location, style, point: [x, y] }) => {
            const selected = location.id === selectedLocationId;
            const offset = labelOffsets[location.labelPosition];
            const labelX = offset.x + (offset.anchor === "start" ? style.pinSize * 0.25 : offset.anchor === "end" ? -style.pinSize * 0.25 : 0);
            return (
              <g
                key={location.id}
                className={`map-location${selected ? " is-selected" : ""}`}
                transform={`translate(${x} ${y})`}
                role="button"
                data-layer-id={layer.id}
                aria-label={`${location.label} in ${layer.name} at ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectState(null);
                  onSelectLocation(location.id);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const svg = event.currentTarget.ownerSVGElement;
                  svg?.setPointerCapture(event.pointerId);
                  draggingLocation.current = location.id;
                  onSelectState(null);
                  onSelectLocation(location.id);
                }}
              >
                {selected ? (
                  <circle r={style.pinSize * 0.82} fill="none" stroke="#fe5000" strokeWidth="2.4" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" data-editor-only="true" />
                ) : null}
                <PinSymbol location={location} style={style} customPin={style.customPinId ? customPins.get(style.customPinId) : undefined} />
                {project.map.showLocationLabels && location.showLabel ? (
                  <g aria-hidden="true" pointerEvents="none">
                    <text
                      data-label-halo="true"
                      x={labelX}
                      y={offset.y}
                      textAnchor={offset.anchor}
                      dominantBaseline="central"
                      fill={project.map.labelHaloColor}
                      stroke={project.map.labelHaloColor}
                      strokeWidth="4"
                      strokeLinejoin="round"
                      fontFamily="Aptos, Arial, sans-serif"
                      fontSize="11.5"
                      fontWeight="800"
                    >
                      {location.label}
                    </text>
                    <text
                      data-label-text="true"
                      x={labelX}
                      y={offset.y}
                      textAnchor={offset.anchor}
                      dominantBaseline="central"
                      fill={location.labelColor}
                      stroke="none"
                      fontFamily="Aptos, Arial, sans-serif"
                      fontSize="11.5"
                      fontWeight="800"
                    >
                      {location.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
            </g>
          ) : null)}
        </g>
      </g>
      {project.map.showLegend ? (
        <g transform="translate(54 684)" aria-label="Map legend">
          <rect x="0" y="-24" width="286" height="34" fill="#ffffff" stroke="#c8d3ce" strokeWidth="1" />
          <circle cx="18" cy="-7" r="5" fill={project.sharedPinStyle.enabled ? project.sharedPinStyle.pinColor : "#00662c"} />
          <text x="31" y="-3" fill="#373a36" fontFamily="Aptos, Arial, sans-serif" fontSize="9.5" fontWeight="700">
            {mappedLocations.length} visible location{mappedLocations.length === 1 ? "" : "s"}
          </text>
          <line x1="148" x2="167" y1="-7" y2="-7" stroke={project.map.borderColor} strokeWidth="1.4" />
          <text x="175" y="-3" fill="#526966" fontFamily="Aptos, Arial, sans-serif" fontSize="8.5" fontWeight="600">
            2025 Census geography
          </text>
        </g>
      ) : null}
    </svg>
  );
});

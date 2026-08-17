import { forwardRef, useMemo, useRef, useState } from "react";
import type { Feature, Geometry } from "geojson";
import { STATE_BY_FIPS } from "../data/state-metadata";
import { calloutBox, calloutConnector, measureCallout, primaryCalloutText } from "../lib/callouts";
import { customPinTransform, scopedCustomPinInnerMarkup } from "../lib/custom-pin";
import { effectivePinStyle, svgLayerId, uniqueCityCount, visibleLocations } from "../lib/layers";
import { countyBoundaries, mapPath as path, projection, stateBoundaries, states } from "../lib/map-geometry";
import type { CustomPinDesign, MapLocation, UsaMapProject } from "../types";
import type { EffectivePinStyle } from "../lib/layers";
import { MAP_CANVAS_HEIGHT, MAP_CANVAS_WIDTH, MAP_TRANSFORM_CENTER, clampMapZoom, zoomViewportAt } from "../lib/viewport";

interface MapCanvasProps {
  project: UsaMapProject;
  selectedLocationId: string | null;
  selectedStateFips: string | null;
  zoom: number;
  pan: { x: number; y: number };
  spacePressed: boolean;
  overlapLocationIds: ReadonlySet<string>;
  onSelectLocation(id: string | null): void;
  onSelectState(fips: string | null): void;
  onMoveLocation(id: string, latitude: number, longitude: number): void;
  onMoveCallout(id: string, offsetX: number, offsetY: number): void;
  onPanChange(pan: { x: number; y: number }): void;
  onZoomChange(zoom: number): void;
}

function starPoints(radius: number): string {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const currentRadius = index % 2 === 0 ? radius : radius * 0.43;
    return `${Math.cos(angle) * currentRadius},${Math.sin(angle) * currentRadius}`;
  }).join(" ");
}

function PinSymbol({ location, style, customPin, scopePrefix = "map" }: { location: MapLocation; style: EffectivePinStyle; customPin?: CustomPinDesign; scopePrefix?: string }) {
  const size = style.pinSize;
  if (customPin) {
    return (
      <g
        className="custom-pin-symbol"
        data-custom-pin-id={customPin.id}
        data-effective-pin-size={size}
        transform={customPinTransform(customPin.viewBox, size)}
        style={{ color: style.pinColor }}
        pointerEvents="none"
        dangerouslySetInnerHTML={{ __html: scopedCustomPinInnerMarkup(customPin, `${scopePrefix}-${location.id}`) }}
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
    spacePressed,
    overlapLocationIds,
    onSelectLocation,
    onSelectState,
    onMoveLocation,
    onMoveCallout,
    onPanChange,
    onZoomChange,
  },
  forwardedRef,
) {
  const draggingLocation = useRef<string | null>(null);
  const draggingCallout = useRef<{
    id: string;
    start: [number, number];
    origin: { x: number; y: number };
  } | null>(null);
  const panning = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const suppressNextClick = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
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
  const visibleLegendLayers = useMemo(() => project.layers.map((layer) => {
    const locations = layer.visible
      ? project.locations.filter((location) => location.layerId === layer.id && location.visible)
      : [];
    return { layer, locations, cityCount: uniqueCityCount(locations) };
  }).filter((entry) => entry.locations.length > 0), [project.layers, project.locations]);
  const layerLegendHeight = 54 + visibleLegendLayers.length * 20;
  const layerLegendTop = MAP_CANVAS_HEIGHT - layerLegendHeight - 12;

  const groupTransform = `translate(${pan.x} ${pan.y}) translate(${MAP_TRANSFORM_CENTER.x} ${MAP_TRANSFORM_CENTER.y}) scale(${zoom}) translate(${-MAP_TRANSFORM_CENTER.x} ${-MAP_TRANSFORM_CENTER.y})`;

  function clientToMap(svg: SVGSVGElement, clientX: number, clientY: number): [number, number] {
    const bounds = svg.getBoundingClientRect();
    const displayX = (clientX - bounds.left) * (MAP_CANVAS_WIDTH / bounds.width);
    const displayY = (clientY - bounds.top) * (MAP_CANVAS_HEIGHT / bounds.height);
    return [
      (displayX - pan.x - MAP_TRANSFORM_CENTER.x * (1 - zoom)) / zoom,
      (displayY - pan.y - MAP_TRANSFORM_CENTER.y * (1 - zoom)) / zoom,
    ];
  }

  function pointerToMap(event: React.PointerEvent<SVGSVGElement>): [number, number] {
    return clientToMap(event.currentTarget, event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (panning.current?.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const scaleX = MAP_CANVAS_WIDTH / bounds.width;
      const scaleY = MAP_CANVAS_HEIGHT / bounds.height;
      onPanChange({
        x: panning.current.originX + (event.clientX - panning.current.startX) * scaleX,
        y: panning.current.originY + (event.clientY - panning.current.startY) * scaleY,
      });
      return;
    }
    if (draggingCallout.current) {
      const current = pointerToMap(event);
      onMoveCallout(
        draggingCallout.current.id,
        draggingCallout.current.origin.x + current[0] - draggingCallout.current.start[0],
        draggingCallout.current.origin.y + current[1] - draggingCallout.current.start[1],
      );
      return;
    }
    if (draggingLocation.current) {
      const coordinate = projection.invert?.(pointerToMap(event));
      if (coordinate) onMoveLocation(draggingLocation.current, coordinate[1], coordinate[0]);
    }
  }

  function stopPointerAction(event: React.PointerEvent<SVGSVGElement>) {
    draggingLocation.current = null;
    draggingCallout.current = null;
    panning.current = null;
    setIsPanning(false);
    window.setTimeout(() => { suppressNextClick.current = false; }, 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <svg
      ref={forwardedRef}
      className={`map-svg${spacePressed ? " is-space-pan-ready" : ""}${isPanning ? " is-panning" : ""}`}
      data-testid="map-svg"
      viewBox="0 0 1200 720"
      role="img"
      aria-labelledby="map-title map-description"
      onPointerMove={handlePointerMove}
      onPointerUp={stopPointerAction}
      onPointerCancel={stopPointerAction}
      onPointerDownCapture={(event) => {
        if (!spacePressed || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingLocation.current = null;
        draggingCallout.current = null;
        panning.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: pan.x,
          originY: pan.y,
        };
        suppressNextClick.current = true;
        setIsPanning(true);
      }}
      onClickCapture={(event) => {
        if (!suppressNextClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressNextClick.current = false;
      }}
      onWheel={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const anchor = {
          x: (event.clientX - bounds.left) * (MAP_CANVAS_WIDTH / bounds.width),
          y: (event.clientY - bounds.top) * (MAP_CANVAS_HEIGHT / bounds.height),
        };
        const next = zoomViewportAt({ zoom, pan }, clampMapZoom(zoom * Math.exp(-event.deltaY * 0.0015)), anchor);
        onPanChange(next.pan);
        onZoomChange(next.zoom);
      }}
    >
      <title id="map-title">{project.map.title || project.project.name}</title>
      <desc id="map-description">United States map with {mappedLocations.length} visible plotted locations across {project.layers.filter((layer) => layer.visible).length} visible layers.</desc>
      <rect
        width={MAP_CANVAS_WIDTH}
        height={MAP_CANVAS_HEIGHT}
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
          setIsPanning(true);
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
      <g transform={groupTransform} data-testid="map-viewport-transform">
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
            const metrics = measureCallout(location.callout);
            const box = calloutBox([0, 0], location.callout, metrics);
            const connector = calloutConnector([0, 0], location.callout, metrics, style.pinSize * 0.55);
            const showCallout = project.map.showLocationLabels
              && location.callout.visible
              && metrics.rows.length > 0;
            const overlapping = overlapLocationIds.has(location.id);
            return (
              <g
                key={location.id}
                className={`map-location${selected ? " is-selected" : ""}`}
                transform={`translate(${x} ${y})`}
                role="button"
                data-layer-id={layer.id}
                data-effective-pin-size={style.pinSize}
                data-effective-pin-type={style.customPinId ? "custom" : style.pinType}
                aria-label={`${primaryCalloutText(location)} in ${layer.name} at ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
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
                {showCallout ? (
                  <g className={`map-callout${overlapping ? " has-overlap" : ""}`} data-location-callout="true">
                    {connector.visible ? (
                      <polyline
                        points={connector.points.map(([pointX, pointY]) => `${pointX},${pointY}`).join(" ")}
                        fill="none"
                        stroke={location.callout.leaderColor}
                        strokeWidth={location.callout.leaderWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        data-callout-leader="true"
                        pointerEvents="none"
                      />
                    ) : null}
                    <g
                      transform={`translate(${location.callout.offsetX} ${location.callout.offsetY})`}
                      role="button"
                      aria-label={`Move labels for ${location.label}`}
                      className="map-callout__content"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectState(null);
                        onSelectLocation(location.id);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        const svg = event.currentTarget.ownerSVGElement;
                        if (!svg) return;
                        svg.setPointerCapture(event.pointerId);
                        draggingLocation.current = null;
                        draggingCallout.current = {
                          id: location.id,
                          start: clientToMap(svg, event.clientX, event.clientY),
                          origin: { x: location.callout.offsetX, y: location.callout.offsetY },
                        };
                        onSelectState(null);
                        onSelectLocation(location.id);
                      }}
                    >
                      <rect
                        x={box.left - location.callout.offsetX - 5}
                        y={box.top - location.callout.offsetY - 4}
                        width={box.width + 10}
                        height={box.height + 8}
                        fill="transparent"
                        stroke={overlapping ? "#c43c1c" : selected ? "#fe5000" : "none"}
                        strokeWidth={overlapping || selected ? 1.5 : 0}
                        strokeDasharray={overlapping ? "3 2" : "4 3"}
                        vectorEffect="non-scaling-stroke"
                        data-editor-only="true"
                      />
                      {metrics.rows.map((row) => {
                        const rowY = -metrics.height / 2 + row.y;
                        return (
                          <g key={row.label.id} data-callout-label-id={row.label.id}>
                            <text
                              data-label-halo="true"
                              aria-hidden="true"
                              x="0"
                              y={rowY}
                              textAnchor={location.callout.anchor}
                              dominantBaseline="hanging"
                              fill={project.map.labelHaloColor}
                              stroke={project.map.labelHaloColor}
                              strokeWidth="2.5"
                              strokeLinejoin="round"
                              fontFamily={`${row.label.fontFamily}, Arial, sans-serif`}
                              fontSize={row.label.fontSize}
                              fontWeight={row.label.fontWeight}
                              pointerEvents="none"
                            >
                              {row.label.text}
                            </text>
                            <text
                              data-label-text="true"
                              x="0"
                              y={rowY}
                              textAnchor={location.callout.anchor}
                              dominantBaseline="hanging"
                              fill={row.label.color}
                              stroke="none"
                              fontFamily={`${row.label.fontFamily}, Arial, sans-serif`}
                              fontSize={row.label.fontSize}
                              fontWeight={row.label.fontWeight}
                              pointerEvents="none"
                            >
                              {row.label.text}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </g>
                ) : null}
              </g>
            );
          })}
            </g>
          ) : null)}
        </g>
      </g>
      {project.map.showLegend && visibleLegendLayers.length > 1 ? (
        <g transform={`translate(54 ${layerLegendTop})`} aria-label="Map layer legend">
          <rect x="0" y="0" width="370" height={layerLegendHeight} fill="#ffffff" stroke="#c8d3ce" strokeWidth="1" />
          <text x="18" y="18" fill="#00662c" fontFamily="Aptos, Arial, sans-serif" fontSize="8" fontWeight="800" letterSpacing="0.8">
            MAP LAYERS
          </text>
          {visibleLegendLayers.map(({ layer, locations, cityCount }, index) => {
            const representative = locations[0];
            const style = { ...effectivePinStyle(project, representative), pinSize: 10 };
            const customPin = style.customPinId ? customPins.get(style.customPinId) : undefined;
            const rowY = 36 + index * 20;
            return (
              <g key={layer.id} data-legend-layer-id={layer.id}>
                <g transform={`translate(18 ${rowY})`}>
                  <PinSymbol location={representative} style={style} customPin={customPin} scopePrefix="legend" />
                </g>
                <text x="34" y={rowY + 3} fill="#373a36" fontFamily="Aptos, Arial, sans-serif" fontSize="9.2" fontWeight="700">
                  {layer.name}
                </text>
                <text x="350" y={rowY + 3} textAnchor="end" fill="#526966" fontFamily="Aptos, Arial, sans-serif" fontSize="8.5" fontWeight="700">
                  {cityCount} {cityCount === 1 ? "city" : "cities"}
                </text>
              </g>
            );
          })}
          <line x1="18" x2="37" y1={layerLegendHeight - 13} y2={layerLegendHeight - 13} stroke={project.map.borderColor} strokeWidth="1.4" />
          <text x="45" y={layerLegendHeight - 9} fill="#526966" fontFamily="Aptos, Arial, sans-serif" fontSize="8.5" fontWeight="600">
            2025 Census geography
          </text>
        </g>
      ) : project.map.showLegend ? (
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

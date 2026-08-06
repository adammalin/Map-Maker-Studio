import { useMemo, useRef } from "react";
import type { Feature, Geometry } from "geojson";
import { effectivePinStyle, visibleLocations } from "../lib/layers";
import { mapPath as path, projection, stateBoundaries, states } from "../lib/map-geometry";
import { MAP_CANVAS_HEIGHT, MAP_CANVAS_WIDTH, panToCanvasPoint, visibleCanvasRect } from "../lib/viewport";
import type { UsaMapProject } from "../types";

interface MapMiniMapProps {
  project: UsaMapProject;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange(pan: { x: number; y: number }): void;
}

export function MapMiniMap({ project, zoom, pan, onPanChange }: MapMiniMapProps) {
  const dragging = useRef<number | null>(null);
  const viewportRect = visibleCanvasRect({ zoom, pan });
  const locations = useMemo(() => visibleLocations(project).map((location) => ({
    location,
    point: projection([location.longitude, location.latitude]),
    color: effectivePinStyle(project, location).pinColor,
  })).filter((entry): entry is typeof entry & { point: [number, number] } => Boolean(entry.point)), [project]);

  function pointerToCanvas(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(MAP_CANVAS_WIDTH, (event.clientX - bounds.left) * (MAP_CANVAS_WIDTH / bounds.width))),
      y: Math.max(0, Math.min(MAP_CANVAS_HEIGHT, (event.clientY - bounds.top) * (MAP_CANVAS_HEIGHT / bounds.height))),
    };
  }

  function recenter(event: React.PointerEvent<SVGSVGElement>) {
    onPanChange(panToCanvasPoint(pointerToCanvas(event), zoom));
  }

  return (
    <div className="map-minimap" data-testid="map-minimap">
      <div className="map-minimap__heading"><span>Navigator</span><strong>{Math.round(zoom * 100)}%</strong></div>
      <svg
        viewBox={`0 0 ${MAP_CANVAS_WIDTH} ${MAP_CANVAS_HEIGHT}`}
        role="img"
        aria-label="Map navigator. Click or drag to recenter the canvas."
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = event.pointerId;
          recenter(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current === event.pointerId) recenter(event);
        }}
        onPointerUp={(event) => {
          dragging.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragging.current = null; }}
      >
        <rect width={MAP_CANVAS_WIDTH} height={MAP_CANVAS_HEIGHT} fill={project.map.backgroundColor} />
        <g aria-hidden="true" pointerEvents="none">
          {states.features.map((state) => (
            <path
              key={state.properties.STATEFP}
              d={path(state as Feature<Geometry>) ?? undefined}
              fill={project.map.stateColors[state.properties.STATEFP] ?? project.map.landColor}
            />
          ))}
          <path d={path(stateBoundaries) ?? undefined} fill="none" stroke={project.map.borderColor} strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
          {locations.map(({ location, point, color }) => <circle key={location.id} cx={point[0]} cy={point[1]} r="6.5" fill={color} stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        </g>
        <rect
          className="map-minimap__viewport"
          data-testid="map-minimap-viewport"
          x={viewportRect.x}
          y={viewportRect.y}
          width={Math.max(2, viewportRect.width)}
          height={Math.max(2, viewportRect.height)}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}

import React, { useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L, { LatLngExpression, LeafletEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][]; // [ [ [lng, lat], ... closed ] ]
};

export interface GeofenceEditorProps {
  center?: LatLngExpression;
  zoom?: number;
  // existing polygons to preload
  polygons?: GeoJsonPolygon[] | null;
  onChange: (polygons: GeoJsonPolygon[] | null) => void;
}

// Helper component to setup Leaflet.Draw controls
const DrawControls: React.FC<{ onChange: (polygons: GeoJsonPolygon[] | null) => void; initial?: GeoJsonPolygon[] | null }>
  = ({ onChange, initial }) => {
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const skipNextSyncRef = useRef(false);

  const emitAll = useCallback(() => {
    try {
      const layers = featureGroupRef.current.getLayers();
      const polys = layers
        .filter((l) => l instanceof L.Polygon)
        .map((l) => layerToPolygon(l as L.Polygon));
      skipNextSyncRef.current = true;
      onChange(polys.length > 0 ? polys : null);
    } catch {
      skipNextSyncRef.current = true;
      onChange(null);
    }
  }, [onChange]);

  useEffect(() => {
    const fg = featureGroupRef.current;
    map.addLayer(fg);

    const drawControl = new (L as any).Control.Draw({
      position: 'topright',
      draw: {
        marker: false,
        circle: false,
        circlemarker: false,
        rectangle: false,
        polyline: false,
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#2563eb' },
        },
      },
      edit: {
        featureGroup: fg,
        edit: true,
        remove: true,
      },
    });

    map.addControl(drawControl);

    const handleCreated = (e: LeafletEvent & { layer: L.Layer }) => {
      const layer = e.layer as L.Polygon;
      fg.addLayer(layer);
      emitAll();
    };

    const handleEdited = () => {
      emitAll();
    };

    const handleDeleted = () => {
      emitAll();
    };

    const DrawNS: any = (L as any).Draw;
    map.on(DrawNS.Event.CREATED as any, handleCreated);
    map.on(DrawNS.Event.EDITED as any, handleEdited);
    map.on(DrawNS.Event.DELETED as any, handleDeleted);

    return () => {
      const DrawNSCleanup: any = (L as any).Draw;
      map.off(DrawNSCleanup.Event.CREATED as any, handleCreated);
      map.off(DrawNSCleanup.Event.EDITED as any, handleEdited);
      map.off(DrawNSCleanup.Event.DELETED as any, handleDeleted);
      map.removeControl(drawControl);
      map.removeLayer(fg);
    };
  }, [map, emitAll]);

  useEffect(() => {
    const fg = featureGroupRef.current;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    // Preload existing polygons or clear if none
    if (Array.isArray(initial) && initial.length > 0) {
      try {
        fg.clearLayers();
        const bounds = L.latLngBounds([]);
        for (const p of initial) {
          if (!p || p.type !== 'Polygon' || !Array.isArray(p.coordinates) || !Array.isArray(p.coordinates[0])) continue;
          const latlngs = p.coordinates[0].map(([lng, lat]) => [lat, lng]) as [number, number][];
          const poly = L.polygon(latlngs, { color: '#2563eb' });
          fg.addLayer(poly);
          try {
            bounds.extend(poly.getBounds());
          } catch {}
        }
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
      } catch {}
    } else {
      try {
        fg.clearLayers();
      } catch {}
    }
  }, [map, initial]);

  return null;
};

function layerToPolygon(layer: L.Polygon): GeoJsonPolygon {
  const latlngs = layer.getLatLngs()[0] as L.LatLng[];
  const coords = latlngs.map((p) => [p.lng, p.lat]);
  // ensure closed ring
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
  return { type: 'Polygon', coordinates: [coords] };
}

const GeofenceEditor: React.FC<GeofenceEditorProps> = ({ center = [ -6.2, 106.8 ], zoom = 12, polygons, onChange }) => {
  const polygonsRef = useRef<GeoJsonPolygon[] | null>(polygons || null);

  return (
    <Box sx={{
      position: 'relative',
      width: '100%',
      height: '100%',
      '& .leaflet-top.leaflet-left': { marginTop: '68px', marginLeft: '12px' },
      '& .leaflet-top.leaflet-right': { marginTop: '68px', marginRight: '12px' }
    }}>
      <MapContainer center={center} zoom={zoom} style={{ width: '100%', height: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FeatureGroup />
        <DrawControls onChange={(p) => { polygonsRef.current = p; onChange(p); }} initial={polygons || null} />
      </MapContainer>
      {/* Imperative save through parent dialog actions: parent will read polygonRef.current via callback */}
      <Box sx={{ display: 'none' }} data-geofence-json={JSON.stringify(polygonsRef.current || null)} />
    </Box>
  );
};

export default GeofenceEditor;

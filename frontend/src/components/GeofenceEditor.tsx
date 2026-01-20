import React, { useEffect, useRef } from 'react';
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
  // existing polygon to preload
  polygon?: GeoJsonPolygon | null;
  onChange: (polygon: GeoJsonPolygon | null) => void;
}

// Helper component to setup Leaflet.Draw controls
const DrawControls: React.FC<{ onChange: (polygon: GeoJsonPolygon | null) => void; initial?: GeoJsonPolygon | null }>
  = ({ onChange, initial }) => {
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const drawnLayerRef = useRef<L.Polygon | null>(null);

  useEffect(() => {
    map.addLayer(featureGroupRef.current);

    // Preload existing polygon or clear if none
    if (initial && initial.type === 'Polygon' && Array.isArray(initial.coordinates)) {
      try {
        const latlngs = initial.coordinates[0].map(([lng, lat]) => [lat, lng]) as [number, number][];
        const poly = L.polygon(latlngs, { color: '#2563eb' });
        featureGroupRef.current.addLayer(poly);
        drawnLayerRef.current = poly;
        map.fitBounds(poly.getBounds(), { padding: [20, 20] });
      } catch {}
    } else {
      try {
        featureGroupRef.current.clearLayers();
        drawnLayerRef.current = null;
        // ensure parent knows it's cleared
        // onChange(null) intentionally not called here to avoid infinite loops; parent already set null
      } catch {}
    }

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
        featureGroup: featureGroupRef.current,
        edit: true,
        remove: true,
      },
    });

    map.addControl(drawControl);

    const handleCreated = (e: LeafletEvent & { layer: L.Layer }) => {
      // Only allow one polygon: clear previous
      featureGroupRef.current.clearLayers();
      const layer = e.layer as L.Polygon;
      featureGroupRef.current.addLayer(layer);
      drawnLayerRef.current = layer;
      onChange(layerToPolygon(layer));
    };

    const handleEdited = () => {
      if (drawnLayerRef.current) onChange(layerToPolygon(drawnLayerRef.current));
    };

    const handleDeleted = () => {
      drawnLayerRef.current = null;
      onChange(null);
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
      map.removeLayer(featureGroupRef.current);
    };
  }, [map, onChange, initial]);

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

const GeofenceEditor: React.FC<GeofenceEditorProps> = ({ center = [ -6.2, 106.8 ], zoom = 12, polygon, onChange }) => {
  const polygonRef = useRef<GeoJsonPolygon | null>(polygon || null);

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
        <DrawControls onChange={(p) => { polygonRef.current = p; onChange(p); }} initial={polygon || null} />
      </MapContainer>
      {/* Imperative save through parent dialog actions: parent will read polygonRef.current via callback */}
      <Box sx={{ display: 'none' }} data-geofence-json={JSON.stringify(polygonRef.current || null)} />
    </Box>
  );
};

export default GeofenceEditor;

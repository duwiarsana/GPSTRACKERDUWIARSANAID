// Simple point-in-polygon check for GeoJSON Polygon (ray casting)
// polygon: [[[lng, lat], ...]] (array of linear rings), first ring is outer boundary
// point: [lng, lat]
function isPointInsidePolygon(polygon, point) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null;
  const [lng, lat] = point;
  const outer = polygon[0];
  if (!Array.isArray(outer) || outer.length < 4) return null;

  let inside = false;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const xi = outer[i][0], yi = outer[i][1];
    const xj = outer[j][0], yj = outer[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

module.exports = { isPointInsidePolygon };

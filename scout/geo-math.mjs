/**
 * Pure geographic maths, with no filesystem or gazetteer dependency.
 *
 * Split out from geocode.mjs so the browser can import the pairing engine
 * directly. The radius control on the board recomputes clusters live using the
 * SAME module the weekly harvester runs, which is the only way to guarantee the
 * number on screen at 60 miles means what the committed data means at 45.
 */

const EARTH_RADIUS_MI = 3958.7613;

/** Great-circle distance in statute miles, or null if either point is unknown. */
export function haversineMiles(a, b) {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line miles understate a real commute. 1.25 is the standard road
 * circuity factor for US metros and 35 mph a conservative mixed arterial/highway
 * average. Always presented as an estimate — this is not a routed drive time.
 */
export function estimatedDriveMinutes(straightLineMiles) {
  if (straightLineMiles == null) return null;
  return Math.round(((straightLineMiles * 1.25) / 35) * 60);
}

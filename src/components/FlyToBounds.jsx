import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Flies/fits the map to a set of [lat, lng] points whenever they change.
 * Lives inside <MapContainer> so it can reach the Leaflet map instance via
 * useMap() without the map itself needing to unmount/remount.
 */
export default function FlyToBounds({
  points,
  fallbackCenter,
  fallbackZoom,
  obscuredRightPx = 0,
  resetSignal,
}) {
  const map = useMap();

  useEffect(() => {
    if (points && points.length > 0) {
      // The side panel overlays the right side of the map without resizing
      // the Leaflet container, so a symmetric fit would center points behind
      // it — pad the right edge extra to keep them in the visible area.
      const paddingTopLeft = [64, 64];
      const paddingBottomRight = [64 + obscuredRightPx, 64];
      // flyToBounds handles a single point fine (zero-area bounds), and
      // keeps the same asymmetric-padding math as the multi-point case.
      map.flyToBounds(points, { paddingTopLeft, paddingBottomRight, duration: 0.75, maxZoom: 13 });
    } else if (fallbackCenter) {
      map.flyTo(fallbackCenter, fallbackZoom ?? 2, { duration: 0.75 });
    }
    // fallbackCenter/fallbackZoom are intentionally NOT dependencies — they
    // update continuously while panning the overview (to remember "return to
    // here" position) and re-flying on every one of those updates would
    // fight the user's own drag. Only an actual points transition (opening/
    // closing a tour) or an explicit resetSignal (the Home button) should
    // trigger a fly; fallbackCenter is just read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points), resetSignal]);

  return null;
}

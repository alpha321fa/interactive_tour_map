import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import FlyToBounds from "./FlyToBounds.jsx";
import { overviewIcon, dayIcon } from "../lib/mapIcons.js";
import { groupDaysByLocation, formatDayLabel } from "../lib/groupDaysByLocation.js";
import { filterOutlierDays } from "../lib/filterOutlierDays.js";

const WORLD_CENTER = [20, 10];
const WORLD_ZOOM = 2;

// Remembers the overview map's pan/zoom position so leaving a focused tour
// can return to where the user actually was, not reset to the world view.
// Only mounted while the overview is showing, so it can't pick up a tour's
// zoomed-in position.
function OverviewPositionTracker({ onChange }) {
  const map = useMapEvents({
    moveend() {
      onChange({ center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() });
    },
  });
  return null;
}

export default function MapView({
  tours,
  focusedTour,
  onSelectTour,
  overviewView,
  onOverviewViewChange,
  resetSignal,
  onDayClick,
}) {
  // Drop days with no specific place to plot — a whole-country geocode
  // fallback (e.g. "Day 6: Farewell Iceland", which has no stop of its own
  // and only resolves at all because "Iceland" is technically geocodable)
  // isn't a real visited location, so it's left out of the map entirely
  // (it still appears in the side panel like any other day) rather than
  // plotted at a country centroid that can skew the view. Separately, drop
  // days whose location is a wild geographic outlier relative to the rest
  // of the tour (e.g. a "Depart/Arrive London" flight day on an otherwise
  // Southeast-Asia-only itinerary) — real, specific data, but plotting it
  // would zoom the whole view out to fit two unrelated regions.
  const specificDays = focusedTour?.days.filter((d) => d.location && !d.location.isCountryFallback) ?? [];
  const resolvedDays = filterOutlierDays(specificDays);
  // The route line traces every (non-outlier) day in order, including
  // revisits to the same place, but pins are grouped by location so two
  // nights in one city show a single "1-2" pin instead of two stacked markers.
  const dayPoints = resolvedDays.map((d) => [d.location.lat, d.location.lng]);
  const locationGroups = groupDaysByLocation(resolvedDays);
  const minDay = resolvedDays.length ? Math.min(...resolvedDays.map((d) => d.dayNumber)) : null;
  const maxDay = resolvedDays.length ? Math.max(...resolvedDays.map((d) => d.dayNumber)) : null;

  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={WORLD_ZOOM}
      minZoom={2}
      maxZoom={19}
      worldCopyJump
      className="tourhub-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains="abc"
        maxZoom={19}
      />

      {!focusedTour && (
        <>
          <OverviewPositionTracker onChange={onOverviewViewChange} />
          <MarkerClusterGroup chunkedLoading spiderfyOnMaxZoom>
            {tours.map((tour) =>
              tour.centroid ? (
                <Marker
                  key={tour.id}
                  position={[tour.centroid.lat, tour.centroid.lng]}
                  icon={overviewIcon}
                  eventHandlers={{ click: () => onSelectTour(tour.id) }}
                >
                  <Tooltip direction="top" offset={[0, -8]}>
                    {tour.title}
                  </Tooltip>
                </Marker>
              ) : null
            )}
          </MarkerClusterGroup>
        </>
      )}

      {focusedTour && (
        <>
          <Polyline positions={dayPoints} pathOptions={{ color: "#e0703f", weight: 4, opacity: 0.9 }} />
          {locationGroups.map((group) => {
            const label = formatDayLabel(group.dayNumbers);
            const isFirst = group.dayNumbers.includes(minDay);
            const isLast = group.dayNumbers.includes(maxDay);
            return (
              <Marker
                key={label}
                position={[group.location.lat, group.location.lng]}
                icon={dayIcon(label, { isFirst, isLast })}
                eventHandlers={{ click: () => onDayClick?.(group.dayNumbers) }}
              >
                <Tooltip direction="top" offset={[0, -12]}>
                  Day {label}: {group.location.name}
                </Tooltip>
                {group.image && (
                  <Popup className="day-popup" offset={[0, -14]} closeButton={false}>
                    <img
                      src={group.image.url}
                      alt={group.image.alt ?? group.location.name}
                      className="day-popup__image"
                      loading="lazy"
                    />
                    {group.image.source === "wikipedia" && (
                      <a
                        className="day-popup__credit"
                        href={group.image.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Photo: Wikipedia
                      </a>
                    )}
                  </Popup>
                )}
              </Marker>
            );
          })}
        </>
      )}

      <FlyToBounds
        points={focusedTour ? dayPoints : null}
        fallbackCenter={overviewView?.center ?? WORLD_CENTER}
        fallbackZoom={overviewView?.zoom ?? WORLD_ZOOM}
        obscuredRightPx={focusedTour ? 420 : 0}
        resetSignal={resetSignal}
      />
    </MapContainer>
  );
}

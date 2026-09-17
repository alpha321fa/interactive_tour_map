import { useState } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { useTours } from "./hooks/useTours.js";
import MapView from "./components/MapView.jsx";
import TourSidePanel from "./components/TourSidePanel.jsx";
import SurpriseMeButton from "./components/SurpriseMeButton.jsx";
import HomeButton from "./components/HomeButton.jsx";

function MapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tours, loading, error } = useTours();
  // Where the overview map was panned/zoomed to before a tour was opened —
  // so closing a tour returns there instead of resetting to the world view.
  const [overviewView, setOverviewView] = useState(null);
  // Bumped only by the Home button, so FlyToBounds re-fires even when
  // already on the overview (a plain overviewView change must NOT trigger a
  // fly on its own, or panning would fight the user's own drag — see
  // FlyToBounds's comment on why fallbackCenter isn't in its deps).
  const [resetSignal, setResetSignal] = useState(0);

  const focusedTour = id ? tours.find((t) => t.id === id) ?? null : null;

  function goHome() {
    setOverviewView(null);
    setResetSignal((n) => n + 1);
    navigate("/");
  }

  return (
    <div className="app-layout">
      <MapView
        tours={tours}
        focusedTour={focusedTour}
        onSelectTour={(tourId) => navigate(`/tour/${tourId}`)}
        overviewView={overviewView}
        onOverviewViewChange={setOverviewView}
        resetSignal={resetSignal}
      />

      {focusedTour && <TourSidePanel tour={focusedTour} onClose={() => navigate("/")} />}

      {!focusedTour && !loading && (
        <SurpriseMeButton tours={tours} onPick={(tourId) => navigate(`/tour/${tourId}`)} />
      )}

      <HomeButton onClick={goHome} />

      {loading && <div className="status-banner">Loading tours…</div>}
      {error && <div className="status-banner status-banner--error">Couldn't load tours.json</div>}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapPage />} />
      <Route path="/tour/:id" element={<MapPage />} />
    </Routes>
  );
}

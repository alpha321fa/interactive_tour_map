import { useEffect, useRef } from "react";

export default function TourSidePanel({ tour, onClose, activeDayNumbers }) {
  const dayRefs = useRef(new Map());

  useEffect(() => {
    if (!activeDayNumbers?.length) return;
    const target = dayRefs.current.get(Math.min(...activeDayNumbers));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeDayNumbers]);

  return (
    <aside className="side-panel">
      <button className="side-panel__close" onClick={onClose} aria-label="Back">
        ← Back
      </button>

      <h1 className="side-panel__title">{tour.title}</h1>
      <div className="side-panel__meta">
        <span>{tour.operator}</span>
        <span aria-hidden="true">·</span>
        <span>{tour.durationDays} days</span>
        {tour.price && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {tour.price.currency} {tour.price.amount}
            </span>
          </>
        )}
      </div>

      <p className="side-panel__vibe">{tour.vibe}</p>

      <ol className="side-panel__days">
        {tour.days.map((day) => (
          <li
            key={day.dayNumber}
            ref={(el) => {
              if (el) dayRefs.current.set(day.dayNumber, el);
              else dayRefs.current.delete(day.dayNumber);
            }}
            className={`side-panel__day${
              activeDayNumbers?.includes(day.dayNumber) ? " side-panel__day--active" : ""
            }`}
          >
            <div className="side-panel__day-heading">
              <span className="side-panel__day-number">{day.dayNumber}</span>
              <span className="side-panel__day-title">{day.title}</span>
            </div>
            {day.description && <p className="side-panel__day-description">{day.description}</p>}
          </li>
        ))}
      </ol>

      <a className="side-panel__source" href={tour.sourceUrl} target="_blank" rel="noreferrer">
        View original listing on Tourhub ↗
      </a>
    </aside>
  );
}

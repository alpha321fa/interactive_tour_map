export default function TourSidePanel({ tour, onClose }) {
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
          <li key={day.dayNumber} className="side-panel__day">
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

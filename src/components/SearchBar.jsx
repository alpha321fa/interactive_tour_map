import { useEffect, useMemo, useRef, useState } from "react";
import { searchTours } from "../lib/searchTours.js";

export default function SearchBar({ tours, onSelect }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const results = useMemo(() => searchTours(tours, query), [tours, query]);
  const showResults = isOpen && results.length > 0;

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(tour) {
    onSelect(tour.id);
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(e) {
    if (!showResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="search-bar" ref={containerRef}>
      <input
        type="text"
        className="search-bar__input"
        placeholder="Search tours…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="Search tours by name"
      />
      {showResults && (
        <ul className="search-bar__results">
          {results.map((tour, index) => (
            <li key={tour.id}>
              <button
                type="button"
                className={`search-bar__result${index === activeIndex ? " search-bar__result--active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(tour)}
              >
                <span className="search-bar__result-title">{tour.title}</span>
                <span className="search-bar__result-meta">
                  {tour.operator} · {tour.region}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SurpriseMeButton({ tours, onPick }) {
  function handleClick() {
    const withCentroid = tours.filter((t) => t.centroid);
    if (!withCentroid.length) return;
    const pick = withCentroid[Math.floor(Math.random() * withCentroid.length)];
    onPick(pick.id);
  }

  return (
    <button className="surprise-me" onClick={handleClick}>
      🎲 Surprise me
    </button>
  );
}

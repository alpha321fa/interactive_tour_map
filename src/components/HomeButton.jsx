export default function HomeButton({ onClick }) {
  return (
    <button className="home-button" onClick={onClick} aria-label="Reset to world view">
      🏠 Home
    </button>
  );
}

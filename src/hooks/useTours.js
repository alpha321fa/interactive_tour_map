import { useEffect, useState } from "react";

export function useTours() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/tours.json")
      .then((res) => {
        if (!res.ok) throw new Error(`failed to load tours.json (${res.status})`);
        return res.json();
      })
      .then((data) => setTours(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  return { tours, loading, error };
}

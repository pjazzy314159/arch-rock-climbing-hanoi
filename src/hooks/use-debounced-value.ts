import { useEffect, useState } from "react";

/**
 * A value that settles after a pause.
 *
 * The route directory asks the backend for a new list every time a filter
 * changes. The search box uses this so that a request is not sent for every
 * keystroke, while the other filters — which are chosen, not typed — are
 * applied at once.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

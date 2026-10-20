import { useEffect, useState } from "react";

/**
 * Whether the React application has finished hydrating.
 *
 * Server-rendered forms submit natively until React takes over. Guarding a
 * submit button with this flag stops a click that lands before hydration from
 * performing a native form submission, which would reload the page and lose
 * what the visitor typed.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

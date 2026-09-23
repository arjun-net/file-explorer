import { useCallback, useState } from "react";

export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // Storage unavailable or corrupt; fall back to the default.
    }
    return initial;
  });

  const setPersisted = useCallback(
    (value: T | ((p: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Ignore quota/availability errors; state still updates in memory.
        }
        return next;
      });
    },
    [key]
  );

  return [state, setPersisted];
}

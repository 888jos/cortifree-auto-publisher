import { useEffect, useState, type DependencyList } from "react";

// Fetch helpers for the Studio's own API routes.

export function getJson<T = any>(path: string): Promise<T> {
  return fetch(path, { cache: "no-store" }).then((response) => response.json());
}

// Like getJson, but a non-2xx response rejects with "API <status>".
export async function getJsonOk<T = any>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export function postJson(path: string, body: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Runs `load` whenever `deps` change while `enabled`, tracking a loading flag
 * and reporting failures through `onError`. Values are applied by `load`
 * itself, so the previous data stays visible while a reload is in flight.
 */
export function useApi(enabled: boolean, deps: DependencyList, load: () => Promise<void>, onError: () => void) {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    load()
      .catch(onError)
      .finally(() => setLoading(false));
    // `deps` is the caller's dependency list; load/onError are recreated each render.
  }, deps);
  return loading;
}

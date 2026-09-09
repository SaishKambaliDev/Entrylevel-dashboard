import { useEffect, useState } from "react";

const PREFERENCES_KEY = "jansamadhanPreferences";
const defaults = { theme: "light", language: "en", textScale: "normal" };

function readPreferences() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}") };
  } catch (_error) {
    return defaults;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  useEffect(() => { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); }, [preferences]);
  const updatePreferences = (updates) => setPreferences((current) => ({ ...current, ...updates }));
  return [preferences, updatePreferences];
}

export function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem("jansamadhanUser") || "null"); } catch (_error) { return null; }
}

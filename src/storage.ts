import type { EID, EventMeta, State } from "./types";

const KEY_INDEX = "liftwin:index";
const KEY_EVENT_PREFIX = "liftwin:event:";
const KEY_THEME = "liftwin:theme";
const KEY_LAST_OPEN = "liftwin:lastOpen";

export function eventKey(eid: EID) {
  return `${KEY_EVENT_PREFIX}${eid}`;
}

export function loadIndex(): EventMeta[] {
  try {
    const s = localStorage.getItem(KEY_INDEX);
    return s ? (JSON.parse(s) as EventMeta[]) : [];
  } catch {
    return [];
  }
}

export function saveIndex(list: EventMeta[]) {
  try {
    localStorage.setItem(KEY_INDEX, JSON.stringify(list));
  } catch {}
}

export function loadEvent(eid: EID): State | null {
  try {
    const s = localStorage.getItem(eventKey(eid));
    return s ? (JSON.parse(s) as State) : null;
  } catch {
    return null;
  }
}

export function saveEvent(eid: EID, state: State) {
  try {
    localStorage.setItem(eventKey(eid), JSON.stringify(state));
  } catch {}
}

export function deleteEvent(eid: EID) {
  try {
    localStorage.removeItem(eventKey(eid));
  } catch {}
}

export function setLastOpen(eid: EID | null) {
  try {
    if (eid) localStorage.setItem(KEY_LAST_OPEN, eid);
    else localStorage.removeItem(KEY_LAST_OPEN);
  } catch {}
}

export function getLastOpen(): EID | null {
  try {
    return localStorage.getItem(KEY_LAST_OPEN);
  } catch {
    return null;
  }
}

export function getTheme(): "light" | "dark" {
  try {
    const saved = (localStorage.getItem(KEY_THEME) as "light" | "dark" | null) ?? null;
    if (saved) return saved;
  } catch {}
  // default from OS
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme: "light" | "dark") {
  try {
    localStorage.setItem(KEY_THEME, theme);
  } catch {}
}

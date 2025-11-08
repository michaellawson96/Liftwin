import { useEffect, useRef, useState } from "react";
import type { EID, EventMeta, State } from "./types";
import EventManager from "./EventManager";
import EventView from "./EventView";
import {
  getLastOpen,
  getTheme,
  loadEvent,
  loadIndex,
  saveEvent,
  saveIndex,
  setLastOpen,
  setTheme,
  deleteEvent as rmEvent,
} from "./storage";
import { makeEventKey, readEventKey } from "./eventKey";

const defaultState: State = {
  title: "Monthly Meet",
  pointsPreset: "F1",
  pointsCustom: [10, 7, 5, 3, 2, 1],
  athletes: [
    { id: uid(), name: "Alex", sex: "M", age: 30, bodyweight: 85, squat: null, bench: null, deadlift: null, runTime: "" },
    { id: uid(), name: "Blake", sex: "F", age: 28, bodyweight: 62, squat: null, bench: null, deadlift: null, runTime: "" },
  ],
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function newEid(): EID {
  return crypto.randomUUID();
}

type Mode = "manager" | "event";

export default function App() {
  const [theme, setThemeState] = useState<"light" | "dark">(getTheme());
  const [mode, setMode] = useState<Mode>("manager");
  const [index, setIndex] = useState<EventMeta[]>([]);
  const [currentEid, setCurrentEid] = useState<EID | null>(null);
  const [currentState, setCurrentState] = useState<State | null>(null);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function applyTheme(t: "light" | "dark") {
    setThemeState(t);
    setTheme(t);
  }

  // Boot: load index, import from #k if present, else open last
  useEffect(() => {
    const list = loadIndex();
    setIndex(list);

    const importFromHash = () => {
      const m = location.hash.match(/[#&]k=([^&]+)/);
      if (!m) return false;
      const key = decodeURIComponent(m[1]);
      const payload = readEventKey<{ eid?: EID; state?: State }>(key);
      if (!payload?.state) return false;
      const imported = addOrForkEvent(payload);
      // Clean hash, open event
      history.replaceState({}, "", location.pathname + location.search);
      openEvent(imported.eid);
      return true;
    };

    const didImport = importFromHash();
    if (!didImport) {
      const last = getLastOpen();
      if (last && loadEvent(last)) openEvent(last);
      else setMode("manager");
    }
  }, []);

  // Debounced autosave when editing an event
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!currentEid || !currentState) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      // Save state
      saveEvent(currentEid, currentState);
      // Update index meta
      setIndex((list) => {
        const now = Date.now();
        const next = [...list];
        const i = next.findIndex((m) => m.eid === currentEid);
        if (i >= 0) {
          next[i] = { ...next[i], title: currentState.title, updatedAt: now };
        } else {
          next.push({ eid: currentEid, title: currentState.title, createdAt: now, updatedAt: now });
        }
        saveIndex(next);
        return next;
      });
    }, 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [currentEid, currentState]);

  // Wrapper setter to satisfy EventView (non-null State)
  const setEventState = (up: State | ((prev: State) => State)) => {
    setCurrentState((prev) => {
      const safePrev = prev as State;
      return typeof up === "function" ? (up as (p: State) => State)(safePrev) : up;
    });
  };

  // ---------- Manager actions ----------
  function createEvent(title?: string) {
    const eid = newEid();
    const state: State = { ...defaultState, title: title?.trim() || "Monthly Meet", athletes: [] };
    const now = Date.now();
    saveEvent(eid, state);
    const meta: EventMeta = { eid, title: state.title, createdAt: now, updatedAt: now };
    const next = [meta, ...index];
    setIndex(next);
    saveIndex(next);
    openEvent(eid);
  }

  function openEvent(eid: EID) {
    const st = loadEvent(eid) ?? { ...defaultState, athletes: [] };
    setCurrentEid(eid);
    setCurrentState(st);
    setMode("event");
    setLastOpen(eid);
  }

  function deleteEvent(eid: EID) {
    const meta = index.find((m) => m.eid === eid);
    if (!meta) return;
    if (!confirm(`Delete event "${meta.title}"? This cannot be undone.`)) return;
    rmEvent(eid);
    const next = index.filter((m) => m.eid !== eid);
    setIndex(next);
    saveIndex(next);
    if (currentEid === eid) {
      setCurrentEid(null);
      setCurrentState(null);
      setMode("manager");
      setLastOpen(null);
    }
  }

  // Build & copy a long share link (#k=base64)
  function copyShareLink(eid: EID) {
    const st = loadEvent(eid);
    if (!st) return alert("Couldn't load event from storage.");
    const key = makeEventKey({ eid, state: st });
    const link = `${location.origin}${location.pathname}#k=${encodeURIComponent(key)}`;
    navigator.clipboard?.writeText(link);
    alert("Share link copied to clipboard.");
  }

  function addOrForkEvent(payload: { eid?: EID; state?: State }): { eid: EID; state: State } {
    const incomingState = payload.state!;
    const incomingEid = payload.eid ?? newEid();

    const existing = loadEvent(incomingEid);
    if (!existing) {
      saveEvent(incomingEid, incomingState);
      const now = Date.now();
      const meta: EventMeta = { eid: incomingEid, title: incomingState.title, createdAt: now, updatedAt: now };
      const next = [meta, ...index];
      setIndex(next);
      saveIndex(next);
      return { eid: incomingEid, state: incomingState };
    }

    if (JSON.stringify(existing) === JSON.stringify(incomingState)) {
      return { eid: incomingEid, state: existing };
    } else {
      const eid = newEid();
      saveEvent(eid, incomingState);
      const now = Date.now();
      const meta: EventMeta = { eid, title: incomingState.title, createdAt: now, updatedAt: now };
      const next = [meta, ...index];
      setIndex(next);
      saveIndex(next);
      return { eid, state: incomingState };
    }
  }

  return mode === "manager" ? (
    <EventManager
      events={index}
      onNew={(title) => createEvent(title)}
      onOpen={openEvent}
      onDelete={deleteEvent}
      onCopyLink={copyShareLink}
      theme={theme}
      setTheme={applyTheme}
    />
  ) : currentState && currentEid ? (
    <EventView
      state={currentState}
      setState={setEventState}
      onBack={() => setMode("manager")}
      onCopyLink={() => copyShareLink(currentEid)}
    />
  ) : null;
}
import { useEffect, useMemo, useState } from "react";

/** Monthly Meet Scorer (DOTS + 5k time)
 * - Strength: DOTS from Sex (M/F) + Bodyweight kg + (Squat+Bench+Deadlift)
 * - 5k: rank by raw time (faster is better) using a neutral time index
 * - Event code (GUID) in URL hash + localStorage per event
 * - Export/Import JSON, Export CSV
 */

const LS_KEY = "meet-scorer-v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function parseTimeToSeconds(time: string): number | null {
  if (!time) return null;
  const parts = time.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || isNaN(Number(p)))) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}
function toNumber(n: any): number | null {
  if (n === "" || n === null || n === undefined) return null;
  const v = Number(n);
  return isNaN(v) ? null : v;
}

// 5k: neutral performance index from raw time (higher = better)
function runPerformanceIndex(seconds: number | null): number | null {
  if (!seconds || seconds <= 0) return null;
  return 780 / seconds; // anchored to 13:00 = 780s
}

/** ---------- DOTS (built-in) ----------
 * DOTS = (600 / (A + Bx + Cx^2 + Dx^3 + Ex^4 + Fx^5)) * Total
 * x = bodyweight (kg), separate coefficients by sex
 */
type SexDOTS = "M" | "F";
const DOTS_COEFF: Record<SexDOTS, { A: number; B: number; C: number; D: number; E: number; F: number }> = {
  M: { A: 47.46178854, B: 8.472061379, C: 0.07369410346, D: -0.001395833811, E: 0.00000707665973070743, F: -0.0000000120804336482315 },
  F: { A: -125.4255398, B: 13.71219419, C: -0.03307250631, D: -0.001050400051, E: 0.00000938773881462799, F: -0.000000023334613884954 },
};
function dotsPoints(totalKg: number | null, bodyweightKg: number | null, sex: "M" | "F" | "X"): number | null {
  if (!totalKg || !bodyweightKg || bodyweightKg <= 0) return null;
  const s: SexDOTS | null = sex === "F" ? "F" : sex === "M" ? "M" : null; // require M or F
  if (!s) return null;
  const { A, B, C, D, E, F } = DOTS_COEFF[s];
  const x = bodyweightKg;
  const denom = A + B * x + C * x ** 2 + D * x ** 3 + E * x ** 4 + F * x ** 5;
  if (!isFinite(denom) || denom === 0) return null;
  return (600 / denom) * totalKg;
}

// Points allocation with ties: equal scores share average of place-points
function allocatePointsByRank(
  sortedScores: Array<{ id: string; score: number | null }>,
  pointsTable: number[]
) {
  const result: Record<string, number> = {};
  let i = 0;
  while (i < sortedScores.length) {
    const current = sortedScores[i];
    if (current.score === null) {
      for (let j = i; j < sortedScores.length; j++) result[sortedScores[j].id] = 0;
      break;
    }
    let j = i + 1;
    while (j < sortedScores.length && sortedScores[j].score === current.score) j++;
    let sum = 0;
    for (let k = i; k < j; k++) sum += pointsTable[k] ?? 0;
    const perHead = sum / (j - i);
    for (let k = i; k < j; k++) result[sortedScores[k].id] = perHead;
    i = j;
  }
  return result;
}

/** ---------- Types ---------- */
interface Athlete {
  id: string;
  name: string;
  sex: "M" | "F" | "X";
  age: number | null;
  bodyweight: number | null; // kg
  squat: number | null; // kg
  bench: number | null; // kg
  deadlift: number | null; // kg
  runTime: string; // hh:mm:ss | mm:ss | ss
}
interface State {
  title: string;
  pointsPreset: "F1" | "Simple" | "Custom";
  pointsCustom: number[];
  athletes: Athlete[];
}

const defaultState: State = {
  title: "Monthly Meet",
  pointsPreset: "F1",
  pointsCustom: [10, 7, 5, 3, 2, 1],
  athletes: [
    { id: uid(), name: "Alex", sex: "M", age: 30, bodyweight: 85, squat: null, bench: null, deadlift: null, runTime: "" },
    { id: uid(), name: "Blake", sex: "F", age: 28, bodyweight: 62, squat: null, bench: null, deadlift: null, runTime: "" },
  ],
};

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SIMPLE_POINTS = [10, 7, 5, 3, 2, 1];

export default function App() {
  // --- Event / routing (GUID in URL hash) ---
  const initialEventId = (() => {
    const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
    const match = /event=([A-Za-z0-9-]+)/.exec(h || "");
    return match ? match[1] : crypto.randomUUID();
  })();
  const [eventId, setEventId] = useState<string>(initialEventId);
  const keyFor = (id: string) => `${LS_KEY}:${id}`;

  const [state, setState] = useState<State>(() => {
    try {
      const saved = localStorage.getItem(keyFor(initialEventId));
      return saved ? JSON.parse(saved) : defaultState;
    } catch {
      return defaultState;
    }
  });

  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = `event=${eventId}`;
      window.history.replaceState({}, "", url.toString());
    }
  }, [eventId]);

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(eventId), JSON.stringify(state));
    } catch {}
  }, [state, eventId]);

  const pointsTable = useMemo(() => {
    if (state.pointsPreset === "F1") return F1_POINTS;
    if (state.pointsPreset === "Simple") return SIMPLE_POINTS;
    return state.pointsCustom.length ? state.pointsCustom : SIMPLE_POINTS;
  }, [state.pointsPreset, state.pointsCustom]);

  const totals = useMemo(() => {
    return state.athletes.map((a) => ({
      id: a.id,
      name: a.name,
      sex: a.sex,
      age: a.age,
      bodyweight: a.bodyweight,
      squat: a.squat,
      bench: a.bench,
      deadlift: a.deadlift,
      total: (a.squat ?? 0) + (a.bench ?? 0) + (a.deadlift ?? 0),
      runSeconds: parseTimeToSeconds(a.runTime),
    }));
  }, [state.athletes]);

  // Strength event scored by DOTS
  const plScores = useMemo(() => {
    const rows = totals.map((t) => {
      const score = dotsPoints(t.total, t.bodyweight ?? null, t.sex as any);
      return { id: t.id, name: t.name, score };
    });
    rows.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return (b.score as number) - (a.score as number);
    });
    const points = allocatePointsByRank(rows, pointsTable);
    return { rows, points } as const;
  }, [totals, pointsTable]);

  // 5k event (time-only)
  const runScores = useMemo(() => {
    const rows = totals.map((t) => {
      const score = runPerformanceIndex(t.runSeconds ?? null);
      return { id: t.id, name: t.name, score };
    });
    rows.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return (b.score as number) - (a.score as number);
    });
    const points = allocatePointsByRank(rows, pointsTable);
    return { rows, points } as const;
  }, [totals, pointsTable]);

  const leaderboard = useMemo(() => {
    const map: Record<string, { name: string; totalPoints: number; breakdown: { pl: number; run: number } }> = {};
    state.athletes.forEach((a) => {
      map[a.id] = { name: a.name, totalPoints: 0, breakdown: { pl: 0, run: 0 } };
    });
    Object.entries(plScores.points).forEach(([id, pts]) => {
      map[id].breakdown.pl += pts;
      map[id].totalPoints += pts;
    });
    Object.entries(runScores.points).forEach(([id, pts]) => {
      map[id].breakdown.run += pts;
      map[id].totalPoints += pts;
    });
    const rows = Object.entries(map).map(([id, v]) => ({ id, ...v }));
    rows.sort((a, b) => b.totalPoints - a.totalPoints);
    return rows;
  }, [state.athletes, plScores.points, runScores.points]);

  // Mutators
  function updateAthlete(id: string, patch: Partial<Athlete>) {
    setState((s) => ({
      ...s,
      athletes: s.athletes.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }
  function addAthlete() {
    setState((s) => ({
      ...s,
      athletes: [
        ...s.athletes,
        { id: uid(), name: "New Athlete", sex: "M", age: null, bodyweight: null, squat: null, bench: null, deadlift: null, runTime: "" },
      ],
    }));
  }
  function removeAthlete(id: string) {
    setState((s) => ({ ...s, athletes: s.athletes.filter((a) => a.id !== id) }));
  }
  function clearNumbers() {
    if (!confirm("Clear all numeric entries? This keeps names but wipes results.")) return;
    setState((s) => ({
      ...s,
      athletes: s.athletes.map((a) => ({
        ...a,
        squat: null,
        bench: null,
        deadlift: null,
        runTime: "",
      })),
    }));
  }

  // Export / Import
  function exportJSON() {
    const payload = { eventId, state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meet-${eventId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportCSV() {
    const headers = ["Place", "Athlete", "StrengthPts", "5kPts", "TotalPts"];
    const rows = leaderboard.map((r, i) => [
      (i + 1).toString(),
      r.name,
      r.breakdown.pl.toFixed(1),
      r.breakdown.run.toFixed(1),
      r.totalPoints.toFixed(1),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${(c as string).replace?.(/"/g, '""') ?? c}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaderboard-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importJSON(file: File) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !data.state) {
      alert("Invalid file.");
      return;
    }
    setEventId(data.eventId || crypto.randomUUID());
    setState(data.state);
  }
  function newEvent() {
    const id = crypto.randomUUID();
    setEventId(id);
    setState({ ...defaultState, title: "Monthly Meet", athletes: [] });
  }
  function loadEventByCode() {
    const code = prompt("Enter event code (GUID):", "");
    if (!code) return;
    const saved = localStorage.getItem(keyFor(code));
    if (!saved) {
      alert("No local data for that code on this device. If you have a JSON export, use Import.");
      return;
    }
    setEventId(code);
    setState(JSON.parse(saved));
  }
  function shareLink() {
    const link = `${location.origin}${location.pathname}#event=${eventId}`;
    navigator.clipboard?.writeText(link);
    alert(
      `Event link copied to clipboard:
${link}
(Data is saved only in this browser for this event code. Use Export/Import to move devices.)`
    );
  }

  function currentPointsTable(): number[] {
    const n = state.athletes.length;
    const base = pointsTable;
    if (base.length >= n) return base.slice(0, n);
    return [...base, ...Array(Math.max(0, n - base.length)).fill(0)];
  }
  const activePointsTable = currentPointsTable();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto text-slate-200">
      {/* Header / actions */}
      <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold">{state.title}</h1>
          <p className="text-xs md:text-sm opacity-80">
            Event code: <span className="font-mono">{eventId}</span>
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={shareLink} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm">
              Copy share link
            </button>
            <button onClick={newEvent} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">
              New event
            </button>
            <button onClick={loadEventByCode} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">
              Load by code
            </button>
            <button onClick={() => setShowHelp((v) => !v)} className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm">
              {showHelp ? "Hide" : "Show"} help
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 w-56"
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            placeholder="Event title"
            aria-label="Event title"
          />
          <button onClick={addAthlete} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500" title="Add athlete">
            Add athlete
          </button>
          <button onClick={clearNumbers} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600" title="Clear numeric results">
            Clear results
          </button>
        </div>
      </div>

      {/* Help / how-to */}
      {showHelp && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm leading-6">
          <div className="font-semibold mb-2">How to use</div>
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>Enter each person:</b> Name, <b>Sex</b> (<u>M or F</u> for DOTS), <b>Bodyweight (kg)</b>, and best single <b>Squat</b>, <b>Bench</b>, <b>Deadlift</b> for the month.</li>
            <li><b>5k time:</b> Type <code>mm:ss</code> or <code>hh:mm:ss</code>. The 5k event ranks by time (faster = better).</li>
            <li><b>Points:</b> Choose F1 (25-18-15-…) or Simple (10-7-5-…). Custom lets you paste your own comma-separated list.</li>
            <li><b>Save/share:</b> Data stays in this browser for the shown event code. Use <b>Export JSON</b> to move devices; <b>Export CSV</b> for podiums.</li>
          </ol>
          <div className="mt-3 text-xs opacity-80">
            Note: DOTS requires <b>M</b> or <b>F</b>; if set to <b>X</b> (or missing bodyweight/any lift), that athlete won’t score in strength.
          </div>
        </div>
      )}

      {/* Config */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-semibold mb-2">Points preset</h2>
          <div className="flex items-center gap-2 mb-3">
            <select
              className="bg-slate-800 border border-slate-700 rounded px-2 py-2 w-full"
              value={state.pointsPreset}
              onChange={(e) => setState((s) => ({ ...s, pointsPreset: e.target.value as any }))}
            >
              <option value="F1">F1 (25-18-15-12-10-8-6-4-2-1)</option>
              <option value="Simple">Simple (10-7-5-3-2-1)</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          {state.pointsPreset === "Custom" && (
            <div className="space-y-2">
              <p className="text-xs opacity-80">Comma-separated points (top to bottom places)</p>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2"
                value={state.pointsCustom.join(", ")}
                onChange={(e) => {
                  const nums = e.target.value.split(",").map((s) => toNumber(s.trim()) ?? 0);
                  setState((s) => ({ ...s, pointsCustom: nums }));
                }}
                placeholder="e.g. 10, 7, 5, 3, 2, 1"
              />
            </div>
          )}
          <p className="mt-3 text-xs opacity-80">Active table for {state.athletes.length} entrants: {activePointsTable.join("-")}</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-semibold mb-2">Strength scoring</h2>
          <p className="text-sm">Uses <b>DOTS</b> from <b>Sex (M/F)</b>, <b>Bodyweight kg</b>, and <b>Total</b> (S+B+D).</p>
          <p className="text-xs opacity-80 mt-2">Tip: enter the <i>best</i> lifts achieved in the month.</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-semibold mb-2">5k scoring</h2>
          <p className="text-sm">Ranks by raw time only. Enter time as <code>mm:ss</code> (or <code>hh:mm:ss</code>).</p>
          <p className="text-xs opacity-80 mt-2">We convert time to a neutral index internally to apply the points table.</p>
        </div>
      </div>

      {/* Athletes (mobile cards) */}
      <div className="md:hidden space-y-3 mb-6">
        {state.athletes.map((a) => (
          <div key={a.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex justify-between items-center mb-2">
              <input
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 w-56"
                value={a.name}
                onChange={(e) => updateAthlete(a.id, { name: e.target.value })}
                placeholder="Name"
                aria-label="Name"
              />
              <button onClick={() => removeAthlete(a.id)} className="ml-2 px-2 py-1 bg-rose-700/80 hover:bg-rose-600 rounded text-sm">Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="bg-slate-800 border border-slate-700 rounded px-2 py-2"
                value={a.sex}
                onChange={(e) => updateAthlete(a.id, { sex: e.target.value as any })}
                aria-label="Sex"
                title="DOTS requires M or F"
              >
                <option value="M">Sex: M</option>
                <option value="F">Sex: F</option>
                <option value="X">Sex: X (no DOTS)</option>
              </select>
              <input
                type="number"
                inputMode="decimal"
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2"
                value={a.bodyweight ?? ""}
                onChange={(e) => updateAthlete(a.id, { bodyweight: toNumber(e.target.value) })}
                placeholder="BW kg"
                aria-label="Bodyweight in kg"
              />
              <input
                type="number"
                inputMode="decimal"
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2"
                value={a.squat ?? ""}
                onChange={(e) => updateAthlete(a.id, { squat: toNumber(e.target.value) })}
                placeholder="Squat kg"
                aria-label="Squat in kg"
              />
              <input
                type="number"
                inputMode="decimal"
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2"
                value={a.bench ?? ""}
                onChange={(e) => updateAthlete(a.id, { bench: toNumber(e.target.value) })}
                placeholder="Bench kg"
                aria-label="Bench in kg"
              />
              <input
                type="number"
                inputMode="decimal"
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2"
                value={a.deadlift ?? ""}
                onChange={(e) => updateAthlete(a.id, { deadlift: toNumber(e.target.value) })}
                placeholder="Deadlift kg"
                aria-label="Deadlift in kg"
              />
              <input
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2"
                value={a.runTime}
                onChange={(e) => updateAthlete(a.id, { runTime: e.target.value })}
                placeholder="5k time mm:ss"
                aria-label="5k time"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Athletes (desktop table) */}
      <div className="hidden md:block bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-8 overflow-x-auto">
        <h2 className="font-semibold mb-4">Entrants</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left opacity-80">
            <tr>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Sex</th>
              <th className="py-2 pr-3">Age</th>
              <th className="py-2 pr-3">BW (kg)</th>
              <th className="py-2 pr-3">Squat</th>
              <th className="py-2 pr-3">Bench</th>
              <th className="py-2 pr-3">Deadlift</th>
              <th className="py-2 pr-3">5k Time</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {state.athletes.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="py-2 pr-3">
                  <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-40" value={a.name} onChange={(e) => updateAthlete(a.id, { name: e.target.value })} placeholder="Name" />
                </td>
                <td className="py-2 pr-3">
                  <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1" value={a.sex} onChange={(e) => updateAthlete(a.id, { sex: e.target.value as any })} title="DOTS requires M or F">
                    <option value="M">M</option>
                    <option value="F">F</option>
                    <option value="X">X (no DOTS)</option>
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-20" value={a.age ?? ""} onChange={(e) => updateAthlete(a.id, { age: toNumber(e.target.value) })} placeholder="Age" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" value={a.bodyweight ?? ""} onChange={(e) => updateAthlete(a.id, { bodyweight: toNumber(e.target.value) })} placeholder="kg" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" value={a.squat ?? ""} onChange={(e) => updateAthlete(a.id, { squat: toNumber(e.target.value) })} placeholder="kg" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" value={a.bench ?? ""} onChange={(e) => updateAthlete(a.id, { bench: toNumber(e.target.value) })} placeholder="kg" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" value={a.deadlift ?? ""} onChange={(e) => updateAthlete(a.id, { deadlift: toNumber(e.target.value) })} placeholder="kg" />
                </td>
                <td className="py-2 pr-3">
                  <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-28" value={a.runTime} onChange={(e) => updateAthlete(a.id, { runTime: e.target.value })} placeholder="mm:ss" />
                </td>
                <td className="py-2 pr-3">
                  <button onClick={() => removeAthlete(a.id)} className="px-2 py-1 bg-rose-700/80 hover:bg-rose-600 rounded">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={exportJSON} className="px-3 py-2 rounded bg-indigo-700 hover:bg-indigo-600">Export JSON</button>
          <button onClick={exportCSV} className="px-3 py-2 rounded bg-indigo-700 hover:bg-indigo-600">Export CSV (leaderboard)</button>
          <label className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 cursor-pointer">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJSON(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <p className="text-xs opacity-70 mt-3">
          Tip • Data stays <b>in this browser</b> under your event code. Use Export/Import to move devices.
        </p>
      </div>

      {/* Event rankings */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Strength event (total S+B+D)</h2>
          <RankingTable rows={plScores.rows} points={plScores.points} note={"Ranking by DOTS points (auto)."} />
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="font-semibold mb-3">5k event</h2>
          <RankingTable rows={runScores.rows} points={runScores.points} note={"Ranking by 5k time (faster is better)."} />
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <h2 className="font-semibold mb-3">Monthly leaderboard</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left opacity-80">
            <tr>
              <th className="py-2 pr-3">Place</th>
              <th className="py-2 pr-3">Athlete</th>
              <th className="py-2 pr-3">Strength pts</th>
              <th className="py-2 pr-3">5k pts</th>
              <th className="py-2 pr-3">Total pts</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row, idx) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="py-2 pr-3">{idx + 1}</td>
                <td className="py-2 pr-3">{row.name}</td>
                <td className="py-2 pr-3">{row.breakdown.pl.toFixed(1)}</td>
                <td className="py-2 pr-3">{row.breakdown.run.toFixed(1)}</td>
                <td className="py-2 pr-3 font-semibold">{row.totalPoints.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs opacity-70 mt-3">Ties share the average of the tied places’ points.</p>
      </div>

      <div className="mt-6 text-xs opacity-80 leading-relaxed">
        <p className="mb-1 font-semibold">Scoring recap</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>DOTS</b> from Sex (M/F), Bodyweight kg, and total (S+B+D).</li>
          <li><b>5k</b> ranks by raw time; we convert time to an index to apply your points table.</li>
        </ul>
      </div>
    </div>
  );
}

function RankingTable({
  rows,
  points,
  note,
}: {
  rows: { id: string; name: string; score: number | null }[];
  points: Record<string, number>;
  note: string;
}) {
  return (
    <div>
      <table className="min-w-full text-sm">
        <thead className="text-left opacity-80">
          <tr>
            <th className="py-2 pr-3">Place</th>
            <th className="py-2 pr-3">Athlete</th>
            <th className="py-2 pr-3">Score</th>
            <th className="py-2 pr-3">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className="border-t border-slate-800">
              <td className="py-2 pr-3">{idx + 1}</td>
              <td className="py-2 pr-3">{r.name}</td>
              <td className="py-2 pr-3">{r.score === null ? "—" : r.score.toFixed(3)}</td>
              <td className="py-2 pr-3 font-semibold">{points[r.id]?.toFixed(1) ?? "0.0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs opacity-70 mt-3">{note}</p>
    </div>
  );
}

import { useMemo } from "react";
import type { Athlete, State } from "./types";

// ===== Util helpers (DOTS, time parsing, points) =====
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

// 5k: neutral performance index (higher = better)
function runPerformanceIndex(seconds: number | null): number | null {
  if (!seconds || seconds <= 0) return null;
  return 780 / seconds;
}

type SexDOTS = "M" | "F";
const DOTS_COEFF: Record<SexDOTS, { A: number; B: number; C: number; D: number; E: number; F: number }> = {
  M: { A: 47.46178854, B: 8.472061379, C: 0.07369410346, D: -0.001395833811, E: 0.00000707665973070743, F: -0.0000000120804336482315 },
  F: { A: -125.4255398, B: 13.71219419, C: -0.03307250631, D: -0.001050400051, E: 0.00000938773881462799, F: -0.000000023334613884954 },
};
function dotsPoints(totalKg: number | null, bodyweightKg: number | null, sex: "M" | "F" | "X"): number | null {
  if (!totalKg || !bodyweightKg || bodyweightKg <= 0) return null;
  const s: SexDOTS | null = sex === "F" ? "F" : sex === "M" ? "M" : null;
  if (!s) return null;
  const { A, B, C, D, E, F } = DOTS_COEFF[s];
  const x = bodyweightKg;
  const denom = A + B * x + C * x ** 2 + D * x ** 3 + E * x ** 4 + F * x ** 5;
  if (!isFinite(denom) || denom === 0) return null;
  return (600 / denom) * totalKg;
}

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

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SIMPLE_POINTS = [10, 7, 5, 3, 2, 1];

export default function EventView({
  state,
  setState,
  onBack,
  onCopyLink,
}: {
  state: State;
  setState: (s: State | ((prev: State) => State)) => void;
  onBack: () => void;
  onCopyLink: () => void;
}) {
  // Points table
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

  const activePointsTable = useMemo(() => {
    const n = state.athletes.length;
    if (pointsTable.length >= n) return pointsTable.slice(0, n);
    return [...pointsTable, ...Array(Math.max(0, n - pointsTable.length)).fill(0)];
  }, [pointsTable, state.athletes.length]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header / actions */}
        <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold">{state.title}</h1>
            <p className="text-xs md:text-sm opacity-80">
              <button onClick={onBack} className="underline hover:opacity-80">Back to events</button>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 w-56"
              value={state.title}
              onChange={(e) => setState({ ...state, title: e.target.value })}
              placeholder="Event title"
              aria-label="Event title"
            />
            <button onClick={addAthlete} className="px-3 py-2 rounded-lg bg-[var(--ok)] hover:bg-[var(--okHover)] text-white" title="Add athlete">
              Add athlete
            </button>
            <button onClick={clearNumbers} className="px-3 py-2 rounded-lg bg-[var(--mutedBtn)] hover:bg-[var(--mutedBtnHover)]" title="Clear numeric results">
              Clear results
            </button>
            <button onClick={onCopyLink} className="px-3 py-2 rounded-lg bg-[var(--mutedBtn)] hover:bg-[var(--mutedBtnHover)]" title="Copy share link">
              Copy share link
            </button>
          </div>
        </div>

        {/* Help / how-to */}
        <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm leading-6">
          <div className="font-semibold mb-2">How to use</div>
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>Enter each person:</b> Name, <b>Sex</b> (<u>M or F</u> for DOTS), <b>Bodyweight (kg)</b>, and best single <b>Squat</b>, <b>Bench</b>, <b>Deadlift</b> for the month.</li>
            <li><b>5k time:</b> Type <code>mm:ss</code> or <code>hh:mm:ss</code>. The 5k event ranks by time (faster = better).</li>
            <li><b>Points:</b> Choose F1 (25-18-15-…) or Simple (10-7-5-…). Custom lets you paste your own comma-separated list.</li>
          </ol>
          <div className="mt-3 text-xs opacity-80">
            Note: DOTS requires <b>M</b> or <b>F</b>; if set to <b>X</b> (or missing bodyweight/any lift), that athlete won’t score in strength.
          </div>
        </div>

        {/* Athletes - Desktop table (keep your mobile cards if added) */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 mb-8 overflow-x-auto">
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
                <tr key={a.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">
                    <input className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-40" value={a.name} onChange={(e) => updateAthlete(a.id, { name: e.target.value })} placeholder="Name" />
                  </td>
                  <td className="py-2 pr-3">
                    <select className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1" value={a.sex} onChange={(e) => updateAthlete(a.id, { sex: e.target.value as any })} title="DOTS requires M or F">
                      <option value="M">M</option>
                      <option value="F">F</option>
                      <option value="X">X (no DOTS)</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-20" value={a.age ?? ""} onChange={(e) => updateAthlete(a.id, { age: toNumber(e.target.value) })} placeholder="Age" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-24" value={a.bodyweight ?? ""} onChange={(e) => updateAthlete(a.id, { bodyweight: toNumber(e.target.value) })} placeholder="kg" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-24" value={a.squat ?? ""} onChange={(e) => updateAthlete(a.id, { squat: toNumber(e.target.value) })} placeholder="kg" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-24" value={a.bench ?? ""} onChange={(e) => updateAthlete(a.id, { bench: toNumber(e.target.value) })} placeholder="kg" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-24" value={a.deadlift ?? ""} onChange={(e) => updateAthlete(a.id, { deadlift: toNumber(e.target.value) })} placeholder="kg" />
                  </td>
                  <td className="py-2 pr-3">
                    <input className="bg-[var(--input)] border border-[var(--border)] rounded px-2 py-1 w-28" value={a.runTime} onChange={(e) => updateAthlete(a.id, { runTime: e.target.value })} placeholder="mm:ss" />
                  </td>
                  <td className="py-2 pr-3">
                    <button onClick={() => removeAthlete(a.id)} className="px-2 py-1 bg-[var(--danger)] hover:bg-[var(--dangerHover)] text-white rounded">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs opacity-70 mt-3">
            Data autosaves. Ties share the average of the tied places’ points.
          </p>
        </div>

        {/* Rankings */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Strength event (total S+B+D)</h2>
            <RankingTable rows={plScores.rows} points={plScores.points} note={"Ranking by DOTS points (auto)."} />
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
            <h2 className="font-semibold mb-3">5k event</h2>
            <RankingTable rows={runScores.rows} points={runScores.points} note={"Ranking by 5k time (faster is better)."} />
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
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
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">{idx + 1}</td>
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3">{row.breakdown.pl.toFixed(1)}</td>
                  <td className="py-2 pr-3">{row.breakdown.run.toFixed(1)}</td>
                  <td className="py-2 pr-3 font-semibold">{row.totalPoints.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 text-xs opacity-80 leading-relaxed">
            <p className="mb-1 font-semibold">Scoring recap</p>
            <ul className="list-disc ml-5 space-y-1">
              <li><b>DOTS</b> from Sex (M/F), Bodyweight kg, and total (S+B+D).</li>
              <li><b>5k</b> ranks by raw time; we convert time to a neutral index to apply your points table.</li>
            </ul>
          </div>
        </div>
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
            <tr key={r.id} className="border-t border-[var(--border)]">
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

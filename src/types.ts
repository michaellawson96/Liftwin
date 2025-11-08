export type EID = string;

export interface Athlete {
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

export interface State {
  title: string;
  pointsPreset: "F1" | "Simple" | "Custom";
  pointsCustom: number[];
  athletes: Athlete[];
}

export interface EventMeta {
  eid: EID;
  title: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

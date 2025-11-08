import type { EID, State } from "./types";

// Base64 encode/decode of { eid, state }, Unicode-safe
export function makeEventKey(payload: { eid: EID; state: State }): string {
  const enc = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  for (let i = 0; i < enc.length; i++) bin += String.fromCharCode(enc[i]);
  return btoa(bin);
}

export function readEventKey<T = { eid?: EID; state?: State }>(key: string): T | null {
  try {
    const bin = atob(key.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Optional: extract #k=... from a full URL string
export function extractKeyFromUrl(text: string): string | null {
  try {
    const m = text.match(/[#&]k=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

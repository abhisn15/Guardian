// Talks to the GUARDIAN agent API.
//
// In production the API is a serverless function on the same origin, so a
// relative path is correct. In local development the agent server runs
// separately on :8787. Hardcoding either one breaks the other.
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:8787" : "");

export async function health() {
  // The deployed function has no health route; a cheap OPTIONS on the cycle
  // endpoint tells us whether an API exists without spending a run.
  const url = BASE ? `${BASE}/api/health` : "/api/cycle";
  const res = await fetch(url, {
    method: BASE ? "GET" : "OPTIONS",
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok && res.status !== 204) throw new Error(`API ${res.status}`);
  return { ok: true };
}

export async function lastTranscript() {
  if (!BASE) return { transcript: null }; // serverless keeps no state between calls
  const res = await fetch(`${BASE}/api/transcript`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function runCycle({ inject = false } = {}) {
  const res = await fetch(`${BASE}/api/cycle${inject ? "?inject=1" : ""}`, {
    method: "POST",
    // Five model calls plus an on-chain transaction.
    signal: AbortSignal.timeout(120000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.transcript) throw new Error(body.error || `API ${res.status}`);
  return body.transcript;
}

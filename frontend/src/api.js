// Talks to the local GUARDIAN API. The agents hold private keys and an LLM key,
// so their reasoning runs server-side; the browser only asks and displays.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8787";

export async function health() {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function lastTranscript() {
  const res = await fetch(`${BASE}/api/transcript`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function runCycle({ inject = false } = {}) {
  const res = await fetch(`${BASE}/api/cycle${inject ? "?inject=1" : ""}`, {
    method: "POST",
    // A full cycle is five LLM calls plus on-chain transactions.
    signal: AbortSignal.timeout(240000),
  });
  const body = await res.json();
  if (!res.ok && !body.transcript) throw new Error(body.error || `API ${res.status}`);
  return body.transcript;
}

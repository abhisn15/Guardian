// Moderation for audience-submitted text.
//
// This runs at a public event co-hosted by a government ministry, and every
// submission lands on a projector. Unfiltered strangers' text on a large screen
// is a real reputational risk, not a hypothetical one.
//
// Deliberately conservative: it is far better to reject a harmless payload than
// to display one slur. Attackers who get filtered can simply rephrase.

const MAX_HANDLE = 20;
const MAX_PAYLOAD = 500;

// Indonesian and English. Substring matching on purpose — evasion by padding is
// possible, but this is a 3-minute demo, not a content platform. The kill
// switch (§ clearDisplay on the client) covers what slips through.
const BLOCKED = [
  "anjing", "bangsat", "kontol", "memek", "ngentot", "pepek", "jancok", "asu",
  "babi", "bajingan", "goblok", "tolol", "keparat", "brengsek", "pelacur", "lonte",
  "fuck", "shit", "bitch", "cunt", "nigger", "faggot", "rape", "nazi", "hitler",
  "kill yourself", "kys",
];

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const ADDR_RE = /0x[a-fA-F0-9]{40}/g;

// The one address an attacker is allowed to name — the designated drain target.
export const ATTACKER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

// Substring matching is not safe here: "asu" sits inside "tre-asu-ry", so a
// naive filter rejects anyone who writes the word "treasury" — which is
// everyone attacking a treasury. So: whole-word matching for everything, plus
// space-stripped matching for an explicit list where padding evasion ("f u c k")
// is likely and a coincidental collision is not. "babi" is excluded from that
// list precisely because it hides inside "babies".
const SQUASH_MATCH = new Set([
  "fuck", "bitch", "cunt", "nigger", "faggot",
  "ngentot", "kontol", "memek", "bangsat", "jancok", "pelacur", "bajingan",
]);

function containsBlocked(text) {
  const flat = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ") // defeat padding like f_u_c_k, keep word breaks
    .replace(/\s+/g, " ")
    .trim();
  const squashed = flat.replace(/ /g, "");

  return BLOCKED.some((w) => {
    const bounded = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (bounded.test(flat)) return true;
    return SQUASH_MATCH.has(w) && squashed.includes(w.replace(/ /g, ""));
  });
}

// Does this text even try to move money?
//
// At an event, plenty of people will type "asdasd" or ask a question. Those come
// back as "the model refused", which is technically true and completely
// unhelpful — it reads as the app being broken rather than as their input not
// being an attack. Telling them apart lets us coach instead of shrug.
const INTENT = /\b(transfer|send|sent|withdraw|drain|pay|payment|move|remit|wire|steal|empty|balance|treasury|fund|mon\b|wallet|0x[a-f0-9]{6,})/i;

export function looksLikeAttack(payload) {
  const p = String(payload ?? "");
  if (p.trim().length < 12) return false;
  return INTENT.test(p);
}

export function moderate({ handle, payload }) {
  const h = String(handle ?? "").trim();
  const p = String(payload ?? "").trim();

  if (!h) return { ok: false, reason: "Pick a handle so your attempt can be attributed." };
  if (h.length > MAX_HANDLE) return { ok: false, reason: `Handle is limited to ${MAX_HANDLE} characters.` };
  if (!p) return { ok: false, reason: "Write an instruction to send the research agent." };
  if (p.length > MAX_PAYLOAD) return { ok: false, reason: `Payload is limited to ${MAX_PAYLOAD} characters.` };

  if (containsBlocked(h) || containsBlocked(p)) {
    return { ok: false, reason: "That wording will not go on a public screen. Rephrase and try again." };
  }

  // Strip links, and any address other than the designated target — so nobody
  // can use the projector to advertise a wallet.
  const cleanPayload = p
    .replace(URL_RE, "[link removed]")
    .replace(ADDR_RE, (m) => (m.toLowerCase() === ATTACKER_ADDRESS.toLowerCase() ? m : "[address removed]"));

  // Handles are display-only: keep them boring.
  const cleanHandle = h.replace(/[^\w \-.@]/g, "").slice(0, MAX_HANDLE) || "anon";

  return { ok: true, handle: cleanHandle, payload: cleanPayload };
}

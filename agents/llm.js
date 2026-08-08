// Klien LLM tipis buat Groq. Sengaja tanpa SDK: satu endpoint, satu fungsi.
require("dotenv").config({ quiet: true });

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Research Agent (yang menelan data tak tepercaya) sengaja pakai model kecil:
// lebih gampang dibobol prompt injection, jadi demonya JUJUR — kami tidak
// menyembunyikan kelemahan model di balik model besar. Poinnya justru itu:
// guard-nya harus tetap menahan walau model-nya kalah.
const MODEL_WEAK = "llama-3.1-8b-instant";
const MODEL_STRONG = "llama-3.3-70b-versatile";

async function ask({ system, user, model = MODEL_WEAK, temperature = 0.2 }) {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diisi di .env");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/// Minta jawaban JSON. LLM kecil sering membungkus JSON dengan prosa atau
/// pagar markdown, jadi kita tarik objek pertama yang terlihat.
async function askJson(opts) {
  const raw = await ask(opts);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { _unparsed: raw };
  try {
    return { ...JSON.parse(match[0]), _raw: raw };
  } catch {
    return { _unparsed: raw };
  }
}

module.exports = { ask, askJson, MODEL_WEAK, MODEL_STRONG };

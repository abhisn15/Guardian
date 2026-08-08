import { useState } from "react";

// The transparency panel: what each agent actually received, actually produced,
// and what the chain did about it. Raw model output is shown verbatim — a
// summary here would defeat the purpose, because the claim being demonstrated
// is that the reasoning chain really was hijacked.

const FLAG_STYLE = {
  HIJACKED: "text-alarm border-alarm/40 bg-alarm-wash",
  RESISTED: "text-pass border-pass/30 bg-pass-wash",
  BLOCKED: "text-alarm border-alarm/40 bg-alarm-wash",
  EXECUTED: "text-pass border-pass/30 bg-pass-wash",
  ERROR: "text-warn border-warn/40 bg-warn-wash",
};

export default function ReasoningTrace({ transcript, busy, explorer }) {
  return (
    <section className="border border-rule bg-surface min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule bg-sunken gap-3">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted m-0">
          Agent Reasoning Trace
        </h2>
        {transcript && (
          <span className="font-mono text-[9.5px] text-faint tnum">
            {(transcript.durationMs / 1000).toFixed(1)}s · {transcript.steps.length} steps
          </span>
        )}
      </div>

      {busy && <Running />}

      {!busy && !transcript && (
        <p className="px-4 py-8 font-mono text-[11px] text-faint text-center m-0">
          No activity yet. Run a decision cycle to begin.
        </p>
      )}

      {!busy && transcript?.failed && (
        <p className="px-4 py-6 font-mono text-[11px] text-alarm m-0">Cycle failed: {transcript.error}</p>
      )}

      {!busy && transcript && !transcript.failed && (
        <>
          <Verdict transcript={transcript} />
          <ol className="m-0 p-0 list-none divide-y divide-rule">
            {transcript.steps.map((step, i) => (
              <Step key={i} index={i + 1} step={step} explorer={explorer} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Running() {
  return (
    <div className="px-4 py-8 flex flex-col items-center gap-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-probe alarm-dot"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
      <p className="font-mono text-[10.5px] text-muted m-0">
        Five agents reasoning, then settling on-chain…
      </p>
    </div>
  );
}

function Verdict({ transcript }) {
  const t = transcript;
  const blocked = t.verdict?.outcome === "BLOCKED";

  // The headline claim, stated plainly: the chain of reasoning was compromised
  // and the money did not move anyway.
  const headline = t.injected
    ? t.hijacked
      ? blocked
        ? "Reasoning chain hijacked. Funds held."
        : "Reasoning chain hijacked."
      : "Payload rejected by the model this run."
    : blocked
      ? "Transfer stopped by the guard."
      : "Clean cycle.";

  const tone = t.injected && t.hijacked && blocked ? "alarm" : blocked ? "warn" : "pass";
  const border = { alarm: "border-alarm/40", warn: "border-warn/40", pass: "border-pass/30" }[tone];
  const wash = { alarm: "bg-alarm-wash", warn: "bg-warn-wash", pass: "bg-pass-wash" }[tone];
  const text = { alarm: "text-alarm", warn: "text-warn", pass: "text-pass" }[tone];

  return (
    <div className={`px-4 py-3 border-b ${border} ${wash} flex flex-wrap items-baseline gap-x-5 gap-y-1`}>
      <span className={`font-sans text-[13px] font-semibold ${text}`}>{headline}</span>
      <span className="font-mono text-[10.5px] text-muted tnum">
        Treasury {Number(t.vaultBefore).toFixed(3)} → {Number(t.vaultAfter).toFixed(3)} MON
      </span>
      {t.verdict?.reason && (
        <span className="font-mono text-[10.5px] text-muted">reason {t.verdict.reason}</span>
      )}
    </div>
  );
}

function Step({ index, step, explorer }) {
  const [open, setOpen] = useState(step.flag === "HIJACKED" || step.flag === "BLOCKED");

  return (
    <li className={step.flag === "HIJACKED" || step.flag === "BLOCKED" ? "bg-alarm-wash/40" : ""}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-sunken/70 transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <span className="font-mono text-[9.5px] text-faint tnum w-4 shrink-0">{index}</span>

        <span className="font-mono text-[10px] font-medium w-[86px] shrink-0 truncate">{step.agent}</span>

        <span
          className={`font-mono text-[8.5px] px-1 py-0.5 border shrink-0 ${
            step.onchain ? "text-probe border-probe/30 bg-probe-wash" : "text-faint border-rule bg-sunken"
          }`}
        >
          {step.onchain ? "ON-CHAIN" : "OFF-CHAIN"}
        </span>

        <span className="text-[12px] flex-1 min-w-0 truncate">{step.title}</span>

        {step.flag && (
          <span className={`font-mono text-[8.5px] px-1.5 py-0.5 border shrink-0 ${FLAG_STYLE[step.flag]}`}>
            {step.flag}
          </span>
        )}

        <span className="font-mono text-[10px] text-faint shrink-0">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-4 pb-3.5 pl-11 flex flex-col gap-2">
          {step.input && (
            <Field label="input">
              <span className="text-muted">{step.input}</span>
            </Field>
          )}
          <Field label="output">
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-ink bg-sunken border border-rule px-2.5 py-2 max-h-56 overflow-auto">
              {step.output}
            </pre>
          </Field>
          {step.txHash && (
            <a
              href={`${explorer}/tx/${step.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] text-probe hover:underline underline-offset-2 self-start"
            >
              view on explorer ↗
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <div className="font-mono text-[10.5px]">{children}</div>
    </div>
  );
}

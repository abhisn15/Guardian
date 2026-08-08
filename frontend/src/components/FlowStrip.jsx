// The five-agent chain, drawn as a chain.
//
// A list of steps tells you what happened; this shows the hand-off — which
// agent passed what to whom, and exactly where the guard interrupted it. When
// a run is hijacked, the compromise enters at one node and travels right until
// the on-chain node stops it. That path is the whole argument, so it should be
// visible without reading.

const CHAIN = [
  { role: "RESEARCH", short: "Research", note: "reads untrusted data" },
  { role: "TREASURY", short: "CFO", note: "decides" },
  { role: "PAYMENT", short: "Executor", note: "signs & calls", alt: "INVESTMENT" },
  { role: "__GUARD__", short: "Guardian", note: "on-chain check" },
  { role: "REPORTING", short: "Reporting", note: "summarises" },
];

export default function FlowStrip({ transcript }) {
  const stepsBy = new Map();
  for (const s of transcript?.steps ?? []) {
    // The executor node covers whichever of Payment/Investment ran, and the
    // guard node reflects the on-chain call's outcome.
    if (s.onchain) stepsBy.set("__GUARD__", s);
    else if (!stepsBy.has(s.agent)) stepsBy.set(s.agent, s);
  }

  const stateOf = (node) => {
    const step = stepsBy.get(node.role) ?? (node.alt ? stepsBy.get(node.alt) : null);
    if (!step) return { tone: "idle", label: null };
    if (step.flag === "HIJACKED") return { tone: "alarm", label: "hijacked" };
    if (step.flag === "BLOCKED") return { tone: "alarm", label: "blocked" };
    if (step.flag === "EXECUTED") return { tone: "pass", label: "passed" };
    if (step.flag === "RESISTED") return { tone: "pass", label: "resisted" };
    if (step.flag === "ERROR") return { tone: "warn", label: "error" };
    return { tone: "done", label: null };
  };

  // Everything downstream of a hijack is carrying poisoned input.
  const hijackAt = CHAIN.findIndex((n) => stepsBy.get(n.role)?.flag === "HIJACKED");
  const guardAt = CHAIN.findIndex((n) => n.role === "__GUARD__");
  const contaminated = (i) => hijackAt !== -1 && i > hijackAt && i <= guardAt;

  const DOT = {
    idle: "bg-rule-strong",
    done: "bg-probe",
    pass: "bg-pass",
    warn: "bg-warn",
    alarm: "bg-alarm",
  };
  const TEXT = {
    idle: "text-faint",
    done: "text-ink",
    pass: "text-pass",
    warn: "text-warn",
    alarm: "text-alarm",
  };

  return (
    <div className="px-4 py-3 border-b border-rule bg-sunken/60 overflow-x-auto">
      <ol className="flex items-start gap-0 m-0 p-0 list-none min-w-[560px]">
        {CHAIN.map((node, i) => {
          const { tone, label } = stateOf(node);
          const isGuard = node.role === "__GUARD__";

          return (
            <li key={node.role} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 min-w-0 px-1">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${DOT[tone]} ${
                    tone === "alarm" ? "alarm-dot" : ""
                  } ${isGuard ? "ring-2 ring-offset-2 ring-offset-ground ring-rule-strong" : ""}`}
                />
                <span
                  className={`font-mono text-[9.5px] tracking-wide truncate max-w-full ${TEXT[tone]}`}
                >
                  {node.short}
                </span>
                <span className="font-mono text-[8px] text-faint truncate max-w-full text-center leading-tight">
                  {label ?? node.note}
                </span>
              </div>

              {i < CHAIN.length - 1 && (
                <span
                  className={`h-px flex-1 mt-[3.5px] min-w-3 ${
                    contaminated(i + 1) ? "bg-alarm/50" : tone === "idle" ? "bg-rule" : "bg-rule-strong"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

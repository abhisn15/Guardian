const FAILURES = [
  {
    label: "Static thresholds",
    detail: "Cannot catch twenty small transfers that each sit under the limit.",
  },
  {
    label: "Off-chain monitoring",
    detail: "Detects and alerts, but responds in 30–60s and trusts a third-party relayer.",
  },
  {
    label: "Manual multisig",
    detail: "Responds in minutes. The agent transacts every second.",
  },
];

const LAYERS = [
  {
    n: "01",
    title: "Static layer",
    body: "A per-transaction ceiling and a daily budget, held per agent. This is the fallback — blunt, cheap, and reliable.",
    codes: ["EXCEEDS_TX_LIMIT", "EXCEEDS_DAILY_BUDGET"],
  },
  {
    n: "02",
    title: "Behavioural layer",
    body: "Each agent carries a baseline of its own past behaviour, updated on every interaction. Deviation from that baseline freezes the agent — and every later transfer is refused, no matter how small.",
    codes: ["VELOCITY_SPIKE", "BURST_PATTERN", "AMOUNT_DEVIATION"],
  },
];

const MONAD = [
  {
    title: "State is per-address, never a global counter",
    body: "A shared counter would make every agent action touch the same slot, forcing Monad to serialise execution and erasing the parallelism. Payment can freeze while Investment keeps running.",
  },
  {
    title: "The baseline fits one 32-byte slot",
    body: "Cold storage costs ~8,100 gas here, roughly 4× Ethereum. A bloated struct would make the guard too expensive to be worth running.",
  },
  {
    title: "No public global mempool",
    body: "An off-chain guard has no interception point. On-chain, in the execution path, is the only architecture that actually works.",
  },
  {
    title: "Gas is charged on the limit, not on usage",
    body: "An attacker hammering a frozen agent burns MON on every attempt. The economic deterrent is free.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="border-b border-rule">
      <div className="max-w-[1180px] mx-auto px-6 py-16 md:py-20 flex flex-col gap-16">
        {/* ---- problem ---- */}
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="font-display text-[clamp(1.7rem,3.4vw,2.5rem)] leading-[1.05] tracking-[-0.03em] font-bold m-0 mt-3 max-w-[18ch] text-balance">
              A treasury run by agents fails from the inside.
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-[14.5px] leading-relaxed text-muted m-0">
              Prompt injection, a bug, or plain faulty reasoning is enough. The agent still holds valid
              keys, so nothing about the transaction looks wrong. Every existing defence breaks at the
              same point:
            </p>
            <ul className="m-0 p-0 list-none flex flex-col divide-y divide-rule border-y border-rule">
              {FAILURES.map((f) => (
                <li key={f.label} className="py-3 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="font-mono text-[11px] text-alarm w-[160px] shrink-0">{f.label}</span>
                  <span className="text-[13px] text-muted flex-1 min-w-[220px]">{f.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---- the two layers ---- */}
        <div>
          <Eyebrow>Two layers, before funds move</Eyebrow>
          <div className="grid gap-px bg-rule border border-rule mt-4 md:grid-cols-2">
            {LAYERS.map((l) => (
              <div key={l.n} className="bg-ground p-6 flex flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-probe tnum">{l.n}</span>
                  <h3 className="font-sans text-[16px] font-semibold m-0 tracking-[-0.01em]">{l.title}</h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-muted m-0">{l.body}</p>
                <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                  {l.codes.map((c) => (
                    <span
                      key={c}
                      className="font-mono text-[9.5px] px-1.5 py-1 border border-rule-strong text-faint"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---- separation of duty ---- */}
        <div className="border border-rule bg-surface p-6 md:p-8">
          <Eyebrow>Why the roles are real</Eyebrow>
          <p className="text-[14.5px] leading-relaxed text-muted m-0 mt-3 max-w-[72ch]">
            Each of the five agents holds its own on-chain address. The guard checks{" "}
            <code className="font-mono text-[13px] text-ink bg-raised px-1.5 py-0.5">msg.sender</code> —
            never a role the backend claims. So a compromised backend cannot promote a read-only Research
            Agent into one that moves money. Separation of duty is cryptographic, not advisory.
          </p>
        </div>

        {/* ---- why monad ---- */}
        <div>
          <Eyebrow>Why this needs Monad</Eyebrow>
          <div className="grid gap-px bg-rule border border-rule mt-4 sm:grid-cols-2">
            {MONAD.map((m) => (
              <div key={m.title} className="bg-ground p-5 flex flex-col gap-2">
                <h3 className="font-sans text-[14px] font-semibold m-0 tracking-[-0.01em]">{m.title}</h3>
                <p className="text-[13px] leading-relaxed text-muted m-0">{m.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ---- honesty ---- */}
        <div className="border-l-2 border-warn pl-5">
          <Eyebrow>What is not solved</Eyebrow>
          <p className="text-[14px] leading-relaxed text-muted m-0 mt-2.5 max-w-[74ch]">
            False-positive calibration is unresolved. The thresholds here are starting points, not
            validated numbers — a legitimate agent that suddenly gets busy can be frozen. That is an
            inherent tension in behavioural guarding, not an oversight: a guard that never
            false-positives almost certainly never catches anything either. There is also no unfreeze
            flow, deliberately. Deciding who may lift a freeze is a governance question, and it should
            not be answered in a hurry.
          </p>
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ children }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{children}</span>
  );
}

import { shortAddr } from "../chain";

// Read-only roles never hold transfer keys. That is the structural defence:
// even a fully hijacked LLM cannot move funds from an address that was never
// permitted to.
const READ_ONLY = new Set(["RESEARCH", "REPORTING"]);

const LIMITS = {
  TREASURY: "10 / 60 MON",
  RESEARCH: "read-only",
  INVESTMENT: "10 / 40 MON",
  PAYMENT: "2 / 20 MON",
  REPORTING: "read-only",
};

// Portraits give each agent an identity you can recognise across the page, which
// matters once one of them is frozen and the others are not. Served from
// /public rather than bundled: 128px WebP, ~8 KB each.
const PORTRAIT = {
  TREASURY: "/agents/treasury.webp",
  RESEARCH: "/agents/research.webp",
  INVESTMENT: "/agents/investment.webp",
  PAYMENT: "/agents/payment.webp",
  REPORTING: "/agents/reporting.webp",
};

export default function AgentRoster({ agents, explorer }) {
  return (
    <section className="border border-rule bg-surface">
      <Header>Agent Organization</Header>

      {agents.length === 0 ? (
        <p className="px-4 py-6 font-mono text-[11px] text-faint m-0">No agents registered.</p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-rule">
          {agents.map((a) => (
            <AgentRow key={a.role} agent={a} explorer={explorer} />
          ))}
        </ul>
      )}

      <div className="border-t border-rule px-4 py-3">
        <p className="font-mono text-[10px] leading-relaxed text-muted m-0">
          Each agent holds its own on-chain address. The guard checks{" "}
          <span className="text-ink">msg.sender</span>, never a role supplied by the backend — which is
          what makes separation of duty cryptographic rather than advisory.
        </p>
      </div>
    </section>
  );
}

function AgentRow({ agent, explorer }) {
  const readOnly = READ_ONLY.has(agent.role);
  const frozen = agent.frozen;

  const state = frozen ? "FROZEN" : readOnly ? "READ-ONLY" : "ACTIVE";
  const tone = frozen
    ? "text-alarm border-alarm/40 bg-alarm-wash"
    : readOnly
      ? "text-muted border-rule bg-sunken"
      : "text-pass border-pass/30 bg-pass-wash";

  return (
    <li className={`px-4 py-3 ${frozen ? "bg-alarm-wash/60" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {PORTRAIT[agent.role] && (
            <img
              src={PORTRAIT[agent.role]}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              // A frozen agent drains of colour — the roster should read at a
              // glance without anyone parsing the status pill.
              className={`w-11 h-11 shrink-0 border border-rule object-cover transition-all duration-300 ${
                frozen ? "grayscale opacity-45" : ""
              }`}
            />
          )}
          <div className="min-w-0">
            <div className="font-sans text-[13px] font-semibold leading-tight">{agent.role}</div>
            <a
              href={`${explorer}/address/${agent.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] text-faint hover:text-probe underline decoration-rule underline-offset-2"
            >
              {shortAddr(agent.address)}
            </a>
          </div>
        </div>
        <span
          className={`shrink-0 font-mono text-[9px] tracking-wide px-1.5 py-0.5 border inline-flex items-center gap-1 ${tone}`}
        >
          {frozen && <span className="w-1 h-1 rounded-full bg-current alarm-dot" />}
          {state}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 m-0 font-mono text-[10px]">
        <Metric label="limit tx/day" value={LIMITS[agent.role] ?? "—"} />
        <Metric label="window" value={agent.txCountWindow ?? "—"} />
        <Metric label="spent" value={agent.spent !== undefined ? Number(agent.spent).toFixed(2) : "—"} />
      </dl>
    </li>
  );
}

function Metric({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[8.5px] uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="m-0 tnum text-ink truncate">{value}</dd>
    </div>
  );
}

function Header({ children }) {
  return (
    <h2 className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted m-0 px-4 py-2.5 border-b border-rule bg-sunken">
      {children}
    </h2>
  );
}

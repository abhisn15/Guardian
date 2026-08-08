import { ADDR, ROLES, shortAddr } from "../chain";

const TONE = {
  pass: "border-l-pass",
  warn: "border-l-warn",
  alarm: "border-l-alarm",
};

const TEXT = {
  pass: "text-pass",
  warn: "text-warn",
  alarm: "text-alarm",
};

// Raw bytes32 reason codes are for machines. People get sentences.
const READABLE = {
  EXCEEDS_TX_LIMIT: "exceeds transaction limit",
  EXCEEDS_DAILY_BUDGET: "exceeds daily budget",
  VELOCITY_SPIKE: "velocity spike",
  BURST_PATTERN: "burst pattern",
  AMOUNT_DEVIATION: "amount deviation",
  AGENT_FROZEN: "agent is frozen",
  READ_ONLY_ROLE: "read-only role",
  NOT_REGISTERED: "not registered",
};

function humanise(detail) {
  return detail.replace(/[A-Z_]{4,}/g, (code) => READABLE[code] ?? code.toLowerCase());
}

function roleOf(address) {
  const match = ROLES.find((r) => ADDR.agents[r]?.toLowerCase() === address?.toLowerCase());
  return match ?? shortAddr(address);
}

export default function ActivityFeed({ events, rpcError, explorer }) {
  return (
    <section className="border border-rule bg-surface min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rule bg-sunken gap-3">
        <h2 className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted m-0">Activity Feed</h2>
        <span className="font-mono text-[9.5px] text-faint">on-chain · live</span>
      </div>

      {rpcError && (
        <p className="px-4 py-2 font-mono text-[10px] text-warn bg-warn-wash border-b border-rule m-0">
          RPC: {rpcError}
        </p>
      )}

      {events.length === 0 ? (
        <p className="px-4 py-8 font-mono text-[11px] text-faint text-center m-0">
          No activity yet. Run a decision cycle to begin.
        </p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-rule max-h-[420px] overflow-auto">
          {events.map((e) => (
            <li
              key={e.key}
              className={`pl-3 pr-4 py-2 border-l-2 ${TONE[e.tone]} flex flex-wrap items-baseline gap-x-4 gap-y-0.5`}
            >
              <span className="font-mono text-[9.5px] text-faint tnum w-[68px] shrink-0">
                {e.block.toLocaleString()}
              </span>
              <span className={`font-mono text-[10px] font-medium w-[128px] shrink-0 ${TEXT[e.tone]}`}>
                {e.title}
              </span>
              <span className="font-mono text-[10px] w-[92px] shrink-0 truncate">{roleOf(e.agent)}</span>
              <span className="font-mono text-[10px] text-muted flex-1 min-w-[120px]">
                {humanise(e.detail)}
              </span>
              <a
                href={`${explorer}/tx/${e.hash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9.5px] text-faint hover:text-probe underline decoration-rule underline-offset-2 shrink-0"
              >
                proof ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

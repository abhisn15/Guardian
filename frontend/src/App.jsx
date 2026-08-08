import { useEffect, useState, useCallback, useRef } from "react";
import { formatEther } from "ethers";
import { ADDR, EXPLORER, ROLES, guardian, treasury, provider, b32, shortAddr } from "./chain";
import * as api from "./api";
import sampleTranscript from "./sample-transcript.json";
import { useWallet } from "./useWallet";
import Header from "./components/Header";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Arena from "./components/Arena";
import seedAttempts from "./seed-attempts.json";
import AgentRoster from "./components/AgentRoster";
import ReasoningTrace from "./components/ReasoningTrace";
import ActivityFeed from "./components/ActivityFeed";

// The public RPC rate-limits per IP, and every visitor polls independently. A
// 4s tick with a deep backfill tripped 429s as soon as more than a couple of
// people had the page open — which at a public event is the normal case, not
// the edge case.
const POLL_MS = 9000;
// The RPC rejects getLogs spans beyond ~100 blocks. At ~300ms per block one
// chunk is roughly 27 seconds, so four chunks is about two minutes of backfill
// — enough to show a run that just happened without hammering it on load.
const CHUNK = 90;
const HISTORY_CHUNKS = 4;
// On a 429, back off rather than retrying straight into the same wall.
const BACKOFF_MAX_MS = 90000;

export default function App() {
  const [agents, setAgents] = useState([]);
  const [vault, setVault] = useState(null);
  const [events, setEvents] = useState([]);
  const [blockNo, setBlockNo] = useState(null);
  const [rpcError, setRpcError] = useState(null);

  const [transcript, setTranscript] = useState(null);
  const [busy, setBusy] = useState(false);
  const [apiUp, setApiUp] = useState(null);
  const [notice, setNotice] = useState(null);

  // Seeded so the board is never empty — a demo that opens on "no attempts yet"
  // fails visibly if the room is slow to scan.
  const [attempts, setAttempts] = useState(seedAttempts);
  const [attackBusy, setAttackBusy] = useState(false);
  const [attackError, setAttackError] = useState(null);

  const seen = useRef(new Set());
  const cursor = useRef(null);
  const wallet = useWallet();

  const jump = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ---------- chain reads ----------

  const refreshAgents = useCallback(async () => {
    const rows = await Promise.all(
      ROLES.map(async (role) => {
        const address = ADDR.agents[role];
        try {
          const [baseline, spent] = await Promise.all([
            guardian.baselineOf(address),
            guardian.spentToday(address),
          ]);
          return {
            role,
            address,
            frozen: (BigInt(baseline.flags) & 1n) === 1n,
            txCountWindow: Number(baseline.txCountWindow),
            spent: formatEther(spent),
          };
        } catch {
          // Rate-limited for a moment: keep the last good reading rather than
          // blanking the panel mid-demo.
          return null;
        }
      })
    );
    setAgents((prev) => rows.map((r, i) => r ?? prev[i] ?? { role: ROLES[i], address: ADDR.agents[ROLES[i]] }));
  }, []);

  const refreshEvents = useCallback(async () => {
    const latest = await provider.getBlockNumber();
    setBlockNo(latest);

    const from = cursor.current === null ? Math.max(0, latest - CHUNK * HISTORY_CHUNKS) : cursor.current + 1;
    if (from > latest) return;

    const collected = [];
    for (let start = from; start <= latest; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latest);
      try {
        const [g, t] = await Promise.all([
          provider.getLogs({ address: ADDR.guardian, fromBlock: start, toBlock: end }),
          provider.getLogs({ address: ADDR.treasury, fromBlock: start, toBlock: end }),
        ]);
        collected.push(...g.map((l) => ["g", l]), ...t.map((l) => ["t", l]));
      } catch {
        // Do not advance the cursor past a failed chunk, or those blocks are
        // skipped silently and events vanish from the record.
        cursor.current = start - 1;
        return;
      }
    }
    cursor.current = latest;

    const parsed = [];
    for (const [which, log] of collected) {
      const iface = which === "g" ? guardian.interface : treasury.interface;
      let p;
      try {
        p = iface.parseLog(log);
      } catch {
        continue;
      }
      if (!p) continue;

      const base = { key: `${log.transactionHash}-${log.index}`, block: log.blockNumber, hash: log.transactionHash };

      if (p.name === "BehavioralAnomalyDetected")
        parsed.push({ ...base, agent: p.args[0], title: "Behavioral anomaly", detail: b32(p.args[1]), tone: "alarm" });
      else if (p.name === "AgentFrozen")
        parsed.push({ ...base, agent: p.args[0], title: "Agent frozen", detail: b32(p.args[1]), tone: "alarm" });
      else if (p.name === "TransferExecuted")
        parsed.push({ ...base, agent: p.args[0], title: "Transfer executed", detail: `${formatEther(p.args[2])} MON`, tone: "pass" });
      else if (p.name === "TransferRejected") {
        const reason = b32(p.args[3]);
        const hard = ["VELOCITY_SPIKE", "BURST_PATTERN", "AMOUNT_DEVIATION", "AGENT_FROZEN"].includes(reason);
        parsed.push({
          ...base,
          agent: p.args[0],
          title: "Transaction blocked",
          detail: `${formatEther(p.args[2])} MON · ${reason}`,
          tone: hard ? "alarm" : "warn",
        });
      }
    }

    const fresh = parsed.filter((e) => !seen.current.has(e.key));
    if (!fresh.length) return;
    fresh.forEach((e) => seen.current.add(e.key));
    setEvents((prev) => [...fresh, ...prev].sort((a, b) => b.block - a.block).slice(0, 60));
  }, []);

  useEffect(() => {
    let alive = true;
    let timer;
    let delay = POLL_MS;

    const tick = async () => {
      if (!alive) return;
      try {
        setVault(formatEther(await treasury.balance()));
        await Promise.all([refreshAgents(), refreshEvents()]);
        setRpcError(null);
        delay = POLL_MS; // healthy again
      } catch (e) {
        const msg = e.shortMessage || e.message || "";
        const limited = /429|rate limit|too many/i.test(msg);
        // Backing off on a rate limit is the difference between recovering and
        // staying throttled: retrying at the same cadence just keeps the window
        // full.
        delay = limited ? Math.min(delay * 2, BACKOFF_MAX_MS) : POLL_MS;
        setRpcError(
          limited ? "Public RPC is rate-limiting — retrying more slowly." : msg
        );
      }
      if (alive) timer = setTimeout(tick, delay);
    };

    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refreshAgents, refreshEvents]);

  // ---------- agent API ----------

  // Re-probe rather than deciding once. A single failed check used to latch the
  // controls off until a reload — which, mid-demo, means the buttons are dead
  // exactly when they matter.
  useEffect(() => {
    let alive = true;

    const probe = async () => {
      try {
        await api.health();
        if (!alive) return;
        setApiUp(true);
        const r = await api.lastTranscript().catch(() => null);
        // Never let a stored transcript overwrite a live one the user just ran.
        if (alive && r?.transcript) setTranscript((cur) => (cur?.recorded || !cur ? r.transcript : cur));
      } catch {
        if (!alive) return;
        setApiUp(false);
        // No agent API reachable: show a real recorded run rather than an empty
        // panel — labelled as recorded, because passing a replay off as live is
        // the one thing a project about verifiable behaviour cannot do.
        setTranscript((cur) => cur ?? { ...sampleTranscript, recorded: true });
      }
    };

    probe();
    const id = setInterval(probe, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const run = async (inject) => {
    setBusy(true);
    setNotice(null);
    setTranscript(null);
    try {
      setTranscript(await api.runCycle({ inject }));
    } catch (e) {
      setNotice(
        e.name === "TimeoutError"
          ? "The cycle is taking longer than expected. It may still be running — check the activity feed."
          : `Could not run the cycle: ${e.message}`
      );
    } finally {
      setBusy(false);
    }
  };

  const launchAttack = async ({ handle, payload }) => {
    setAttackBusy(true);
    setAttackError(null);
    try {
      const attempt = await api.attack({ handle, payload });
      setAttempts((prev) => [attempt, ...prev]);
      // An attack is also a live cycle — surface its reasoning in the console.
      setTranscript({
        startedAt: attempt.at,
        durationMs: attempt.durationMs,
        injected: true,
        hijacked: attempt.agentComplied,
        vaultBefore: attempt.vaultBefore,
        vaultAfter: attempt.vaultAfter,
        verdict: attempt.txHash
          ? {
              outcome: attempt.outcome === "DRAINED" ? "EXECUTED" : "BLOCKED",
              reason: attempt.reason,
              txHash: attempt.txHash,
            }
          : null,
        steps: [
          {
            agent: "RESEARCH",
            title: `Reads ${attempt.handle}'s instruction`,
            onchain: false,
            input: attempt.payload,
            output: attempt.research,
            flag: attempt.agentComplied ? "HIJACKED" : "RESISTED",
          },
          ...(attempt.txHash
            ? [
                {
                  agent: "PAYMENT",
                  title: `Calls Treasury.executeTransfer(${attempt.requested} MON)`,
                  onchain: true,
                  output:
                    attempt.outcome === "DRAINED"
                      ? `Passed the guard — ${attempt.extracted} MON moved.`
                      : `Stopped by GUARDIAN — ${attempt.reason}. No funds moved.`,
                  flag: attempt.outcome === "DRAINED" ? "EXECUTED" : "BLOCKED",
                  txHash: attempt.txHash,
                },
              ]
            : []),
        ],
      });
    } catch (e) {
      setAttackError(
        e.name === "TimeoutError" ? "The attack is taking too long — try again." : e.message
      );
    } finally {
      setAttackBusy(false);
    }
  };

  const frozenCount = agents.filter((a) => a.frozen).length;

  return (
    <div className="min-h-svh flex flex-col">
      <Header wallet={wallet} onJump={jump} />

      <div className="gridfield">
        <Hero onJump={jump} />
        <Arena
          attempts={attempts}
          onAttack={launchAttack}
          busy={attackBusy}
          error={attackError}
          explorer={EXPLORER}
        />
        <HowItWorks />
      </div>

      {/* ---------- live console ---------- */}
      <div id="console" className="border-b border-rule-strong bg-surface">
        <div className="max-w-[1180px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Live console
            </span>
            <p className="text-[13px] text-muted m-0 mt-1">
              Not just watching the money. Watching the agents.
            </p>
          </div>

          <div className="flex items-stretch gap-6">
            <Readout label="Treasury" value={vault !== null ? Number(vault).toFixed(3) : "—"} unit="MON" />
            <Readout label="Block" value={blockNo?.toLocaleString() ?? "—"} />
            <div className="flex flex-col justify-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint mb-1">Status</span>
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 border ${
                  frozenCount
                    ? "text-alarm border-alarm/40 bg-alarm-wash"
                    : "text-pass border-pass/30 bg-pass-wash"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${frozenCount ? "alarm-dot" : ""}`} />
                {frozenCount ? `${frozenCount} frozen` : "All nominal"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- command bar ---------- */}
      <div className="border-b border-rule bg-sunken sticky top-14 z-20">
        <div className="max-w-[1180px] mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint mr-1">Command</span>

          <button
            onClick={() => run(false)}
            disabled={busy}
            className="font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 border border-ink bg-ink text-ground hover:bg-probe hover:border-probe disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {busy ? "Running…" : "Run Decision Cycle"}
          </button>

          <button
            onClick={() => run(true)}
            disabled={busy}
            className="font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 border border-alarm text-alarm bg-surface hover:bg-alarm-wash disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Inject Test Payload
          </button>

          {apiUp === false && !busy && (
            <span className="font-mono text-[10.5px] text-warn">
              Agent API unreachable — showing a recorded run. Press a button to retry;{" "}
              <code className="bg-warn-wash px-1">npm run server</code> starts it locally.
            </span>
          )}
          {notice && <span className="font-mono text-[11px] text-alarm">{notice}</span>}
        </div>
      </div>

      {/* ---------- body ---------- */}
      <main className="flex-1 max-w-[1180px] w-full mx-auto px-6 py-6 grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        <AgentRoster agents={agents} explorer={EXPLORER} />

        <div className="flex flex-col gap-6 min-w-0">
          <ReasoningTrace transcript={transcript} busy={busy} explorer={EXPLORER} />
          <ActivityFeed events={events} rpcError={rpcError} explorer={EXPLORER} />
        </div>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-rule bg-surface">
        <div className="max-w-[1180px] mx-auto px-6 py-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10.5px] text-muted">
          {[
            ["Treasury", ADDR.treasury],
            ["GuardianPolicyEngine", ADDR.guardian],
            ["AgentRegistry", ADDR.registry],
          ].map(([label, addr]) => (
            <a
              key={label}
              href={`${EXPLORER}/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-probe underline decoration-rule-strong underline-offset-2"
            >
              {label} {shortAddr(addr)}
            </a>
          ))}
          <span className="text-faint ml-auto">
            Prototype built for Monad Blitz Jakarta. Not audited. Testnet only.
          </span>
        </div>
      </footer>
    </div>
  );
}

function Readout({ label, value, unit }) {
  return (
    <div className="flex flex-col justify-center">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint mb-1">{label}</span>
      <span className="font-mono text-[17px] tnum leading-none">
        {value}
        {unit && <span className="text-faint text-[11px] ml-1">{unit}</span>}
      </span>
    </div>
  );
}

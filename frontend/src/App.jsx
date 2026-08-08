import { useEffect, useState, useCallback, useRef } from "react";
import { formatEther } from "ethers";
import {
  ADDR,
  EXPLORER,
  ROLES,
  readOnlyRoles,
  guardian,
  treasury,
  provider,
  b32,
  shortAddr,
} from "./chain";

const POLL_MS = 4000;
// RPC testnet menolak getLogs > ~100 block (413). Block Monad ~300ms,
// jadi satu petak = ~27 detik riwayat.
const CHUNK = 90;
// Riwayat awal: 12 petak (~5 menit). Setelah itu inkremental — tiap poll
// cuma mengambil block yang benar-benar baru.
const HISTORY_CHUNKS = 12;

// Warna per jenis kejadian — bukan dekorasi, ini yang bikin status kebaca sekilas.
const REASON_TONE = {
  OK: "ok",
  VELOCITY_SPIKE: "danger",
  BURST_PATTERN: "danger",
  AMOUNT_DEVIATION: "danger",
  AGENT_FROZEN: "danger",
  EXCEEDS_TX_LIMIT: "warn",
  EXCEEDS_DAILY_BUDGET: "warn",
  READ_ONLY_ROLE: "warn",
  NOT_REGISTERED: "warn",
};

const toneClass = {
  ok: "text-ok border-ok/30 bg-ok/5",
  warn: "text-warn border-warn/30 bg-warn/5",
  danger: "text-danger border-danger/30 bg-danger/5",
  idle: "text-ink-dim border-white/10 bg-white/[0.02]",
};

export default function App() {
  const [agents, setAgents] = useState([]);
  const [vault, setVault] = useState(null);
  const [events, setEvents] = useState([]);
  const [blockNo, setBlockNo] = useState(null);
  const [err, setErr] = useState(null);
  const seen = useRef(new Set());
  const cursor = useRef(null);

  const refreshAgents = useCallback(async () => {
    // Cukup baca `baselineOf` + `spentToday`: status frozen sudah ada di
    // bit 0 `flags`, jadi tidak perlu panggilan `isFrozen` terpisah —
    // memangkas sepertiga beban RPC.
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
            readOnly: readOnlyRoles.has(role),
            txCountWindow: Number(baseline.txCountWindow),
            spent: formatEther(spent),
            stale: false,
          };
        } catch {
          // RPC kena rate limit sesaat — pertahankan angka terakhir yang
          // valid, jangan kosongkan kartunya. Data telat sedikit jauh lebih
          // berguna daripada layar yang tiba-tiba blank saat demo.
          return null;
        }
      })
    );

    setAgents((prev) =>
      rows.map((row, i) => row ?? prev[i] ?? { role: ROLES[i], address: ADDR.agents[ROLES[i]], readOnly: readOnlyRoles.has(ROLES[i]), stale: true })
    );
  }, []);

  const refreshEvents = useCallback(async () => {
    const latest = await provider.getBlockNumber();
    setBlockNo(latest);

    // Pertama kali: tarik riwayat per petak. Berikutnya: cuma block baru.
    const from =
      cursor.current === null
        ? Math.max(0, latest - CHUNK * HISTORY_CHUNKS)
        : cursor.current + 1;

    if (from > latest) return;

    const gLogs = [];
    const tLogs = [];
    // Dijalankan berurutan, bukan paralel — RPC-nya gampang kena rate limit.
    for (let start = from; start <= latest; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latest);
      try {
        const [g, t] = await Promise.all([
          provider.getLogs({ address: ADDR.guardian, fromBlock: start, toBlock: end }),
          provider.getLogs({ address: ADDR.treasury, fromBlock: start, toBlock: end }),
        ]);
        gLogs.push(...g);
        tLogs.push(...t);
      } catch {
        // Satu petak gagal (rate limit) jangan menjatuhkan seluruh feed —
        // dan JANGAN majukan cursor melewatinya, biar block itu dicoba lagi
        // di poll berikutnya dan tidak ada kejadian yang hilang diam-diam.
        cursor.current = start - 1;
        return;
      }
    }
    cursor.current = latest;

    const parsed = [];

    for (const log of gLogs) {
      const p = guardian.interface.parseLog(log);
      if (!p) continue;
      if (p.name === "BehavioralAnomalyDetected") {
        parsed.push({
          key: `${log.transactionHash}-${log.index}`,
          block: log.blockNumber,
          hash: log.transactionHash,
          agent: p.args[0],
          title: "ANOMALI PERILAKU",
          detail: b32(p.args[1]),
          tone: "danger",
        });
      } else if (p.name === "AgentFrozen") {
        parsed.push({
          key: `${log.transactionHash}-${log.index}`,
          block: log.blockNumber,
          hash: log.transactionHash,
          agent: p.args[0],
          title: "AGENT DIBEKUKAN",
          detail: b32(p.args[1]),
          tone: "danger",
        });
      }
    }

    for (const log of tLogs) {
      const p = treasury.interface.parseLog(log);
      if (!p) continue;
      if (p.name === "TransferExecuted") {
        parsed.push({
          key: `${log.transactionHash}-${log.index}`,
          block: log.blockNumber,
          hash: log.transactionHash,
          agent: p.args[0],
          title: "TRANSFER LOLOS",
          detail: `${formatEther(p.args[2])} MON`,
          tone: "ok",
        });
      } else if (p.name === "TransferRejected") {
        const reason = b32(p.args[3]);
        parsed.push({
          key: `${log.transactionHash}-${log.index}`,
          block: log.blockNumber,
          hash: log.transactionHash,
          agent: p.args[0],
          title: "TRANSFER DITOLAK",
          detail: `${formatEther(p.args[2])} MON · ${reason}`,
          tone: REASON_TONE[reason] ?? "warn",
        });
      }
    }

    // Akumulasi, jangan timpa — hasil fetch inkremental cuma berisi block baru.
    const fresh = parsed.filter((e) => !seen.current.has(e.key));
    if (fresh.length === 0) return;
    for (const e of fresh) seen.current.add(e.key);

    setEvents((prev) =>
      [...fresh, ...prev].sort((a, b) => b.block - a.block || b.key.localeCompare(a.key)).slice(0, 50)
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const bal = await treasury.balance();
        setVault(formatEther(bal));
        await Promise.all([refreshAgents(), refreshEvents()]);
        setErr(null);
      } catch (e) {
        setErr(e.shortMessage || e.message);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshAgents, refreshEvents]);

  const roleOf = (addr) =>
    ROLES.find((r) => ADDR.agents[r]?.toLowerCase() === addr?.toLowerCase()) ?? shortAddr(addr);

  const frozenCount = agents.filter((a) => a.frozen).length;

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="font-head text-white text-xl font-bold tracking-tight">GUARDIAN</span>
            <span className="font-mono text-[11px] text-ink-dim">
              behavioural guard · monad testnet
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-ink-dim">
              block <span className="text-ink tabular-nums">{blockNo ?? "…"}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                frozenCount > 0 ? toneClass.danger : toneClass.ok
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {frozenCount > 0 ? `${frozenCount} agent beku` : "semua agent normal"}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-head text-white text-2xl font-semibold tracking-tight m-0 mb-1">
              Kas yang dijaga di jalur eksekusi
            </h1>
            <p className="text-ink-dim text-sm max-w-[62ch] m-0">
              Lima AI agent, masing-masing punya alamat on-chain sendiri. Guardian mengevaluasi
              tiap permintaan sebelum dana bergerak — limit statis, lalu baseline perilaku
              per-agent.
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-wide text-ink-dim mb-1">
              saldo kas
            </div>
            <div className="font-head text-3xl text-white tabular-nums">
              {vault !== null ? `${Number(vault).toFixed(3)}` : "…"}
              <span className="text-ink-dim text-lg ml-1.5">MON</span>
            </div>
          </div>
        </section>

        {err && (
          <p className="font-mono text-[12px] text-warn border border-warn/30 bg-warn/5 rounded-md px-3 py-2 m-0">
            RPC: {err}
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.role} agent={a} />
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-head text-white text-lg font-semibold m-0">
              Jejak keputusan on-chain
            </h2>
            <span className="font-mono text-[11px] text-ink-dim">
              live · refresh {POLL_MS / 1000}s
            </span>
          </div>

          {events.length === 0 ? (
            <p className="font-mono text-[12px] text-ink-dim border border-white/10 rounded-lg px-4 py-6 text-center m-0">
              Belum ada aktivitas di jendela ini. Jalankan{" "}
              <code className="text-accent-soft">scripts/demo.js</code> untuk memicunya.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
              {events.map((e) => (
                <li
                  key={e.key}
                  className={`border rounded-lg px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 ${
                    toneClass[e.tone]
                  }`}
                >
                  <span className="font-mono text-[10px] tabular-nums text-ink-dim w-[72px] shrink-0">
                    #{e.block}
                  </span>
                  <span className="font-mono text-[11px] font-medium w-[150px] shrink-0">
                    {e.title}
                  </span>
                  <span className="font-mono text-[11px] text-ink w-[110px] shrink-0">
                    {roleOf(e.agent)}
                  </span>
                  <span className="font-mono text-[11px] flex-1 min-w-[140px]">{e.detail}</span>
                  <a
                    href={`${EXPLORER}/tx/${e.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-ink-dim hover:text-accent-soft underline shrink-0"
                  >
                    bukti ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-ink-dim">
          <a
            href={`${EXPLORER}/address/${ADDR.treasury}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent-soft underline"
          >
            Treasury {shortAddr(ADDR.treasury)}
          </a>
          <a
            href={`${EXPLORER}/address/${ADDR.guardian}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent-soft underline"
          >
            GuardianPolicyEngine {shortAddr(ADDR.guardian)}
          </a>
          <a
            href={`${EXPLORER}/address/${ADDR.registry}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent-soft underline"
          >
            AgentRegistry {shortAddr(ADDR.registry)}
          </a>
        </div>
      </footer>
    </div>
  );
}

function AgentCard({ agent }) {
  const tone = agent.stale ? "idle" : agent.frozen ? "danger" : agent.readOnly ? "idle" : "ok";
  const statusLabel = agent.stale
    ? "…"
    : agent.frozen
      ? "BEKU"
      : agent.readOnly
        ? "READ-ONLY"
        : "AKTIF";

  return (
    <div
      className={`border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
        agent.frozen ? "border-danger/40 bg-danger/[0.06]" : "border-white/10 bg-panel"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-head text-white text-sm font-semibold">{agent.role}</div>
          <a
            href={`${EXPLORER}/address/${agent.address}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-ink-dim hover:text-accent-soft underline"
          >
            {shortAddr(agent.address)}
          </a>
        </div>
        <span
          className={`font-mono text-[9px] px-2 py-0.5 rounded-full border shrink-0 ${toneClass[tone]}`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 m-0 font-mono text-[11px]">
        <Stat label="aksi / window" value={agent.stale ? "…" : agent.txCountWindow} />
        <Stat
          label="terpakai hari ini"
          value={agent.stale ? "…" : `${Number(agent.spent).toFixed(2)} MON`}
        />
      </dl>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[9px] uppercase tracking-wide text-ink-dim">{label}</dt>
      <dd className="m-0 text-ink tabular-nums">{value}</dd>
    </div>
  );
}

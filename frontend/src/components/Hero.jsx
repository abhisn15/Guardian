import { ADDR } from "../chain";

export default function Hero({ onJump }) {
  return (
    <section id="top" className="border-b border-rule">
      <div className="max-w-[1180px] mx-auto px-6 pt-16 pb-14 md:pt-24 md:pb-20">
        <p className="font-mono text-[10.5px] tracking-[0.2em] text-faint uppercase m-0 mb-7">
          Monad Testnet · Chain 10143 · v1.0
        </p>

        {/* The thesis, stated at the size it deserves. The field is converging on
            agents supervising agents; this is the opposing position. */}
        <h1 className="font-display text-[clamp(2.6rem,7.4vw,5.6rem)] leading-[0.93] tracking-[-0.035em] font-extrabold m-0 max-w-[15ch] text-balance">
          If the supervisor gets injected, who supervises the supervisor?
        </h1>

        <p className="text-[15px] md:text-[16.5px] leading-relaxed text-muted m-0 mt-8 max-w-[60ch]">
          The pattern everyone is converging on is agents watching agents — one votes to veto, another
          enforces. That is off-chain reasoning validating off-chain reasoning, and it collapses the
          moment the checking agent is the one that gets compromised.
        </p>
        <p className="text-[15px] md:text-[16.5px] leading-relaxed text-ink m-0 mt-4 max-w-[60ch]">
          GUARDIAN trusts no agent, including the one doing the checking. Enforcement lives inside the
          contract — somewhere a prompt cannot reach.
        </p>

        <div className="flex flex-wrap items-center gap-3 mt-9">
          <button
            onClick={() => onJump("arena")}
            className="font-mono text-[11.5px] uppercase tracking-wide px-5 py-3 bg-alarm text-ink hover:bg-alarm/85 transition-colors cursor-pointer"
          >
            Try to break it
          </button>
          <button
            onClick={() => onJump("console")}
            className="font-mono text-[11.5px] uppercase tracking-wide px-5 py-3 bg-ink text-ground hover:bg-probe transition-colors cursor-pointer"
          >
            Open live console
          </button>
          <button
            onClick={() => onJump("how")}
            className="font-mono text-[11.5px] uppercase tracking-wide px-5 py-3 border border-rule-strong text-ink hover:border-probe hover:text-probe transition-colors cursor-pointer"
          >
            How it works
          </button>
          <a
            href={`https://testnet.monadvision.com/address/${ADDR.treasury}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-faint hover:text-probe underline decoration-rule underline-offset-4 ml-1"
          >
            Contracts on explorer ↗
          </a>
        </div>

        {/* Hard numbers instead of adjectives. */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px mt-14 bg-rule border border-rule">
          {[
            ["5", "AI agents, one address each"],
            ["2", "guard layers before funds move"],
            ["32", "bytes of baseline per agent"],
            ["600ms", "detect-to-freeze on Monad"],
          ].map(([value, label]) => (
            <div key={label} className="bg-ground px-4 py-5">
              <dt className="font-display text-[26px] font-bold tracking-[-0.03em] tnum leading-none m-0">
                {value}
              </dt>
              <dd className="font-mono text-[10px] text-faint leading-snug m-0 mt-2">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

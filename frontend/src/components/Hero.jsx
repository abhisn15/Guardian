import { ADDR } from "../chain";

export default function Hero({ onJump }) {
  return (
    <section id="top" className="border-b border-rule">
      <div className="max-w-[1180px] mx-auto px-6 pt-16 pb-14 md:pt-24 md:pb-20">
        <p className="font-mono text-[10.5px] tracking-[0.2em] text-faint uppercase m-0 mb-7">
          Monad Testnet · Chain 10143 · v1.0
        </p>

        {/* The thesis, stated at the size it deserves. */}
        <h1 className="font-display text-[clamp(2.6rem,7.4vw,5.6rem)] leading-[0.93] tracking-[-0.035em] font-extrabold m-0 max-w-[16ch] text-balance">
          The threat isn't the hacker. It's your own agent going off&#8209;script.
        </h1>

        <p className="text-[15px] md:text-[16.5px] leading-relaxed text-muted m-0 mt-8 max-w-[58ch]">
          GUARDIAN watches <em className="not-italic text-ink">how</em> each AI agent behaves — not just
          how much it spends. It learns every agent's own baseline and freezes it on-chain the moment it
          drifts, even when every single transaction sits comfortably within its limits.
        </p>

        <div className="flex flex-wrap items-center gap-3 mt-9">
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

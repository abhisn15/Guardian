import { shortAddr } from "../chain";

export default function Header({ wallet, onJump }) {
  const { address, balance, busy, wrongNetwork, hasWallet, connect, switchNetwork, disconnect } = wallet;

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-ground/85 backdrop-blur-md">
      <div className="max-w-[1180px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5 group shrink-0">
          <Mark />
          <span className="font-sans text-[15px] font-bold tracking-[-0.02em]">GUARDIAN</span>
        </a>

        <nav className="hidden md:flex items-center gap-6 font-mono text-[11px] text-muted">
          <button onClick={() => onJump("how")} className="hover:text-ink transition-colors cursor-pointer">
            How it works
          </button>
          <button onClick={() => onJump("console")} className="hover:text-ink transition-colors cursor-pointer">
            Live console
          </button>
          <a
            href="https://github.com/abhisn15/Guardian"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink transition-colors"
          >
            Source
          </a>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {wrongNetwork && (
            <button
              onClick={switchNetwork}
              disabled={busy}
              className="font-mono text-[10.5px] px-2.5 py-1.5 border border-warn/50 text-warn bg-warn-wash hover:bg-warn/15 transition-colors cursor-pointer disabled:opacity-50"
            >
              Switch to Monad
            </button>
          )}

          {address ? (
            <button
              onClick={disconnect}
              title="Disconnect"
              className="font-mono text-[11px] px-3 py-1.5 border border-rule-strong bg-surface hover:border-alarm hover:text-alarm transition-colors cursor-pointer flex items-center gap-2"
            >
              {balance !== null && (
                <span className="text-faint tnum hidden sm:inline">{Number(balance).toFixed(2)} MON</span>
              )}
              <span>{shortAddr(address)}</span>
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={busy}
              className="font-mono text-[11px] uppercase tracking-wide px-3.5 py-1.5 bg-ink text-ground hover:bg-probe transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy ? "Connecting…" : hasWallet ? "Connect Wallet" : "Get a Wallet"}
            </button>
          )}
        </div>
      </div>

      {wallet.error && (
        <div className="border-t border-alarm/30 bg-alarm-wash">
          <p className="max-w-[1180px] mx-auto px-6 py-2 font-mono text-[10.5px] text-alarm m-0">
            {wallet.error}
          </p>
        </div>
      )}
    </header>
  );
}

/// A shield rendered as a containment boundary rather than a badge — the
/// product stops things from leaving, it does not decorate them.
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 4.5 5.5v6.2c0 4.6 3.1 8.4 7.5 9.8 4.4-1.4 7.5-5.2 7.5-9.8V5.5L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="text-probe"
      />
      <path d="M8.6 12.2h6.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-alarm" />
    </svg>
  );
}

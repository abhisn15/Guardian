import { useState } from "react";
import { BrowserProvider, Contract, parseEther } from "ethers";
import { ADDR, EXPLORER, TREASURY_ABI, b32, shortAddr } from "../chain";

// Connect your own wallet and try to move the treasury yourself.
//
// The claim being made everywhere else on this page is that the guard checks
// msg.sender rather than a role the backend asserts. This is where a visitor
// gets to verify that instead of taking our word for it: your address is not a
// registered agent, so the contract refuses you exactly as it refuses a hijacked
// one. Same code path, no special case.

export default function ProveIt({ wallet }) {
  const [state, setState] = useState(null); // { status, reason, hash }
  const [busy, setBusy] = useState(false);

  const attempt = async () => {
    setBusy(true);
    setState(null);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const treasury = new Contract(ADDR.treasury, TREASURY_ABI, signer);

      // A deliberately small amount: this is about who is asking, not how much.
      const tx = await treasury.executeTransfer(await signer.getAddress(), parseEther("0.01"), {
        gasLimit: 200000,
      });
      const receipt = await tx.wait();

      let status = "no-event";
      let reason = null;
      for (const log of receipt.logs) {
        try {
          const p = treasury.interface.parseLog(log);
          if (p?.name === "TransferExecuted") status = "executed";
          if (p?.name === "TransferRejected") {
            status = "rejected";
            reason = b32(p.args[3]);
          }
        } catch {
          /* Guardian's own logs */
        }
      }
      setState({ status, reason, hash: tx.hash });
    } catch (err) {
      const msg = err.shortMessage || err.message || "";
      setState({
        status: "error",
        reason: /user rejected|denied/i.test(msg) ? "You cancelled it in your wallet." : msg,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-rule bg-surface">
      <h2 className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted m-0 px-4 py-2.5 border-b border-rule bg-sunken">
        Verify it yourself
      </h2>

      <div className="p-5 flex flex-col gap-4">
        <p className="text-[13.5px] leading-relaxed text-muted m-0 max-w-[62ch]">
          Everything above claims the guard checks <span className="text-ink">msg.sender</span>, not a
          role the backend asserts. Test it with your own wallet: ask the treasury for 0.01 MON. Your
          address is not a registered agent, so the contract should refuse you the same way it refuses a
          hijacked one — same code path, no special case.
        </p>

        {!wallet.address ? (
          <button
            onClick={wallet.connect}
            disabled={wallet.busy}
            className="font-mono text-[11px] uppercase tracking-wide px-4 py-2.5 bg-ink text-ground hover:bg-probe transition-colors cursor-pointer disabled:opacity-45 self-start"
          >
            {wallet.busy ? "Connecting…" : "Connect wallet to try"}
          </button>
        ) : wallet.wrongNetwork ? (
          <button
            onClick={wallet.switchNetwork}
            className="font-mono text-[11px] uppercase tracking-wide px-4 py-2.5 border border-warn text-warn bg-warn-wash hover:bg-warn/15 transition-colors cursor-pointer self-start"
          >
            Switch to Monad Testnet first
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={attempt}
              disabled={busy}
              className="font-mono text-[11px] uppercase tracking-wide px-4 py-2.5 border border-probe text-probe bg-probe-wash hover:bg-probe/15 transition-colors cursor-pointer disabled:opacity-45"
            >
              {busy ? "Asking the contract…" : "Try to move 0.01 MON"}
            </button>
            <span className="font-mono text-[10.5px] text-faint">
              as {shortAddr(wallet.address)} · costs you a little testnet gas
            </span>
          </div>
        )}

        {state && (
          <div
            className={`border px-4 py-3 trace-in ${
              state.status === "rejected"
                ? "border-pass/40 bg-pass-wash"
                : state.status === "executed"
                  ? "border-alarm/40 bg-alarm-wash"
                  : "border-warn/40 bg-warn-wash"
            }`}
          >
            {state.status === "rejected" && (
              <>
                <p className="font-sans text-[13.5px] font-semibold text-pass m-0">
                  Refused — {state.reason}
                </p>
                <p className="text-[12.5px] text-muted m-0 mt-1 leading-relaxed">
                  Your wallet holds real keys and signed a real transaction. The contract still said no,
                  because identity is checked on-chain rather than asserted off it.
                </p>
              </>
            )}
            {state.status === "executed" && (
              <p className="font-sans text-[13.5px] font-semibold text-alarm m-0">
                It went through. That means this address is a registered agent within its limits.
              </p>
            )}
            {state.status === "error" && (
              <p className="font-mono text-[12px] text-warn m-0">{state.reason}</p>
            )}

            {state.hash && (
              <a
                href={`${EXPLORER}/tx/${state.hash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-mono text-[10px] text-probe hover:underline underline-offset-2 mt-2"
              >
                your transaction ↗
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

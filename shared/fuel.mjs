import { Wallet, parseEther, formatEther } from "ethers";

// Keeps the agent wallets able to pay for gas.
//
// This is the failure that killed the arena in testing, and it is worth spelling
// out because the symptom does not point at the cause: attacks start returning
// "could not coalesce error" — an ethers parse failure — when what actually
// happened is an agent ran out of MON.
//
// Monad charges gas on the gas LIMIT rather than gas used, so every attempt
// burns the full reservation whether the guard allows it or not. A rejected
// attack costs the same as a successful one, which is excellent as a deterrent
// and merciless on a wallet fielding attacks from a room full of people.
//
// Needs FUNDER_PK in the environment. Without it this is a no-op, so a
// deployment that omits it still works — it just cannot refill itself.

const TOP_UP_BELOW = parseEther("0.4"); // roughly twenty attempts of headroom
const TOP_UP_TO = parseEther("2");

let lastCheck = 0;
const CHECK_EVERY_MS = 60000;

export async function ensureFuel(provider, addresses, { force = false } = {}) {
  const pk = process.env.FUNDER_PK || process.env.PRIVATE_KEY;
  if (!pk) return { funded: false, reason: "no funder key configured" };

  // Checking every invocation would add an RPC round-trip per attack for a
  // condition that changes slowly.
  if (!force && Date.now() - lastCheck < CHECK_EVERY_MS) return { funded: false, skipped: true };
  lastCheck = Date.now();

  const funder = new Wallet(pk, provider);
  const topped = [];

  for (const address of addresses) {
    try {
      const balance = await provider.getBalance(address);
      if (balance >= TOP_UP_BELOW) continue;

      const amount = TOP_UP_TO - balance;
      const tx = await funder.sendTransaction({ to: address, value: amount });
      await tx.wait();
      topped.push({ address, amount: formatEther(amount) });
    } catch {
      // A funder that is itself empty, or a transient RPC failure, must not
      // take down the request that triggered the check.
    }
  }

  return { funded: topped.length > 0, topped };
}

/// Turns the opaque errors this path produces into something a person can act on.
export function explainError(err, agentBalanceWei) {
  const msg = err?.shortMessage || err?.message || String(err);

  if (agentBalanceWei !== undefined && agentBalanceWei < parseEther("0.05")) {
    return "The agent wallet is out of gas. It refills automatically — try again in a moment.";
  }
  if (/coalesce/i.test(msg)) {
    return "The RPC returned an error we could not read — usually rate limiting or an agent out of gas. Try again shortly.";
  }
  if (/429|rate limit|too many/i.test(msg)) {
    return "Monad's public RPC is rate-limiting right now. Try again in a few seconds.";
  }
  if (/insufficient/i.test(msg)) {
    return "The agent wallet cannot cover gas for this attempt.";
  }
  return msg;
}

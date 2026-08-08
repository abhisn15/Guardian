import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, formatEther } from "ethers";

export const MONAD_CHAIN_ID = 10143;

const MONAD_PARAMS = {
  chainId: "0x279f", // 10143
  chainName: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadvision.com"],
};

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const hasWallet = typeof window !== "undefined" && !!window.ethereum;
  const wrongNetwork = chainId !== null && chainId !== MONAD_CHAIN_ID;

  const refresh = useCallback(async (addr) => {
    if (!window.ethereum || !addr) return;
    const provider = new BrowserProvider(window.ethereum);
    const net = await provider.getNetwork();
    setChainId(Number(net.chainId));
    setBalance(formatEther(await provider.getBalance(addr)));
  }, []);

  const connect = useCallback(async () => {
    if (!hasWallet) {
      setError("No wallet detected. Install MetaMask to connect.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const [addr] = await provider.send("eth_requestAccounts", []);
      setAddress(addr);
      await refresh(addr);
    } catch (err) {
      const raw = err.info?.error?.message || err.message || "";
      if (raw.includes("-32002") || raw.includes("already pending"))
        setError("A request is already open in your wallet. Approve or dismiss it, then try again.");
      else if (raw.includes("at least one account"))
        setError("Your wallet has no unlocked account. Open the extension, unlock it, then try again.");
      else if (err.code === "ACTION_REJECTED") setError(null);
      else setError(raw || "Could not connect.");
    } finally {
      setBusy(false);
    }
  }, [hasWallet, refresh]);

  const switchNetwork = useCallback(async () => {
    if (!hasWallet) return;
    setBusy(true);
    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MONAD_PARAMS.chainId }],
        });
      } catch (e) {
        // 4902 — the chain is not in the wallet yet.
        if (e.code === 4902) {
          await window.ethereum.request({ method: "wallet_addEthereumChain", params: [MONAD_PARAMS] });
        } else throw e;
      }
      if (address) await refresh(address);
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }, [hasWallet, address, refresh]);

  const disconnect = useCallback(async () => {
    try {
      // EIP-2255: makes the wallet forget the grant so the next connect shows
      // the account picker again. Not every wallet implements it.
      await window.ethereum?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      /* wallet does not support revoke — local reset below is enough */
    }
    setAddress(null);
    setChainId(null);
    setBalance(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!hasWallet) return;
    const onAccounts = (accounts) => {
      if (!accounts.length) return disconnect();
      setAddress(accounts[0]);
      refresh(accounts[0]);
    };
    const onChain = () => address && refresh(address);

    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [hasWallet, address, refresh, disconnect]);

  return { address, chainId, balance, busy, error, hasWallet, wrongNetwork, connect, switchNetwork, disconnect };
}

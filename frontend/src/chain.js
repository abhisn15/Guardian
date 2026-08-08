import { JsonRpcProvider, Contract, decodeBytes32String } from "ethers";
import deployed from "./deployed.json";

export const RPC_URL = "https://testnet-rpc.monad.xyz";
export const EXPLORER = "https://testnet.monadvision.com";
export const CHAIN_ID = 10143;
export const ADDR = deployed;

export const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });

export const REGISTRY_ABI = [
  "function getAgent(address) view returns (tuple(bytes32 role, uint128 maxTxLimit, uint128 dailyBudget, bool registered))",
  "function isReadOnly(address) view returns (bool)",
];

export const GUARDIAN_ABI = [
  "function baselineOf(address) view returns (tuple(uint64 lastTimestamp, uint64 rollingAvgAmount, uint32 txCountWindow, uint32 windowStart, uint64 flags))",
  "function isFrozen(address) view returns (bool)",
  "function spentToday(address) view returns (uint256)",
  "event ComplianceChecked(address indexed agent, uint256 amount, bool passed, bytes32 reason)",
  "event TransactionBlocked(address indexed agent, uint256 requested, uint256 maxAllowed)",
  "event BehavioralAnomalyDetected(address indexed agent, bytes32 indexed pattern, uint256 blockNumber)",
  "event AgentFrozen(address indexed agent, bytes32 reason)",
];

export const TREASURY_ABI = [
  "function balance() view returns (uint256)",
  "function executeTransfer(address to, uint256 amount) external returns (bool)",
  "event TransferExecuted(address indexed agent, address indexed to, uint256 amount)",
  "event TransferRejected(address indexed agent, address indexed to, uint256 amount, bytes32 reason)",
];

export const registry = new Contract(ADDR.registry, REGISTRY_ABI, provider);
export const guardian = new Contract(ADDR.guardian, GUARDIAN_ABI, provider);
export const treasury = new Contract(ADDR.treasury, TREASURY_ABI, provider);

export const ROLES = ["TREASURY", "RESEARCH", "INVESTMENT", "PAYMENT", "REPORTING"];

export const readOnlyRoles = new Set(["RESEARCH", "REPORTING"]);

export function b32(value) {
  try {
    return decodeBytes32String(value);
  } catch {
    return value;
  }
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

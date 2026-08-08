// Minimal ABI fragments shared by the API and the frontend.
//
// Deliberately hand-written rather than read from artifacts/: a serverless
// function bundles only what it imports, and pulling in the full Hardhat
// artifact tree there is fragile. These fragments are the contract surface
// actually used at runtime.

export const REGISTRY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function isReadOnly(address) view returns (bool)",
  "function limitsOf(address) view returns (uint128 maxTxLimit, uint128 dailyBudget)",
  "function logAgentAction(bytes32 actionType, string detail) external",
  "event AgentAction(address indexed agent, bytes32 indexed actionType, uint256 blockNumber, string detail)",
];

export const GUARDIAN_ABI = [
  "function baselineOf(address) view returns (tuple(uint64 lastTimestamp, uint64 rollingAvgAmount, uint32 txCountWindow, uint32 windowStart, uint64 flags))",
  "function isFrozen(address) view returns (bool)",
  "function spentToday(address) view returns (uint256)",
  "function resetAgentForDemo(address) external",
  "event ComplianceChecked(address indexed agent, uint256 amount, bool passed, bytes32 reason)",
  "event TransactionBlocked(address indexed agent, uint256 requested, uint256 maxAllowed)",
  "event BehavioralAnomalyDetected(address indexed agent, bytes32 indexed pattern, uint256 blockNumber)",
  "event AgentFrozen(address indexed agent, bytes32 reason)",
];

export const TREASURY_ABI = [
  "function balance() view returns (uint256)",
  "function deposit() payable",
  "function executeTransfer(address to, uint256 amount) external returns (bool)",
  "event TransferExecuted(address indexed agent, address indexed to, uint256 amount)",
  "event TransferRejected(address indexed agent, address indexed to, uint256 amount, bytes32 reason)",
];

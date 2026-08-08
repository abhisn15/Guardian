// Reclaim testnet MON stranded in previous deployments and agent wallets.
// Faucets are rate-limited; redeploying repeatedly during a build drains the
// deployer fast. This pulls the funds back instead of waiting.
//
// Run: npx hardhat run scripts/reclaim.js --network monadTestnet

const hre = require("hardhat");
const { ethers } = hre;

// Treasuries from earlier deploys this session.
const OLD_TREASURIES = [
  "0xA0894995908e472604aF6FB67268214e035B64DD",
  "0xe50388011D54f8071D3bA64f710758892B72242e",
  "0x4bD5906BB89697A252Af7a508a0470d8146A76CB",
];

const AGENT_KEYS = [
  "TREASURY_AGENT_PK",
  "RESEARCH_AGENT_PK",
  "INVESTMENT_AGENT_PK",
  "PAYMENT_AGENT_PK",
  "REPORTING_AGENT_PK",
];

// Leave enough behind to cover the sweeping transaction itself. Monad charges
// on the gas limit, so this has to be generous or the sweep reverts.
const GAS_RESERVE = ethers.parseEther("0.05");

async function main() {
  const [deployer] = await ethers.getSigners();
  const before = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Before  : ${ethers.formatEther(before)} MON\n`);

  // --- Old treasury contracts (they still expose the pre-C4 adminWithdraw) ---
  const oldAbi = ["function adminWithdraw(address to, uint256 amount) external"];
  for (const addr of OLD_TREASURIES) {
    const bal = await ethers.provider.getBalance(addr);
    if (bal === 0n) continue;
    try {
      const c = new ethers.Contract(addr, oldAbi, deployer);
      await (await c.adminWithdraw(deployer.address, bal, { gasLimit: 120000 })).wait();
      console.log(`treasury ${addr.slice(0, 10)}… reclaimed ${ethers.formatEther(bal)} MON`);
    } catch (e) {
      console.log(`treasury ${addr.slice(0, 10)}… skipped (${(e.shortMessage || e.message).slice(0, 50)})`);
    }
  }

  // --- Agent wallets ---
  for (const key of AGENT_KEYS) {
    if (!process.env[key]) continue;
    const w = new ethers.Wallet(process.env[key], ethers.provider);
    const bal = await ethers.provider.getBalance(w.address);
    if (bal <= GAS_RESERVE) continue;
    const send = bal - GAS_RESERVE;
    try {
      await (await w.sendTransaction({ to: deployer.address, value: send, gasLimit: 30000 })).wait();
      console.log(`${key.padEnd(22)} reclaimed ${ethers.formatEther(send)} MON`);
    } catch (e) {
      console.log(`${key.padEnd(22)} skipped (${(e.shortMessage || e.message).slice(0, 50)})`);
    }
  }

  const after = await ethers.provider.getBalance(deployer.address);
  console.log(`\nAfter   : ${ethers.formatEther(after)} MON`);
  console.log(`Recovered: ${ethers.formatEther(after - before)} MON`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

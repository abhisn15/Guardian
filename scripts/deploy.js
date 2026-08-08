const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { Wallet } = require("ethers");

const { ethers } = hre;

// Limit sesuai PRD. Role read-only tetap didaftarkan supaya penolakannya
// terbukti on-chain (bukan sekadar "tidak dipanggil").
const AGENT_SPEC = [
  { key: "TREASURY", role: "TREASURY", maxTx: "10", daily: "60" },
  { key: "RESEARCH", role: "RESEARCH", maxTx: "0.001", daily: "0.001" },
  { key: "INVESTMENT", role: "INVESTMENT", maxTx: "10", daily: "40" },
  { key: "PAYMENT", role: "PAYMENT", maxTx: "2", daily: "20" },
  { key: "REPORTING", role: "REPORTING", maxTx: "0.001", daily: "0.001" },
];

const TREASURY_FUNDING = "5"; // MON masuk kas
const AGENT_GAS_FUNDING = "0.3"; // MON per agent buat bayar gas

function agentAddresses() {
  return AGENT_SPEC.map((spec) => {
    const pk = process.env[`${spec.key}_AGENT_PK`];
    if (!pk) {
      throw new Error(
        `${spec.key}_AGENT_PK belum ada di .env — jalankan dulu: node scripts/gen-agents.js`
      );
    }
    return { ...spec, address: new Wallet(pk).address, pk };
  });
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(`Network  : ${net.name} (chainId ${net.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MON\n`);

  const agents = agentAddresses();

  // --- Deploy ---
  const Registry = await ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log("AgentRegistry       :", await registry.getAddress());

  const Guardian = await ethers.getContractFactory("GuardianPolicyEngine");
  const guardian = await Guardian.deploy(await registry.getAddress());
  await guardian.waitForDeployment();
  console.log("GuardianPolicyEngine:", await guardian.getAddress());

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(await guardian.getAddress());
  await treasury.waitForDeployment();
  console.log("Treasury            :", await treasury.getAddress());

  await (await guardian.setTreasury(await treasury.getAddress())).wait();
  console.log("\nGuardian -> Treasury tersambung.");

  // --- Register the admin as an agent too ---
  // emergencyWithdraw routes through the guard (C4), so the admin must be a
  // registered agent like everyone else. That is the point: no address, not
  // even the deployer's, moves funds without the policy engine seeing it.
  await (
    await registry.registerAgent(
      deployer.address,
      ethers.encodeBytes32String("ADMIN"),
      ethers.parseEther("5"),
      ethers.parseEther("50")
    )
  ).wait();
  console.log(`\nAdmin registered as an agent: ${deployer.address}`);

  // --- Daftarkan agent ---
  console.log("\nMendaftarkan agent:");
  for (const a of agents) {
    const tx = await registry.registerAgent(
      a.address,
      ethers.encodeBytes32String(a.role),
      ethers.parseEther(a.maxTx),
      ethers.parseEther(a.daily)
    );
    await tx.wait();
    console.log(`  ${a.role.padEnd(11)} ${a.address}  maxTx=${a.maxTx} daily=${a.daily}`);
  }

  // --- Isi kas ---
  await (await treasury.deposit({ value: ethers.parseEther(TREASURY_FUNDING) })).wait();
  console.log(`\nKas terisi: ${TREASURY_FUNDING} MON`);

  // --- Fund gas tiap agent (penting: akun baru Monad ada ~1,2 detik delay) ---
  console.log("\nMengisi gas tiap agent:");
  for (const a of agents) {
    const bal = await ethers.provider.getBalance(a.address);
    if (bal >= ethers.parseEther(AGENT_GAS_FUNDING)) {
      console.log(`  ${a.role.padEnd(11)} sudah ada saldo, dilewati`);
      continue;
    }
    const tx = await deployer.sendTransaction({
      to: a.address,
      value: ethers.parseEther(AGENT_GAS_FUNDING),
    });
    await tx.wait();
    console.log(`  ${a.role.padEnd(11)} +${AGENT_GAS_FUNDING} MON`);
  }

  // --- Simpan alamat ---
  const out = {
    network: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    registry: await registry.getAddress(),
    guardian: await guardian.getAddress(),
    treasury: await treasury.getAddress(),
    agents: Object.fromEntries(agents.map((a) => [a.role, a.address])),
  };

  fs.writeFileSync(path.join(__dirname, "..", "deployed.json"), JSON.stringify(out, null, 2));

  const feDir = path.join(__dirname, "..", "frontend", "src");
  if (fs.existsSync(feDir)) {
    fs.writeFileSync(path.join(feDir, "deployed.json"), JSON.stringify(out, null, 2));
    console.log("\nAlamat disalin ke frontend/src/deployed.json");
  }

  console.log("\n=== Ringkasan buat README ===");
  console.log(`AgentRegistry       : ${out.registry}`);
  console.log(`GuardianPolicyEngine: ${out.guardian}`);
  console.log(`Treasury            : ${out.treasury}`);
  console.log(`Explorer            : https://testnet.monadvision.com/address/${out.treasury}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

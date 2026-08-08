// Penyiapan panggung yang dipakai bersama demo.js dan agent-cycle.js.
// Tanpa ini, demo cuma bisa dijalankan sekali — dan gejala gagalnya
// menyesatkan (kelihatan seperti guard-nya rusak, padahal cuma kehabisan gas).

const { ethers } = require("hardhat");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STAGED_ROLES = ["INVESTMENT", "PAYMENT", "RESEARCH"];
const MIN_VAULT = ethers.parseEther("3");
const MIN_AGENT_GAS = ethers.parseEther("1");

async function prepareStage(deployed, { quiet = false } = {}) {
  const log = (m) => !quiet && console.log(m);
  const [deployer] = await ethers.getSigners();

  const guardian = await ethers.getContractAt("GuardianPolicyEngine", deployed.guardian);
  const treasury = await ethers.getContractAt("Treasury", deployed.treasury);

  log("Menyiapkan ulang baseline agent...");
  for (const role of STAGED_ROLES) {
    await (await guardian.resetAgentForDemo(deployed.agents[role])).wait();
  }

  if ((await treasury.balance()) < MIN_VAULT) {
    const topUp = MIN_VAULT - (await treasury.balance());
    log(`Kas menipis, mengisi ulang ${ethers.formatEther(topUp)} MON...`);
    await (await treasury.connect(deployer).deposit({ value: topUp })).wait();
  }

  // Monad menagih gas berdasarkan gas LIMIT, bukan gas terpakai — saldo agent
  // habis jauh lebih cepat dari dugaan, dan errornya muncul sebagai
  // "Signer had insufficient balance", bukan pesan dari guard.
  let funded = false;
  for (const role of STAGED_ROLES) {
    const addr = deployed.agents[role];
    const bal = await ethers.provider.getBalance(addr);
    if (bal < MIN_AGENT_GAS) {
      const topUp = MIN_AGENT_GAS - bal;
      log(`Gas ${role} menipis, mengisi ${ethers.formatEther(topUp)} MON...`);
      await (await deployer.sendTransaction({ to: addr, value: topUp })).wait();
      funded = true;
    }
  }

  // Delayed merkle root Monad (D=3, ~1,2 detik): saldo baru belum tentu
  // terlihat saat transaksi berikutnya divalidasi.
  if (funded) {
    log("Menunggu saldo terlihat (delayed merkle root Monad)...");
    await sleep(3000);
  }

  log("Panggung siap.\n");
  return { guardian, treasury, deployer };
}

module.exports = { prepareStage, sleep };

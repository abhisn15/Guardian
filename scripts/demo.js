// Menjalankan 4 skenario P0 langsung di Monad testnet & mencetak tx hash asli.
// Jalankan: npx hardhat run scripts/demo.js --network monadTestnet
//
// Ini bukti, bukan klaim: tiap baris "tx:" bisa dibuka di explorer.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = hre;

const EXPLORER = "https://testnet.monadvision.com/tx/";

// Monad menagih gas berdasarkan gas LIMIT, bukan gas terpakai. Kebutuhan
// nyata `executeTransfer` ~156k (diukur lewat estimateGas), jadi limit 300k
// membakar hampir 2x lipat percuma. 200k = cukup lapang tapi tidak boros.
const GAS_LIMIT = 200000;
const deployed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed.json"), "utf8"));

const b32 = (s) => ethers.decodeBytes32String(s);
const mon = (n) => ethers.parseEther(String(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function agentSigner(role) {
  const pk = process.env[`${role}_AGENT_PK`];
  return new ethers.Wallet(pk, ethers.provider);
}

async function attempt(treasury, signer, to, amount, label) {
  console.log(`  ${label}`);
  try {
    const tx = await treasury.connect(signer).executeTransfer(to, amount, { gasLimit: GAS_LIMIT });
    const receipt = await tx.wait();

    let outcome = "(tidak ada event)";
    for (const log of receipt.logs) {
      try {
        const parsed = treasury.interface.parseLog(log);
        if (parsed?.name === "TransferExecuted") outcome = "LOLOS -> dana pindah";
        if (parsed?.name === "TransferRejected") outcome = `DITOLAK -> ${b32(parsed.args[3])}`;
      } catch {
        /* log dari contract lain (Guardian), dilewati di sini */
      }
    }

    console.log(`    ${outcome}`);
    console.log(`    tx: ${EXPLORER}${tx.hash}`);
    return receipt;
  } catch (err) {
    // Jangan hentikan seluruh demo cuma karena satu langkah gagal.
    console.log(`    ERROR: ${err.shortMessage || err.message}`);
    return null;
  }
}

async function main() {
  const registry = await ethers.getContractAt("AgentRegistry", deployed.registry);
  const guardian = await ethers.getContractAt("GuardianPolicyEngine", deployed.guardian);
  const treasury = await ethers.getContractAt("Treasury", deployed.treasury);

  // Bersihkan panggung dulu supaya demo bisa diulang (dry run + demo asli).
  // Pembekuan itu permanen by design, jadi tanpa ini demo cuma jalan sekali.
  console.log("Menyiapkan ulang baseline agent...");
  for (const role of ["INVESTMENT", "PAYMENT", "RESEARCH"]) {
    await (await guardian.resetAgentForDemo(deployed.agents[role])).wait();
  }

  const [deployer] = await ethers.getSigners();

  // Isi ulang kas kalau menipis. Tanpa ini, demo yang dijalankan berulang
  // akan gagal karena kehabisan dana — bukan karena guard-nya, dan itu
  // menyesatkan di panggung.
  const MIN_VAULT = ethers.parseEther("3");
  if ((await treasury.balance()) < MIN_VAULT) {
    const topUp = MIN_VAULT - (await treasury.balance());
    console.log(`Kas menipis, mengisi ulang ${ethers.formatEther(topUp)} MON...`);
    await (await treasury.connect(deployer).deposit({ value: topUp })).wait();
  }

  // Isi ulang gas tiap agent. WAJIB: Monad menagih gas berdasarkan gas LIMIT,
  // bukan gas terpakai — jadi tiap percobaan (termasuk yang ditolak guard)
  // membakar jatah penuh. Saldo agent habis jauh lebih cepat dari dugaan,
  // dan gejalanya menyesatkan: "Signer had insufficient balance", bukan
  // pesan dari guard-nya.
  const MIN_AGENT_GAS = ethers.parseEther("1");
  let funded = false;
  for (const role of ["INVESTMENT", "PAYMENT", "RESEARCH"]) {
    const addr = deployed.agents[role];
    const bal = await ethers.provider.getBalance(addr);
    if (bal < MIN_AGENT_GAS) {
      const topUp = MIN_AGENT_GAS - bal;
      console.log(`Gas ${role} menipis, mengisi ${ethers.formatEther(topUp)} MON...`);
      await (await deployer.sendTransaction({ to: addr, value: topUp })).wait();
      funded = true;
    }
  }

  // Monad punya delayed merkle root (D=3, ~1,2 detik): saldo yang baru masuk
  // belum tentu terlihat saat transaksi berikutnya divalidasi. Tanpa jeda ini
  // gejalanya menyesatkan — "Signer had insufficient balance" padahal saldonya
  // sudah ada.
  if (funded) {
    console.log("Menunggu saldo terlihat (delayed merkle root Monad)...");
    await sleep(3000);
  }
  console.log("Siap.\n");

  const investment = agentSigner("INVESTMENT");
  const payment = agentSigner("PAYMENT");
  const research = agentSigner("RESEARCH");
  const vendor = deployed.agents.TREASURY; // tujuan pembayaran (dummy)

  console.log("GUARDIAN — demo langsung di Monad testnet");
  console.log(`Treasury: ${deployed.treasury}`);
  console.log(`Saldo kas: ${ethers.formatEther(await treasury.balance())} MON\n`);

  // ---- Skenario 1: happy path ----
  console.log("[1] HAPPY PATH — Investment agent kirim 1 MON (limit 10, budget 40)");
  await attempt(treasury, investment, vendor, mon(1), "transfer wajar");

  // ---- Skenario 2: static block ----
  console.log("\n[2] STATIC BLOCK — Payment agent minta 3 MON (limit per-tx cuma 2)");
  const balBefore = await treasury.balance();
  await attempt(treasury, payment, vendor, mon(3), "melebihi limit per-transaksi");
  const balAfter = await treasury.balance();
  console.log(`    saldo kas sebelum/sesudah: ${ethers.formatEther(balBefore)} -> ${ethers.formatEther(balAfter)} MON`);

  // ---- Skenario 3: behavioural freeze ----
  console.log("\n[3] BEHAVIOURAL FREEZE — 5x 0.1 MON, SEMUANYA lolos limit statis");
  console.log("    (dijeda 2,5 detik supaya yang memicu murni VELOCITY, bukan BURST —");
  console.log("     tanpa jeda, guard justru menangkapnya lebih cepat lewat BURST_PATTERN)");
  for (let i = 1; i <= 5; i++) {
    await attempt(treasury, payment, vendor, mon("0.1"), `transfer kecil #${i}`);
    console.log(`    frozen? ${await guardian.isFrozen(payment.address)}`);
    if (i < 5) await sleep(2500);
  }

  console.log("\n    Coba lagi dengan nominal super kecil (0.001 MON) setelah beku:");
  await attempt(treasury, payment, vendor, mon("0.001"), "agent yang sudah beku");

  const baseline = await guardian.baselineOf(payment.address);
  console.log(`\n    Baseline on-chain Payment agent (muat 1 slot 32-byte):`);
  console.log(`      lastTimestamp=${baseline.lastTimestamp} rollingAvgGwei=${baseline.rollingAvgAmount}`);
  console.log(`      txCountWindow=${baseline.txCountWindow} windowStart=${baseline.windowStart} flags=${baseline.flags}`);

  // ---- Skenario 4: separation of duty ----
  console.log("\n[4] SEPARATION OF DUTY — Research agent (read-only) coba pindahkan dana");
  console.log("    Ini fondasi anti prompt-injection: walau LLM-nya berhasil dibajak,");
  console.log("    alamat on-chain-nya memang tidak pernah boleh memindahkan dana.");
  await attempt(treasury, research, vendor, mon("0.0005"), "role read-only");

  // ---- Bukti paralelisme ----
  console.log("\n[5] BUKTI TIDAK ADA COUNTER GLOBAL");
  const bInv = await guardian.baselineOf(investment.address);
  const bPay = await guardian.baselineOf(payment.address);
  console.log(`    Investment txCountWindow=${bInv.txCountWindow}, frozen=${await guardian.isFrozen(investment.address)}`);
  console.log(`    Payment    txCountWindow=${bPay.txCountWindow}, frozen=${await guardian.isFrozen(payment.address)}`);
  console.log("    Payment beku, Investment tetap jalan — state-nya per-address,");
  console.log("    jadi Monad tidak perlu men-serialize eksekusi antar agent.");

  console.log(`\nSaldo kas akhir: ${ethers.formatEther(await treasury.balance())} MON`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

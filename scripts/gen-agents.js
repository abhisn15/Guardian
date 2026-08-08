// Generate 5 wallet agent (alamat on-chain terpisah = separation of duty).
// Jalankan: node scripts/gen-agents.js
// Output-nya di-paste ke .env. JANGAN commit .env.

const { Wallet } = require("ethers");

const ROLES = ["TREASURY", "RESEARCH", "INVESTMENT", "PAYMENT", "REPORTING"];

console.log("# --- generated agent keys, paste ke .env ---");
for (const role of ROLES) {
  const w = Wallet.createRandom();
  console.log(`${role}_AGENT_PK=${w.privateKey}`);
  console.log(`# ${role} address: ${w.address}`);
}
console.log("# ------------------------------------------");
console.log("# Ingat: fund semua alamat di atas dengan MON sebelum demo.");
console.log("# Monad punya ~1,2 detik delay buat akun baru (D=3 delayed merkle root),");
console.log("# jadi fund duluan, jangan pas cycle pertama jalan.");

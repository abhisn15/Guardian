# GUARDIAN

**On-chain adaptive permission & behavioural guard untuk AI agent treasury — di Monad.**

Ancaman terbesar buat kas yang dikelola AI bukan hacker dari luar, tapi agent-nya sendiri
yang melenceng: kena prompt injection, bug, atau salah nalar. GUARDIAN duduk **di jalur
eksekusi** — bukan monitor pasif di pinggir — jadi tidak ada jeda antara "terdeteksi" dan
"keburu tereksekusi".

---

## Alamat Contract (Monad Testnet, chain ID 10143)

| Contract | Alamat |
|---|---|
| `AgentRegistry` | [`0xCB8F74F53da1DE43d4203478F12DC6385EeC0D2e`](https://testnet.monadvision.com/address/0xCB8F74F53da1DE43d4203478F12DC6385EeC0D2e) |
| `GuardianPolicyEngine` | [`0x7DF086C3D413291fbeB4a34c9ECa6AbbE418D9B8`](https://testnet.monadvision.com/address/0x7DF086C3D413291fbeB4a34c9ECa6AbbE418D9B8) |
| `Treasury` | [`0xe50388011D54f8071D3bA64f710758892B72242e`](https://testnet.monadvision.com/address/0xe50388011D54f8071D3bA64f710758892B72242e) |

### Alamat agent (tiap role = alamat on-chain terpisah)

| Role | Alamat | Limit per-tx | Budget harian |
|---|---|---|---|
| TREASURY | `0x91fFeff55B6a598858EA7EF9cdba7Da784fCDf0A` | 10 MON | 60 MON |
| INVESTMENT | `0x85028e6661413f8093310D00B2665A7E2f4C30eC` | 10 MON | 40 MON |
| PAYMENT | `0x1c495adf5e522A2Af91e9021533c3F1Db8544c61` | 2 MON | 20 MON |
| RESEARCH | `0xf92A03ECD7C7f735c2F664A41Bf4127d8B015227` | read-only | read-only |
| REPORTING | `0xd98d8C01B0Be34cDa0b78302E483Ea81ce84885C` | read-only | read-only |

---

## Masalah yang dipecahkan

Pertahanan yang ada sekarang semuanya jebol di titik yang sama:

- **Limit statis (ERC-7265)** — susah dikalibrasi. Terlalu ketat memblokir aktivitas sah,
  terlalu longgar meloloskan penyalahgunaan. Dan **tidak bisa** menangkap 20 transfer kecil
  beruntun yang masing-masing di bawah limit.
- **Monitoring off-chain (Blockaid, Phalcon)** — cuma mendeteksi dan mengirim alert.
  Responsnya 30–60 detik dan bergantung relayer pihak ketiga.
- **Multisig manual** — responsnya menit sampai jam. Tidak relevan buat agent yang
  bertransaksi tiap detik.

Yang belum ada: guard yang mengawasi **pola perilaku** agent internal yang identitasnya
sudah terdaftar on-chain, langsung di dalam jalur eksekusi protokolnya sendiri.

---

## Cara kerja

Dua lapis, dievaluasi sebelum dana bergerak sedikit pun:

**Layer 1 — statis.** Limit per-transaksi dan akumulasi budget harian per agent.

**Layer 2 — behavioural.** Tiap agent punya baseline perilakunya sendiri yang diperbarui
tiap interaksi. Tiga pola yang ditangkap:

| Pola | Pemicu |
|---|---|
| `VELOCITY_SPIKE` | > 4 aksi dalam window 60 detik |
| `BURST_PATTERN` | aksi beruntun berjarak < 2 detik (pola menguras dana) |
| `AMOUNT_DEVIATION` | nominal > 3× rata-rata bergerak agent itu sendiri |

Begitu terdeteksi, agent dibekukan — dan **semua** transfer berikutnya ditolak, sekecil
apa pun nominalnya.

---

## Kenapa harus Monad

Ini bukan aplikasi EVM generik yang kebetulan di-deploy di chain baru. Empat sifat Monad
yang dipakai langsung:

**1. State per-address, bukan counter global.** Kalau baseline ditulis ke satu counter
global, setiap aksi agent akan menyentuh slot yang sama dan Monad terpaksa **men-serialize**
eksekusinya — keunggulan parallel execution-nya hilang. Semua state GUARDIAN per-address.
Dibuktikan di demo: Payment agent beku sementara Investment agent tetap jalan normal.

**2. Baseline dipadatkan ke satu slot 32-byte.** Cold storage di Monad ~8.100 gas
(vs ~2.100 di Ethereum). Struct yang gemuk bikin guard-nya mahal dan mematahkan klaim
"guard ini murah".

```solidity
struct Baseline {
    uint64 lastTimestamp;    // 8B
    uint64 rollingAvgAmount; // 8B  (satuan gwei — lihat catatan skala di bawah)
    uint32 txCountWindow;    // 4B
    uint32 windowStart;      // 4B
    uint64 flags;            // 8B  (bit 0 = frozen)
}                            // = 32B, persis 1 slot
```

**3. Tidak ada mempool publik global.** Guard off-chain kehilangan pijakannya — on-chain
jadi satu-satunya pilihan yang masuk akal.

**4. Gas ditagih berdasarkan gas *limit*, bukan gas terpakai.** Penyerang yang menggedor
agent yang sudah beku tetap membakar MON di setiap percobaan. Efek jera ekonominya dapat
tanpa perlu revert.

---

## Dua keputusan desain yang lahir dari kegagalan nyata

Keduanya ketahuan lewat test, bukan teori:

**1. Penolakan tidak boleh di-`revert`.** Versi pertama me-`revert` saat guard menolak.
Test langsung gagal: `revert` membatalkan **seluruh** perubahan state di transaksi itu —
termasuk penandaan `frozen` yang baru saja ditulis Guardian. Guard-nya jadi amnesia dan
agent nakal bisa mencoba selamanya tanpa pernah benar-benar beku. Sekarang penolakan
dicatat sebagai event, dana tidak bergerak, dan pembekuannya bertahan. Efek jeranya tetap
ada lewat sifat gas Monad di poin 4 di atas.

**2. Guard dievaluasi sebelum cek saldo.** Awalnya saldo kas dicek duluan. Akibatnya
pelanggaran kebijakan atas nominal yang kebetulan lebih besar dari isi kas ter-revert
sebagai "saldo kurang" dan **tidak pernah tercatat sebagai pelanggaran**. Perilaku agent
harus terekam apa pun kondisi kasnya.

**Catatan skala:** `uint64` tidak muat menampung wei (maksimalnya cuma ~18 MON), jadi
`rollingAvgAmount` disimpan dalam gwei — sanggup sampai ~1,8 × 10¹⁰ MON dan tetap muat
8 byte.

---

## Bukti — dijalankan langsung di testnet

`npx hardhat run scripts/demo.js --network monadTestnet`

| # | Skenario | Hasil | Bukti |
|---|---|---|---|
| 1 | Happy path | LOLOS | [`0x348fa6…`](https://testnet.monadvision.com/tx/0x348fa600c84f2107de3c548b9781d5f69727b658f647bc5ab0178c110673e102) |
| 2 | Melebihi limit per-tx | `EXCEEDS_TX_LIMIT`, saldo kas 4.0 → 4.0 | [`0x25b1ca…`](https://testnet.monadvision.com/tx/0x25b1cacacb2a070c2796a141695d839c559c9233a4128da755ac7d51d0bce1f5) |
| 3 | 5 transfer kecil, semuanya lolos limit statis | #5 → `VELOCITY_SPIKE` → **beku** | [`0xf775fd…`](https://testnet.monadvision.com/tx/0xf775fd91f554d6ff8341164a8e8a5dfb3e5681d2b2e32261cb6bab4f09e062a0) |
| 3b | Agent beku coba 0.001 MON | `AGENT_FROZEN` | [`0xe4b7e7…`](https://testnet.monadvision.com/tx/0xe4b7e7497c7df6b988fa7b35ae717757975fa0a7359066730b1f99762677d929) |
| 4 | Role read-only coba pindahkan dana | `READ_ONLY_ROLE` | [`0xff103b…`](https://testnet.monadvision.com/tx/0xff103b027c6982eeb6c491e0b9bb3bad0161b0dbb52818083b2ebdfc5b5d2a27) |

Test lokal: **10/10 lolos** (`npx hardhat test`).

---

## Menjalankan

### Contract

```bash
npm install
cp .env.example .env          # isi PRIVATE_KEY
node scripts/gen-agents.js    # generate 5 wallet agent -> paste ke .env
npx hardhat test              # 10 test
npm run deploy:monad          # deploy + daftarkan agent + isi kas & gas
npx hardhat run scripts/demo.js --network monadTestnet
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Batas jujur

**Kalibrasi false-positive belum selesai.** Ambang `VELOCITY_SPIKE` di 4 aksi/menit dan
`AMOUNT_DEVIATION` di 3× rata-rata itu titik awal, bukan angka yang sudah tervalidasi.
Agent sah yang tiba-tiba sibuk bisa kena beku. Ini **ketegangan desain yang melekat** pada
guard berbasis perilaku — bukan bug yang kelewat: guard yang tidak pernah salah-tangkap
hampir pasti juga tidak menangkap apa-apa. Yang bisa kami klaim: pola yang lolos semua
limit statis memang tertangkap, dan tiap keputusannya bisa diaudit on-chain.

**Belum ada alur unfreeze.** Disengaja — memilih siapa yang berhak mencairkan pembekuan
adalah pertanyaan tata kelola, bukan pertanyaan teknis, dan tidak pantas dijawab
buru-buru dalam hackathon sehari.

---

## Lisensi

MIT

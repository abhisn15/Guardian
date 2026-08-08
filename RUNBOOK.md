# RUNBOOK — Demo Panggung GUARDIAN

Checklist operasional. Bukan dokumen produk — ini yang dibaca 15 menit sebelum naik panggung.

---

## T-60 menit: persiapan

```bash
cd guardian
npx hardhat test                                        # harus 10/10 lolos
npx hardhat run scripts/demo.js --network monadTestnet  # DRY RUN penuh
```

Dry run **wajib** dilakukan. Script-nya otomatis:
- me-reset baseline agent (kalau tidak, demo cuma jalan sekali — pembekuan itu permanen),
- mengisi ulang kas kalau menipis,
- mengisi ulang gas tiap agent,
- menunggu 3 detik untuk delayed merkle root Monad.

Jadi dry run **tidak** merusak demo asli. Justru sebaliknya: dry run yang membuat demo
asli pasti jalan.

Lalu:

```bash
cd frontend && npm run dev
```

Buka dashboard **sebelum** naik panggung. Event masuk secara live; kalau baru dibuka
setelah script jalan, riwayatnya cuma terambil ~5 menit ke belakang.

### Checklist fisik
- [ ] Dashboard sudah terbuka di tab sendiri, sudah menampilkan 5 kartu agent
- [ ] Tab explorer sudah terbuka di alamat Treasury
- [ ] Terminal sudah di folder `guardian`, perintah demo sudah diketik (tinggal Enter)
- [ ] Rekaman video demo lengkap sebagai cadangan
- [ ] Screenshot tiap event kunci di explorer
- [ ] Hotspot HP siap (jangan andalkan WiFi venue)

---

## Urutan demo (3 menit)

| Waktu | Aksi | Yang diucapkan |
|---|---|---|
| 0:00–0:15 | Dashboard sudah tampil di layar | "Kas ini dijalankan lima AI agent. Kalau salah satu melenceng, limit statis tidak akan menangkapnya. Lihat." |
| 0:15–0:50 | Enter di terminal. Tunjuk baris **TRANSFER LOLOS** muncul di dashboard | "Investment agent kirim 1 MON. Lolos, wajar. Tiap keputusan jadi event tersendiri, teratribusi ke alamat agent-nya." |
| 0:50–1:20 | Tunjuk **EXCEEDS_TX_LIMIT** lalu 4 baris **TRANSFER LOLOS** 0.1 MON | "Sekarang yang menarik. Empat transfer kecil — semuanya lolos limit statis. Tidak ada satu pun yang melanggar aturan." |
| 1:20–1:50 | Tunjuk **ANOMALI PERILAKU** → **AGENT DIBEKUKAN** → kartu PAYMENT berubah merah | "Yang kelima memicu VELOCITY_SPIKE. Agent dibekukan. Lalu 0.001 MON pun ditolak — bukan karena nominalnya, tapi karena agent-nya sudah beku." |
| 1:50–2:10 | Tunjuk **READ_ONLY_ROLE** | "Research agent mencoba memindahkan dana. Ditolak. Guard memeriksa `msg.sender`, bukan role yang dikirim backend — jadi kalaupun LLM-nya kena prompt injection, alamatnya memang tidak pernah boleh memindahkan dana." |
| 2:10–2:45 | Tunjuk kartu INVESTMENT masih **AKTIF** | "Kenapa Monad. Satu: baseline-nya per-address, muat satu slot 32-byte. Kalau ini counter global, tiap aksi agent menyentuh slot yang sama dan Monad terpaksa men-serialize eksekusi — paralelismenya hilang. Payment beku, Investment tetap jalan. Dua: tidak ada mempool publik, jadi guard off-chain kehilangan pijakan. Tiga: gas ditagih per gas-limit, jadi penyerang yang menggedor agent beku tetap membakar MON." |
| 2:45–3:00 | Tampilkan README (alamat contract) | "Kalibrasi false-positive belum selesai — itu ketegangan desain yang melekat, bukan bug yang kelewat. Alamat contract dan repo ada di sini." |

---

## Kalau ditanya juri

**"Kenapa penolakan tidak di-revert?"**
Karena revert membatalkan seluruh perubahan state di transaksi itu — termasuk penandaan
`frozen` yang baru saja ditulis. Guard-nya jadi amnesia dan agent nakal bisa mencoba
selamanya. Ini ketahuan dari test, bukan dari teori. Efek jeranya tetap ada karena Monad
menagih gas per gas-limit, jadi tiap percobaan tetap membakar MON.

**"Bagaimana cara unfreeze?"**
Belum ada, dan itu disengaja. Menentukan siapa yang berhak mencairkan pembekuan adalah
pertanyaan tata kelola, bukan teknis. Ada `resetAgentForDemo` yang admin-only murni untuk
menyiapkan ulang panggung — itu bukan jawaban produknya.

**"Bagaimana kalau agent sah kena beku?"**
Bisa, dan kami tidak mengklaim sudah menyelesaikannya. Guard berbasis perilaku yang tidak
pernah salah-tangkap hampir pasti juga tidak menangkap apa-apa. Yang kami klaim: pola yang
lolos semua limit statis memang tertangkap, dan tiap keputusannya bisa diaudit on-chain.

**"Kenapa tidak pakai off-chain monitoring saja?"**
Monad tidak punya mempool publik global, jadi guard off-chain kehilangan titik intersepsi.
Dan monitoring pasif responsnya 30–60 detik — tidak relevan untuk finality 600ms.

---

## Kalau demo gagal di panggung

| Gejala | Sebab | Tindakan |
|---|---|---|
| `Signer had insufficient balance` | Gas agent habis. Monad menagih per gas-limit, jadi habisnya lebih cepat dari dugaan | Jalankan ulang `demo.js` — dia mengisi ulang otomatis lalu menunggu merkle root |
| Dashboard kosong | Dibuka setelah script jalan | Refresh; riwayat 5 menit terakhir akan tertarik |
| Kartu agent jadi "…" | RPC kena rate limit | Biarkan — nilai terakhir dipertahankan, akan pulih sendiri |
| Feed berhenti | Satu petak getLogs gagal | Cursor tidak dimajukan, otomatis dicoba lagi di poll berikutnya |
| Semua macet | RPC publik ngambek | Putar rekaman video cadangan, lanjut bicara |

---

## Angka yang harus diingat

- Baseline: **32 byte, 1 slot** (8+8+4+4+8)
- Cold storage Monad **~8.100 gas** vs Ethereum ~2.100
- `executeTransfer` butuh **~156k gas**; limit dipasang 200k
- Finality Monad **~600ms**, block **~300ms**
- `VELOCITY_SPIKE`: >4 aksi / 60 detik
- `BURST_PATTERN`: jarak antar-aksi <2 detik
- `AMOUNT_DEVIATION`: >3× rata-rata bergerak agent itu sendiri

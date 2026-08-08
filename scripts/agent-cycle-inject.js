// Pembungkus tipis: menyalakan mode injeksi lalu menjalankan siklus normal.
// Ada supaya `npm run cycle:inject` jalan sama di PowerShell maupun bash,
// tanpa perlu dependensi cross-env.
process.env.INJECT = "1";
require("./agent-cycle.js");

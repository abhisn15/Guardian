const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const ROLE_INVESTMENT = ethers.encodeBytes32String("INVESTMENT");
const ROLE_PAYMENT = ethers.encodeBytes32String("PAYMENT");
const ROLE_RESEARCH = ethers.encodeBytes32String("RESEARCH");

const mon = (n) => ethers.parseEther(String(n));

async function deployAll() {
  const [admin, investment, payment, research, outsider, vendor] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy();

  const Guardian = await ethers.getContractFactory("GuardianPolicyEngine");
  const guardian = await Guardian.deploy(await registry.getAddress());

  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(await guardian.getAddress());

  await guardian.setTreasury(await treasury.getAddress());

  // Sesuai PRD: Investment 40 MON budget / 10 MON per posisi,
  // Payment 20 MON budget / 2 MON per transaksi.
  await registry.registerAgent(investment.address, ROLE_INVESTMENT, mon(10), mon(40));
  await registry.registerAgent(payment.address, ROLE_PAYMENT, mon(2), mon(20));
  await registry.registerAgent(research.address, ROLE_RESEARCH, mon(1), mon(1));

  await treasury.deposit({ value: mon(100) });

  return { admin, investment, payment, research, outsider, vendor, registry, guardian, treasury };
}

describe("GUARDIAN", function () {
  describe("Skenario 1 — Happy path", function () {
    it("transfer dalam limit lolos & tercatat on-chain", async function () {
      const { investment, vendor, treasury, guardian } = await deployAll();

      await expect(treasury.connect(investment).executeTransfer(vendor.address, mon(5)))
        .to.emit(treasury, "TransferExecuted")
        .withArgs(investment.address, vendor.address, mon(5));

      expect(await guardian.spentToday(investment.address)).to.equal(mon(5));
      expect(await guardian.isFrozen(investment.address)).to.equal(false);
    });
  });

  describe("Skenario 2 — Static block", function () {
    it("tolak transfer di atas limit per-transaksi, saldo tidak berubah", async function () {
      const { payment, vendor, treasury } = await deployAll();
      const before = await treasury.balance();

      await expect(treasury.connect(payment).executeTransfer(vendor.address, mon(5))) // limit 2 MON
        .to.emit(treasury, "TransferRejected")
        .withArgs(payment.address, vendor.address, mon(5), ethers.encodeBytes32String("EXCEEDS_TX_LIMIT"));

      expect(await treasury.balance()).to.equal(before);
    });

    it("tolak kalau akumulasi harian terlampaui", async function () {
      const { payment, vendor, treasury } = await deployAll();

      // Budget harian 20 MON, limit per-tx 2 MON. Jalankan pelan biar
      // tidak kena guard behavioural (fokus tes ini di layer statis).
      for (let i = 0; i < 10; i++) {
        await treasury.connect(payment).executeTransfer(vendor.address, mon(2));
        await time.increase(120);
      }

      await expect(treasury.connect(payment).executeTransfer(vendor.address, mon(2)))
        .to.emit(treasury, "TransferRejected")
        .withArgs(
          payment.address,
          vendor.address,
          mon(2),
          ethers.encodeBytes32String("EXCEEDS_DAILY_BUDGET")
        );
    });
  });

  describe("Skenario 3 — Behavioural freeze", function () {
    it("VELOCITY_SPIKE: 5 transfer kecil yang SEMUANYA lolos limit statis tetap ketahuan", async function () {
      const { payment, vendor, treasury, guardian } = await deployAll();

      // Masing-masing 1 MON — jauh di bawah limit 2 MON/tx dan 20 MON/hari.
      // Diberi jarak > BURST_GAP biar yang memicu murni velocity.
      for (let i = 0; i < 4; i++) {
        await treasury.connect(payment).executeTransfer(vendor.address, mon(1));
        await time.increase(5);
      }

      expect(await guardian.isFrozen(payment.address)).to.equal(false);

      await expect(treasury.connect(payment).executeTransfer(vendor.address, mon(1)))
        .to.emit(guardian, "BehavioralAnomalyDetected")
        .and.to.emit(guardian, "AgentFrozen");

      expect(await guardian.isFrozen(payment.address)).to.equal(true);
    });

    it("pembekuan BERTAHAN setelah transaksi selesai (bukan ikut ter-rollback)", async function () {
      const { payment, vendor, treasury, guardian } = await deployAll();

      for (let i = 0; i < 5; i++) {
        await treasury.connect(payment).executeTransfer(vendor.address, mon(1));
        await time.increase(5);
      }
      expect(await guardian.isFrozen(payment.address)).to.equal(true);

      await time.increase(3600); // window sudah lewat — tetap harus ditolak
      await expect(treasury.connect(payment).executeTransfer(vendor.address, mon("0.001")))
        .to.emit(treasury, "TransferRejected")
        .withArgs(
          payment.address,
          vendor.address,
          mon("0.001"),
          ethers.encodeBytes32String("AGENT_FROZEN")
        );
    });

    it("BURST_PATTERN: transfer beruntun sangat rapat ketahuan lebih cepat", async function () {
      const { payment, vendor, treasury, guardian } = await deployAll();

      await treasury.connect(payment).executeTransfer(vendor.address, mon(1));
      await treasury.connect(payment).executeTransfer(vendor.address, mon(1));

      // Aksi ke-3 tanpa jeda -> pola menguras dana.
      await expect(treasury.connect(payment).executeTransfer(vendor.address, mon(1)))
        .to.emit(guardian, "BehavioralAnomalyDetected")
        .withArgs(payment.address, ethers.encodeBytes32String("BURST_PATTERN"), anyValue);

      expect(await guardian.isFrozen(payment.address)).to.equal(true);
    });
  });

  describe("Skenario 4 — Separation of duty (fondasi tahan prompt injection)", function () {
    it("role read-only tidak bisa memindahkan dana sama sekali", async function () {
      const { research, vendor, treasury } = await deployAll();

      await expect(treasury.connect(research).executeTransfer(vendor.address, mon("0.0001")))
        .to.emit(treasury, "TransferRejected")
        .withArgs(
          research.address,
          vendor.address,
          mon("0.0001"),
          ethers.encodeBytes32String("READ_ONLY_ROLE")
        );
    });

    it("alamat tak terdaftar ditolak", async function () {
      const { outsider, vendor, treasury } = await deployAll();

      await expect(treasury.connect(outsider).executeTransfer(vendor.address, mon(1)))
        .to.emit(treasury, "TransferRejected")
        .withArgs(
          outsider.address,
          vendor.address,
          mon(1),
          ethers.encodeBytes32String("NOT_REGISTERED")
        );
    });
  });

  describe("C4 — single guarded fund exit", function () {
    it("admin exit is subject to the same policy engine", async function () {
      const { admin, vendor, treasury, registry } = await deployAll();

      // Admin registered with a 2 MON per-tx ceiling.
      await registry.registerAgent(
        admin.address,
        ethers.encodeBytes32String("ADMIN"),
        mon(2),
        mon(50)
      );

      const before = await treasury.balance();

      // Above the ceiling -> guard blocks the ADMIN, funds stay put.
      await expect(treasury.connect(admin).emergencyWithdraw(vendor.address, mon(10)))
        .to.emit(treasury, "TransferRejected")
        .withArgs(
          admin.address,
          vendor.address,
          mon(10),
          ethers.encodeBytes32String("EXCEEDS_TX_LIMIT")
        );

      expect(await treasury.balance()).to.equal(before);
    });

    it("an unregistered admin cannot move funds at all", async function () {
      const { admin, vendor, treasury } = await deployAll();
      const before = await treasury.balance();

      await expect(treasury.connect(admin).emergencyWithdraw(vendor.address, mon(1)))
        .to.emit(treasury, "TransferRejected")
        .withArgs(
          admin.address,
          vendor.address,
          mon(1),
          ethers.encodeBytes32String("NOT_REGISTERED")
        );

      expect(await treasury.balance()).to.equal(before);
    });

    it("exposes no fund-moving function other than the two guarded ones", async function () {
      const { treasury } = await deployAll();

      const movers = treasury.interface.fragments
        .filter((f) => f.type === "function" && f.stateMutability !== "view")
        .map((f) => f.name)
        .filter((n) => !["deposit"].includes(n));

      expect(movers.sort()).to.deep.equal(["emergencyWithdraw", "executeTransfer"]);
    });
  });

  describe("Klaim arsitektur", function () {
    it("Baseline muat persis 1 storage slot", async function () {
      const { guardian, investment, vendor, treasury } = await deployAll();
      await treasury.connect(investment).executeTransfer(vendor.address, mon(1));

      // Slot 0 mapping _baselines -> kalau lebih dari 1 slot, layout ini pecah.
      const b = await guardian.baselineOf(investment.address);
      expect(b.lastTimestamp).to.be.greaterThan(0);
      expect(b.txCountWindow).to.equal(1);
    });

    it("baseline agent A tidak menyentuh baseline agent B (bukti tidak ada counter global)", async function () {
      const { investment, payment, vendor, treasury, guardian } = await deployAll();

      await treasury.connect(investment).executeTransfer(vendor.address, mon(3));

      const bPayment = await guardian.baselineOf(payment.address);
      expect(bPayment.txCountWindow).to.equal(0);
      expect(bPayment.lastTimestamp).to.equal(0);
    });
  });
});

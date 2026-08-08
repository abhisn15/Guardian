// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";
import {GuardianTypes} from "./GuardianTypes.sol";

/// @title GuardianPolicyEngine — dua lapis guard di execution path
/// @notice Layer 1 statis (limit per-tx & budget harian) + Layer 2 behavioural
/// (baseline perilaku per-agent). Layer 2 yang menangkap pola yang lolos
/// semua limit statis — misal 5 transfer kecil beruntun.
///
/// === Kenapa state-nya PER-ADDRESS, bukan counter global ===
/// Kalau baseline ditulis ke satu counter global, setiap aksi agent akan
/// menyentuh slot yang sama -> Monad terpaksa men-serialize eksekusinya dan
/// keunggulan parallel execution-nya hilang. Per-address = tiap agent nulis
/// slot berbeda = tetap paralel.
///
/// === Kenapa struct-nya dipadatkan ke 1 slot ===
/// Cold storage di Monad ~8.100 gas (vs 2.100 di Ethereum). Struct yang
/// gemuk bikin guard-nya mahal dan mematahkan klaim "guard ini murah".
contract GuardianPolicyEngine {
    /// @dev PERSIS 32 byte = 1 storage slot.
    /// 8 + 8 + 4 + 4 + 8 = 32
    struct Baseline {
        uint64 lastTimestamp; // 8B — waktu aksi terakhir
        uint64 rollingAvgAmount; // 8B — EMA nominal, dalam GWEI (lihat catatan skala)
        uint32 txCountWindow; // 4B — jumlah aksi di window berjalan
        uint32 windowStart; // 4B — awal window berjalan
        uint64 flags; // 8B — bit 0 = frozen, bit 8+ = sample count
    }

    /// @dev Budget harian juga per-address (alasan paralelisme yang sama). 1 slot.
    struct DailySpend {
        uint128 spentToday;
        uint64 dayIndex;
    }

    // ---- Skala nominal ----
    // uint64 tidak muat menampung wei (uint64 max ~1,8e19 wei ~= 18 MON).
    // Jadi rollingAvgAmount disimpan dalam GWEI (wei / 1e9): uint64 sanggup
    // sampai ~1,8e10 MON — jauh lebih dari cukup, tetap muat 8 byte.
    uint256 private constant WEI_PER_GWEI = 1e9;

    // ---- Parameter behavioural ----
    uint32 public constant WINDOW_SECONDS = 60;
    uint32 public constant MAX_TX_PER_WINDOW = 4; // aksi ke-5 memicu VELOCITY_SPIKE
    uint64 public constant DEVIATION_MULTIPLE = 3; // >3x rata-rata = menyimpang
    uint64 public constant MIN_SAMPLES_FOR_DEVIATION = 3;
    uint64 public constant BURST_GAP_SECONDS = 2; // aksi beruntun < 2 detik

    uint64 private constant FLAG_FROZEN = 1;
    uint64 private constant SAMPLE_SHIFT = 8;

    AgentRegistry public immutable registry;
    address public immutable admin;
    address public treasury;

    mapping(address => Baseline) private _baselines;
    mapping(address => DailySpend) private _dailySpend;

    error NotAdmin();
    error NotTreasury();
    error TreasuryAlreadySet();
    error AgentNotRegistered(address agent);
    error AgentIsFrozen(address agent);
    error ExceedsTxLimit(address agent, uint256 requested, uint256 maxAllowed);
    error ExceedsDailyBudget(address agent, uint256 requested, uint256 remaining);
    error BehavioralAnomaly(address agent, bytes32 pattern);

    event ComplianceChecked(address indexed agent, uint256 amount, bool passed, bytes32 reason);
    event TransactionBlocked(address indexed agent, uint256 requested, uint256 maxAllowed);
    event BehavioralAnomalyDetected(
        address indexed agent,
        bytes32 indexed pattern,
        uint256 blockNumber
    );
    event AgentFrozen(address indexed agent, bytes32 reason);

    modifier onlyTreasury() {
        if (msg.sender != treasury) revert NotTreasury();
        _;
    }

    constructor(address registry_) {
        registry = AgentRegistry(registry_);
        admin = msg.sender;
    }

    function setTreasury(address treasury_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (treasury != address(0)) revert TreasuryAlreadySet();
        treasury = treasury_;
    }

    // ---------------------------------------------------------------
    // Jalur utama: dipanggil Treasury sebelum dana bergerak
    // ---------------------------------------------------------------

    /// @notice Evaluasi permintaan transfer & catat perilakunya.
    /// @dev Mengembalikan status, bukan revert, supaya penolakan tetap
    /// meninggalkan jejak event on-chain yang bisa diaudit.
    function checkAndRecord(address agent, uint256 amount)
        external
        onlyTreasury
        returns (bool allowed, bytes32 reason)
    {
        // --- Gate identitas ---
        if (!registry.isRegistered(agent)) {
            emit ComplianceChecked(agent, amount, false, GuardianTypes.NOT_REGISTERED);
            return (false, GuardianTypes.NOT_REGISTERED);
        }
        if (registry.isReadOnly(agent)) {
            emit ComplianceChecked(agent, amount, false, GuardianTypes.READ_ONLY_ROLE);
            return (false, GuardianTypes.READ_ONLY_ROLE);
        }

        Baseline memory b = _baselines[agent];
        if (b.flags & FLAG_FROZEN != 0) {
            emit ComplianceChecked(agent, amount, false, GuardianTypes.AGENT_FROZEN);
            return (false, GuardianTypes.AGENT_FROZEN);
        }

        // --- Layer 1: statis ---
        (uint128 maxTxLimit, uint128 dailyBudget) = registry.limitsOf(agent);

        if (amount > maxTxLimit) {
            emit TransactionBlocked(agent, amount, maxTxLimit);
            emit ComplianceChecked(agent, amount, false, GuardianTypes.EXCEEDS_TX_LIMIT);
            return (false, GuardianTypes.EXCEEDS_TX_LIMIT);
        }

        DailySpend memory d = _dailySpend[agent];
        uint64 today = uint64(block.timestamp / 1 days);
        uint128 spent = d.dayIndex == today ? d.spentToday : 0;

        if (uint256(spent) + amount > dailyBudget) {
            uint256 remaining = dailyBudget > spent ? dailyBudget - spent : 0;
            emit TransactionBlocked(agent, amount, remaining);
            emit ComplianceChecked(agent, amount, false, GuardianTypes.EXCEEDS_DAILY_BUDGET);
            return (false, GuardianTypes.EXCEEDS_DAILY_BUDGET);
        }

        // --- Layer 2: behavioural ---
        (bytes32 pattern, Baseline memory updated) = _evaluateBehaviour(b, amount);

        if (pattern != GuardianTypes.OK) {
            updated.flags |= FLAG_FROZEN;
            _baselines[agent] = updated;

            emit BehavioralAnomalyDetected(agent, pattern, block.number);
            emit AgentFrozen(agent, pattern);
            emit ComplianceChecked(agent, amount, false, pattern);
            return (false, pattern);
        }

        // --- Lolos: commit state ---
        _baselines[agent] = updated;
        _dailySpend[agent] = DailySpend({spentToday: spent + uint128(amount), dayIndex: today});

        emit ComplianceChecked(agent, amount, true, GuardianTypes.OK);
        return (true, GuardianTypes.OK);
    }

    // ---------------------------------------------------------------
    // Logika behavioural (pure — gampang di-reason & di-test)
    // ---------------------------------------------------------------

    function _evaluateBehaviour(Baseline memory b, uint256 amount)
        private
        view
        returns (bytes32 pattern, Baseline memory updated)
    {
        uint64 nowTs = uint64(block.timestamp);
        uint64 amountGwei = uint64(amount / WEI_PER_GWEI);
        uint64 samples = b.flags >> SAMPLE_SHIFT;

        // Reset window kalau sudah lewat.
        uint32 windowStart = b.windowStart;
        uint32 txCount = b.txCountWindow;
        if (windowStart == 0 || nowTs >= uint64(windowStart) + WINDOW_SECONDS) {
            windowStart = uint32(nowTs);
            txCount = 0;
        }
        txCount += 1;

        updated = Baseline({
            lastTimestamp: nowTs,
            rollingAvgAmount: samples == 0
                ? amountGwei
                : uint64((uint256(b.rollingAvgAmount) * 3 + amountGwei) / 4), // EMA
            txCountWindow: txCount,
            windowStart: windowStart,
            flags: (b.flags & FLAG_FROZEN) | ((samples + 1) << SAMPLE_SHIFT)
        });

        // 1) Terlalu banyak aksi dalam satu window.
        if (txCount > MAX_TX_PER_WINDOW) {
            return (GuardianTypes.VELOCITY_SPIKE, updated);
        }

        // 2) Aksi beruntun sangat rapat — pola menguras dana.
        if (
            b.lastTimestamp != 0 &&
            nowTs - b.lastTimestamp < BURST_GAP_SECONDS &&
            txCount >= 3
        ) {
            return (GuardianTypes.BURST_PATTERN, updated);
        }

        // 3) Nominal jauh menyimpang dari kebiasaan agent ini sendiri.
        if (
            samples >= MIN_SAMPLES_FOR_DEVIATION &&
            b.rollingAvgAmount != 0 &&
            amountGwei > b.rollingAvgAmount * DEVIATION_MULTIPLE
        ) {
            return (GuardianTypes.AMOUNT_DEVIATION, updated);
        }

        return (GuardianTypes.OK, updated);
    }

    // ---------------------------------------------------------------
    // Staging demo (admin-only)
    // ---------------------------------------------------------------

    /// @notice Bersihkan baseline & pembekuan supaya demo bisa diulang.
    /// @dev INI BUKAN alur "unfreeze" produk. Menentukan siapa yang berhak
    /// mencairkan pembekuan adalah pertanyaan TATA KELOLA, dan sengaja belum
    /// dijawab (lihat README). Fungsi ini murni admin-only untuk menyiapkan
    /// ulang panggung demo; di produksi ia harus diganti proses bertanda
    /// tangan jamak, bukan satu alamat admin.
    function resetAgentForDemo(address agent) external {
        if (msg.sender != admin) revert NotAdmin();
        delete _baselines[agent];
        delete _dailySpend[agent];
        emit AgentResetForDemo(agent);
    }

    event AgentResetForDemo(address indexed agent);

    // ---------------------------------------------------------------
    // View
    // ---------------------------------------------------------------

    function baselineOf(address agent) external view returns (Baseline memory) {
        return _baselines[agent];
    }

    function isFrozen(address agent) external view returns (bool) {
        return _baselines[agent].flags & FLAG_FROZEN != 0;
    }

    function spentToday(address agent) external view returns (uint256) {
        DailySpend memory d = _dailySpend[agent];
        return d.dayIndex == uint64(block.timestamp / 1 days) ? d.spentToday : 0;
    }

    /// @notice Simulasi tanpa mengubah state — dipakai frontend buat pratinjau.
    function previewCheck(address agent, uint256 amount)
        external
        view
        returns (bool allowed, bytes32 reason)
    {
        if (!registry.isRegistered(agent)) return (false, GuardianTypes.NOT_REGISTERED);
        if (registry.isReadOnly(agent)) return (false, GuardianTypes.READ_ONLY_ROLE);

        Baseline memory b = _baselines[agent];
        if (b.flags & FLAG_FROZEN != 0) return (false, GuardianTypes.AGENT_FROZEN);

        (uint128 maxTxLimit, uint128 dailyBudget) = registry.limitsOf(agent);
        if (amount > maxTxLimit) return (false, GuardianTypes.EXCEEDS_TX_LIMIT);

        DailySpend memory d = _dailySpend[agent];
        uint128 spent = d.dayIndex == uint64(block.timestamp / 1 days) ? d.spentToday : 0;
        if (uint256(spent) + amount > dailyBudget) return (false, GuardianTypes.EXCEEDS_DAILY_BUDGET);

        (bytes32 pattern, ) = _evaluateBehaviour(b, amount);
        if (pattern != GuardianTypes.OK) return (false, pattern);

        return (true, GuardianTypes.OK);
    }
}

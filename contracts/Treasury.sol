// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GuardianPolicyEngine} from "./GuardianPolicyEngine.sol";
import {GuardianTypes} from "./GuardianTypes.sol";

/// @title Treasury — kas yang dijaga Guardian
/// @notice Dana hanya bergerak setelah kedua lapis Guardian meloloskan.
/// Guard ada DI JALUR EKSEKUSI, bukan monitor pasif di luar — jadi tidak ada
/// celah waktu antara "terdeteksi" dan "keburu tereksekusi".
contract Treasury {
    GuardianPolicyEngine public immutable guardian;
    address public immutable admin;

    bool private _locked;

    error NotAdmin();
    error Reentrant();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    event Deposited(address indexed from, uint256 amount);
    event TransferExecuted(address indexed agent, address indexed to, uint256 amount);
    event TransferRejected(address indexed agent, address indexed to, uint256 amount, bytes32 reason);

    modifier nonReentrant() {
        if (_locked) revert Reentrant();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address guardian_) {
        guardian = GuardianPolicyEngine(guardian_);
        admin = msg.sender;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Dipanggil LANGSUNG oleh alamat agent. Guardian memeriksa
    /// `msg.sender`, jadi backend tidak bisa mengaku jadi role lain.
    ///
    /// @dev Penolakan SENGAJA tidak di-revert, dan ini keputusan desain inti:
    /// revert akan membatalkan seluruh perubahan state di transaksi ini —
    /// termasuk penandaan `frozen` yang baru saja ditulis Guardian. Guard-nya
    /// jadi amnesia: agent nakal bisa mencoba lagi selamanya tanpa pernah
    /// benar-benar dibekukan. Jadi penolakan dicatat sebagai event, dana tidak
    /// bergerak, dan pembekuannya bertahan.
    ///
    /// Efek jeranya tetap ada: Monad menagih gas berdasarkan gas LIMIT, bukan
    /// gas yang terpakai — jadi penyerang yang menggedor agent beku tetap
    /// membakar MON di setiap percobaan.
    function executeTransfer(address to, uint256 amount) external nonReentrant returns (bool executed) {
        if (amount == 0) revert ZeroAmount();

        // Guard dievaluasi PALING AWAL — sebelum cek saldo. Kalau urutannya
        // dibalik, pelanggaran kebijakan atas nominal yang kebetulan lebih
        // besar dari isi kas akan ter-revert sebagai "saldo kurang" dan
        // tidak pernah tercatat sebagai pelanggaran. Perilaku agent harus
        // tetap terekam apa pun kondisi kas.
        (bool allowed, bytes32 reason) = guardian.checkAndRecord(msg.sender, amount);

        if (!allowed) {
            emit TransferRejected(msg.sender, to, amount, reason);
            return false;
        }

        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }

        emit TransferExecuted(msg.sender, to, amount);

        (bool sent, ) = to.call{value: amount}("");
        if (!sent) revert TransferFailed();

        return true;
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @dev Escape hatch buat admin (di luar jalur agent) — dipakai untuk
    /// menarik sisa dana testnet setelah demo.
    function adminWithdraw(address payable to, uint256 amount) external nonReentrant {
        if (msg.sender != admin) revert NotAdmin();
        if (amount > address(this).balance) {
            revert InsufficientBalance(amount, address(this).balance);
        }
        (bool sent, ) = to.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }
}

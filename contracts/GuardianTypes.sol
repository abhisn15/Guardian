// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GuardianTypes — role & reason code constants dipakai lintas contract
library GuardianTypes {
    // ---- Roles ----
    bytes32 internal constant ROLE_TREASURY = "TREASURY";
    bytes32 internal constant ROLE_RESEARCH = "RESEARCH";
    bytes32 internal constant ROLE_INVESTMENT = "INVESTMENT";
    bytes32 internal constant ROLE_PAYMENT = "PAYMENT";
    bytes32 internal constant ROLE_REPORTING = "REPORTING";

    // ---- Reason codes (bytes32, bukan string: lebih murah + gampang di-index off-chain) ----
    bytes32 internal constant OK = "OK";
    bytes32 internal constant NOT_REGISTERED = "NOT_REGISTERED";
    bytes32 internal constant READ_ONLY_ROLE = "READ_ONLY_ROLE";
    bytes32 internal constant AGENT_FROZEN = "AGENT_FROZEN";
    bytes32 internal constant EXCEEDS_TX_LIMIT = "EXCEEDS_TX_LIMIT";
    bytes32 internal constant EXCEEDS_DAILY_BUDGET = "EXCEEDS_DAILY_BUDGET";

    // ---- Behavioural anomaly patterns ----
    bytes32 internal constant VELOCITY_SPIKE = "VELOCITY_SPIKE";
    bytes32 internal constant AMOUNT_DEVIATION = "AMOUNT_DEVIATION";
    bytes32 internal constant BURST_PATTERN = "BURST_PATTERN";
}

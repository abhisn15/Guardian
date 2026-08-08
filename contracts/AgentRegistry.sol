// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GuardianTypes} from "./GuardianTypes.sol";

/// @title AgentRegistry — identitas on-chain tiap AI agent
/// @notice Separation of duty ditegakkan lewat `msg.sender` (alamat on-chain
/// tiap agent), BUKAN lewat field role yang dikirim backend. Backend yang
/// dikompromi tidak bisa mengaku-ngaku jadi role lain.
contract AgentRegistry {
    /// @dev Semua limit disimpan dalam wei. Satu agent = satu slot config.
    struct Agent {
        bytes32 role;
        uint128 maxTxLimit; // per-transaksi
        uint128 dailyBudget; // akumulasi per hari
        bool registered;
    }

    address public immutable admin;

    mapping(address => Agent) private _agents;
    address[] private _agentList;

    error NotAdmin();
    error AlreadyRegistered(address agent);
    error AgentNotRegistered(address agent);
    error InvalidLimits();

    event AgentRegistered(
        address indexed agent,
        bytes32 indexed role,
        uint256 maxTxLimit,
        uint256 dailyBudget
    );

    /// @notice Off-chain reasoning steps, attributed on-chain to the agent that
    /// performed them. This is what makes a decision chain auditable rather than
    /// merely logged in an application somewhere.
    event AgentAction(
        address indexed agent,
        bytes32 indexed actionType,
        uint256 blockNumber,
        string detail
    );

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerAgent(
        address agent,
        bytes32 role,
        uint128 maxTxLimit,
        uint128 dailyBudget
    ) external onlyAdmin {
        if (agent == address(0)) revert AgentNotRegistered(agent);
        if (_agents[agent].registered) revert AlreadyRegistered(agent);
        if (maxTxLimit > dailyBudget) revert InvalidLimits();

        _agents[agent] = Agent({
            role: role,
            maxTxLimit: maxTxLimit,
            dailyBudget: dailyBudget,
            registered: true
        });
        _agentList.push(agent);

        emit AgentRegistered(agent, role, maxTxLimit, dailyBudget);
    }

    /// @notice Record an off-chain reasoning step.
    /// @dev Takes NO `agent` parameter on purpose: `msg.sender` is inherently
    /// authentic, whereas an address parameter would let anyone forge entries in
    /// another agent's audit trail. For a product whose value is verifiable
    /// accountability, a forgeable trail is worse than no trail.
    ///
    /// Each agent writes from its own address, so five agents logging in the same
    /// cycle touch five disjoint storage slots — nothing serialises.
    function logAgentAction(bytes32 actionType, string calldata detail) external {
        if (!_agents[msg.sender].registered) revert AgentNotRegistered(msg.sender);
        emit AgentAction(msg.sender, actionType, block.number, detail);
    }

    function getAgent(address agent) external view returns (Agent memory) {
        return _agents[agent];
    }

    function isRegistered(address agent) external view returns (bool) {
        return _agents[agent].registered;
    }

    function roleOf(address agent) external view returns (bytes32) {
        return _agents[agent].role;
    }

    function limitsOf(address agent) external view returns (uint128 maxTxLimit, uint128 dailyBudget) {
        Agent storage a = _agents[agent];
        return (a.maxTxLimit, a.dailyBudget);
    }

    /// @notice Role read-only tidak pernah boleh memindahkan dana, apapun limitnya.
    function isReadOnly(address agent) external view returns (bool) {
        bytes32 role = _agents[agent].role;
        return role == GuardianTypes.ROLE_RESEARCH || role == GuardianTypes.ROLE_REPORTING;
    }

    function agentCount() external view returns (uint256) {
        return _agentList.length;
    }

    function agentAt(uint256 index) external view returns (address) {
        return _agentList[index];
    }
}

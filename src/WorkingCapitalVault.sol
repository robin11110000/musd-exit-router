// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Mezo savings uses principal receipts, not ERC-4626 shares.
interface IMezoSavings {
    function musdToken() external view returns (address);
    function strategy() external view returns (address);
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function claimYield() external returns (uint256);
}

/// @notice One owner per vault: yield and principal never mix between users.
/// @dev Deploy only with the source-verified Mezo testnet savings address.
contract WorkingCapitalVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidPolicy();
    error PolicyInactive();
    error LimitExceeded();
    error UnexpectedTokenFlow();
    error WrongChain();
    error IntegrationChanged();

    struct Policy {
        uint256 reserve;
        uint256 maxPerAllocation;
        uint256 remainingBudget;
        uint64 cooldown;
        uint64 expiresAt;
        bool active;
    }

    address public immutable owner;
    IERC20 public immutable musd;
    IMezoSavings public immutable savings;
    address public immutable initialStrategy;
    Policy public policy;
    mapping(address => bool) public keepers;
    uint256 public lastAllocation;

    event Funded(uint256 amount);
    event PolicyUpdated(Policy policy);
    event KeeperUpdated(address indexed keeper, bool allowed);
    event Allocated(address indexed caller, uint256 amount, uint256 remainingBudget);
    event SavingsWithdrawn(uint256 principal, uint256 returnedMusd);
    event Withdrawn(uint256 amount);
    event YieldClaimed(uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address token, address savingsVault, address vaultOwner) {
        if (block.chainid != 31611) revert WrongChain();
        if (token == address(0) || savingsVault == address(0) || vaultOwner == address(0)) revert InvalidPolicy();
        owner = vaultOwner;
        musd = IERC20(token);
        savings = IMezoSavings(savingsVault);
        if (savings.musdToken() != token) revert InvalidPolicy();
        initialStrategy = savings.strategy();
        if (initialStrategy == address(0)) revert InvalidPolicy();
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed;
        emit KeeperUpdated(keeper, allowed);
    }

    /// @notice The budget applies until the owner explicitly replaces the policy.
    function setPolicy(Policy calldata next) external onlyOwner {
        if (next.active && (next.maxPerAllocation == 0 || next.remainingBudget == 0 || next.expiresAt <= block.timestamp)) {
            revert InvalidPolicy();
        }
        policy = next;
        emit PolicyUpdated(next);
    }

    function revoke() external onlyOwner {
        policy.active = false;
        emit PolicyUpdated(policy);
    }

    function fund(uint256 amount) external onlyOwner nonReentrant {
        uint256 beforeBalance = musd.balanceOf(address(this));
        musd.safeTransferFrom(owner, address(this), amount);
        if (musd.balanceOf(address(this)) - beforeBalance != amount) revert UnexpectedTokenFlow();
        emit Funded(amount);
    }

    /// @notice Permissioned keeper may invest surplus; owner keeps the same limits.
    function allocate(uint256 amount) external nonReentrant {
        if (msg.sender != owner && !keepers[msg.sender]) revert Unauthorized();
        if (savings.strategy() != initialStrategy) revert IntegrationChanged();
        Policy memory p = policy;
        if (!p.active || block.timestamp >= p.expiresAt) revert PolicyInactive();
        uint256 liquid = musd.balanceOf(address(this));
        if (amount == 0 || amount > p.maxPerAllocation || amount > p.remainingBudget ||
            liquid < p.reserve || amount > liquid - p.reserve ||
            (lastAllocation != 0 && block.timestamp < lastAllocation + p.cooldown)) revert LimitExceeded();
        policy.remainingBudget -= amount;
        lastAllocation = block.timestamp;
        uint256 beforePrincipal = savings.balanceOf(address(this));
        musd.forceApprove(address(savings), amount);
        savings.deposit(amount);
        musd.forceApprove(address(savings), 0);
        if (liquid - musd.balanceOf(address(this)) != amount ||
            savings.balanceOf(address(this)) - beforePrincipal != amount) revert UnexpectedTokenFlow();
        emit Allocated(msg.sender, amount, policy.remainingBudget);
    }

    /// @notice Always available to owner, including after policy expiry/revocation.
    /// @dev Mezo withdraw claims accrued MUSD yield as well as returning principal.
    function withdrawSavings(uint256 principal, uint256 minReturned) external onlyOwner nonReentrant {
        uint256 beforeBalance = musd.balanceOf(address(this));
        uint256 beforePrincipal = savings.balanceOf(address(this));
        savings.withdraw(principal);
        uint256 returned = musd.balanceOf(address(this)) - beforeBalance;
        if (returned < principal || returned < minReturned ||
            beforePrincipal - savings.balanceOf(address(this)) != principal) revert UnexpectedTokenFlow();
        emit SavingsWithdrawn(principal, returned);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        musd.safeTransfer(owner, amount);
        emit Withdrawn(amount);
    }

    function harvest(uint256 minYield) external onlyOwner nonReentrant {
        uint256 beforeBalance = musd.balanceOf(address(this));
        uint256 reported = savings.claimYield();
        uint256 received = musd.balanceOf(address(this)) - beforeBalance;
        if (received != reported || received < minYield) revert UnexpectedTokenFlow();
        emit YieldClaimed(received);
    }

    function snapshot() external view returns (uint256 liquid, uint256 savingsPrincipal, Policy memory limits) {
        return (musd.balanceOf(address(this)), savings.balanceOf(address(this)), policy);
    }
}

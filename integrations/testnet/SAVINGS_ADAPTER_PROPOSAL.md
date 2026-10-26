# Proposed savings adapter contract boundary

Design only. No financial contracts changed or deployed. Target the **observed testnet MUSDSavingsRate**, not an assumed ERC-4626 vault. Reject chain IDs other than 31611 in deployment/runtime configuration and require exact configured asset, proxy, implementation and strategy.

Immediate integration reference: proxy `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16`, implementation `0x92D12f0a60906b39d81acD9bf8977b6c824cD98C`, MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`. `savings-abi.json` contains the full explorer-verified implementation ABI and provenance.

| Call | Selector | Return / recipient |
| --- | --- | --- |
| `deposit(uint256)` | `0xb6b55f25` | No return value; pulls caller's approved MUSD and mints equal receipts to `_msgSender()` |
| `withdraw(uint256)` | `0x2e1a7d4d` | No return value; burns caller's receipts, sends principal MUSD and all accrued caller yield MUSD to `_msgSender()` |
| `claimYield()` | `0x406cf229` | Returns `uint256` yield paid; sends MUSD to `_msgSender()` |

Verified source uses ERC-2771 `_msgSender()`; ordinary direct calls use the adapter/account as sender. No receiver parameter exists. A shared adapter must not call as itself and then attribute all paid yield to one user.

**Remaining blocker:** the configured strategy `0x6abE6853f3006f304709084AC37f826Be50847E0` has runtime bytecode but its explorer response supplied no verified name, source or ABI in this snapshot. Do not mark its deallocation semantics verified merely because the vault implementation is verified. This blocks claiming source-verified end-to-end withdrawals; funded integration remains disabled pending strategy review and lifecycle testing.

## Underlying interface established from verified implementation

```solidity
interface IObservedMezoSavings {
    function musdToken() external view returns (address);
    function strategy() external view returns (address);
    function balanceOf(address) external view returns (uint256);
    function yieldIndex() external view returns (uint256);
    function supplyYieldIndex(address) external view returns (uint256);
    function claimableYield(address) external view returns (uint256);
    function deposit(uint256 assets) external;
    function withdraw(uint256 principalReceipts) external;
    function claimYield() external returns (uint256);
}
```

This interface does not assert withdrawal availability or yield profitability. It deliberately omits ERC-4626 previews, conversions and max-withdraw methods because the deployed implementation does not expose them.

## Proposed application-facing boundary

```solidity
interface IWorkingCapitalSavingsAdapter {
    // Caller must be the owning working-capital account, never an arbitrary keeper.
    function allocate(uint256 maxAssets, uint256 minReceipts, uint256 deadline)
        external returns (uint256 assetsSpent, uint256 receiptsReceived);
    function unwind(uint256 maxReceipts, uint256 minAssetsReceived, uint256 deadline)
        external returns (uint256 receiptsBurned, uint256 principalReceived, uint256 yieldReceived);
    function harvest(uint256 minYieldReceived, uint256 deadline)
        external returns (uint256 yieldReceived);
    function position() external view returns (
        uint256 principalReceipts,
        uint256 accruedYieldEstimate,
        address strategy,
        bool allocationEnabled
    );
}
```

Suggested first implementation: one adapter/account per user so the underlying vault's caller-owned receipts and yield indices naturally isolate users. A shared adapter requires a second internal yield-index ledger, including settlement before every ownership change; do not credit pooled claims to the last withdrawing user. No arbitrary destination, calldata or delegatecall path.

`accruedYieldEstimate = claimableYield(account) + floor(balanceOf(account) * (yieldIndex - supplyYieldIndex(account)) / 1e18)`. This excludes not-yet-collected strategy/PCV yield and is not guaranteed withdrawable cash. The position should display principal and yield separately, with pending/unavailable state when reads fail.

The account policy must enforce owner-authorized destinations, reserve floor, budget, action allowlist, fee cap, cooldown, expiry and revocation on chain. Allocation amount is bounded by both requested maxAssets and policy-permitted liquid surplus. Keep BTC gas budget separate. Keepers can request only pre-authorized bounded actions through the account; they do not become asset owners.

For allocation, snapshot MUSD and receipt balances; approve only the bounded amount; call `deposit`; compare actual spent/received against limits and clear residual allowance. For unwind, snapshot both balances; call `withdraw`; record receipt reduction as principal and MUSD excess over returned principal as realized yield only after validating expected deltas. Under the current source principal and receipt units are 1:1, but require that invariant rather than silently assuming it across upgrades. A partial withdrawal may realize all user yield. Emit receipts showing both quantities, execution fee, reserve before/after, strategy and implementation identity.

Withdrawn capital must first restore the reserve or fund the authorized action; any redeposit needs its own policy check. Do not charge keeper fees against unrealized yield. Avoid automatic borrowing to chase APR. Losses, revert/failure and liquidity constraints must remain visible.

## Required gates before funded testnet integration

1. Inspect strategy's verified source, liquidity and access controls; confirm deallocation path. Record proxy admin/owner and trusted-forwarder risks. Verify runtime hashes/implementation slots immediately before use and define pause/review behavior on changes.
2. Run fork/local adversarial tests using the captured deployed ABI and source semantics: ownership, unauthorized keeper calls, limits/deadline/revocation, receipt transfers, partial withdrawals claiming all yield, zero supply, rounding, reentrancy and strategy failure. Clearly label any local mocks.
3. Confirm the reserve remains liquid after fees, measure actual balance deltas and reconcile logs. Reject stale oracle data for any value-sensitive action. Savings principal accounting itself should not require a fabricated dollar price.
4. Obtain a funded testnet lifecycle record for deposit, separate claim, partial unwind and final withdrawal. This package provides **read-only verification only**; no funded lifecycle success has been established.
5. Keep savings staking disabled until a current source-verified savings gauge and its reward/withdrawal behavior are established. Native fee yield and gauge emissions are not additive yield assumptions.

Do not route the inherited YieldAggregator stub to this address without replacing its accounting and authorization model and completing the gates above.

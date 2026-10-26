# Working-capital vault

`src/WorkingCapitalVault.sol` is a new single-owner MUSD account integrating the actual Mezo testnet savings ABI. It does not use the inherited accounting-only YieldAggregator. Constructor and deployment script reject every chain except 31611. No deployed application address or funded savings lifecycle is claimed.

Each user deploys their own account, funds it with test MUSD, selects keepers and sets a policy. The policy specifies liquid reserve, per-allocation cap, total remaining allocation budget, cooldown and expiry. Both owner and keeper allocations obey all limits. No keeper fee is charged. Keepers cannot choose another destination or withdraw funds. Successful allocations decrement the budget, preserve the reserve and clear token allowance. Receipt and token deltas must match the observed 1:1 principal interface or the transaction reverts.

Owner withdrawals, savings unwinds and yield claims remain available after revocation or expiry. `withdrawSavings(principal,minReturned)` measures actual proceeds, including yield claimed by the underlying savings contract; it does not assume all returned MUSD is principal. `harvest(minYield)` checks the reported claim against the actual MUSD received. Each user has a separate underlying savings position, so one user cannot receive another user's accrued yield.

The savings strategy address is pinned at account creation. A strategy change blocks further allocation while owner exit functions remain available. This does not detect proxy upgrades that retain the same strategy address; proxy admin, savings owner and underlying strategy remain trust dependencies. No delegatecall, arbitrary execution, rescue administrator, or upgrade authority exists in this account.

## Testnet integration status

The target proxy and ABI were independently read from testnet explorer evidence in `integrations/testnet/`. The savings implementation is verified, but the configured strategy source was not available and no mined funded deposit/withdraw lifecycle has been verified. PCV and gauge are zero in the captured snapshot. A live testnet eth_call lifecycle has now passed with ephemeral funding; see exports/testnet-lifecycle-simulation.json. There is no promised yield rate and no savings staking integration. The frontend exposes wallet-controlled experimental testnet funding and allocation with this limitation displayed. Use only test assets; production readiness is not established. Local tests explicitly use a savings mock; its simulated yield is not protocol performance.

## Commands

```sh
npm run test:security
npm run build:capital
npm run preflight:capital
node integrations/testnet/verify.mjs
forge script script/WorkingCapitalDeploy.s.sol:WorkingCapitalDeploy --rpc-url https://rpc.test.mezo.org
```

The Forge command is simulation only unless `--broadcast` is explicitly added. It reads `DEPLOYER_PRIVATE_KEY` locally and optionally `VAULT_OWNER`; never commit either secret. Forge is not installed in the current environment, so deployment script compilation is checked using solc instead. No deployment transaction has been submitted.

`build:capital` writes the frontend ABI, reproducible compiler settings and deployment bytecode to `exports/WorkingCapitalVault.json`. This artifact contains no application deployment address. `preflight:capital` uses only public testnet reads and writes a block-pinned comparison of implementation, token and strategy against the reviewed evidence. A successful preflight means configuration matches; `allocationReady` remains false until the funded lifecycle and strategy review are completed.

## Frontend contract boundary

| Action | Interface |
| --- | --- |
| Read current state | `snapshot()` returns liquid MUSD, savings principal receipts and policy |
| Fund account | Approve MUSD to this account, then `fund(amount)` |
| Authorize a keeper | `setKeeper(address,bool)` |
| Set allocation policy | `setPolicy((reserve,maxPerAllocation,remainingBudget,cooldown,expiresAt,active))` |
| Allocate surplus | `allocate(amount)` by owner or allowed keeper |
| Stop automation | `revoke()` |
| Return savings to reserve | `withdrawSavings(principal,minReturned)` |
| Claim yield to reserve | `harvest(minYield)` |
| Withdraw liquid MUSD | `withdraw(amount)` returns to immutable owner |

Use token amounts in 18-decimal base units, timestamps/cooldown in seconds. Display principal and realized yield separately from the `SavingsWithdrawn` event. Pyth's captured MUSD feed is stale; this principal-denominated flow does not consume or invent a dollar price. BTC gas must remain in the wallet.

Existing projects, including TreasuryOS, overlap with reserve automation. This implementation is not evidence of a novel category or buildathon eligibility; attribution and independent changes remain documented.

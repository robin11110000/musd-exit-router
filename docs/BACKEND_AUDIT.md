# Backend audit and capital utilization direction

Reviewed 2026-10-26. This is an architecture audit, not an independent security audit or proof of production compatibility.

## Current implementation, separated by project

The buildathon branch preserves the original five modules: LiquidationEngine, RedemptionRouter, KeeperRegistry, VaultManager and a YieldAggregator stub. Our only financial-logic correction so far restricts autoDeposit to the balance owner. A targeted local regression test demonstrates the original issue and verifies the correction; the full inherited Foundry suite has not been run.

The separate router-preview branch implements mainnet RPC reads, basic/CL pool quotes, core-feed-based redemption estimates, partial-fill accounting and a locally tested bounded redemption adapter. Its fifteen local tests are not coverage of the cloned project. Direct-core and adapter read-only redemption simulations both reverted. No capital is earning through either project, no production contract has been deployed and no user funds have moved.

## Recommended productive-capital extension

Keep TrovePilot's execution/keeper foundation and add a policy-controlled MUSD working-capital vault. Maintain a user-selected liquid reserve, allocate only permitted surplus into a verified existing savings vault and unwind positions only within user limits. This is a proposed extension, not implemented functionality.

For a BTC holder, BTC can first back an explicitly authorized MUSD loan. That collateral is economically committed but does not automatically itself earn yield. Borrowed MUSD can then be used or allocated. Direct MUSD holders can enter without borrowing. Do not suggest that the same BTC can simultaneously be pledged as loan collateral and locked into veBTC.

Mezo's native sMUSD vault is the initial integration candidate. Holding sMUSD represents variable fee-backed yield. Staking sMUSD trades the direct fee yield for MEZO emissions; it is not additive double yield. Ditto dMUSD is a distinct cross-chain strategy with asynchronous withdrawal, unsuitable as an assumed immediately available operating reserve.

Differentiation must be a working keeper-capital workflow: useful reserve sizing, user bounds, actual position accounting, bounded unwind/execution, and receipts. Depositing into an existing savings vault alone is not sufficient differentiation.

## Backend sections

1. Integration registry: chain IDs, verified contracts/proxies, feed configuration, version/hash checks and separate testnet configuration.
2. User custody/accounting: actual MUSD balances, liquid reserve, strategy receipt shares, per-user ownership and withdrawal rights. Never credit principal as if it were an unchanged share balance.
3. Policy: budgets, reserve floor, allowed destinations/actions, fee cap, cooldown, expiry, output limits and revocation. Enforce in contracts, not just keeper code.
4. Savings adapter: verified deposit/withdraw paths, rounding, limits, yield/loss recognition and explicit withdrawal availability. The inherited stub cannot be presented as this integration.
5. Execution adapters: repair redemption caller funding/output flow; distinguish protocol redemption from repayment of the user's own trove. Add borrower operations only with the correct authorization.
6. Keeper runtime: discovery, profitability after gas, simulation, nonce tracking, restart recovery, retries and reconciliation of confirmed events. No private keys handled by the web server.
7. Data/API/indexer: positions, policy, executable opportunities, live oracle state and event-backed history. Mezo Tools is a reference/comparison tool until a documented integration is verified.
8. Security/deployment: authorization and reentrancy tests, stale oracle checks, slippage, share accounting, keeper griefing, admin powers, midpoint/final reviews and testnet deployment records.

## Verification gates

- Native savings vault: confirm live address, source, ABI, upgradeability, receipt ownership, deposit/withdraw operations and limits. Do not assume ERC-4626 methods based solely on the product name.
- The current core repository exposes IMUSDSavingsRate.receiveProtocolYield only; that does not establish the user-facing savings deposit interface.
- BorrowerOperationsSignatures includes action-specific signatures, nonce and deadline handling. Ordinary MUSD approval does not authorize managing a borrower's trove. MUSD's ERC20Permit support is an approval primitive, not blanket automation authorization.
- Resolve current core redemption simulation failure before enabling execution.
- Any allocation policy must account for debt interest, origination/strategy/keeper fees, gas and possible loss, rather than promising that advertised APR pays for the loan.

## Useful product metrics

Track actual MUSD allocated, liquid reserve, realized yield/loss, all fees, execution success, failed transaction cost and user withdrawals. Borrowing volume, deposits and token emissions are not profit. Never promise all capital remains deployed: liquid reserves and gas balances serve a purpose.

## Workshop integration inventory

| Workshop component | Status |
|---|---|
| EVM compatibility | Used: Solidity compiler, viem and local EVM tests |
| Mezo RPC/client | Used through public RPC; no node operated or client modified |
| DEX | Preview only: basic pool quotes and two CL simulations; no swap execution |
| Skip/core oracle | Preview reads core's configured PriceFeed; native feed freshness/scaling reviewed |
| Pyth | Inherited UI references only; no new working integration |
| Vaults | Original funded vault and stub inherited; one authorization fix; no earning strategy |
| Mezo Earn/sMUSD | Researched; adapter proposed, not integrated |
| MEZO emissions | Researched; no staking, voting or claims implemented |
| Boar Finance / Matchbox | Researched for overlap; not integrated |
| Mezo Tools | Reviewed as ecosystem reference; no API integration |
| Banxa/access | Researched; no on-ramp integration |
| Native bridge / Wormhole | Researched; no transfers/integration implemented |
| Consensus | Infrastructure dependency only; no consensus work |
| Security reviews | One targeted authorization regression fix; separate adapter tests; midpoint/final reviews still required |

## Source snapshot

- Core repository main at da7888a10949c8a5d3f884454cec8978cfa87e48: https://github.com/mezo-org/musd/tree/da7888a10949c8a5d3f884454cec8978cfa87e48
- Savings: https://mezo.org/docs/users/mezo-earn/vaults/musd-savings-vault/
- Ditto: https://mezo.org/docs/users/mezo-earn/vaults/ditto-musd-savings-vault/
- Oracle integration: https://mezo.org/docs/developers/architecture/oracles/read-oracle/
- MEZO utility: https://mezo.org/docs/users/mezo/
- Client releases: https://github.com/mezo-org/mezod/releases (v13.0.1 identified as stable mainnet patch; not proof of a given RPC node's running version)
- Ecosystem tools: https://mezo.org/docs/users/integrations/community-projects/
- Security incident relevant to relayed calls and library sender handling: https://mezo.org/blog/incident-report-october-5-2026/

Resolve contradictions between prose, source artifacts and deployed state through source-matched tests and on-chain reads. Do not treat every workshop topic as a feature to bolt on.

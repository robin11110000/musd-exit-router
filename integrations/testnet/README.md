# Testnet integration evidence

Reviewed 2026-10-26. Scope: read-only Mezo testnet, chain **31611**. No transactions, deployment, wallet connection, signing, approvals or real funds were used. All added files are in this directory. The inherited YieldAggregator is still a stub.

## Run

From the repository root after its existing dependencies have been installed:

```powershell
node integrations/testnet/verify.mjs
```

Requires Node with built-in fetch and the repository's existing `viem` dependency. Writes `integrations/testnet/evidence.json`. The RPC endpoint is fixed, with a chain-ID guard and an allowlist of read RPC methods. There is no mainnet fallback or wallet/key configuration. Failed contract calls are captured as evidence, not silently replaced with mocks. A successful script exit means evidence collection completed; it does **not** mean every integration is usable. Initial RPC/network failure aborts before overwriting evidence.

All EVM reads use one captured block number, whose hash/time are saved. Explorer verification metadata is fetched at retrieval time, rather than historically at that block. Recheck proxy implementation and strategy before any future execution. Output includes full public explorer source/ABIs and pinned official deployment ABIs; expect a relatively large JSON file.

## Findings and integration gates

| Component | Finding | Product decision |
| --- | --- | --- |
| MUSD | Official testnet token address, live bytecode, `name`, `symbol`, 18 decimals and supply reads work. Official matsnet artifact uses the same address. Artifact runtime hash differs from deployed runtime. | Use the deployed explorer ABI; repository address matching alone is not source equivalence. |
| Native savings / sMUSD | Found by following official deployed PCV `feeRecipient()`. Explorer verifies an EIP-1967 transparent proxy and MUSDSavingsRate implementation. `musdToken()` matches testnet MUSD. | A real integration candidate exists; no funded deposit/withdraw test was performed. |
| Savings accounting | Deployed source mints 1 sMUSD per MUSD principal. Yield uses `yieldIndex`, `supplyYieldIndex`, `claimableYield` and `claimYield()`. ERC-4626 `asset()` and `totalAssets()` revert. | Implement explicit principal and yield accounting. Do not use ERC-4626 methods or an exchange-rate assumption. |
| Savings configuration | `pcv()` and `vaultGauge()` were zero; strategy and owner addresses are captured. | No claim that protocol fee distribution or savings staking is fully configured. Zero PCV disables automatic distribution requests, although externally funded yield can still be received. |
| Earn infrastructure | Official Tigris testnet artifacts identify VeBTCVoter, GaugeFactory and VeBTC. All have bytecode; voter `length()` returns 4 and veBTC name/symbol reads work. GaugeFactory exact runtime matches its artifact; voter runtime differs. | Useful read-only registry leads, not a verified current savings staking route. Do not import mainnet or third-party addresses as substitutes. |
| Skip BTC/USD | Official native address works; `decimals()` returns **18**, and latest round data returns a positive price and block-aligned timestamp. `answeredInRound` is zero in the captured data. | Validate positive answer, timestamp and scaling. Do not blindly apply a Chainlink answeredInRound invariant to this native interface without checking Mezo source. |
| Pyth MUSD/USD | Official testnet Pyth address has bytecode/proxy implementation; `getPriceNoOlderThan(id,3600)` reverts `0x19abf40e` (`StalePrice`). Unsafe read succeeds with an old publishTime. | **Unavailable as a fresh MUSD price feed in this snapshot.** Unsafe data is diagnostic only. Never waive freshness or replace missing data with $1. |
| Mezo Tools | Official community directory identifies a trove/protocol monitoring dashboard. Its site is client-rendered; no documented testnet API/SDK/contract interface was established from reviewed public material. | Use as a comparison/reference interface only. No API integration is claimed. |

The live evidence is authoritative for exact blocks, balances, hashes and calls. `manifest.json` separates discovered addresses from unavailable integrations. Static status labels describe this review and are not refreshed automatically by the script.

The strategy at `0x6abE6853f3006f304709084AC37f826Be50847E0` has bytecode but no verified source/ABI in the captured explorer response. That is an explicit remaining blocker for end-to-end withdrawal assurance. The direct savings interface and selectors are ready for review in `SAVINGS_ADAPTER_PROPOSAL.md`; `savings-abi.json` is the extracted full implementation ABI.

## Savings source conflicts that affect implementation

The public savings page describes exchange-rate accrual, but the deployed testnet source implements fixed principal receipts and separate yield claims. This is a material compatibility difference, not cosmetic terminology. Transferring receipts updates the sender's and recipient's yield indices before transfer; previously accrued yield remains with the sender. A newly acquired receipt does not transfer all historical yield rights.

`deposit(uint256)` pulls MUSD from the caller, mints receipts to the caller, and allocates principal to the configured strategy. `withdraw(uint256)` first attempts optional PCV distribution, claims strategy yield, pays the caller's accrued vault yield, deallocates the requested principal, burns receipts and returns principal. Both user methods return no value. Derive receipts and MUSD proceeds from balance changes. A partial withdrawal can claim **all** accrued yield, so MUSD received is not necessarily equal to principal withdrawn.

The vault owner can change strategy and configuration; the proxy has upgrade authority. These powers and the ERC-2771 trusted forwarder must be included in adapter trust assumptions. Verified source means the explorer reports verification; it is not an audit or a guarantee that withdrawals succeed. Strategy deallocation and funded lifecycle tests remain execution gates.

## Ecosystem overlap

Boar Finance overlaps in managed yield, especially BTC/veBTC and MEZO strategies. That is different custody, liquidity and risk from an unstaked MUSD working-capital reserve. No documented **Mezo testnet Boar Finance vault integration** was established. Boar's hackathon infrastructure post explicitly offers Mezo mainnet RPC/MCP and Bitcoin Testnet3 access; Bitcoin Testnet3 is not Mezo chain 31611. Do not confuse those offerings with a Mezo testnet savings adapter. No APY from marketing is used in this work.

Matchbox overlaps in optimizing veBTC/veMEZO votes, incentives and boost. Its documented workflow is a matching market, not a liquid MUSD reserve. No source-matched testnet Matchbox deployment or API was established in reviewed docs. It is unnecessary for the proposed first savings adapter.

An additional direct product overlap surfaced: upstream author's [TreasuryOS](https://github.com/VitalR/mezo-treasuryos) describes policy-controlled capital allocation, savings, reserve restoration and defensive keepers, including testnet claims. This makes generic “idle MUSD into savings with a keeper buffer” insufficient differentiation. Those deployment claims were not independently verified here and are not dependencies or address provenance. Parent product review should compare workflow and implementation before claiming novelty.

## Sources

- [Official network setup](https://mezo.org/docs/developers/getting-started/) and [token references](https://mezo.org/docs/users/resources/contracts-reference/).
- [Official oracle interfaces, testnet addresses and feed IDs](https://mezo.org/docs/developers/architecture/oracles/read-oracle/).
- [Public savings product description](https://mezo.org/docs/users/mezo-earn/vaults/musd-savings-vault/) (not a source-matched ABI).
- [Pinned official core source/artifacts](https://github.com/mezo-org/musd/tree/da7888a10949c8a5d3f884454cec8978cfa87e48), matsnet `.chainId` is 31611.
- [Pinned official Earn source/artifacts](https://github.com/mezo-org/tigris/tree/0a3b5e840ac8e187cc705fbeddcf00f88b09247e/solidity/deployments/testnet).
- [Savings proxy verification](https://api.explorer.test.mezo.org/api/v2/smart-contracts/0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16) and [implementation verification](https://api.explorer.test.mezo.org/api/v2/smart-contracts/0x92D12f0a60906b39d81acD9bf8977b6c824cD98C).
- [Pyth error definitions](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/sdk/solidity/PythErrors.sol).
- [Official community project descriptions](https://mezo.org/docs/users/integrations/community-projects/), [Matchbox docs](https://matchbox.markets/docs), [Boar hackathon scope](https://blog.boar.network/boar-hackathon-starter-pack-for-the-mezo-hackathon-building-bitcoin-future).

Unavailability means this review did not establish a usable integration, not proof that none can exist. No mocks are included in this evidence package.

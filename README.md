# MUSD Working Capital

A testnet-only MUSD account that keeps a user-defined liquid reserve and lets authorized keepers allocate surplus into Mezo savings within explicit limits.

## Implemented

- One owner and one savings position per account; no pooled yield attribution.
- Reserve floor, per-allocation limit, cumulative budget, cooldown, expiry and revocation enforced on-chain.
- Owner withdrawals, savings unwinds and yield claims.
- Exact-amount token approvals, allowance clearing, receipt/balance checks and reentrancy protection.
- MetaMask frontend with multi-wallet discovery, network setup, empty-vault deployment and transaction receipts.
- Source-build bytecode matching before loading a vault or granting funding approval.
- A one-shot keeper with read-only simulation by default and explicit opt-in sending.

## Run

```sh
git submodule update --init --recursive
npm ci
npm run build:capital
npm run test:security
npm run preflight:capital
cd ui
npm ci
npm run dev
```

Open http://127.0.0.1:3002/capital in a browser with MetaMask. The root page redirects there. Use Mezo testnet, chain **31611**, and test assets only. The app never requests a seed phrase or private key.

## Verification status

- Contract and keeper tests pass, including reserve/budget bounds, expiry, revocation, adversarial receipt accounting and reentrancy.
- The frontend production build passes. Desktop/mobile and disconnected-wallet checks pass.
- The complete browser workflow has passed against an isolated local EVM with mocked tokens/savings. This checks UI transaction handling, not public protocol behavior.
- A separate live Mezo testnet `eth_call` successfully funded a temporary vault with 100 simulated MUSD, allocated 60 while preserving a 40 reserve, revoked automation, unwound savings and returned all 100. See `exports/testnet-lifecycle-simulation.json`.
- No public application deployment or mined funded lifecycle is claimed. Owner wallet funding and signatures are required. The configured savings strategy source remains unverified. No APY or guaranteed yield is shown.

## Useful commands

```sh
npm run simulate:capital
npm run prepare:deploy -- <public-owner-address>
npm run keeper:capital
npm run verify:testnet
```

The keeper reads `VAULT_ADDRESS` and `KEEPER_ADDRESS`. See [keeper and deployment runbook](docs/KEEPER_RUNBOOK.md) before using explicit send mode. [Contract behavior](docs/WORKING_CAPITAL.md), [frontend handoff](docs/FRONTEND_HANDOFF.md), and [testnet integration evidence](integrations/testnet/README.md) document interfaces and limitations.

The browser lifecycle test is `test-browser/capital-flow.cjs`. It requires Playwright (or a `PLAYWRIGHT_MODULE` path), a running frontend and an installed browser; all transactions stay on its isolated local EVM.

## Workshop tools used

Mezo EVM, the real testnet MUSD/savings interface, deployed Earn registry inspection, Skip oracle reads and Pyth freshness validation. Pyth's captured MUSD price was stale and is not used as a live price. Bridges, Banxa, savings gauges and third-party yield products are not represented as implemented integrations.

## Provenance

This repository preserves MIT-licensed [VitalR/mezo-trovepilot](https://github.com/VitalR/mezo-trovepilot) source and history. The new WorkingCapitalVault, bounded allocation policy, keeper, frontend and verification tools are additions. Inherited contracts remain available for reference and are not the account used by this UI; the inherited YieldAggregator is an accounting stub. Existing projects also implement reserve automation, so this repository does not claim the category itself is novel.

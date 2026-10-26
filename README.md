# MUSD Exit Router

Compare Mezo MUSD-to-BTC swaps and protocol redemptions with bounded execution.

## Current state

Working local quote-comparison app and an implemented, locally tested bounded redemption adapter. No public execution deployment or wallet transaction submission yet.

The app and active read-only verifier use Mezo testnet only (chain 31611). Quotes for basic and concentrated pools and protocol redemption are read at a consistent block. No mainnet fallback is configured.

```sh
npm ci
npm test
npm run build
npm start
npm run verify:testnet
```

Open http://127.0.0.1:3000 for live testnet quotes. Optionally set `MEZO_TESTNET_RPC_URL` to another Mezo testnet RPC. No signer or private key is required. The app rejects chain IDs other than 31611. The testnet report is replaced on rerun. Live route failures are shown as unavailable, never replaced by sample prices.

Redemption estimates are excluded from UI ranking until testnet execution is validated. Historical mainnet research reports are retained as evidence only; their scripts now stop immediately without network calls. The previous mainnet funding simulation reverted and does not establish testnet execution support.

Ganache is used only for local mocked-EVM tests. Its bundled dependency tree has audit advisories; it is not imported by the application server or exposed as a public RPC. This prototype is not a production deployment.

## Initial evidence

See [integration findings](docs/INTEGRATION.md) and the [execution specification](docs/EXECUTION_SPEC.md). The app compares a basic pool, two concentrated-liquidity pools and protocol redemption at a single block. This is a gross-output comparison, not a best-execution claim. Gas estimates, source matching and testnet deployment remain release gates.

Partial redemption is represented as BTC output plus an MUSD refund; it must not be ranked as if the full input was spent.

## TrovePilot provenance

This project builds on [VitalR/mezo-trovepilot](https://github.com/VitalR/mezo-trovepilot), reviewed at commit `08eeaeb5e711de9d56d906f001087b8a29fdeae7`. The new adapter follows its caller-funded atomic custody and balance-delta forwarding design. Original changes add on-chain output/fill bounds, expiry, bounded iterations, payer-directed refunds, a CL research quoter and a live comparison app. Upstream attribution and the MIT notice are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

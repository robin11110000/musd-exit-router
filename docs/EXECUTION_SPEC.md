# Bounded redemption adapter

## Transaction boundary

The caller approves the adapter for MUSD and supplies a request containing amount, minimum BTC, minimum MUSD redeemed, deadline, recipient, fresh redemption hints and an iteration bound (1–100).

1. Snapshot the adapter's MUSD and native BTC balances.
2. Pull exactly the requested MUSD from the caller. Reject a transfer that credits a different amount.
3. Call the fixed TroveManager with the request and hints.
4. Derive actual BTC output and MUSD spent/refund from balance deltas.
5. Revert the entire transaction if BTC output or fill is below the caller's bound.
6. Return unused MUSD to the caller and send BTC to the designated recipient.
7. Emit the actual amounts. A failing recipient reverts the entire operation.

The adapter has no admin, sweep function, upgradeability, arbitrary external-call facility or deposits. Pre-existing balances are excluded from output and refund accounting. Accidental deposits cannot be recovered. Do not send funds directly to it.

## Quote boundary

The live comparison uses one block for basic-pool quotes, CL swap simulations and redemption hint/fee estimates. Only full-input quotes can receive the highest-gross-output label. There is no net-output or best-execution claim: gas and multi-hop routes are not included.

The CL research quoter reverts inside the pool callback before paying, then decodes the output and actual input deltas. On-chain caller code exists only in eth_call state overrides. It is not an execution adapter and must not be deployed or funded.

## Release gates

- Source-to-live-implementation matching and independent security review.
- Testnet deployment with recorded constructor arguments and deployment receipt.
- Wallet allowance, signing, transaction confirmation and failure flows against that deployment.
- Actual gas estimates, quote expiry and refresh immediately before execution.
- Separate verified CL/basic swap execution integrations before enabling swaps.

The current UI deliberately offers read-only mainnet comparisons. There is no configured execution deployment.

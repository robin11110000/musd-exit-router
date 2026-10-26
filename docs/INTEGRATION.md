# Initial mainnet integration findings

Evidence: `reports/mainnet-probe.json`, Mezo chain 31612, block 12772717. These are historical sampled-block values, not current executable prices. The report includes the block hash and timestamp.

## Basic pool comparison

| Input MUSD | Basic swap BTC | Estimated redemption BTC | Estimated unspent MUSD |
|---|---:|---:|---:|
| 100 | 0.00123603 | 0.00124153 | 0 |
| 1,000 | 0.01217847 | 0.01241528 | 0 |
| 10,000 | 0.10616695 | 0.12415279 | 0 |
| 50,000 | 0.33812046 | 0.17740803 | 35,710.50765 |
| 100,000 | 0.46515400 | 0.17740803 | 85,710.50765 |

Pool and router quotes agreed for all five inputs. Redemption figures use HintHelpers' reported fill, core PriceFeed output, and BorrowerOperations' 0.75% fee. They are not funded redemption simulations. The large requests are partial fills and cannot be directly ranked against full-input swaps.

## Confirmed observations

- All nine documented contract addresses checked had EVM bytecode at the sampled block. EIP-1967 implementation slots and implementation bytecode hashes were recorded where present. This is not source-to-bytecode verification or an audit.
- TroveManager's configured PriceFeed matched the documented proxy.
- MUSD and the pool's BTC token report 18 decimals.
- Pool BTC is the native BTC ERC-20 precompile at `0x7b7C000000000000000000000000000000000000`, not an assumed WETH-style wrapper. Transfer/native-balance behavior still needs execution tests.
- The router's Aerodrome-style four-field route tuple returned successful read-only quotes.
- With 50 hint iterations the large requests reported about 14,289.49 MUSD redeemable. This is the sampled hint result, not a proven permanent protocol capacity limit.

## Decision

Continue validation: the basic pool has enough price impact to make redemption comparison potentially useful. Do not advertise best execution or net savings yet.

Next required evidence:

1. Quote concentrated-liquidity pools and compare the best supported swap route.
2. Match live implementation bytecode to source/artifacts; verify redemption output and fee rounding.
3. On a local fork, simulate funded swaps and redemption with fresh insertion hints, including partial-fill and stale-state behavior.
4. Estimate gas for actual calldata and account for approval transactions separately.
5. Specify minimum BTC, minimum fill, deadline, refund recipient, and residual-balance invariants before adapting the execution contract.

## Implementation update

The local app now quotes both active BTC/MUSD CL pools by injecting an ephemeral callback quoter through eth_call state overrides. The callback reports both output and input consumed. The 2000-spacing pool is almost exhausted, and the 200-spacing pool also partially fills sufficiently large inputs. Partial fills are excluded from ranking. See `reports/cl-quotes.json`.

The bounded adapter compiles and passes local mocked-EVM tests for refunds, output/fill bounds, expiry, recipient failures, dust isolation and reentrancy. These are not mainnet compatibility tests.

The funded read-only adapter simulation at block 12773956 reverted with arithmetic underflow/overflow. A direct TroveManager call with the same balance fixture and hints reverted the same way. This narrows the issue to the shared core/simulation path, but does not prove a protocol bug. The RPC does not expose debug_traceCall. See `reports/redemption-simulation.json`. Redemption remains an estimate excluded from ranking until this failure is understood. Do not enable wallet execution based on the local unit tests.

## Primary sources

- https://mezo.org/docs/developers/musd/musd-redemptions/
- https://mezo.org/docs/developers/features/mezo-pools/
- https://github.com/mezo-org/musd
- https://github.com/VitalR/mezo-trovepilot/tree/08eeaeb5e711de9d56d906f001087b8a29fdeae7

# Buildathon working copy

Upstream: https://github.com/VitalR/mezo-trovepilot

Starting commit: `62fdef44e71f62b13b9f3268de26f6d20ce9ffc1` (November 1, 2025).

Local working branch: `buildathon`.

The official 2025 winner announcement links this repository. This is a submission-era snapshot, not a certified copy of the exact commit evaluated by judges. The later `archive/hackathon-v1` head changes only README and architecture documentation relative to this commit.

## Preserved foundation

LiquidationEngine, RedemptionRouter, KeeperRegistry, VaultManager, YieldAggregator stub, Next.js dashboard, deployment scripts and tests remain the upstream baseline. The upstream MIT license is retained. YieldAggregator is a demonstration stub, not an earning strategy.

## Initial local change

The UI development/start port is 3002 to avoid conflicting with the separate exit-router prototype on 3000. The UI has not been installed or launched in this working copy yet.

## Engineering sequence

1. Reproduce the original build and tests, inspect demo versus live UI behavior, and record baseline failures.
2. Review funds custody, redemption outputs/refunds, keeper authorization and fees, oracle alignment, and callback/reentrancy behavior before modifying financial logic.
3. Agree a substantive extension after reviewing current Mezo ecosystem overlap. Workshop topics are integration options, not a requirement to integrate everything.
4. Implement the feature with adversarial tests and a mid-implementation security review.
5. Review the completed change, verify deployed-contract compatibility, and demonstrate on testnet before any production use.

## Candidates for review, not production claims

- User-scoped automation policies: budgets, cooldowns, expiry and permitted actions.
- Keeper execution receipts derived from actual state changes and funds movements.
- Oracle freshness/decimal validation and live protocol interface alignment.
- Access and distribution: a verified onboarding path into an existing MUSD product, potentially using an authorized Banxa integration rather than implementing a bridge or payment processor.

## Security review checkpoints

Midpoint: authorization, asset accounting, reentrancy, external calls, oracle trust and fee limits.

Final: regression tests, dependency review, deployment configuration, admin powers, failure handling and documentation of remaining risks. Internal reviews do not constitute an independent audit.

## First security correction

An unrelated caller could previously call `autoDeposit(user, amount)` to move a user's vault balance into the configured aggregator without that user's instruction. The balance remained credited to the user, so this is an unauthorized routing issue, not proof of theft. Entry is now restricted to the balance owner. The targeted local-EVM regression test reproduces the original behavior and verifies authorized deposit and withdrawal after the fix.

Run `git submodule update --init --recursive`, `npm ci`, then `npm run test:security`. The original Foundry suite is separate and still needs to be run before claiming full regression coverage.

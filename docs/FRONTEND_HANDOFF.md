# Frontend chat handoff

## Product direction

Extend the original keeper/vault project into user-controlled MUSD automation. The planned distinguishing feature is a policy that limits keeper spending, execution frequency, expiry and fees, with revocation and accurate receipts. This direction is selected for implementation exploration; production viability and protocol compatibility are not yet established.

The original YieldAggregator is a stub. Do not show real yield, invented APY or a completed Earn integration. Workshop components (DEX, vaults, Earn, Matchbox, Banxa) are optional integrations to evaluate individually.

## Workspace

This cloned project is the `trovepilot` subdirectory of the current workspace. Its Next.js app lives in `trovepilot/ui`, configured for port 3002. The separate app at port 3000 is the earlier exit-router prototype, not this product.

## Frontend scope

- Start from the original Next.js dashboard instead of replacing the project with the exit-router app.
- Work in `ui/`; contract and security work stays in `src/` and tests in the main chat.
- Design a vault balance view, policy editor, enable/revoke controls and execution history.
- Distinguish demo data, disconnected wallet, wrong network, loading, transaction pending, confirmed and failed states.
- Do not enable transactions against old deployments after local contract changes.
- Show fees, budgets, expiry and authorization clearly.
- Preserve upstream licensing and source attribution while using a distinct product name and interface once selected.

## Contract boundary

Existing getters such as `userSnapshot` are available in source, but the policy API is not frozen. Build layout and local form state first; use clearly marked development fixtures for policy fields. Do not invent deployed addresses or imply policy transactions work. Confirm ABI and deployment addresses with the main chat before wiring writes.

## Git and release

Working branch: `buildathon`. Upstream retains original source history; `origin` points to robin11110000/musd-exit-router. Commit each small tested feature. Push after each completed feature when authentication works. Local push currently fails authentication; no claim of successful publication should be made until verified.

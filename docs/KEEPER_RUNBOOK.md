# Working-capital keeper and deployment

## Verified lifecycle

`npm run simulate:capital` compiles an ephemeral helper and executes a single `eth_call` against live Mezo testnet savings and its configured strategy. It injects 100 MUSD into the helper's temporary balance, creates a real WorkingCapitalVault inside the simulation, funds it, allocates 60 MUSD with a 40 MUSD reserve, revokes automation, unwinds all savings and returns the 100 MUSD. The captured successful result is in `exports/testnet-lifecycle-simulation.json`. No transaction or application deployment persists. This does not establish future liquidity, yield, or strategy source verification.

## Wallet deployment

1. Claim test BTC from the official faucet at https://faucet.test.mezo.org/.
2. Open http://127.0.0.1:3002/capital in an EVM-wallet-enabled browser.
3. Connect the intended owner on Mezo testnet and choose **Deploy empty vault**. Confirm in the wallet.
4. Save the confirmed vault address; the frontend also stores it locally.
5. Use test MUSD only. Approve and fund, then choose a reserve, action cap, budget, cooldown and expiry. Policy activation is a separate wallet transaction. Revoke always disables keeper allocations; owner exits remain available.

`npm run prepare:deploy -- <owner-address>` saves an unsigned deployment request and live balance/gas estimates. It does not sign or broadcast. No seed or private key is needed in chat. Fees and estimates can change.

## One-shot keeper

Set `VAULT_ADDRESS` and `KEEPER_ADDRESS` locally, then run:

```sh
npm run keeper:capital
```

Default mode is read-only: verify testnet, match vault runtime bytecode, check owner/keeper authorization and pinned strategy, read a consistent-block policy, compute the permitted surplus and simulate allocation. It reports inactive, expired, reserve-limited, budget-exhausted or cooldown states without a transaction.

To execute, first authorize the keeper through the owner's wallet. Configure `KEEPER_PRIVATE_KEY` securely in the local process environment (never commit or paste it), then explicitly run:

```sh
npm run keeper:capital -- --send
```

Send mode signs one bounded `allocate` call, uses a configurable `MAX_GAS_PRICE_WEI` ceiling (default 10 gwei), waits for the receipt and reports success or failure. No infinite loop or hosted scheduler is running. The keeper pays its own test BTC gas; there is no keeper fee charged against the user's MUSD. Policy enforcement happens again on-chain if state changes after simulation.

## Validation

`npm run test:security` covers ownership, reserve/budget/action limits, cooldown/expiry/revocation, withdrawal accounting, malicious receipt accounting, reentrancy and keeper planning boundaries. Browser checks cover responsive layout, disconnected controls and missing-wallet errors. Full browser wallet signing still requires the owner's wallet and funded testnet account.

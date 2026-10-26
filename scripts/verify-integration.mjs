import { createPublicClient, http, parseAbi, parseUnits, formatUnits, keccak256 } from 'viem';
import { mkdir, writeFile } from 'node:fs/promises';
import { estimateRedemption, isFullInputComparable } from '../src/quote-math.mjs';

// Read-only: no signer, approvals, transaction submission, or private-key input.
const rpcUrl = process.env.MEZO_RPC_URL ?? 'https://mainnet.mezo.public.validationcloud.io';
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 20_000, retryCount: 1 }) });
const addresses = {
  musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',
  troveManager: '0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',
  borrowerOperations: '0x44b1bac67dDA612a41a58AAf779143B181dEe031',
  priceFeed: '0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88',
  hintHelpers: '0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3',
  sortedTroves: '0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f',
  router: '0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706',
  factory: '0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248',
  pool: '0x52e604c44417233b6CcEDDDc0d640A405Caacefb',
};
const abi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function getReserves() view returns (uint256,uint256,uint256)',
  'function getAmountOut(uint256,address) view returns (uint256)',
  'function fetchPrice() view returns (uint256)',
  'function priceFeed() view returns (address)',
  'function oracle() view returns (address)',
  'function redemptionRate() view returns (uint256)',
  'function getTCR(uint256) view returns (uint256)',
  'function getRedemptionHints(uint256,uint256,uint256) view returns (address,uint256,uint256)',
  'function getAmountsOut(uint256,(address from,address to,bool stable,address factory)[]) view returns (uint256[])',
]);
const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const report = {
  generatedAt: new Date().toISOString(),
  status: 'incomplete',
  sources: [
    'https://mezo.org/docs/developers/musd/musd-redemptions/',
    'https://mezo.org/docs/developers/features/mezo-pools/',
  ],
  limitations: [
    'Pool and router eth_call quotes are not funded execution simulations.',
    'Redemption output is a fee-adjusted oracle estimate for the hinted fill, not an execution guarantee.',
    'Gas-adjusted ranking is withheld until executable calldata and gas estimates are verified.',
    'Concentrated-liquidity and multi-hop routes are outside this first probe.',
  ],
  contracts: {},
  quotes: [],
  errors: [],
};
let blockNumber;
const read = (address, functionName, args = []) => client.readContract({ address, abi, functionName, args, blockNumber });
async function attempt(label, fn) {
  try { return await fn(); }
  catch (error) {
    report.errors.push({ label, message: error.shortMessage ?? error.message });
    return null;
  }
}
try {
  const chainId = await client.getChainId();
  if (chainId !== 31612) throw new Error(`Expected Mezo mainnet 31612; received ${chainId}`);
  blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  Object.assign(report, { chainId, blockNumber, blockHash: block.hash, blockTimestamp: block.timestamp });
  for (const [name, address] of Object.entries(addresses)) {
    const code = await client.getCode({ address, blockNumber });
    if (!code || code === '0x') throw new Error(`No EVM bytecode at ${name}: ${address}`);
    const storage = await client.getStorageAt({ address, slot: implementationSlot, blockNumber });
    const implementation = storage && BigInt(storage) !== 0n ? `0x${storage.slice(-40)}` : null;
    report.contracts[name] = { address, bytecodeHash: keccak256(code), implementation };
    if (implementation) {
      const implementationCode = await client.getCode({ address: implementation, blockNumber });
      report.contracts[name].implementationBytecodeHash = implementationCode && implementationCode !== '0x'
        ? keccak256(implementationCode) : null;
    }
  }
  const musdDecimals = await read(addresses.musd, 'decimals');
  if (musdDecimals !== 18) throw new Error(`Unexpected MUSD decimals: ${musdDecimals}`);
  const [token0, token1] = await Promise.all([read(addresses.pool, 'token0'), read(addresses.pool, 'token1')]);
  if (![token0, token1].some(token => token.toLowerCase() === addresses.musd.toLowerCase())) {
    throw new Error('Documented pool does not contain MUSD');
  }
  const btc = token0.toLowerCase() === addresses.musd.toLowerCase() ? token1 : token0;
  const btcDecimals = await read(btc, 'decimals');
  if (btcDecimals !== 18) throw new Error(`Unexpected BTC decimals: ${btcDecimals}`);
  const actualPriceFeed = await read(addresses.troveManager, 'priceFeed');
  // Use the core's configured feed, even when documentation has drifted.
  const price = await read(actualPriceFeed, 'fetchPrice');
  if (price <= 0n) throw new Error('Nonpositive core BTC price');
  const fee = await read(addresses.borrowerOperations, 'redemptionRate');
  if (fee < 0n || fee >= 10n ** 18n) throw new Error('Invalid redemption fee');
  const tcr = await read(addresses.troveManager, 'getTCR', [price]);
  Object.assign(report, {
    pool: { token0, token1, btc, btcDecimals, reserves: await read(addresses.pool, 'getReserves') },
    redemption: { actualPriceFeed, documentedPriceFeedMatches: actualPriceFeed.toLowerCase() === addresses.priceFeed.toLowerCase(), priceE18: price, feeE18: fee, tcrE18: tcr, systemAllowsRedemption: tcr >= 1_100_000_000_000_000_000n },
  });
  const routes = [{ from: addresses.musd, to: btc, stable: false, factory: addresses.factory }];
  for (const amount of ['100', '1000', '10000', '50000', '100000']) {
    const input = parseUnits(amount, 18);
    const swap = await attempt(`pool quote ${amount}`, () => read(addresses.pool, 'getAmountOut', [input, addresses.musd]));
    const router = await attempt(`router quote ${amount}`, () => read(addresses.router, 'getAmountsOut', [input, routes]));
    const hints = await attempt(`redemption hints ${amount}`, () => read(addresses.hintHelpers, 'getRedemptionHints', [input, price, 50n]));
    const fill = hints?.[2] ?? null;
    // Match the core's two-stage integer rounding (gross collateral then fee).
    const redeem = fill === null ? null : estimateRedemption(fill, price, fee);
    report.quotes.push({
      inputMusd: amount, inputWei: input,
      swapBtc: swap === null ? null : formatUnits(swap, 18),
      routerBtc: router ? formatUnits(router.at(-1), 18) : null,
      poolRouterAgree: swap !== null && router !== null ? swap === router.at(-1) : null,
      redemptionFillMusd: fill === null ? null : formatUnits(fill, 18),
      redemptionRefundMusd: fill === null ? null : formatUnits(input - fill, 18),
      redemptionEstimatedBtc: redeem === null ? null : formatUnits(redeem, 18),
      comparableFullInput: fill !== null && isFullInputComparable(input, fill, tcr),
      hints,
    });
  }
  report.status = report.errors.length ? 'partial' : 'read-only-probe-complete';
} catch (error) {
  report.errors.push({ label: 'verification', message: error.shortMessage ?? error.message });
}
await mkdir('reports', { recursive: true });
await writeFile('reports/mainnet-probe.json', `${json(report)}\n`);
console.log(json(report));
if (report.status !== 'read-only-probe-complete') process.exitCode = 1;

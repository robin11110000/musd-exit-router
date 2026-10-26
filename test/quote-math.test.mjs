import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRedemption, isFullInputComparable } from '../src/quote-math.mjs';

const WAD = 10n ** 18n;
test('100 MUSD at $100,000/BTC and 0.75% fee returns 0.0009925 BTC', () => {
  assert.equal(estimateRedemption(100n * WAD, 100_000n * WAD, 75n * WAD / 10_000n), 992_500_000_000_000n);
});
test('fee rounding follows gross collateral rounding, never floats', () => {
  assert.equal(estimateRedemption(2n, 3n * WAD, WAD / 2n), 0n);
  assert.equal(estimateRedemption(5n, 3n * WAD, WAD / 2n), 1n);
});
test('partial redemptions cannot be ranked against full-input swaps', () => {
  assert.equal(isFullInputComparable(50_000n * WAD, 14_000n * WAD, 2n * WAD), false);
  assert.equal(isFullInputComparable(100n * WAD, 100n * WAD, 2n * WAD), true);
});
test('unavailable system and zero input cannot be ranked', () => {
  assert.equal(isFullInputComparable(WAD, WAD, WAD), false);
  assert.equal(isFullInputComparable(0n, 0n, 2n * WAD), false);
});
test('invalid prices, fees, and negative input fail closed', () => {
  assert.throws(() => estimateRedemption(WAD, 0n, 0n), RangeError);
  assert.throws(() => estimateRedemption(WAD, WAD, WAD), RangeError);
  assert.throws(() => estimateRedemption(-1n, WAD, 0n), RangeError);
});

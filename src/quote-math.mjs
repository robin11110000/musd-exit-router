const WAD = 10n ** 18n;

export function estimateRedemption(fillWei, priceE18, feeE18) {
  if (fillWei < 0n || priceE18 <= 0n || feeE18 < 0n || feeE18 >= WAD) {
    throw new RangeError('Invalid redemption inputs');
  }
  const gross = fillWei * WAD / priceE18;
  return gross - gross * feeE18 / WAD;
}

export function isFullInputComparable(inputWei, fillWei, tcrE18) {
  return inputWei > 0n && fillWei === inputWei && tcrE18 >= 1_100_000_000_000_000_000n;
}

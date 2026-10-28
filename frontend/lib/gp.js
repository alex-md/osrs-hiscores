// Presentation only: callers retain integer coins and quantities.
export function compactGP(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  for (const [size, suffix] of [[1e9, 'b'], [1e6, 'm'], [1e3, 'k']]) {
    if (abs >= size) {
      const scaled = Number((n / size).toFixed(abs / size < 10 ? 1 : 0));
      if (Math.abs(scaled) >= 1000 && suffix !== 'b') return `${scaled / 1000}${suffix === 'k' ? 'm' : 'b'}`;
      return `${scaled}${suffix}`;
    }
  }
  return Math.trunc(n).toLocaleString('en-US');
}

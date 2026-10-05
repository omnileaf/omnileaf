/** Orders strings the same way in every locale, so generated output stays stable. */
export function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

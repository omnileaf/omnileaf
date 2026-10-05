export class UnexpectedVariantError extends Error {
  override name = "UnexpectedVariantError";
}

export function assertNever(value: never): never {
  throw new UnexpectedVariantError(`No case handles ${JSON.stringify(value)}`);
}

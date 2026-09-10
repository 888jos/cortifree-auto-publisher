export const CORTIFREE_WORKSPACE_ID = "cortifree";
export const CORTIFREE_ACCOUNT_ID = "CF_EN_01";

export function isCortiFreeCarouselId(value: string): boolean {
  return /^CF_[A-Z0-9_]+$/.test(value);
}

export function assertCortiFreeCarouselId(value: string): void {
  if (!isCortiFreeCarouselId(value)) throw new Error("Invalid CortiFree carousel id");
}

export function assertCortiFreeAccountId(value: string): void {
  if (!value.startsWith("CF_")) throw new Error("Invalid CortiFree account id");
}

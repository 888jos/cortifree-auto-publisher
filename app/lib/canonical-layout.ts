import { formatContractFor } from "./format-contracts";

export function canonicalLayoutFor(contentType: string | null | undefined, fallback = "single-image") {
  const id = String(contentType ?? "").trim();
  if (!id) return fallback || "single-image";
  try {
    return formatContractFor(id).layout;
  } catch {
    return fallback || "single-image";
  }
}

export function isBrowserRenderableAssetUrl(value: unknown) {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url);
}

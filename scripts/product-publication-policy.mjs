export const PUBLICATION_STATUSES = Object.freeze(["editorial", "verified", "pending", "excluded", "legacy"]);
export const INDEXABLE_STATUSES = Object.freeze(["editorial", "verified", "legacy"]);
export const DIRECTORY_STATUSES = Object.freeze(["editorial", "verified"]);
export const COMPARISON_STATUSES = Object.freeze(["editorial", "verified"]);

export function publicationStatus(product) {
  if (PUBLICATION_STATUSES.includes(product?.publicationStatus)) return product.publicationStatus;
  if (product?.sourceType === "rakuten_product_api") return "pending";
  if (product?.status === "previous_generation") return "legacy";
  return "editorial";
}
export function productScope(product) {
  if (product?.productScope) return product.productScope;
  if (product?.productType === "makeup") return "makeup";
  return "face";
}

export function isIndexableProduct(product) {
  return INDEXABLE_STATUSES.includes(publicationStatus(product));
}

export function isDirectoryProduct(product) {
  return DIRECTORY_STATUSES.includes(publicationStatus(product));
}

export function isComparisonProduct(product) {
  return COMPARISON_STATUSES.includes(publicationStatus(product)) && productScope(product) === "face";
}

export function isPendingProduct(product) {
  return publicationStatus(product) === "pending";
}

export function isExcludedProduct(product) {
  return publicationStatus(product) === "excluded";
}

export function officialSources(product) {
  return Array.isArray(product?.editorialEvidence?.sources) ? product.editorialEvidence.sources : [];
}

export function hasQualifyingOfficialSource(product) {
  return officialSources(product).some(source => [
    "official-product", "official-brand", "official-pdf", "official-press-release", "official-successor"
  ].includes(source?.type) && /^https:\/\//.test(source?.url || ""));
}

export function verifiedGateFailures(product) {
  if (publicationStatus(product) !== "verified") return [];
  const failures = [];
  if (productScope(product) !== "face") failures.push("productScopeがfaceではない");
  if (!String(product?.brand || "").trim() || product.brand === "ブランド情報未掲載") failures.push("ブランド未確定");
  if (!String(product?.category || "").trim()) failures.push("カテゴリ未確定");
  if (!String(product?.name || "").trim()) failures.push("商品名未確定");
  if (!hasQualifyingOfficialSource(product)) failures.push("公式情報源なし");
  if (!product?.editorialEvidence?.verifiedAt) failures.push("verifiedAtなし");
  if (product?.qualityAudit?.duplicateStatus && product.qualityAudit.duplicateStatus !== "none") failures.push("重複・variant未解決");
  if (product?.qualityAudit?.categoryAnomaly) failures.push("カテゴリ未確定");
  return failures;
}

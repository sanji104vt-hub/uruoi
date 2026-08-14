export const EDITORIAL_AUDIT_DATE = "2026-08-14";

export const PRIORITY5_IDS = Object.freeze([
  95, 10, 36, 40, 205, 157, 199, 19, 22, 28,
  203, 24, 17, 64, 75, 135, 196, 179, 82, 39,
  142, 38, 37, 206, 177, 23, 49, 3, 56, 159,
  122, 168, 193, 154, 30, 166, 192, 117, 62, 91
]);

export const PRIORITY5_ID_SET = new Set(PRIORITY5_IDS);

const EXPERIENCE_TERMS = [
  "使ってみた", "使用して感じ", "効果を感じ", "実感しました", "私たちの使用",
  "べたつかない", "ベタつかない", "さらさら", "浸透が早い", "香りが良い", "刺激が少ない"
];

const MARKETING_TERMS = ["人気", "話題", "実力派", "高機能", "最強", "ベストセラー", "売れ筋"];
const REGULATED_PATTERNS = [
  /シワを?改善(?:する|します|できる)/,
  /シミを?(?:消す|なくす)/,
  /ニキビを?(?:治す|予防する|改善する)/,
  /炎症を?(?:治す|改善する)/,
  /肌を?修復(?:する|します)/
];

export function flatten(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === "object") return Object.values(value).flatMap(flatten);
  return [String(value)];
}

export function sourceList(product) {
  return Array.isArray(product?.editorialEvidence?.sources) ? product.editorialEvidence.sources : [];
}

export function isDomesticSource(source) {
  return source?.scope === "domestic"
    || source?.locale === "ja-JP"
    || /(?:\.jp(?:\/|$)|\/jp(?:\/|$)|\/ja(?:\/|$)|japan)/i.test(source?.url || "");
}

export function sourceProfile(product) {
  const sources = sourceList(product);
  const productPages = sources.filter(source => source.type === "official-product");
  const domesticProductPages = productPages.filter(isDomesticSource);
  const overseasProductPages = productPages.filter(source => !isDomesticSource(source));
  const officialDocuments = sources.filter(source => ["official-pdf", "official-press-release"].includes(source.type));
  const successors = sources.filter(source => source.type === "official-successor");
  const brandPages = sources.filter(source => source.type === "official-brand");
  const authorizedSellers = sources.filter(source => ["official-authorized-seller", "official-distributor"].includes(source.type));
  return { sources, productPages, domesticProductPages, overseasProductPages, officialDocuments, successors, brandPages, authorizedSellers };
}

export function lifecycleStatus(product) {
  if (product?.publicationStatus === "legacy" || product?.status === "previous_generation") return "legacy";
  const evidence = product?.editorialEvidence || {};
  const statusText = [
    ...flatten(evidence?.specs?.releaseStatus),
    ...flatten(evidence?.specs?.renewal),
    ...flatten(evidence?.sourceLimitations),
    ...flatten(evidence?.officialFeatures)
  ].join(" ");
  if (/製造終了|販売終了|discontinued/i.test(statusText)) return "discontinued";
  if (/前世代|旧製品|旧仕様|旧世代|掲載中の旧|現行.+へ刷新/.test(statusText)) return "legacy";
  const profile = sourceProfile(product);
  if (profile.productPages.length && evidence?.verifiedAt) return "current";
  return "status_unknown";
}

export function relevantMissingFields(product) {
  const evidence = product?.editorialEvidence || {};
  const specs = evidence.specs || {};
  const profile = sourceProfile(product);
  const missing = [];
  if (!profile.productPages.length) missing.push("product_specific_official_page");
  if (!specs.manufacturerCategory) missing.push("manufacturer_category");
  if (!specs.contentAmount) missing.push("content_amount");
  if (!specs.usage) missing.push("usage");
  if (!specs.keyIngredients && !specs.activeIngredients) missing.push("verified_ingredients");
  if (lifecycleStatus(product) === "status_unknown") missing.push("current_status");
  if (product?.category === "日焼け止め") {
    if (!specs.spf) missing.push("spf");
    if (!specs.pa) missing.push("pa");
    if (!specs.waterResistance) missing.push("uv_water_resistance");
  }
  return missing;
}

export function coverageAssessment(product) {
  const evidence = product?.editorialEvidence || {};
  const profile = sourceProfile(product);
  const specCount = Object.values(evidence.specs || {}).filter(value => flatten(value).length).length;
  const featureCount = flatten(evidence.officialFeatures).length;
  const hasDirectPrimary = profile.productPages.length > 0 || profile.officialDocuments.length > 0;
  const hasExplicitLimit = flatten(evidence.sourceLimitations).length > 0;
  const status = lifecycleStatus(product);

  if (profile.domesticProductPages.length && specCount >= 3 && featureCount >= 1 && status !== "legacy") {
    return { qualityLevel: "A", sourceCoverage: "complete", reason: "国内の商品専用公式ページで主要仕様と特徴を確認" };
  }
  if ((hasDirectPrimary && specCount >= 2 && featureCount >= 1)
    || (profile.successors.length && specCount >= 3 && featureCount >= 1 && hasExplicitLimit)) {
    return { qualityLevel: "B", sourceCoverage: "mostly_complete", reason: "一次情報はあるが世代差または一部仕様の確認範囲に制限" };
  }
  if (profile.sources.length) {
    return { qualityLevel: "C", sourceCoverage: "partial", reason: "公式系情報はあるが商品固有性または仕様coverageが限定的" };
  }
  return { qualityLevel: "D", sourceCoverage: "insufficient", reason: "商品固有の一次情報をSSoTへ未記録" };
}

export function attributeProvenance(product) {
  const specs = product?.editorialEvidence?.specs || {};
  return {
    category: specs.manufacturerCategory ? "official_normalized" : "editorial_classification",
    skin: "editorial_classification",
    concern: "editorial_classification",
    keyIngredients: (specs.keyIngredients || specs.activeIngredients) ? "official" : "editorial_unverified_tag",
    price: product?.priceType === "editorial_reference" ? "editorial_reference" : "catalog_value"
  };
}

export function claimAudit(product) {
  const evidence = product?.editorialEvidence || {};
  const publicText = [product?.desc, ...flatten(evidence.officialFeatures), ...flatten(evidence.comparisonPoints), ...flatten(evidence.decision)].join(" ");
  const allText = JSON.stringify(product);
  const nonUseExperience = product?.reviewedByEditor !== true
    ? EXPERIENCE_TERMS.filter(term => allText.includes(term))
    : [];
  const unsupportedMarketing = MARKETING_TERMS.filter(term => publicText.includes(term) && !sourceList(product).length);
  const unsupportedRegulated = !sourceList(product).length
    ? REGULATED_PATTERNS.filter(pattern => pattern.test(product?.desc || "")).map(pattern => pattern.source)
    : [];
  const legacyWithoutDisclosure = lifecycleStatus(product) === "legacy" && !/前世代|旧製品|旧仕様|旧世代|現行/.test(product?.desc || "");
  const issues = [];
  if (nonUseExperience.length) issues.push(`non_use_experience:${nonUseExperience.join("|")}`);
  if (unsupportedRegulated.length) issues.push(`unsupported_regulated:${unsupportedRegulated.join("|")}`);
  if (legacyWithoutDisclosure) issues.push("legacy_without_disclosure");
  if (unsupportedMarketing.length) issues.push(`unsupported_marketing:${unsupportedMarketing.join("|")}`);
  if (!sourceList(product).length) issues.push("product_specific_source_missing");
  if (attributeProvenance(product).keyIngredients === "editorial_unverified_tag") issues.push("ingredient_tag_not_officially_verified");

  let severity = "Low";
  if (nonUseExperience.length || unsupportedRegulated.length) severity = "Critical";
  else if (legacyWithoutDisclosure) severity = "High";
  else if (unsupportedMarketing.length) severity = "Medium";
  return { severity, claimRisk: issues.join(" | ") || "none", issues };
}

export function sourceCategory(product) {
  const profile = sourceProfile(product);
  if (profile.domesticProductPages.length) return "domestic_official_product";
  if (profile.overseasProductPages.length && !profile.domesticProductPages.length) return "overseas_official_only";
  if (profile.authorizedSellers.length && profile.sources.length === profile.authorizedSellers.length) return "authorized_seller_only";
  if (profile.brandPages.length && profile.sources.length === profile.brandPages.length) return "brand_top_only";
  if (profile.successors.length && profile.sources.length === profile.successors.length) return "successor_only";
  if (profile.officialDocuments.length) return "official_document";
  if (!profile.sources.length) return "no_product_primary_source";
  return "official_mixed";
}

export function auditRecord(product) {
  const coverage = coverageAssessment(product);
  const claims = claimAudit(product);
  const missingFields = relevantMissingFields(product);
  const status = lifecycleStatus(product);
  const profile = sourceProfile(product);
  const nextAction = coverage.qualityLevel === "D"
    ? "商品専用メーカー公式ページを調査し、商品状態・仕様・成分タグを確認"
    : status === "legacy"
      ? "掲載世代と現行品の対応を再確認し、旧製品案内を維持"
      : missingFields.length
        ? `不足項目を公式情報で確認: ${missingFields.join(", ")}`
        : "定期的に公式URLと商品状態を再確認";
  return {
    qualityLevel: coverage.qualityLevel,
    sourceCoverage: coverage.sourceCoverage,
    qualityReason: coverage.reason,
    sourceCategory: sourceCategory(product),
    sourceCount: profile.sources.length,
    lastVerified: product?.editorialEvidence?.verifiedAt || "",
    currentStatus: status,
    actualUse: product?.reviewedByEditor === true,
    priority5: PRIORITY5_ID_SET.has(Number(product?.id)),
    claimRisk: claims.claimRisk,
    severity: claims.severity,
    missingFields,
    nextAction,
    attributeProvenance: attributeProvenance(product)
  };
}

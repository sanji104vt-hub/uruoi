export const REPORT_DATE = "2026-08-11";

export const RISK_TERMS = [
  "人気","話題","定番","ロングセラー","ベストセラー","売れ筋","高評価","受賞","ベストコスメ",
  "実力派","高機能","低刺激","肌に優しい","敏感肌でも使える","鎮静","炎症","修復","改善","治す",
  "浸透","透明感","毛穴","バリア","シワ改善","美白","シミ","ニキビ","エイジング"
];

export const EXPERIENCE_TERMS = ["使ってみた","使用して感じ","効果を感じ","実感しました","私たちの使用","べたつかない","さらさら","しっとりした使用感"];

export function evidenceOf(product){
  return product?.editorialEvidence && typeof product.editorialEvidence === "object" ? product.editorialEvidence : null;
}

export function flatten(value){
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === "object") return Object.values(value).flatMap(flatten);
  return [String(value)];
}

export function sourceQuality(product){
  const evidence = evidenceOf(product);
  const sources = evidence?.sources || [];
  const specs = Object.values(evidence?.specs || {}).filter(value => flatten(value).length).length;
  const hasProduct = sources.some(source => source.type === "official-product");
  const hasDomestic = sources.some(source => source.locale === "ja-JP" || /(?:\.jp|\/ja(?:\/|$)|japan)/i.test(source.url || ""));
  if (hasProduct && specs >= 3 && (evidence?.officialFeatures || []).length) return { grade:"A", reason:"商品専用メーカー公式ページで主要表示内容を確認" };
  if (sources.length && hasDomestic) return { grade:"B", reason:"メーカー公式情報を参照しているが、複数ページまたは限定範囲で確認" };
  if (sources.length) return { grade:"C", reason:"海外公式または国内正規販売元等の情報を中心に確認" };
  return { grade:"D", reason:"商品固有の一次情報をSSoTへ未記録" };
}

export function productStatus(product){
  const evidence = evidenceOf(product);
  const statusText = flatten(evidence?.specs?.releaseStatus).join(" ");
  if (product.status === "previous_generation") return "legacy";
  if (/製造終了|販売終了|discontinued/i.test(statusText)) return "discontinued";
  if ((evidence?.sources || []).some(source => source.type === "official-product") && evidence?.verifiedAt) return "current-confirmed";
  return "status-unknown";
}

export function hasKnownSuccessor(product){
  const evidence = evidenceOf(product);
  return (evidence?.sources || []).some(source => source.type === "official-successor")
    || Boolean(evidence?.successorId)
    || /後継|リニューアル/.test(flatten(evidence?.specs?.renewal).join(" "));
}

function cleanSentence(value){
  return String(value || "").replace(/\s+/g," ").trim().replace(/[。．]+$/u,"");
}

export function factualSummary(product){
  const evidence = evidenceOf(product);
  const identity = `${product.name}は${product.brand}の${product.category}です`;
  if (product.sourceType === "rakuten_product_api") {
    const checkedAt = String(product.availabilityCheckedAt || product.priceCheckedAt || "");
    const checked = checkedAt ? `${checkedAt}時点で` : "取得時点で";
    return `${identity}。楽天市場の商品価格ナビAPIで、${checked}購入可能な販売情報と商品画像を確認しています。参考価格は購入可能な店舗の最低価格で、成分・使用感・肌との相性は未確認です。`;
  }
  if (product.status === "previous_generation") {
    const feature = cleanSentence(evidence?.officialFeatures?.[0]);
    return `${identity}。Moilumでは旧製品・前世代情報として掲載しています${feature ? `。メーカー公式情報で確認できた当時の特徴は「${feature}」です` : ""}。`;
  }
  if (evidence?.sources?.length) {
    const feature = cleanSentence(evidence.officialFeatures?.[0]);
    const amount = cleanSentence(evidence.specs?.contentAmount);
    const detail = [feature, amount ? `内容量は${amount}` : ""].filter(Boolean).join("。 ");
    return `${identity}。${detail || "メーカー公式情報で確認できた仕様を商品ページに整理しています"}。`;
  }
  const conditions = [];
  if ((product.skin || []).length) conditions.push(`掲載肌タイプは${product.skin.join("・")}`);
  if ((product.concern || []).length) conditions.push(`掲載悩み分類は${product.concern.join("・")}`);
  const scope = product.productType === "makeup" ? "関連カテゴリ商品" : "比較候補";
  return `${identity}。Moilumでは${scope}として整理し、${conditions.join("、") || "商品名・ブランド・カテゴリ・参考価格"}を掲載しています。`;
}

export function riskMatches(text){
  const value = String(text || "");
  return RISK_TERMS.flatMap(term => [...value.matchAll(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))].map(() => term));
}

export function claimDisposition(product, field, text){
  const evidence = evidenceOf(product);
  if (field === "editorNote" && product.reviewedByEditor === true) return { status:"verified-primary-use", action:"keep", reason:"編集部実使用情報として記録" };
  if (field.startsWith("editorialEvidence.") && evidence?.sources?.length) return { status:"verified-official", action:"keep", reason:"同じeditorialEvidence内の公式sourceで根拠を管理" };
  if (text === factualSummary(product)) {
    if (evidence?.sources?.length) return { status:"verified-official", action:"keep", reason:"公式確認済み特徴または仕様から生成" };
    return { status:"catalog-classification", action:"keep", reason:"効能断定ではなくSSoTの掲載分類を明示" };
  }
  if (riskMatches(text).length && !evidence?.sources?.length) return { status:"unsupported", action:"neutralize", reason:"商品固有の一次情報が未記録のまま強い表現を公開" };
  if (riskMatches(text).length && evidence?.sources?.length) return { status:"needs-coverage-review", action:"review", reason:"公式根拠との対応を確認対象にする" };
  return { status:"catalog-fact", action:"keep", reason:"商品識別・分類・価格等のSSoT情報" };
}

export function normalize(value){
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"");
}

import fs from "node:fs";
import { normalize, sourceQuality } from "./priority7-policy.mjs";
import { publicationStatus } from "./product-publication-policy.mjs";

const AUDIT_DATE = "2026-08-14";
const FILE = "src/products.json";
const CSV_FILE = `reports/api-product-quality-audit-${AUDIT_DATE}.csv`;
const MD_FILE = `reports/api-product-quality-audit-${AUDIT_DATE}.md`;
const products = JSON.parse(fs.readFileSync(FILE, "utf8"));
const apiProducts = products.filter(product => product.sourceType === "rakuten_product_api");

const scopeRules = [
  ["hair", /シャンプー|ヘアマスク|ヘアオイル|ヘアケア|頭皮|スカルプ|毛髪|育毛|shampoo|hair\s*(?:mask|oil|care)|scalp/i],
  ["body", /ボディ|ハンドクリーム|ハンドケア|フットケア|デオドラント|body\s*(?:care|cream|lotion)|hand\s*(?:cream|care)/i],
  ["makeup", /ファンデーション|マスカラ|口紅|アイシャドウ|チーク|コンシーラー|化粧下地|メイクアップ|foundation|mascara|lipstick/i],
  ["fragrance", /香水|オードトワレ|オードパルファム|フレグランス|perfume|fragrance/i],
  ["supplement", /サプリメント|健康食品|美容ドリンク|supplement/i],
  ["other", /美顔器|美容機器|脱毛器|LEDマスク|beauty\s*device/i]
];
const variantRules = [
  ["refill", /詰[め替替]|詰替|レフィル|リフィル|付けかえ/i],
  ["set", /セット|キット|[2-9]個(?:セット)?|[2-9]本(?:セット)?/i],
  ["trial", /トライアル|サンプル|お試し|ミニサイズ/i],
  ["limited", /限定|コフレ/i]
];
const categoryRules = new Map([
  ["洗顔", /洗顔|フェイスウォッシュ|ウォッシングフォーム|洗顔フォーム|フェイスフォーム|石鹸|せっけん|ソープ|クレンジング/i],
  ["化粧水", /化粧水|ローション|トナー|ミスト|スキンコンディショナー/i],
  ["乳液", /乳液|エマルジョン|ソフナー|ミルク/i],
  ["美容液", /美容液|セラム|アンプル|エッセンス/i]
]);

function detectScope(product){
  // ブランド名に「BODY」等を含んでも商品自体は顔用の場合があるため、scope候補は商品名だけで抽出する。
  const text = product.name;
  for (const [scope, pattern] of scopeRules) if (pattern.test(text)) return scope;
  return "face";
}

function detectVariant(product){
  for (const [kind, pattern] of variantRules) if (pattern.test(product.name)) return kind;
  return "none";
}

function detectCategoryAnomaly(product){
  const matches = [...categoryRules].filter(([, pattern]) => pattern.test(product.name)).map(([category]) => category);
  if (!matches.length || matches.includes(product.category) || new Set(matches).size > 1) return { anomaly:false, expected:"" };
  return { anomaly:true, expected:matches[0] };
}

function brandStatus(product, variantBrands){
  if (!product.brand || product.brand === "ブランド情報未掲載") return "unknown";
  if (variantBrands.has(normalize(product.brand))) return "normalization-candidate";
  if (/化粧水|美容液|乳液|洗顔|スキンケア/.test(product.brand)) return "extraction-candidate";
  return "normal";
}

function quantile(values, q){
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b) => a-b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position), rest = position - base;
  return sorted[base] + (sorted[base + 1] == null ? 0 : rest * (sorted[base + 1] - sorted[base]));
}

const brandForms = new Map();
for (const product of apiProducts){
  const key = normalize(product.brand);
  if (!brandForms.has(key)) brandForms.set(key, new Set());
  brandForms.get(key).add(product.brand);
}
const variantBrands = new Set([...brandForms].filter(([, forms]) => forms.size > 1).map(([key]) => key));

const janGroups = new Map();
const titleGroups = new Map();
for (const product of products){
  if (product.productCode){
    const key = String(product.productCode);
    if (!janGroups.has(key)) janGroups.set(key, []);
    janGroups.get(key).push(product.id);
  }
  const key = `${normalize(product.brand)}:${normalize(product.name)}`;
  if (!titleGroups.has(key)) titleGroups.set(key, []);
  titleGroups.get(key).push(product.id);
}

const categoryStats = new Map();
for (const category of new Set(apiProducts.map(product => product.category))){
  const values = apiProducts.filter(product => product.category === category).map(product => Number(product.marketLowestPrice ?? product.price)).filter(value => value > 0);
  const q1 = quantile(values,.25), q3 = quantile(values,.75), iqr = q3-q1;
  categoryStats.set(category,{q1,q3,low:Math.max(0,q1-1.5*iqr),high:q3+1.5*iqr});
}

const audits = [];
for (const product of apiProducts){
  const detectedScope = detectScope(product);
  const categoryCheck = detectCategoryAnomaly(product);
  const variantStatus = detectVariant(product);
  const janIds = product.productCode ? janGroups.get(String(product.productCode)) || [] : [];
  const titleIds = titleGroups.get(`${normalize(product.brand)}:${normalize(product.name)}`) || [];
  const duplicateStatus = janIds.length > 1 ? "jan-duplicate" : titleIds.length > 1 ? "exact-title-duplicate" : variantStatus;
  const brandCheck = brandStatus(product, variantBrands);
  const marketPrice = Number(product.marketLowestPrice ?? product.price ?? 0);
  const stats = categoryStats.get(product.category);
  const priceWarning = !marketPrice ? "missing" : marketPrice < stats.low ? "low-outlier" : marketPrice > stats.high ? "high-outlier" : "none";
  const reasons = [];
  if (detectedScope !== "face") reasons.push(`商品名から${detectedScope}候補`);
  if (categoryCheck.anomaly) reasons.push(`現在${product.category}／名称上は${categoryCheck.expected}候補`);
  if (brandCheck !== "normal") reasons.push(`ブランド:${brandCheck}`);
  if (duplicateStatus !== "none") reasons.push(`重複・variant:${duplicateStatus}`);
  if (priceWarning !== "none") reasons.push(`価格:${priceWarning}`);
  if (!reasons.length) reasons.push("自動監査上の明確な異常なし。公式商品ページ確認前のためpending維持");
  const currentStatus = publicationStatus(product);
  const proposedStatus = currentStatus === "verified" ? "verified" : (product.id === 610 || currentStatus === "excluded") ? "excluded" : "pending";
  audits.push({
    product,
    detectedScope,
    categoryCheck,
    variantStatus,
    duplicateStatus,
    brandCheck,
    priceWarning,
    proposedStatus,
    reason:reasons.join(" / ")
  });
}

const candidates = audits
  .filter(a => a.detectedScope === "face" && !a.categoryCheck.anomaly && a.brandCheck === "normal" && a.duplicateStatus === "none" && a.product.productCode)
  .sort((a,b) => Number(b.product.rakutenSalesItemCount||0)-Number(a.product.rakutenSalesItemCount||0) || a.product.id-b.product.id)
  .slice(0,30);
const candidateIds = new Set(candidates.map(a => a.product.id));

for (const audit of audits){
  audit.product.qualityAudit = {
    auditedAt:AUDIT_DATE,
    detectedScope:audit.detectedScope,
    categoryAnomaly:audit.categoryCheck.anomaly,
    expectedCategory:audit.categoryCheck.expected || "",
    brandStatus:audit.brandCheck,
    duplicateStatus:audit.duplicateStatus,
    variantStatus:audit.variantStatus,
    priceWarning:audit.priceWarning,
    proposedStatus:audit.proposedStatus,
    verifiedCandidate:candidateIds.has(audit.product.id),
    reason:audit.reason
  };
}
fs.writeFileSync(FILE, JSON.stringify(products,null,2)+"\n","utf8");

function csv(value){
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}
const headers = ["id","name","brand","sourceOrigin","currentStatus","proposedStatus","productScope","category","categoryAnomaly","expectedCategory","duplicateStatus","variantStatus","jan","officialSource","sourceQuality","price","priceWarning","brandStatus","verifiedCandidate","reason"];
const rows = audits.map(a => ({
  id:a.product.id,name:a.product.name,brand:a.product.brand,sourceOrigin:a.product.sourceType,
  currentStatus:publicationStatus(a.product),proposedStatus:a.proposedStatus,productScope:a.product.productScope,
  category:a.product.category,categoryAnomaly:a.categoryCheck.anomaly,expectedCategory:a.categoryCheck.expected,
  duplicateStatus:a.duplicateStatus,variantStatus:a.variantStatus,jan:a.product.productCode||"",
  officialSource:(a.product.editorialEvidence?.sources||[]).map(source=>source.url).join(" | "),
  sourceQuality:sourceQuality(a.product).grade,price:a.product.marketLowestPrice??a.product.price,
  priceWarning:a.priceWarning,brandStatus:a.brandCheck,verifiedCandidate:candidateIds.has(a.product.id),reason:a.reason
}));
fs.writeFileSync(CSV_FILE,[headers.join(","),...rows.map(row=>headers.map(header=>csv(row[header])).join(","))].join("\n")+"\n","utf8");

const count = predicate => audits.filter(predicate).length;
const statusCounts = Object.fromEntries(["editorial","verified","pending","excluded","legacy"].map(status=>[status,products.filter(product=>publicationStatus(product)===status).length]));
const examples = (predicate,limit=8) => audits.filter(predicate).slice(0,limit).map(a=>`- ID ${a.product.id}：${a.product.name}（${a.reason}）`).join("\n") || "- なし";
const markdown = `# 楽天API商品 品質監査（${AUDIT_DATE}）

## 集計

| 項目 | 件数 |
|---|---:|
| DB全商品 | ${products.length} |
| API商品 | ${apiProducts.length} |
| editorial | ${statusCounts.editorial} |
| verified | ${statusCounts.verified} |
| pending | ${statusCounts.pending} |
| excluded | ${statusCounts.excluded} |
| legacy | ${statusCounts.legacy} |
| face skincare候補 | ${count(a=>a.detectedScope==="face")} |
| hair候補 | ${count(a=>a.detectedScope==="hair")} |
| body候補 | ${count(a=>a.detectedScope==="body")} |
| makeup候補 | ${count(a=>a.detectedScope==="makeup")} |
| fragrance候補 | ${count(a=>a.detectedScope==="fragrance")} |
| supplement候補 | ${count(a=>a.detectedScope==="supplement")} |
| other候補 | ${count(a=>a.detectedScope==="other")} |
| カテゴリ不一致候補 | ${count(a=>a.categoryCheck.anomaly)} |
| ブランド要確認 | ${count(a=>a.brandCheck!=="normal")} |
| JAN重複 | ${count(a=>a.duplicateStatus==="jan-duplicate")} |
| 完全名称重複 | ${count(a=>a.duplicateStatus==="exact-title-duplicate")} |
| 詰替 | ${count(a=>a.variantStatus==="refill")} |
| セット | ${count(a=>a.variantStatus==="set")} |
| トライアル | ${count(a=>a.variantStatus==="trial")} |
| 価格異常候補 | ${count(a=>a.priceWarning!=="none")} |
| verified調査候補 | ${candidates.length} |

## 方針

- API取得商品は公式根拠を持たないため、根拠確認なしでverifiedへ昇格していません。
- ID 610は明確なボディミルクを美容液カテゴリで取得したためexcludedとし、データはSSoTに保持します。
- marketLowestPriceは「楽天市場取得時点の購入可能店舗の最低価格」としてreferencePriceから分離しました。
- 楽天レビュー値はデータとして保持しますが、pendingの一覧・ランキング・診断・個別ページUIでは表示しません。
- キーワード判定は削除判断ではなく監査候補の抽出です。verified昇格時はメーカー・ブランド公式ページを人が確認します。

## 対象scope・誤分類の代表例

${examples(a=>a.detectedScope!=="face"||a.categoryCheck.anomaly)}

## 重複・variant候補

${examples(a=>a.duplicateStatus!=="none")}

## ブランド要確認の代表例

${examples(a=>a.brandCheck!=="normal")}

## 価格異常候補の代表例

${examples(a=>a.priceWarning!=="none")}

## verified調査候補 上位${candidates.length}件

販売店舗数、JAN、カテゴリ・ブランド表記が揃い、自動監査で明確な異常がない順です。これはSEO公開承認ではなく、公式商品ページを次に確認する候補です。

${candidates.map((a,index)=>`${index+1}. ID ${a.product.id} ${a.product.brand}「${a.product.name}」— 楽天販売店舗 ${Number(a.product.rakutenSalesItemCount||0)}件`).join("\n")}
`;
fs.writeFileSync(MD_FILE,markdown,"utf8");
console.log(`✓ API商品品質監査: ${apiProducts.length}件 / CSV ${CSV_FILE} / Markdown ${MD_FILE}`);
console.log(`  face=${count(a=>a.detectedScope==="face")} body=${count(a=>a.detectedScope==="body")} category-anomaly=${count(a=>a.categoryCheck.anomaly)} verified候補=${candidates.length}`);

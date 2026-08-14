import fs from "node:fs";
import path from "node:path";
import {
  EDITORIAL_AUDIT_DATE,
  PRIORITY5_IDS,
  auditRecord,
  sourceList,
  sourceProfile
} from "./editorial-source-audit-policy.mjs";

const PRODUCTS_FILE = "src/products.json";
const CSV_FILE = `reports/editorial-product-source-audit-${EDITORIAL_AUDIT_DATE}.csv`;
const MD_FILE = `reports/editorial-product-source-audit-${EDITORIAL_AUDIT_DATE}.md`;
const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
const editorial = products.filter(product => product.publicationStatus === "editorial");
const legacy = products.filter(product => product.publicationStatus === "legacy");
if (editorial.length !== 246) throw new Error(`editorial商品は246件の想定です: ${editorial.length}`);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.html$/i.test(entry.name) ? [file] : [];
  });
}

const publicHtml = walk("public").map(file => ({ file, source: fs.readFileSync(file, "utf8") }));
const rankingHtml = fs.existsSync("public/hubs/ranking.html") ? fs.readFileSync("public/hubs/ranking.html", "utf8") : "";
const columnHtml = publicHtml.filter(item => item.file.replaceAll("\\", "/").includes("/columns/"));

function productLinkOccurrences(source, productId) {
  const escaped = String(productId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`/products/${escaped}(?!\\d)`, "g"))].length;
}

function linkSignals(product) {
  const needle = `/products/${product.id}`;
  const internalLinks = publicHtml.reduce((sum, item) => sum + productLinkOccurrences(item.source, product.id), 0);
  const columnLinks = columnHtml.reduce((sum, item) => sum + productLinkOccurrences(item.source, product.id), 0);
  const ranking = rankingHtml.includes(needle);
  const priorityScore = Math.min(internalLinks, 20)
    + Math.min(columnLinks, 5) * 4
    + (ranking ? 12 : 0)
    + (product.reviewedByEditor === true ? 16 : 0)
    + (Number(product.rating || 0) >= 4.6 ? 3 : 0);
  const reasons = [];
  if (ranking) reasons.push("ランキング導線あり");
  if (columnLinks) reasons.push(`コラムリンク${columnLinks}件`);
  if (internalLinks) reasons.push(`内部リンク${internalLinks}件`);
  if (product.reviewedByEditor === true) reasons.push("編集部実使用商品");
  if (Number(product.rating || 0) >= 4.6) reasons.push("編集部参考指標4.6以上");
  return { internalLinks, columnLinks, ranking, priorityScore, priorityReason: reasons.join("・") || "通常一覧導線" };
}

const records = editorial.map(product => ({ product, audit: auditRecord(product), signals: linkSignals(product) }));
for (const { product, audit, signals } of records) {
  product.sourceAudit = {
    assessedAt: EDITORIAL_AUDIT_DATE,
    qualityLevel: audit.qualityLevel,
    sourceCoverage: audit.sourceCoverage,
    sourceCategory: audit.sourceCategory,
    sourceCount: audit.sourceCount,
    lastVerified: audit.lastVerified,
    currentStatus: audit.currentStatus,
    actualUse: audit.actualUse,
    priority5: audit.priority5,
    claimRisk: audit.claimRisk,
    severity: audit.severity,
    missingFields: audit.missingFields,
    nextAction: audit.nextAction,
    attributeProvenance: audit.attributeProvenance,
    priorityScore: signals.priorityScore,
    priorityReason: signals.priorityReason
  };
}
for (const product of legacy) {
  const audit = auditRecord(product);
  product.sourceAudit = {
    assessedAt: EDITORIAL_AUDIT_DATE,
    qualityLevel: audit.qualityLevel,
    sourceCoverage: audit.sourceCoverage,
    sourceCategory: audit.sourceCategory,
    sourceCount: audit.sourceCount,
    lastVerified: audit.lastVerified,
    currentStatus: audit.currentStatus,
    actualUse: audit.actualUse,
    priority5: audit.priority5,
    claimRisk: audit.claimRisk,
    severity: audit.severity,
    missingFields: audit.missingFields,
    nextAction: audit.nextAction,
    attributeProvenance: audit.attributeProvenance
  };
}
fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2) + "\n", "utf8");
fs.mkdirSync("reports", { recursive: true });

const rows = records.map(({ product, audit, signals }) => {
  const profile = sourceProfile(product);
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    editorialStatus: product.publicationStatus,
    qualityLevel: audit.qualityLevel,
    sourceCoverage: audit.sourceCoverage,
    officialProductPage: profile.productPages.map(source => source.url).join(" | "),
    officialSourceType: [...new Set(sourceList(product).map(source => source.type))].join(" | "),
    sourceCount: audit.sourceCount,
    lastVerified: audit.lastVerified,
    currentStatus: audit.currentStatus,
    actualUse: audit.actualUse,
    priority5: audit.priority5,
    claimRisk: audit.claimRisk,
    severity: audit.severity,
    missingFields: audit.missingFields.join(" | "),
    nextAction: audit.nextAction,
    internalLinks: signals.internalLinks,
    columnLinks: signals.columnLinks,
    ranking: signals.ranking,
    priorityScore: signals.priorityScore,
    priorityReason: signals.priorityReason
  };
});

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const headers = Object.keys(rows[0]);
fs.writeFileSync(CSV_FILE, [headers.join(","), ...rows.map(row => headers.map(header => csv(row[header])).join(","))].join("\n") + "\n", "utf8");

function countBy(items, getter) {
  const result = {};
  for (const item of items) {
    const key = getter(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}
function countRows(filter) { return records.filter(filter).length; }
function tableCounts(order, counts) { return order.map(key => `| ${key} | ${counts[key] || 0} |`).join("\n"); }

const levels = countBy(records, row => row.audit.qualityLevel);
const severities = countBy(records, row => row.audit.severity);
const statuses = countBy(records, row => row.audit.currentStatus);
const sourceCategories = countBy(records, row => row.audit.sourceCategory);
const priority5Products = PRIORITY5_IDS.map(id => products.find(product => product.id === id)).filter(Boolean);
const priority5Levels = countBy(priority5Products, product => auditRecord(product).qualityLevel);
const actualUseProducts = records.filter(row => row.product.reviewedByEditor === true);
const actualUseLevels = countBy(actualUseProducts, row => row.audit.qualityLevel);
const priorities = records
  .filter(row => row.audit.qualityLevel === "D" || ["Critical", "High"].includes(row.audit.severity))
  .sort((a, b) => b.signals.priorityScore - a.signals.priorityScore || a.product.id - b.product.id)
  .slice(0, 30);
const criticalOrHigh = records.filter(row => ["Critical", "High"].includes(row.audit.severity));
const sourceUrlCount = new Set(records.flatMap(row => sourceList(row.product).map(source => source.url))).size;

const markdown = `# editorial商品 一次情報カバレッジ監査（${EDITORIAL_AUDIT_DATE}）

## 監査範囲

- editorial商品: ${editorial.length}件（全件監査）
- legacy商品: ${legacy.length}件（別集計）
- Priority 5コホート: ${priority5Products.length}件（editorial 39件 + legacy 1件）
- 実使用商品: ${actualUseProducts.length}件
- 登録済み公式系URL: ${sourceUrlCount}件
- publicationStatusとA/B/C/Dは別軸です。Dでも自動noindexにはせず、根拠不足として人手調査の優先順位へ回します。

## 商品品質

| Level | 件数 |
|---|---:|
${tableCounts(["A", "B", "C", "D"], levels)}

- A: 商品専用の国内公式ページで主要仕様と特徴を確認
- B: 一次情報はあるが世代差または一部仕様に制限
- C: 公式系情報はあるが商品固有性・仕様coverageが限定的
- D: 商品固有一次情報をSSoTへ未記録

## 情報源

| 区分 | 商品数 |
|---|---:|
| 国内メーカー・ブランドの商品専用公式ページあり | ${sourceCategories.domestic_official_product || 0} |
| 海外公式のみ | ${sourceCategories.overseas_official_only || 0} |
| 国内正規販売元のみ | ${sourceCategories.authorized_seller_only || 0} |
| ブランドトップのみ | ${sourceCategories.brand_top_only || 0} |
| 後継商品公式のみ | ${sourceCategories.successor_only || 0} |
| 公式PDF・プレス資料中心 | ${sourceCategories.official_document || 0} |
| その他公式情報の組み合わせ | ${sourceCategories.official_mixed || 0} |
| 商品固有一次情報なし | ${sourceCategories.no_product_primary_source || 0} |

## Claim監査（修正後判定）

| Severity | 件数 |
|---|---:|
${tableCounts(["Critical", "High", "Medium", "Low"], severities)}

- Critical/High残存: ${criticalOrHigh.length}件
- 非実使用商品に実使用表現がないかを全246件で検査します。
- 肌タイプ・悩み・未確認成分タグは「Moilum編集分類」として扱い、メーカー公式の適合・成分表とは区別します。
- review/aggregateRatingは監査対象外へ戻さず、引き続き出力禁止です。

## 商品status

| status | 件数 |
|---|---:|
${Object.entries(statuses).map(([status, count]) => `| ${status} | ${count} |`).join("\n")}

公式ページが見つからないことだけでdiscontinuedにはしていません。status_unknownとして人手確認へ回します。

## Priority 5コホート40件

| Level | 件数 |
|---|---:|
${tableCounts(["A", "B", "C", "D"], priority5Levels)}

Priority 5で記録した公式仕様・比較候補・情報源・verifiedAtは保持しています。

## 実使用11件

| Level | 件数 |
|---|---:|
${tableCounts(["A", "B", "C", "D"], actualUseLevels)}

実使用メモはreviewedByEditor=trueの商品だけに限定し、公式事実とは別フィールドで管理します。

## 次に公式調査すべき上位30件

外部検索需要は推測せず、内部リンク・コラム導線・ランキング・実使用フラグ・編集部参考指標だけで優先順位を付けています。

| 順位 | ID | 商品 | Level | score | 理由 |
|---:|---:|---|:---:|---:|---|
${priorities.map((row, index) => `| ${index + 1} | ${row.product.id} | ${row.product.brand} ${row.product.name} | ${row.audit.qualityLevel} | ${row.signals.priorityScore} | ${row.signals.priorityReason} |`).join("\n")}

## 次のアクション

1. 上位30件から商品専用メーカー公式ページを人手確認する。
2. 商品名・世代・カテゴリ・主要仕様を確認後、sourceAuditとeditorialEvidenceを更新する。
3. 既存editorial商品の補強と、pending商品のverified昇格は別工程で管理する。
4. 外部URLのHTTP状態は editorial-source-http-audit-${EDITORIAL_AUDIT_DATE}.csv で非blocking監査する。
`;
fs.writeFileSync(MD_FILE, markdown, "utf8");

console.log(`✓ editorial source audit: ${editorial.length}件 / A=${levels.A || 0} B=${levels.B || 0} C=${levels.C || 0} D=${levels.D || 0}`);
console.log(`  severity Critical=${severities.Critical || 0} High=${severities.High || 0} Medium=${severities.Medium || 0} Low=${severities.Low || 0}`);
console.log(`  reports: ${CSV_FILE}, ${MD_FILE}`);

import fs from "node:fs";
import path from "node:path";
import {
  EDITORIAL_AUDIT_DATE,
  PRIORITY5_IDS,
  auditRecord,
  sourceList
} from "./editorial-source-audit-policy.mjs";

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const editorial = products.filter(product => product.publicationStatus === "editorial");
const legacy = products.filter(product => product.publicationStatus === "legacy");
const errors = [];
const warnings = [];
const fail = message => errors.push(message);
const warn = message => warnings.push(message);

if (editorial.length !== 246) fail(`editorial商品数が246ではありません: ${editorial.length}`);
if (legacy.length !== 1) fail(`legacy商品数が1ではありません: ${legacy.length}`);

const levels = { A: 0, B: 0, C: 0, D: 0 };
const statuses = {};
let actualUse = 0;
for (const product of editorial) {
  const expected = auditRecord(product);
  const audit = product.sourceAudit;
  if (!audit) { fail(`商品ID ${product.id}: sourceAuditがありません`); continue; }
  if (audit.assessedAt !== EDITORIAL_AUDIT_DATE) fail(`商品ID ${product.id}: sourceAudit日付が不正です`);
  for (const key of ["qualityLevel", "sourceCoverage", "sourceCategory", "currentStatus", "severity"]) {
    if (audit[key] !== expected[key]) fail(`商品ID ${product.id}: sourceAudit.${key}が再計算結果と不一致です`);
  }
  if (!audit.attributeProvenance || audit.attributeProvenance.skin !== "editorial_classification" || audit.attributeProvenance.concern !== "editorial_classification") {
    fail(`商品ID ${product.id}: 肌タイプ・悩みの編集分類sourceが不明です`);
  }
  levels[audit.qualityLevel] = (levels[audit.qualityLevel] || 0) + 1;
  statuses[audit.currentStatus] = (statuses[audit.currentStatus] || 0) + 1;
  if (product.reviewedByEditor === true) actualUse++;
  if (["Critical", "High"].includes(audit.severity)) fail(`商品ID ${product.id}: ${audit.severity}問題が未修正です (${audit.claimRisk})`);
  if (audit.qualityLevel === "D") warn(`商品ID ${product.id}: 商品固有一次情報が未記録です`);
  if (audit.currentStatus === "status_unknown") warn(`商品ID ${product.id}: current/legacy状態が未確認です`);
  if (!audit.lastVerified) warn(`商品ID ${product.id}: source確認日がありません`);
  for (const source of sourceList(product)) {
    if (!/^https:\/\//.test(source.url || "")) fail(`商品ID ${product.id}: source URLがHTTPSではありません`);
    if (!source.title || !source.type) fail(`商品ID ${product.id}: sourceのtitle/typeがありません`);
  }

  const file = path.join("public", "products", `${product.id}.html`);
  if (!fs.existsSync(file)) { fail(`商品ID ${product.id}: 商品HTMLがありません`); continue; }
  const html = fs.readFileSync(file, "utf8");
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  if (canonical !== `https://moilum.asutelu.com/products/${product.id}`) fail(`商品ID ${product.id}: canonicalが不正です`);
  if (/noindex/i.test(html.match(/<meta name="robots" content="([^"]+)"/i)?.[1] || "")) fail(`商品ID ${product.id}: editorial商品がnoindexです`);
  if (/"(?:aggregateRating|reviewCount|ratingCount|review)"\s*:/.test(html)) fail(`商品ID ${product.id}: review系構造化データが復活しています`);
}

if (actualUse !== 11) fail(`実使用商品数が11ではありません: ${actualUse}`);
if (Object.values(levels).reduce((sum, count) => sum + count, 0) !== 246) fail("A/B/C/Dの合計が246ではありません");

const priority5Products = PRIORITY5_IDS.map(id => products.find(product => product.id === id));
if (priority5Products.some(product => !product)) fail("Priority 5対象40商品が揃っていません");
if (priority5Products.filter(Boolean).some(product => !product.editorialEvidence?.sources?.length || !product.editorialEvidence?.verifiedAt)) {
  fail("Priority 5対象商品の公式sourceまたはverifiedAtが失われています");
}

const productHub = fs.readFileSync("public/hubs/products.html", "utf8");
if (/品質確認済み|公式確認済み246|検証済み246/.test(productHub)) fail("/productsに過剰な確認済み表現が残っています");
if (!productHub.includes("Moilum編集部で比較情報を整理している246商品")) fail("/productsの新しい実態整合表現がありません");
if (!productHub.includes("比較用成分タグ")) fail("/productsに比較用成分タグの説明がありません");

const spa = fs.readFileSync("public/index.html", "utf8");
if (spa.includes('>主要成分</div>')) fail("SPA詳細にsource未区別の『主要成分』見出しが残っています");
for (const phrase of ["Moilum比較用成分タグ（公式成分表は未確認）", "成分タグ（公式確認状況は詳細へ）", "比較用成分タグ"]) {
  if (!spa.includes(phrase)) fail(`SPAにsource区別表現がありません: ${phrase}`);
}
if (/専門家監修|医師監修|皮膚科医推奨/.test(spa + productHub)) fail("根拠のない専門家・医師監修表現があります");

const sourcesPage = fs.readFileSync("public/about/sources.html", "utf8");
const ratingPage = fs.readFileSync("public/about/rating-policy.html", "utf8");
for (const phrase of ["公式系source記録あり", "商品固有source未記録", "比較用編集分類", "A〜D"]) {
  if (!sourcesPage.includes(phrase)) fail(`/about/sourcesに説明がありません: ${phrase}`);
}
if (!ratingPage.includes("比較用成分タグ")) fail("/about/rating-policyに比較用成分タグの説明がありません");

const csvFile = `reports/editorial-product-source-audit-${EDITORIAL_AUDIT_DATE}.csv`;
const mdFile = `reports/editorial-product-source-audit-${EDITORIAL_AUDIT_DATE}.md`;
const httpCsvFile = `reports/editorial-source-http-audit-${EDITORIAL_AUDIT_DATE}.csv`;
for (const file of [csvFile, mdFile, httpCsvFile]) if (!fs.existsSync(file)) fail(`監査レポートがありません: ${file}`);
if (fs.existsSync(csvFile)) {
  const rows = fs.readFileSync(csvFile, "utf8").trim().split(/\r?\n/);
  if (rows.length !== 247) fail(`監査CSVが246商品ではありません: ${rows.length - 1}`);
}

const legacyProduct = legacy[0];
const legacyHtml = fs.readFileSync(path.join("public", "products", `${legacyProduct.id}.html`), "utf8");
if (!/旧製品|前世代/.test(legacyHtml)) fail("legacy商品に旧製品・前世代案内がありません");
if (!/index\s*,\s*follow/i.test(legacyHtml)) fail("legacy商品がindex,followではありません");

console.log(`Priority 8 CI: editorial=${editorial.length} / A=${levels.A} B=${levels.B} C=${levels.C} D=${levels.D}`);
console.log(`status: ${Object.entries(statuses).map(([key, value]) => `${key}=${value}`).join(" ")} / actualUse=${actualUse}`);
console.log(`warnings=${warnings.length} / errors=${errors.length}`);
if (warnings.length) {
  const summary = warnings.reduce((map, warning) => {
    const key = warning.includes("一次情報") ? "source D" : warning.includes("状態") ? "status_unknown" : "lastVerifiedなし";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  console.warn(`WARNING summary: ${Object.entries(summary).map(([key, value]) => `${key}=${value}`).join(" / ")}`);
}
if (errors.length) {
  errors.forEach(error => console.error(`FAIL: ${error}`));
  process.exit(1);
}
console.log("✓ editorial 246商品のsource coverage・claim・status・実使用・UI整合を確認");

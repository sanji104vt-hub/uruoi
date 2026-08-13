import fs from "node:fs";
import path from "node:path";
import { sourceQuality } from "./priority7-policy.mjs";
import { isDirectoryProduct, isIndexableProduct } from "./product-publication-policy.mjs";

const TARGET_IDS = [95,10,36,40,205,157,199,19,22,28,203,24,17,64,75,135,196,179,82,39,142,38,37,206,177,23,49,3,56,159,122,168,193,154,30,166,192,117,62,91];
const SITE_ORIGIN = "https://moilum.asutelu.com";
const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function extractProducts(html){
  const marker = "const PRODUCTS=[";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("SPA PRODUCTS marker not found");
  let index = start + marker.length - 1;
  let depth = 0, inString = false, quote = "", escaped = false, end = -1;
  for (; index < html.length; index++) {
    const char = html[index];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") { inString = true; quote = char; continue; }
    if (char === "[") depth++;
    else if (char === "]" && --depth === 0) { end = index; break; }
  }
  if (end < 0) throw new Error("SPA PRODUCTS end not found");
  return JSON.parse(html.slice(start + marker.length - 1, end + 1));
}

function textFromHtml(value){
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function grams(value){
  const normalized = String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const set = new Set();
  for (let index = 0; index <= normalized.length - 3; index++) set.add(normalized.slice(index, index + 3));
  return set;
}

function jaccard(a, b){
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const spaProducts = extractProducts(fs.readFileSync("public/index.html", "utf8"));
const productById = new Map(products.map(product => [product.id, product]));
const spaById = new Map(spaProducts.map(product => [product.id, product]));
const workerSource = fs.readFileSync("src/index.js", "utf8");
const dynamicSitemapUsesProducts = /for\s*\(const p of PRODUCTS\.filter\(isIndexableProduct\)\)/.test(workerSource)
  && workerSource.includes("${SITE_ORIGIN}/products/${p.id}")
  && workerSource.includes('pathname === "/sitemap.xml"');
const productHub = fs.readFileSync("public/hubs/products.html", "utf8");
const changelog = fs.readFileSync("public/about/changelog.html", "utf8");
const descriptions = new Map();
const mainGrams = [];

if (products.length < 247 || spaProducts.length !== products.length) fail(`商品数またはSPA同期が不正です: JSON=${products.length}, SPA=${spaProducts.length}`);

for (const id of TARGET_IDS) {
  const product = productById.get(id);
  const spaProduct = spaById.get(id);
  if (!product) { fail(`商品ID ${id}: SSoTに存在しません`); continue; }
  if (!spaProduct) { fail(`商品ID ${id}: SPAに存在しません`); continue; }
  if (JSON.stringify(product) !== JSON.stringify(spaProduct)) fail(`商品ID ${id}: SSoTとSPAの商品データが不一致です`);

  const evidence = product.editorialEvidence;
  if (!evidence) { fail(`商品ID ${id}: editorialEvidenceがありません`); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.verifiedAt || "")) fail(`商品ID ${id}: 情報確認日が不正です`);
  if (!/^\d{4}-\d{2}$/.test(evidence.referencePriceCheckedAt || "")) fail(`商品ID ${id}: 参考価格確認月が不正です`);
  if (!Array.isArray(evidence.sources) || !evidence.sources.length) fail(`商品ID ${id}: official sourceが0件です`);
  const quality = sourceQuality(product);
  if (quality.grade === "D") fail(`商品ID ${id}: 公開中の公式仕様を説明できる商品固有sourceがありません`);
  if (quality.grade === "C") warn(`商品ID ${id}: 国内メーカー公式商品ページ以外を中心に確認しています`);
  for (const source of evidence.sources || []) {
    if (!/^official-(?:product|brand|pdf|press-release|successor)$/.test(source.type || "")) fail(`商品ID ${id}: source typeが不正です (${source.type || "なし"})`);
    try { if (new URL(source.url).protocol !== "https:") throw new Error(); }
    catch { fail(`商品ID ${id}: source URLが不正です (${source.url || "なし"})`); }
  }
  const specCount = Object.values(evidence.specs || {}).filter(value => value != null && value !== "" && (!Array.isArray(value) || value.length)).length;
  if (specCount < 3) warn(`商品ID ${id}: 固有仕様が少なめです (${specCount})`);
  if (!Array.isArray(evidence.comparisonCandidates) || evidence.comparisonCandidates.length < 2 || evidence.comparisonCandidates.length > 4) fail(`商品ID ${id}: 比較候補は2〜4件必要です`);
  for (const candidate of evidence.comparisonCandidates || []) {
    if (!productById.has(candidate.id)) fail(`商品ID ${id}: 存在しない比較候補 ${candidate.id}`);
    if (!candidate.reason) fail(`商品ID ${id}: 比較候補 ${candidate.id} の理由がありません`);
  }
  if (product.reviewedByEditor !== true) {
    const evidenceText = JSON.stringify(evidence);
    if (/(?:使ってみた|使用して感じ|効果を感じ|実感しました|私たちの使用)/.test(evidenceText)) fail(`商品ID ${id}: 非実使用商品に使用感らしい文章があります`);
  }

  const file = path.join("public", "products", `${id}.html`);
  if (!fs.existsSync(file)) { fail(`商品ID ${id}: 生成HTMLがありません`); continue; }
  const html = fs.readFileSync(file, "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1]?.trim();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  const robots = html.match(/<meta name="robots" content="([^"]+)"/i)?.[1] || "";
  if (!title || !title.includes(product.name)) fail(`商品ID ${id}: titleが商品固有ではありません`);
  if (!description) fail(`商品ID ${id}: meta descriptionがありません`);
  else {
    if (descriptions.has(description)) fail(`商品ID ${id}: meta descriptionが商品ID ${descriptions.get(description)}と完全重複です`);
    descriptions.set(description, id);
  }
  if (canonical !== `${SITE_ORIGIN}/products/${id}`) fail(`商品ID ${id}: self canonicalが不正です`);
  if (!/index\s*,\s*follow/i.test(robots)) fail(`商品ID ${id}: index,followではありません`);
  if (!html.includes("公式情報で確認した仕様") || !html.includes("根拠となる公式情報源") || !html.includes("商品情報確認：2026年08月10日")) fail(`商品ID ${id}: 公式根拠表示または確認日がありません`);
  for (const candidate of evidence.comparisonCandidates || []) {
    if (!html.includes(`href="/products/${candidate.id}"`)) fail(`商品ID ${id}: 比較リンク /products/${candidate.id} がありません`);
    if (!fs.existsSync(path.join("public", "products", `${candidate.id}.html`))) fail(`商品ID ${id}: 比較リンク ${candidate.id} が404になります`);
  }
  if (!dynamicSitemapUsesProducts) fail(`商品ID ${id}: 動的sitemapがPRODUCTSから生成されていません`);
  if (isDirectoryProduct(product) && !productHub.includes(`href="/products/${id}"`)) fail(`商品ID ${id}: 商品一覧からリンクされていません`);
  if (isIndexableProduct(product) && !isDirectoryProduct(product) && !changelog.includes(`href="/products/${id}"`)) fail(`商品ID ${id}: index維持用の内部リンクがありません`);
  if (/\$\{|(?:href|src|content)="[^"]*(?:undefined|null|\[object Object\])/i.test(html)) fail(`商品ID ${id}: 未展開・無効URLがあります`);

  for (const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    const data = JSON.parse(match[1]);
    const raw = JSON.stringify(data);
    if (/"(?:aggregateRating|reviewCount|ratingCount|review)"\s*:/.test(raw) || data["@type"] === "Review") fail(`商品ID ${id}: 禁止されたレビュー系JSON-LDがあります`);
  }
  const article = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || "";
  mainGrams.push({ id, grams: grams(textFromHtml(article)) });
}

for (let a = 0; a < mainGrams.length; a++) for (let b = a + 1; b < mainGrams.length; b++) {
  const score = jaccard(mainGrams[a].grams, mainGrams[b].grams);
  if (score >= 0.65) warn(`商品ID ${mainGrams[a].id}/${mainGrams[b].id}: main類似度が高い (${score.toFixed(3)})`);
}

for (const id of TARGET_IDS) {
  let meaningfulInbound = 0;
  for (const [directory, names] of [
    ["public/products", fs.readdirSync("public/products").filter(name => name.endsWith(".html"))],
    ["public/columns", fs.readdirSync("public/columns").filter(name => name.endsWith(".html"))],
    ["public/guides", fs.readdirSync("public/guides").filter(name => name.endsWith(".html"))],
    ["public/hubs", ["brands.html","ranking.html"]]
  ]) {
    for (const name of names) {
      if (directory === "public/products" && name === `${id}.html`) continue;
      const html = fs.readFileSync(path.join(directory, name), "utf8");
      if (html.includes(`href="/products/${id}"`)) meaningfulInbound++;
    }
  }
  if (!meaningfulInbound) warn(`商品ID ${id}: 商品一覧以外の内部導線が確認できません`);
}

console.log(`Priority 5 CI: target=${TARGET_IDS.length}, errors=${errors.length}, warnings=${warnings.length}`);
for (const message of warnings) console.warn(`WARNING: ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`FAIL: ${message}`);
  process.exit(1);
}
console.log("✓ 40商品の公式根拠・比較リンク・meta・canonical・sitemap・レビュー系ガードを確認");

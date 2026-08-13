import fs from "node:fs";
import path from "node:path";
import {
  PUBLICATION_STATUSES, isComparisonProduct, isDirectoryProduct, isExcludedProduct,
  isIndexableProduct, isPendingProduct, publicationStatus, verifiedGateFailures
} from "./product-publication-policy.mjs";

const SITE = "https://moilum.asutelu.com";
const products = JSON.parse(fs.readFileSync("src/products.json","utf8"));
const byId = new Map(products.map(product => [String(product.id),product]));
const indexable = products.filter(isIndexableProduct);
const directory = products.filter(isDirectoryProduct);
const comparison = products.filter(isComparisonProduct);
const pending = products.filter(isPendingProduct);
const excluded = products.filter(isExcludedProduct);
const errors = [], warnings = [];
const fail = message => errors.push(message);

for (const product of products){
  const status = publicationStatus(product);
  if (!PUBLICATION_STATUSES.includes(status)) fail(`ID ${product.id}: publicationStatus不正`);
  if (!product.productScope) fail(`ID ${product.id}: productScopeなし`);
  if (product.sourceType === "rakuten_product_api" && !["pending","verified","excluded"].includes(status)) fail(`ID ${product.id}: API商品が安全なstatusではありません (${status})`);
  for (const reason of verifiedGateFailures(product)) fail(`ID ${product.id}: verified条件違反: ${reason}`);
}

function html(file){ return fs.readFileSync(file,"utf8"); }
function canonical(source){ return source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || ""; }
function productAnchors(source){ return [...source.matchAll(/<a\b[^>]*href="\/products\/(\d+)"/gi)].map(match=>match[1]); }

for (const product of products){
  const file = path.join("public","products",`${product.id}.html`);
  if (isExcludedProduct(product)){
    if (fs.existsSync(file)) fail(`ID ${product.id}: excluded商品ページが生成されています`);
    continue;
  }
  if (!fs.existsSync(file)){ fail(`ID ${product.id}: 商品ページがありません`); continue; }
  const source = html(file);
  if (canonical(source) !== `${SITE}/products/${product.id}`) fail(`ID ${product.id}: self canonical不正`);
  const robots = source.match(/<meta\s+name="robots"\s+content="([^"]+)"/i)?.[1] || "";
  if (isPendingProduct(product)){
    if (!/noindex\s*,\s*follow/i.test(robots)) fail(`ID ${product.id}: pendingがnoindex,followではありません`);
    if (!source.includes("Moilumで公式情報を確認中です")) fail(`ID ${product.id}: pending確認中表示なし`);
    if (/楽天レビュー|Moilum編集部評価|こちらもおすすめ|同じカテゴリのおすすめ/.test(source)) fail(`ID ${product.id}: pendingに評価・おすすめUIがあります`);
    if (/"@type"\s*:\s*"Product"/.test(source)) fail(`ID ${product.id}: pendingにProduct JSON-LDがあります`);
  } else if (!/index\s*,\s*follow/i.test(robots)) fail(`ID ${product.id}: index対象がindex,followではありません`);
}

const hub = html("public/hubs/products.html");
const hubIds = new Set(productAnchors(hub));
for (const product of directory) if (!hubIds.has(String(product.id))) fail(`ID ${product.id}: 公開商品が/productsにありません`);
for (const product of products.filter(product=>!isDirectoryProduct(product))) if (hubIds.has(String(product.id))) fail(`ID ${product.id}: ${publicationStatus(product)}商品が/productsにあります`);

const brands = html("public/hubs/brands.html");
const ranking = html("public/hubs/ranking.html");
const diagnosis = html("public/hubs/diagnosis.html");
for (const [name,source] of [["brands",brands],["ranking",ranking]]){
  for (const id of productAnchors(source)) if (!isComparisonProduct(byId.get(id))) fail(`${name}: 比較対象外ID ${id}へのリンクがあります`);
}
const diagnosisIds = [...diagnosis.matchAll(/"id":(\d+)/g)].map(match=>match[1]);
for (const id of diagnosisIds) if (!isComparisonProduct(byId.get(id))) fail(`diagnosis: 比較対象外ID ${id}を使用しています`);

const publicFiles = [];
function walk(directory){
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file = path.join(directory,entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.html$/i.test(entry.name)) publicFiles.push(file);
  }
}
walk("public");
const forbiddenIds = new Set([...pending,...excluded].map(product=>String(product.id)));
for (const file of publicFiles){
  const match = file.replaceAll("\\","/").match(/public\/products\/(\d+)\.html$/);
  if (match && forbiddenIds.has(match[1])) continue;
  for (const id of productAnchors(html(file))) if (forbiddenIds.has(id)) fail(`${file}: pending/excluded ID ${id}への通常リンクがあります`);
}

const worker = html("src/index.js");
if (!worker.includes("PRODUCTS.filter(isIndexableProduct)")) fail("Worker sitemapがindex対象で絞り込まれていません");
if (!worker.includes('status === "excluded"') || !worker.includes("status: 410")) fail("Workerにexcludedの410処理がありません");
if (!worker.includes('headers.set("x-robots-tag", "noindex, follow")')) fail("WorkerにpendingのX-Robots-Tagがありません");
const staticSitemap = html("public/sitemap.xml");
const sitemapProductIds = [...staticSitemap.matchAll(/<loc>https:\/\/moilum\.asutelu\.com\/products\/(\d+)<\/loc>/g)].map(match=>match[1]);
if (new Set(sitemapProductIds).size !== indexable.length) fail(`static sitemapの商品数が不正です: ${new Set(sitemapProductIds).size}/${indexable.length}`);
for (const id of sitemapProductIds) if (!isIndexableProduct(byId.get(id))) fail(`static sitemapに非index商品ID ${id}があります`);

const spa = html("public/index.html");
if (!spa.includes("const SKINCARE_PRODUCTS = PRODUCTS.filter(isComparisonProduct)")) fail("SPA比較対象が公開ゲートを使っていません");
if (!spa.includes("const DIRECTORY_PRODUCTS=PRODUCTS.filter(isDirectoryProduct)")) fail("SPA公開一覧集合がありません");
const fetchScript = html("scripts/fetch-rakuten-category-products.mjs");
if (!fetchScript.includes('publicationStatus: "pending"')) fail("新規API商品がpending開始になっていません");
if (!fetchScript.includes('product.publicationStatus = "excluded"')) fail("誤取得候補を削除せずexcludedへ残す処理がありません");

// indexable商品だけの通常リンクグラフを検査。pendingは意図的に主要導線から隔離する。
const routeFiles = new Map([
  ["/","public/index.html"],["/products","public/hubs/products.html"],["/brands","public/hubs/brands.html"],
  ["/ranking","public/hubs/ranking.html"],["/diagnosis","public/hubs/diagnosis.html"],["/columns","public/hubs/columns.html"],
  ["/about/sources","public/about/sources.html"],["/about/rating-policy","public/about/rating-policy.html"],["/about/changelog","public/about/changelog.html"]
]);
for (const product of indexable) routeFiles.set(`/products/${product.id}`,`public/products/${product.id}.html`);
for (const file of fs.readdirSync("public/columns").filter(file=>file.endsWith(".html"))) routeFiles.set(`/columns/${file.slice(0,-5)}`,`public/columns/${file}`);
for (const file of fs.readdirSync("public/guides").filter(file=>file.endsWith(".html"))) routeFiles.set(`/guides/${file.slice(0,-5)}`,`public/guides/${file}`);
function ordinaryInternalLinks(source){
  return [...source.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(match=>match[1]).filter(value=>value.startsWith("/")).map(value=>new URL(value,SITE).pathname.replace(/\/$/,"")||"/");
}
const graph = new Map();
for (const [route,file] of routeFiles){
  if (!fs.existsSync(file)){ fail(`${route}: グラフ対象HTMLなし`); continue; }
  graph.set(route,new Set(ordinaryInternalLinks(html(file)).filter(target=>routeFiles.has(target))));
}
const reached = new Set(["/"]), queue=["/"];
while(queue.length){ const route=queue.shift(); for(const target of graph.get(route)||[]) if(!reached.has(target)){reached.add(target);queue.push(target);} }
for (const product of indexable) if (!reached.has(`/products/${product.id}`)) fail(`ID ${product.id}: index対象商品が通常リンクで到達不能`);

if (!fs.existsSync("reports/api-product-quality-audit-2026-08-14.csv")) fail("品質監査CSVがありません");
if (!fs.existsSync("reports/api-product-quality-audit-2026-08-14.md")) fail("品質監査Markdownがありません");

for (const product of products.filter(product=>publicationStatus(product)==="verified" && !product.editorialEvidence?.sources?.some(source=>source.locale==="ja-JP"))) warnings.push(`ID ${product.id}: verifiedだが国内公式なし`);
for (const product of products.filter(product=>product.qualityAudit?.priceWarning && product.qualityAudit.priceWarning!=="none")) warnings.push(`ID ${product.id}: price anomaly ${product.qualityAudit.priceWarning}`);

console.log(`Publication gate CI: DB=${products.length} / index=${indexable.length} / directory=${directory.length} / comparison=${comparison.length} / pending=${pending.length} / excluded=${excluded.length}`);
console.log(`Indexable internal link reachability: ${indexable.filter(product=>reached.has(`/products/${product.id}`)).length}/${indexable.length}`);
console.log(`Warnings: ${warnings.length}`);
if(errors.length){ for(const error of errors) console.error(`FAIL: ${error}`); process.exit(1); }
console.log("✓ pending/excluded隔離、verified条件、主要導線、index対象商品到達性を確認");

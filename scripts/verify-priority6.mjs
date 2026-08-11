import fs from "node:fs";
import path from "node:path";

const SITE = "https://moilum.asutelu.com";
const TARGETS = [
  ["ingredient-comparison","2026-06-18"],
  ["depacos-vs-puchipura","2026-06-18"],
  ["sunscreen","2026-06-14"]
];
const TODAY = "2026-08-11";
const errors = [];
const warnings = [];
const fail = message => errors.push(message);
const warn = message => warnings.push(message);

const products = JSON.parse(fs.readFileSync("src/products.json","utf8"));
const columns = JSON.parse(fs.readFileSync("src/columns.json","utf8"));
const guides = JSON.parse(fs.readFileSync("src/guides-slugs.json","utf8"));
const indexHtml = fs.readFileSync("public/index.html","utf8");
const productIds = new Set(products.map(product => Number(product.id)));

function strip(value){
  return String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
}
function main(html,selector){
  if(selector !== "article") return html.match(/<!-- PRIORITY6_HOME_START -->([\s\S]*?)<!-- PRIORITY6_HOME_END -->/i)?.[1] || "";
  const start = html.search(/<article\b[^>]*>/i);
  const openEnd = start >= 0 ? html.indexOf(">",start) + 1 : -1;
  const end = html.lastIndexOf("</article>");
  return openEnd > 0 && end > openEnd ? html.slice(openEnd,end) : "";
}
function scripts(html){
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1]));
}
function normalize(value){ return strip(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu,""); }
function grams(value,n=5){
  const text = normalize(value), result = new Set();
  for(let index=0; index<=text.length-n; index++) result.add(text.slice(index,index+n));
  return result;
}
function jaccard(a,b){
  if(!a.size || !b.size) return 0;
  let intersection = 0;
  for(const value of a) if(b.has(value)) intersection++;
  return intersection/(a.size+b.size-intersection);
}

if(products.length < 247) fail(`商品数が基準値247件未満です: ${products.length}`);
if(columns.length !== 27) fail(`コラム数が27ではありません: ${columns.length}`);
if(guides.length !== 12) fail(`ガイド数が12ではありません: ${guides.length}`);
for(const token of ["G-BC0FBSZSWX","UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q","54ebba1a.f0b1f403.54ebba1b.9f0abc5f"]){
  if(!indexHtml.includes(token)) fail(`保護トークンがindex.htmlにありません: ${token}`);
}
if(!indexHtml.includes("PRIORITY6_HOME_START") || !indexHtml.includes("PRIORITY6_HOME_END")) fail("Priority6トップ生成マーカーがありません");
if(indexHtml.includes("HOME_PRODUCT_LINKS_START")) fail("旧トップ商品ブロックが残っています");
if(/<div id="products" class="grid"><\/div>/.test(main(indexHtml,"home"))) fail("トップにSPA商品グリッドが残っています");

const home = main(indexHtml,"home");
const homeProductIds = [...home.matchAll(/href="\/products\/(\d+)"/g)].map(match => Number(match[1]));
const uniqueHomeProducts = new Set(homeProductIds);
if(uniqueHomeProducts.size < 8 || uniqueHomeProducts.size > 16) fail(`トップの商品リンク数が8〜16件ではありません: ${uniqueHomeProducts.size}`);
for(const id of uniqueHomeProducts) if(!productIds.has(id)) fail(`トップに存在しない商品リンクがあります: ${id}`);
for(const href of ["/products","/brands","/ranking","/diagnosis","/columns","/about/rating-policy","/about/sources"]){
  if(!home.includes(`href="${href}"`)) fail(`トップの主要リンクがありません: ${href}`);
}
for(const slug of guides) if(!home.includes(`href="/guides/${slug}"`)) fail(`トップのガイドリンクがありません: ${slug}`);
const activeCount = products.filter(product => product.productType !== "makeup" && product.status !== "previous_generation").length;
const editorCount = products.filter(product => product.reviewedByEditor === true).length;
const publicOnlyCount = products.filter(product => product.reviewedByEditor !== true).length;
for(const expected of [products.length,activeCount,editorCount,publicOnlyCount]) if(!home.includes(`>${expected}<`) && !home.includes(`掲載${expected}商品`) && !home.includes(`全${expected}商品`)) fail(`トップにSSoT件数${expected}が表示されていません`);
const productsHub = fs.readFileSync("public/hubs/products.html","utf8");
const homeSimilarity = jaccard(grams(home),grams(productsHub));
if(homeSimilarity >= .25) fail(`トップと/productsの類似度が25%以上です: ${(homeSimilarity*100).toFixed(1)}%`);

const targetBodies = [];
for(const [id,published] of TARGETS){
  const file = path.join("public","columns",`${id}.html`);
  if(!fs.existsSync(file)){ fail(`${id}: 生成HTMLがありません`); continue; }
  const html = fs.readFileSync(file,"utf8");
  const body = main(html,"article");
  targetBodies.push([id,body]);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  if(canonical !== `${SITE}/columns/${id}`) fail(`${id}: canonicalが不正です`);
  if(!/<meta name="robots" content="index,follow,max-image-preview:large">/i.test(html)) fail(`${id}: robotsがindex,followではありません`);
  if(!body.includes("p6-data-analysis")) fail(`${id}: 独自データ分析がありません`);
  if(!body.includes("p6-sources")) fail(`${id}: 可視の参考情報源がありません`);
  const externalSources = [...body.matchAll(/href="(https?:\/\/[^"#]+)"/g)].filter(match => !match[1].startsWith(SITE));
  if(externalSources.length < 2) fail(`${id}: 外部一次情報源が2件未満です (${externalSources.length})`);
  if(/<div class="col-radar-box"|<div\s+class="col-radar"/i.test(body)) fail(`${id}: 記事本文にレーダーチャートが残っています`);
  if(!/<div class="col-table-wrap">/i.test(body)) warn(`${id}: 表形式の比較がありません`);
  if(/SPF\s*(?:1|Ⅰ)[^。]{0,12}(?:20|二十)分|SPF\s*×\s*\d+\s*分|SPF\s*50[^。]{0,12}(?:16|十六)時間|SPF値が高いほど長時間(?:守る|防ぐ|効く)/i.test(strip(body))) fail(`${id}: SPFを時間へ換算する表現があります`);
  if(/シミが消える|必ず治る|完全に治す|絶対に効く|毛穴が消える/i.test(strip(body))) fail(`${id}: 断定的な効果表現があります`);
  if(/\$\{|(?:href|src|content)="[^"]*(?:undefined|null|\[object Object\])/i.test(html)) fail(`${id}: 未展開または無効な値があります`);
  for(const match of body.matchAll(/href="\/products\/(\d+)"/g)) if(!productIds.has(Number(match[1]))) fail(`${id}: 存在しない商品リンク /products/${match[1]}`);
  const article = scripts(html).find(value => value["@type"] === "Article");
  if(!article) fail(`${id}: Article JSON-LDがありません`);
  else {
    if(article.datePublished !== published) fail(`${id}: datePublishedが不正です (${article.datePublished || "なし"})`);
    if(article.dateModified !== TODAY) fail(`${id}: dateModifiedが実装日ではありません (${article.dateModified || "なし"})`);
    if(!article.headline || !article.description || !article.image || !article.author?.name || !article.publisher?.name || !article.mainEntityOfPage?.["@id"]) fail(`${id}: Article JSON-LDの必須情報が不足しています`);
    if(article.mainEntityOfPage?.["@id"] !== canonical) fail(`${id}: Article mainEntityOfPageとcanonicalが不一致です`);
  }
  if(!html.includes(`公開：${published}`) || !html.includes(`最終更新：${TODAY}`)) fail(`${id}: 可視の日付とschemaが揃っていません`);
  if(/"(?:aggregateRating|reviewCount|ratingCount|review)"\s*:/.test(html)) fail(`${id}: 禁止されたレビュー系構造化データがあります`);
}

for(let left=0; left<targetBodies.length; left++) for(let right=left+1; right<targetBodies.length; right++){
  const score = jaccard(grams(targetBodies[left][1]),grams(targetBodies[right][1]));
  if(score >= .28) fail(`${targetBodies[left][0]}/${targetBodies[right][0]}: 本文類似度が高すぎます (${(score*100).toFixed(1)}%)`);
  else if(score >= .22) warn(`${targetBodies[left][0]}/${targetBodies[right][0]}: 本文類似度 ${(score*100).toFixed(1)}%`);
}

for(const file of ["public/index.html",...TARGETS.map(([id]) => `public/columns/${id}.html`)]){
  const html = fs.readFileSync(file,"utf8");
  if(/\$\{[^}]+\}/.test(html.replace(/<script\b[\s\S]*?<\/script>/gi,""))) fail(`${file}: 公開HTMLに未展開テンプレートがあります`);
}

console.log(`Priority 6 CI: errors=${errors.length}, warnings=${warnings.length}, home/products similarity=${(homeSimilarity*100).toFixed(1)}%`);
for(const message of warnings) console.warn(`WARNING: ${message}`);
if(errors.length){
  for(const message of errors) console.error(`FAIL: ${message}`);
  process.exit(1);
}
console.log("✓ トップSSoT・3記事の独自分析/一次情報/Article schema・内部リンク・保護対象を確認");

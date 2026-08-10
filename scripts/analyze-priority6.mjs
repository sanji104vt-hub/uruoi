import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] || "before";
if (!new Set(["before", "after"]).has(mode)) throw new Error("mode must be before or after");

const SITE = "https://moilum.asutelu.com";
const DATE = "2026-08-11";
const routes = [
  { route: "/", file: "public/index.html", kind: "home" },
  { route: "/columns/ingredient-comparison", file: "public/columns/ingredient-comparison.html", kind: "column" },
  { route: "/columns/depacos-vs-puchipura", file: "public/columns/depacos-vs-puchipura.html", kind: "column" },
  { route: "/columns/sunscreen", file: "public/columns/sunscreen.html", kind: "column" }
];

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const columnFiles = fs.readdirSync("public/columns").filter(file => file.endsWith(".html"));

function decodeEntities(value){
  return String(value || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function stripHtml(value){
  return decodeEntities(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function mainHtml(html, kind){
  if (kind === "home"){
    const start = html.indexOf("<body>");
    const end = html.indexOf('<div id="brandsPage"');
    return html.slice(start >= 0 ? start : 0, end >= 0 ? end : html.length)
      .replace(/<header\b[\s\S]*?<\/header>/i, " ");
  }
  if (kind === "hub"){
    const match = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    return match ? match[1] : html;
  }
  const start = html.search(/<article\b[^>]*>/i);
  const openEnd = start >= 0 ? html.indexOf(">", start) + 1 : -1;
  const end = html.lastIndexOf("</article>");
  return openEnd > 0 && end > openEnd ? html.slice(openEnd, end) : html;
}

function meta(html, pattern){ return decodeEntities(html.match(pattern)?.[1] || "").trim(); }
function hrefs(html){ return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map(match => decodeEntities(match[1])); }
function internalHref(href){
  try{
    const url = new URL(href, SITE);
    return url.origin === SITE ? url.pathname : "";
  }catch{ return ""; }
}
function normalize(value){ return stripHtml(value).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
function ngrams(value, n = 5){
  const text = normalize(value);
  const out = new Set();
  for (let i = 0; i <= text.length - n; i++) out.add(text.slice(i, i + n));
  return out;
}
function jaccard(a, b){
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
function sentences(text){
  return stripHtml(text).split(/(?<=[。！？!?])\s*/).map(item => item.trim()).filter(item => item.length >= 20);
}
function sentenceKey(text){ return text.replace(/[0-9０-９,.，、・「」『』（）()\s]/g, "").trim(); }

const allColumnBodies = columnFiles.map(file => {
  const html = fs.readFileSync(path.join("public/columns", file), "utf8");
  return { file, html, main:mainHtml(html, "column") };
});
const sentenceFrequency = new Map();
for (const column of allColumnBodies){
  for (const key of new Set(sentences(column.main).map(sentenceKey).filter(key => key.length >= 18))){
    sentenceFrequency.set(key, (sentenceFrequency.get(key) || 0) + 1);
  }
}

const productTokens = [...new Set(products.flatMap(product => [
  product.name,
  product.brand,
  ...(product.keyIngredients || [])
]).map(value => String(value || "").trim()).filter(value => value.length >= 4))].sort((a,b) => b.length - a.length);

async function statusFor(route){
  try{
    const response = await fetch(SITE + route, { redirect:"manual", headers:{ "user-agent":"Moilum-Priority6-Audit/1.0" } });
    return response.status;
  }catch{ return "取得失敗"; }
}

function productDerivedRate(main){
  const list = sentences(main);
  if (!list.length) return 0;
  const total = list.reduce((sum, sentence) => sum + sentence.length, 0);
  const derived = list.filter(sentence => /[¥￥]\s*[\d,]+/.test(sentence) || productTokens.some(token => sentence.includes(token)))
    .reduce((sum, sentence) => sum + sentence.length, 0);
  return total ? derived / total : 0;
}

function commonTemplateRate(main){
  const list = sentences(main);
  if (!list.length) return 0;
  const total = list.reduce((sum, sentence) => sum + sentence.length, 0);
  const common = list.filter(sentence => (sentenceFrequency.get(sentenceKey(sentence)) || 0) >= 3)
    .reduce((sum, sentence) => sum + sentence.length, 0);
  return total ? common / total : 0;
}

function maxColumnSimilarity(route, main){
  if (!route.startsWith("/columns/")) return null;
  const ownFile = route.split("/").pop() + ".html";
  const own = ngrams(main);
  let best = { score:0, file:"" };
  for (const candidate of allColumnBodies){
    if (candidate.file === ownFile) continue;
    const score = jaccard(own, ngrams(candidate.main));
    if (score > best.score) best = { score, file:candidate.file.replace(/\.html$/, "") };
  }
  return best;
}

const rows = [];
for (const target of routes){
  const html = fs.readFileSync(target.file, "utf8");
  const main = mainHtml(html, target.kind);
  const text = stripHtml(main);
  const allHrefs = hrefs(main);
  const internal = allHrefs.map(internalHref).filter(Boolean);
  const external = allHrefs.filter(href => /^https?:\/\//i.test(href) && !href.startsWith(SITE));
  const similarity = maxColumnSimilarity(target.route, main);
  rows.push({
    ...target,
    status:await statusFor(target.route),
    size:Buffer.byteLength(html),
    title:meta(html, /<title>([\s\S]*?)<\/title>/i),
    description:meta(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i),
    canonical:meta(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i),
    robots:meta(html, /<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i),
    chars:text.length,
    internal:internal.length,
    productLinks:internal.filter(href => /^\/products\/\d+$/.test(href)).length,
    external:external.length,
    h2:(main.match(/<h2\b/gi) || []).length,
    h3:(main.match(/<h3\b/gi) || []).length,
    maxSimilarity:similarity,
    templateRate:commonTemplateRate(main),
    productRate:productDerivedRate(main),
    independent:/class=["'][^"']*p6-data-analysis/.test(main)
  });
}

const homeHtml = mainHtml(fs.readFileSync("public/index.html", "utf8"), "home");
const productsHtml = mainHtml(fs.readFileSync("public/hubs/products.html", "utf8"), "hub");
const homeProductsSimilarity = jaccard(ngrams(homeHtml), ngrams(productsHtml));

const pct = value => `${(value * 100).toFixed(1)}%`;
const report = `# Moilum SEO優先順位6 ${mode === "before" ? "修正前" : "修正後"}監査

- 計測日: ${DATE}
- 対象: ${routes.map(item => `\`${item.route}\``).join(" / ")}
- GSCの状態は2026年8月7日時点の過去スナップショットであり、現在も未登録とは断定しません。

## HTTP・meta・本文量

| URL | HTTP | canonical | robots | HTML | main本文 | 内部リンク | 商品リンク | 外部情報源 | H2/H3 |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
${rows.map(row => `| ${row.route} | ${row.status} | ${row.canonical || "なし"} | ${row.robots || "なし"} | ${(row.size / 1024).toFixed(1)}KB | ${row.chars.toLocaleString()}字 | ${row.internal} | ${row.productLinks} | ${row.external} | ${row.h2}/${row.h3} |`).join("\n")}

## title・description

${rows.map(row => `### ${row.route}\n\n- title: ${row.title}\n- description: ${row.description}`).join("\n\n")}

## 独自性・テンプレート分析

| URL | 他コラムとの最大類似度 | 比較先 | 共通テンプレート文章率 | 商品データ由来文章率 | 自動生成の独自集計 |
|---|---:|---|---:|---:|---|
${rows.map(row => `| ${row.route} | ${row.maxSimilarity ? pct(row.maxSimilarity.score) : "—"} | ${row.maxSimilarity?.file || "—"} | ${pct(row.templateRate)} | ${pct(row.productRate)} | ${row.independent ? "あり" : "なし"} |`).join("\n")}

## トップと商品ハブの重複

- \`/\` と \`/products\` のmain本文5文字gram類似度: **${pct(homeProductsSimilarity)}**

## 計測定義

- main本文: トップはbody先頭からブランドSPA領域直前まで、コラムはarticle要素内。script/style/svgは除外。
- 他コラム類似度: 正規化した本文の5文字gram Jaccard係数。27記事のうち最大値。
- 共通テンプレート文章率: 20文字以上の文のうち、3記事以上に同じ正規化文がある文字量の比率。
- 商品データ由来文章率: 商品名・ブランド・主要成分・価格表記を含む文の文字量比率。
- 独自集計: Priority 6のビルド時集計マーカー \`p6-data-analysis\` の有無。既存の固定比較表やレーダーだけでは「あり」にしない。
`;

const reportPath = `reports/priority6-${mode}-${DATE}.md`;
fs.writeFileSync(reportPath, report.replace(/[ \t]+$/gm, ""), "utf8");
console.log(`priority6 ${mode}: ${reportPath}`);
console.log(`home/products similarity: ${pct(homeProductsSimilarity)}`);
for (const row of rows) console.log(`${row.route}: status=${row.status} chars=${row.chars} productLinks=${row.productLinks} sources=${row.external}`);

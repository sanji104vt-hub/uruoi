import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const siteOrigin = "https://moilum.asutelu.com";
const products = JSON.parse(fs.readFileSync(path.join(root, "src", "products.json"), "utf8"));
const columns = JSON.parse(fs.readFileSync(path.join(root, "src", "columns.json"), "utf8"));
const productIds = new Set(products.map(product => String(product.id)));
const columnSlugs = new Set(columns.map(column => String(column.id)));

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(?:html|xml|txt)$/i.test(entry.name)) files.push(fullPath);
  }
}
walk(publicDir);

const errors = [];
const internalLinks = { products: new Set(), columns: new Set() };
let jsonLdCount = 0;
let inlineScriptCount = 0;

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function fail(file, message) {
  errors.push(`${relative(file)}: ${message}`);
}

function checkUrl(file, value, context) {
  const decoded = (() => {
    try { return decodeURIComponent(value); }
    catch { return value; }
  })();
  if (/\$\{|\[object Object\]/i.test(decoded)) {
    fail(file, `${context} に未展開値: ${value}`);
    return;
  }
  if (/[{}]/.test(decoded) && /^(?:https?:\/\/|\/)/i.test(decoded)) {
    fail(file, `${context} に波括弧を含むURL: ${value}`);
    return;
  }

  let pathname = "";
  try { pathname = new URL(value, siteOrigin).pathname; }
  catch { return; }
  if (pathname.split("/").some(segment => /^(?:undefined|null)$/i.test(segment))) {
    fail(file, `${context} に無効なパス要素: ${value}`);
  }

  const productMatch = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (productMatch) {
    const id = decodeURIComponent(productMatch[1]);
    internalLinks.products.add(id);
    if (!productIds.has(id)) fail(file, `${context} が存在しない商品IDを参照: ${value}`);
  }
  const columnMatch = pathname.match(/^\/columns\/([^/]+)\/?$/);
  if (columnMatch) {
    const slug = decodeURIComponent(columnMatch[1]);
    internalLinks.columns.add(slug);
    if (!columnSlugs.has(slug)) fail(file, `${context} が存在しないコラムslugを参照: ${value}`);
  }
}

function checkJsonLdUrls(file, value, key = "root") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkJsonLdUrls(file, item, `${key}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) {
    const location = `${key}.${childKey}`;
    if (typeof childValue === "string" && /^(?:url|item|image|logo|@id)$/i.test(childKey)) {
      checkUrl(file, childValue, `JSON-LD ${location}`);
    } else {
      checkJsonLdUrls(file, childValue, location);
    }
  }
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");

  for (const token of ["${p.id}", "${mc.id}"]) {
    if (source.includes(token)) fail(file, `禁止トークン ${token} が残存`);
  }
  if (/\/(?:products|columns)\/[^\s"'<>]*\$\{/i.test(source)) {
    fail(file, "商品・コラムURLに未展開テンプレートが残存");
  }

  if (/\.html$/i.test(file)) {
    const attributePattern = /\b(href|src|content)\s*=\s*(["'])(.*?)\2/gis;
    for (const match of source.matchAll(attributePattern)) {
      const [, name, , value] = match;
      const looksLikeUrl = /^(?:https?:\/\/|\/|\.\/|\.\.\/|data:)/i.test(value)
        || /\$\{|\[object Object\]/i.test(value);
      if (looksLikeUrl) checkUrl(file, value, `${name}属性`);
    }

    const jsonLdPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (const match of source.matchAll(jsonLdPattern)) {
      const body = match[1].trim();
      if (!body) continue;
      jsonLdCount += 1;
      try {
        checkJsonLdUrls(file, JSON.parse(body));
      } catch (error) {
        fail(file, `JSON-LDをJSONとして解析できません: ${error.message}`);
      }
    }

    const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    for (const match of source.matchAll(scriptPattern)) {
      const attributes = match[1];
      const body = match[2].trim();
      if (!body || /\bsrc\s*=/i.test(attributes) || /application\/ld\+json/i.test(attributes)) continue;
      inlineScriptCount += 1;
      try {
        new vm.Script(body, { filename: relative(file) });
      } catch (error) {
        fail(file, `インラインJavaScript構文エラー: ${error.message}`);
      }
    }
  }
}

const indexSource = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
if (!indexSource.includes("data-product-link-id=")) fail(path.join(publicDir, "index.html"), "商品リンクの安全なID属性がありません");
if (!indexSource.includes("data-column-link-slug=")) fail(path.join(publicDir, "index.html"), "コラムリンクの安全なslug属性がありません");
if (!indexSource.includes("function hydrateInternalLinks(")) fail(path.join(publicDir, "index.html"), "内部リンクの展開処理がありません");

if (errors.length) {
  console.error(`URL検査に失敗しました（${errors.length}件）`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("公開ファイルURL検査: OK");
console.log(`対象ファイル: ${files.length}件`);
console.log(`商品データ: ${productIds.size}件 / コラムデータ: ${columnSlugs.size}件`);
console.log(`確認した実在商品リンク: ${internalLinks.products.size}ID`);
console.log(`確認した実在コラムリンク: ${internalLinks.columns.size}slug`);
console.log(`JSON-LD: ${jsonLdCount}件 / インラインJavaScript: ${inlineScriptCount}件`);

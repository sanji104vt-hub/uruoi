import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const siteOrigin = "https://moilum.asutelu.com";
const products = JSON.parse(fs.readFileSync(path.join(root, "src", "products.json"), "utf8"));
const columns = JSON.parse(fs.readFileSync(path.join(root, "src", "columns.json"), "utf8"));
const guideSlugs = JSON.parse(fs.readFileSync(path.join(root, "src", "guides-slugs.json"), "utf8"));
const productIds = new Set(products.map(product => String(product.id)));
const columnSlugs = new Set(columns.map(column => String(column.id)));
const guideSlugSet = new Set(guideSlugs.map(String));

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

function ordinaryAnchorHrefs(source) {
  const content = source
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  return [...content.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gis)].map(match => match[2]);
}

function internalPathname(href) {
  if (!href || href === "#" || /^javascript:/i.test(href)) return null;
  try {
    const url = new URL(href, siteOrigin);
    if (url.origin !== siteOrigin) return null;
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    return pathname;
  } catch {
    return null;
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
    const isFavoritesHub = relative(file) === "public/hubs/favorites.html";
    if (/href\s*=\s*["']\/column\/?["']/i.test(source) || source.includes(`${siteOrigin}/column"`)) {
      fail(file, "旧 /column への公開リンクが残っています");
    }
    if (!isFavoritesHub && /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(source)) {
      fail(file, "公開対象HTMLにnoindexが混入しています");
    }
    const attributePattern = /\b(href|src|content)\s*=\s*(["'])(.*?)\2/gis;
    for (const match of source.matchAll(attributePattern)) {
      const [, name, , value] = match;
      if (name.toLowerCase() === "href" && /^javascript:/i.test(value)) {
        fail(file, `javascript: のhrefは禁止です: ${value}`);
      }
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
for (const match of indexSource.matchAll(/<a\b[^>]*onclick=(["'])[^"']*navigateToProduct\([^"']*\1[^>]*>/gi)) {
  if (!/\bdata-product-link-id=/i.test(match[0]) || !/\bhref=/i.test(match[0])) {
    fail(path.join(publicDir, "index.html"), `商品遷移アンカーに通常href展開用IDがありません: ${match[0].slice(0, 120)}`);
  }
}

const requiredNavLinks = ["/products", "/brands", "/ranking", "/diagnosis", "/columns", "/favorites"];
for (const href of requiredNavLinks) {
  if (!indexSource.includes(`class="nav-btn`) || !indexSource.includes(`href="${href}"`)) {
    fail(path.join(publicDir, "index.html"), `メインナビに実リンク ${href} がありません`);
  }
}

const hubExpectations = [
  { route:"/products", file:"products.html", indexable:true },
  { route:"/columns", file:"columns.html", indexable:true },
  { route:"/brands", file:"brands.html", indexable:true },
  { route:"/ranking", file:"ranking.html", indexable:true },
  { route:"/diagnosis", file:"diagnosis.html", indexable:true },
  { route:"/favorites", file:"favorites.html", indexable:false }
];
const hubTitles = new Set();
for (const expected of hubExpectations) {
  const file = path.join(publicDir, "hubs", expected.file);
  if (!fs.existsSync(file)) {
    fail(file, `専用HTMLがありません（${expected.route}）`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const title = source.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = source.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]?.trim();
  const canonical = source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  const robots = source.match(/<meta\s+name="robots"\s+content="([^"]+)"/i)?.[1] || "";
  if (!title) fail(file, "固有titleがありません");
  else if (hubTitles.has(title)) fail(file, `titleが重複しています: ${title}`);
  else hubTitles.add(title);
  if (!description) fail(file, "固有descriptionがありません");
  if (!/<h1\b[^>]*>[^<]/i.test(source)) fail(file, "初期HTMLにH1がありません");
  if (expected.indexable) {
    if (canonical !== siteOrigin + expected.route) fail(file, `self canonicalが不正です: ${canonical || "なし"}`);
    if (/noindex/i.test(robots)) fail(file, "インデックス対象ページにnoindexがあります");
  } else {
    if (!/noindex\s*,\s*follow/i.test(robots)) fail(file, "お気に入りはnoindex,followである必要があります");
    if (canonical === siteOrigin + "/") fail(file, "お気に入りのcanonicalがトップを指しています");
  }
}

const columnsHub = fs.readFileSync(path.join(publicDir, "hubs", "columns.html"), "utf8");
for (const slug of columnSlugs) {
  if (!columnsHub.includes(`href="/columns/${slug}"`)) {
    fail(path.join(publicDir, "hubs", "columns.html"), `コラム一覧に通常リンクがありません: ${slug}`);
  }
}

const productHubFile = path.join(publicDir, "hubs", "products.html");
const productHubSource = fs.readFileSync(productHubFile, "utf8");
const productHubIds = ordinaryAnchorHrefs(productHubSource).map(href => internalPathname(href)?.match(/^\/products\/(\d+)$/)?.[1]).filter(Boolean);
const uniqueProductHubIds = new Set(productHubIds);
if (productHubIds.length !== productIds.size) fail(productHubFile, `商品リンクは1商品1本である必要があります: ${productHubIds.length}/${productIds.size}`);
if (uniqueProductHubIds.size !== productIds.size) fail(productHubFile, `商品ハブの実在商品リンクが不足しています: ${uniqueProductHubIds.size}/${productIds.size}`);
for (const id of productIds) {
  if (!uniqueProductHubIds.has(id)) fail(productHubFile, `商品ハブに通常リンクがありません: ${id}`);
}
if (!productHubSource.includes(`全${products.length}件`) || !productHubSource.includes(`${products.length}商品を表示中`)) {
  fail(productHubFile, "商品総数がSSoTから生成された表示を確認できません");
}

const rootProductIds = new Set(ordinaryAnchorHrefs(indexSource).map(href => internalPathname(href)?.match(/^\/products\/(\d+)$/)?.[1]).filter(Boolean));
if (!rootProductIds.size) fail(path.join(publicDir, "index.html"), "トップ初期HTMLに実商品への通常リンクがありません");
const skincareIds = new Set(products.filter(product => product.productType !== "makeup" && product.status !== "previous_generation").map(product => String(product.id)));
const brandsFile = path.join(publicDir, "hubs", "brands.html");
const brandProductIds = new Set(ordinaryAnchorHrefs(fs.readFileSync(brandsFile, "utf8")).map(href => internalPathname(href)?.match(/^\/products\/(\d+)$/)?.[1]).filter(Boolean));
for (const id of skincareIds) {
  if (!brandProductIds.has(id)) fail(brandsFile, `ブランド一覧に現在比較対象商品の通常リンクがありません: ${id}`);
}
const rankingFile = path.join(publicDir, "hubs", "ranking.html");
const rankingProductLinks = ordinaryAnchorHrefs(fs.readFileSync(rankingFile, "utf8")).filter(href => /^\/products\/\d+\/?$/.test(href));
if (rankingProductLinks.length !== 50) fail(rankingFile, `ランキングの商品リンク数が50件ではありません: ${rankingProductLinks.length}`);

for (const product of products) {
  const file = path.join(publicDir, "products", `${product.id}.html`);
  const source = fs.readFileSync(file, "utf8");
  const canonical = source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (canonical !== `${siteOrigin}/products/${product.id}`) fail(file, `商品self canonicalが不正です: ${canonical || "なし"}`);
}
for (const column of columns) {
  const file = path.join(publicDir, "columns", `${column.id}.html`);
  const source = fs.readFileSync(file, "utf8");
  const canonical = source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (canonical !== `${siteOrigin}/columns/${column.id}`) fail(file, `コラムself canonicalが不正です: ${canonical || "なし"}`);
  if (/href="\/column\/?"/i.test(source) || source.includes(`${siteOrigin}/column"`)) fail(file, "旧 /column へのリンクが残っています");
}
for (const slug of guideSlugs) {
  const file = path.join(publicDir, "guides", `${slug}.html`);
  if (!fs.existsSync(file)) {
    fail(file, `ガイドHTMLがありません: ${slug}`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const canonical = source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (canonical !== `${siteOrigin}/guides/${slug}`) fail(file, `ガイドself canonicalが不正です: ${canonical || "なし"}`);
}

const routeFiles = new Map([
  ["/", path.join(publicDir, "index.html")],
  ["/products", path.join(publicDir, "hubs", "products.html")],
  ["/columns", path.join(publicDir, "hubs", "columns.html")],
  ["/brands", path.join(publicDir, "hubs", "brands.html")],
  ["/ranking", path.join(publicDir, "hubs", "ranking.html")],
  ["/diagnosis", path.join(publicDir, "hubs", "diagnosis.html")]
]);
for (const id of productIds) routeFiles.set(`/products/${id}`, path.join(publicDir, "products", `${id}.html`));
for (const slug of columnSlugs) routeFiles.set(`/columns/${slug}`, path.join(publicDir, "columns", `${slug}.html`));
for (const slug of guideSlugSet) routeFiles.set(`/guides/${slug}`, path.join(publicDir, "guides", `${slug}.html`));

const graph = new Map();
const incoming = new Map([...routeFiles.keys()].map(route => [route, 0]));
for (const [route, file] of routeFiles) {
  if (!fs.existsSync(file)) {
    fail(file, `index対象ルートのHTMLがありません: ${route}`);
    graph.set(route, new Set());
    continue;
  }
  const targets = new Set(ordinaryAnchorHrefs(fs.readFileSync(file, "utf8")).map(internalPathname).filter(pathname => pathname && routeFiles.has(pathname)));
  graph.set(route, targets);
  for (const target of targets) incoming.set(target, (incoming.get(target) || 0) + 1);
}

const depth = new Map([["/", 0]]);
const queue = ["/"];
while (queue.length) {
  const route = queue.shift();
  for (const target of graph.get(route) || []) {
    if (!depth.has(target)) {
      depth.set(target, depth.get(route) + 1);
      queue.push(target);
    }
  }
}
const indexTargets = [
  "/products", "/columns", "/brands", "/ranking", "/diagnosis",
  ...[...productIds].map(id => `/products/${id}`),
  ...[...columnSlugs].map(slug => `/columns/${slug}`),
  ...[...guideSlugSet].map(slug => `/guides/${slug}`)
];
for (const route of indexTargets) {
  if (!depth.has(route)) fail(routeFiles.get(route), `トップから通常リンクだけで到達できません: ${route}`);
  if ((incoming.get(route) || 0) === 0) fail(routeFiles.get(route), `通常内部リンクが0本の孤立ページです: ${route}`);
}
const productDepths = [...productIds].map(id => depth.get(`/products/${id}`)).filter(Number.isFinite);
const unreachableProductCount = productIds.size - productDepths.length;
const maxProductDepth = productDepths.length ? Math.max(...productDepths) : Infinity;
const averageProductDepth = productDepths.length ? productDepths.reduce((sum, value) => sum + value, 0) / productDepths.length : Infinity;
if (unreachableProductCount) fail(productHubFile, `トップから到達不能の商品があります: ${unreachableProductCount}件`);
if (maxProductDepth > 2) fail(productHubFile, `商品への最大クリック深度が2を超えています: ${maxProductDepth}`);

const workerFile = path.join(root, "src", "index.js");
const workerSource = fs.readFileSync(workerFile, "utf8");
const staticPathsMatch = workerSource.match(/const staticPaths\s*=\s*(\[[^;]+\]);/);
if (!staticPathsMatch) {
  fail(workerFile, "sitemapの静的URL一覧を解析できません");
} else {
  const staticPaths = JSON.parse(staticPathsMatch[1]);
  for (const route of ["/products", "/columns", "/brands", "/ranking", "/diagnosis"]) {
    if (!staticPaths.includes(route)) fail(workerFile, `sitemapに ${route} がありません`);
  }
  for (const forbidden of ["/column", "/favorites"]) {
    if (staticPaths.includes(forbidden)) fail(workerFile, `sitemapに除外対象 ${forbidden} が残っています`);
  }
}
if (!workerSource.includes('pathname === "/column"') || !workerSource.includes('`${SITE_ORIGIN}/columns`')) {
  fail(workerFile, "/column から /columns への301ルートがありません");
}
for (const route of ["/products", "/columns", "/brands", "/ranking", "/diagnosis", "/favorites"]) {
  if (!workerSource.includes(`"${route}"`)) fail(workerFile, `Workerに ${route} ルートがありません`);
}

const robotsSource = fs.readFileSync(path.join(publicDir, "robots.txt"), "utf8");
if (/Disallow:\s*\/favorites/i.test(robotsSource)) fail(path.join(publicDir, "robots.txt"), "noindexを読ませる必要があるため /favorites をrobots.txtで拒否できません");

if (errors.length) {
  console.error(`URL検査に失敗しました（${errors.length}件）`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("公開ファイルURL検査: OK");
console.log(`対象ファイル: ${files.length}件`);
console.log(`商品データ: ${productIds.size}件 / コラムデータ: ${columnSlugs.size}件 / ガイドデータ: ${guideSlugSet.size}件`);
console.log(`確認した実在商品リンク: ${internalLinks.products.size}ID`);
console.log(`確認した実在コラムリンク: ${internalLinks.columns.size}slug`);
console.log(`JSON-LD: ${jsonLdCount}件 / インラインJavaScript: ${inlineScriptCount}件`);
console.log(`専用一覧ページ: ${hubExpectations.length}件 / indexable: 5件 / noindex: 1件`);
console.log(`商品ハブ通常リンク: ${productHubIds.length}件 / ユニーク商品: ${uniqueProductHubIds.size}件`);
console.log(`トップ初期HTMLの実商品リンク: ${rootProductIds.size}件`);
console.log(`内部リンクグラフ: 商品到達 ${productDepths.length}/${productIds.size}件 / 孤立 ${unreachableProductCount}件 / 最大深度 ${maxProductDepth} / 平均深度 ${averageProductDepth.toFixed(2)}`);

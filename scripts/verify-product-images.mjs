import fs from "node:fs";

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const indexHtml = fs.readFileSync("public/index.html", "utf8");
const productsHtml = fs.readFileSync("public/hubs/products.html", "utf8");
const brandsHtml = fs.readFileSync("public/hubs/brands.html", "utf8");
const rankingHtml = fs.readFileSync("public/hubs/ranking.html", "utf8");
const diagnosisHtml = fs.readFileSync("public/hubs/diagnosis.html", "utf8");
const favoritesHtml = fs.readFileSync("public/hubs/favorites.html", "utf8");
const errors = [];

const count = (source, pattern) => (source.match(pattern) || []).length;
const fail = message => errors.push(message);
const imageProducts = products.filter(product => typeof product.image === "string" && product.image.startsWith("https://"));
const missingProducts = products.filter(product => !product.image);

if (products.length !== 247) fail(`商品数が247件ではありません: ${products.length}`);
if (imageProducts.length < 225) fail(`実画像付き商品が225件未満です: ${imageProducts.length}`);
if (imageProducts.length + missingProducts.length !== products.length) fail("不正なimage値を持つ商品があります");

const directoryCards = count(productsHtml, /<article class="product-directory-card"/g);
const directoryMedia = count(productsHtml, /<span class="product-media directory-product-media">/g);
const directoryImages = count(productsHtml, /<span class="product-media directory-product-media"><img /g);
const directoryFallbacks = count(productsHtml, /<span class="product-media directory-product-media"><span class="product-image-fallback"/g);
if (directoryCards !== products.length) fail(`商品一覧カード数が不正です: ${directoryCards}`);
if (directoryMedia !== products.length) fail(`商品一覧の画像枠数が不正です: ${directoryMedia}`);
if (directoryImages !== imageProducts.length) fail(`商品一覧の実画像数が不正です: ${directoryImages}`);
if (directoryFallbacks !== missingProducts.length) fail(`商品一覧の代替画像数が不正です: ${directoryFallbacks}`);

const homeCards = count(indexHtml, /<article class="p6-featured-card">/g);
const homeMedia = count(indexHtml, /<a class="p6-featured-image"/g);
if (homeCards !== 11 || homeMedia !== homeCards) fail(`トップの商品画像枠が不正です: cards=${homeCards}, media=${homeMedia}`);

const skincareCount = products.filter(product => product.productType !== "makeup" && product.status !== "previous_generation").length;
const brandMedia = count(brandsHtml, /<span class="product-media product-thumb">/g);
if (brandMedia !== skincareCount) fail(`ブランド一覧の画像枠数が不正です: ${brandMedia}`);

const rankingRows = count(rankingHtml, /<div class="rank-row">/g);
const rankingMedia = count(rankingHtml, /<span class="product-media rank-image">/g);
if (rankingRows !== 50 || rankingMedia !== rankingRows) fail(`ランキングの画像枠が不正です: rows=${rankingRows}, media=${rankingMedia}`);

for (const [name, html] of [["診断", diagnosisHtml], ["お気に入り", favoritesHtml]]) {
  if (!html.includes("function clientProductMedia(p)")) fail(`${name}ページに画像描画処理がありません`);
  if (!html.includes('"image":"https://')) fail(`${name}ページの商品データに画像URLがありません`);
}

for (const token of [
  "G-BC0FBSZSWX",
  "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q",
  "54ebba1a.f0b1f403.54ebba1b.9f0abc5f"
]) {
  if (!indexHtml.includes(token)) fail(`保護対象トークンがありません: ${token}`);
}

console.log(`商品画像CI: 実画像=${imageProducts.length}, 代替表示=${missingProducts.length}, 一覧画像枠=${directoryMedia}`);
if (errors.length) {
  for (const message of errors) console.error(`FAIL: ${message}`);
  process.exit(1);
}
console.log("✓ トップ・商品一覧・ブランド・ランキング・診断・お気に入りの商品画像出力を確認");

import fs from "node:fs";
import { EXPERIENCE_TERMS, factualSummary } from "./priority7-policy.mjs";

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const ORIGIN = process.env.RAKUTEN_ORIGIN || "https://moilum.asutelu.com";
const ENDPOINT = "https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801";
const PRODUCT_FILE = "src/products.json";
const TARGET_PER_CATEGORY = Math.min(500, Math.max(1, Number(process.env.RAKUTEN_TARGET_PER_CATEGORY || 100)));
const MAX_PAGES = Math.min(100, Math.max(1, Number(process.env.RAKUTEN_MAX_PAGES || 12)));
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const EXPECTED_ORIGIN = "https://moilum.asutelu.com";

if (!APP_ID || !ACCESS_KEY) {
  throw new Error("RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY を環境変数で指定してください。");
}
if (ORIGIN !== EXPECTED_ORIGIN) {
  throw new Error(`RAKUTEN_ORIGIN は ${EXPECTED_ORIGIN} を指定してください。`);
}

const CATEGORIES = [
  { name: "洗顔", genreId: "216301", icon: "🫧" },
  { name: "化粧水", genreId: "216307", icon: "💧" },
  { name: "乳液", genreId: "216387", icon: "🧴" },
  { name: "美容液", genreId: "216348", icon: "✨" }
];

// 販売店違い・詰替え・複数個セットで商品数だけが膨らむのを防ぎ、単品本体を優先する。
const EXCLUDED_NAME = /(?:詰め替え|詰替え|つめかえ|レフィル|リフィル|付け替え|付替え|お試し|サンプル|試供品|トライアル|ミニサイズ|旅行用|業務用|まとめ買い|ケース販売|箱売り|\d+\s*(?:個|本|袋|箱|セット)\s*(?:セット|入|組)|セット商品|福袋|訳あり|中古)/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let products = JSON.parse(fs.readFileSync(PRODUCT_FILE, "utf8"));

function cleanDisplayName(value) {
  return String(value || "").replace(/[\s\u3000]+/g, " ").trim();
}

function categoryMismatch(product) {
  const name = cleanDisplayName(product.name);
  if (product.category === "化粧水" && /フェイスウォッシュ|洗顔|クレンジング|フェイスソープ/i.test(name)) return true;
  if (product.category === "乳液" && /フェイスウォッシュ|洗顔|クレンジング|フェイスソープ/i.test(name)) return true;
  return false;
}

// 過去の取得分も削除せず、明白な誤取得候補はexcludedとしてSSoTに保持する。
// 取得件数の補充対象からは外すが、監査・統合判断に使えるデータ資産は残す。
const excludedImported = products.filter(product => product.sourceType === "rakuten_product_api" && (
  categoryMismatch(product) || EXPERIENCE_TERMS.some(term => cleanDisplayName(product.name).includes(term))
));
for (const product of excludedImported) product.publicationStatus = "excluded";
for (const product of products.filter(product => product.sourceType === "rakuten_product_api")) {
  product.name = cleanDisplayName(product.name);
  product.desc = factualSummary(product);
}
const imported = products.filter(product => product.sourceType === "rakuten_product_api" && product.publicationStatus !== "excluded");
const importedByProductId = new Map(imported.map(product => [String(product.rakutenProductId), product]));
const usedProductIds = new Set(importedByProductId.keys());
const usedProductCodes = new Set(products.flatMap(product => {
  const values = [product.productCode, product.purchase, product.image, product.name].filter(Boolean).join(" ");
  return [...values.matchAll(/(?<!\d)(\d{13})(?!\d)/g)].map(match => match[1]);
}));
const normalizedExistingNames = new Set(products.map(product => normalizeName(product.name)));
let nextId = Math.max(...products.map(product => Number(product.id) || 0)) + 1;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000・･／/|｜【】\[\]（）()「」『』'"’“”.,，。:：;；!！?？+＋_-]/g, "")
    .replace(/医薬部外品|薬用|化粧品/g, "")
    .trim();
}

function cleanProductUrl(value) {
  const url = new URL(value);
  url.searchParams.delete("rafcid");
  url.searchParams.delete("scid");
  url.searchParams.delete("sc2id");
  return url.toString();
}

function highResolutionImage(value) {
  if (!value) return "";
  return /_ex=\d+x\d+/.test(value)
    ? value.replace(/_ex=\d+x\d+/, "_ex=512x512")
    : value + (value.includes("?") ? "&" : "?") + "_ex=512x512";
}

function cleanBrand(value, makerName) {
  const source = String(value || makerName || "ブランド情報未掲載").trim();
  return source.split("|").map(part => part.trim()).filter(Boolean)[0] || "ブランド情報未掲載";
}

function responseProducts(data) {
  const list = data.Products || data.products || data.Items || data.items || [];
  return list.map(value => value.Product || value.product || value);
}

async function fetchPage(category, page) {
  const url = new URL(ENDPOINT);
  for (const [key, value] of Object.entries({
    applicationId: APP_ID,
    genreId: category.genreId,
    format: "json",
    formatVersion: "2",
    hits: "30",
    page: String(page),
    sort: "standard"
  })) url.searchParams.set(key, value);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      headers: {
        accessKey: ACCESS_KEY,
        Referer: `${ORIGIN}/`,
        Origin: ORIGIN
      }
    });
    if (response.ok) return response.json();
    const detail = (await response.text()).slice(0, 240);
    if (response.status === 429 || response.status >= 500) {
      console.warn(`  ${category.name} p${page}: HTTP ${response.status}、${attempt}/3回目。再試行します`);
      await sleep(3500 * attempt);
      continue;
    }
    throw new Error(`${category.name} p${page}: HTTP ${response.status} ${detail}`);
  }
  throw new Error(`${category.name} p${page}: 3回再試行しても取得できませんでした`);
}

function eligible(item) {
  const name = cleanDisplayName(item.productName);
  const productId = String(item.productId || "").trim();
  const productCode = String(item.productCode || "").trim();
  const image = String(item.mediumImageUrl || "").trim();
  const price = Number(item.salesMinPrice);
  const salesItemCount = Number(item.salesItemCount);
  const normalizedName = normalizeName(name);
  if (!name || !productId || !productCode || !image.startsWith("https://")) return false;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(salesItemCount) || salesItemCount < 1) return false;
  if (EXCLUDED_NAME.test(name) || EXPERIENCE_TERMS.some(term => name.includes(term)) || usedProductIds.has(productId) || usedProductCodes.has(productCode)) return false;
  if (categoryMismatch({ name, category: CATEGORIES.find(category => category.genreId === String(item.genreId))?.name || "" })) return false;
  if (normalizedExistingNames.has(normalizedName)) return false;
  try {
    if (new URL(item.productUrlPC).hostname !== "product.rakuten.co.jp") return false;
  } catch {
    return false;
  }
  return true;
}

function toProduct(item, category) {
  const directUrl = cleanProductUrl(item.productUrlPC);
  const product = {
    id: nextId++,
    name: cleanDisplayName(item.productName),
    brand: cleanBrand(item.brandName, item.makerName),
    category: category.name,
    price: Number(item.salesMinPrice),
    rating: null,
    skin: [],
    concern: [],
    desc: "",
    keyIngredients: [],
    icon: category.icon,
    origin: "",
    purchase: directUrl,
    image: highResolutionImage(item.mediumImageUrl),
    audience: "unisex",
    sourceType: "rakuten_product_api",
    publicationStatus: "pending",
    productScope: "face",
    sourceUrl: directUrl,
    rakutenProductId: String(item.productId),
    productCode: String(item.productCode),
    rakutenGenreId: category.genreId,
    rakutenReviewAverage: Number.isFinite(Number(item.reviewAverage)) ? Number(item.reviewAverage) : null,
    rakutenReviewCount: Number.isFinite(Number(item.reviewCount)) ? Number(item.reviewCount) : 0,
    rakutenSalesItemCount: Number(item.salesItemCount),
    availability: 1,
    availabilityCheckedAt: CHECKED_AT,
    priceCheckedAt: CHECKED_AT,
    marketLowestPrice: Number(item.salesMinPrice),
    marketLowestPriceCheckedAt: CHECKED_AT,
    priceType: "rakuten_market_lowest"
  };
  product.desc = factualSummary(product);
  return product;
}

function refreshProduct(product, item) {
  product.price = Number(item.salesMinPrice);
  product.marketLowestPrice = Number(item.salesMinPrice);
  product.marketLowestPriceCheckedAt = CHECKED_AT;
  product.priceType = "rakuten_market_lowest";
  if (!product.publicationStatus) product.publicationStatus = "pending";
  if (!product.productScope) product.productScope = "face";
  product.image = highResolutionImage(item.mediumImageUrl);
  product.purchase = cleanProductUrl(item.productUrlPC);
  product.sourceUrl = product.purchase;
  product.rakutenReviewAverage = Number.isFinite(Number(item.reviewAverage)) ? Number(item.reviewAverage) : null;
  product.rakutenReviewCount = Number.isFinite(Number(item.reviewCount)) ? Number(item.reviewCount) : 0;
  product.rakutenSalesItemCount = Number(item.salesItemCount);
  product.availability = 1;
  product.availabilityCheckedAt = CHECKED_AT;
  product.priceCheckedAt = CHECKED_AT;
  product.desc = factualSummary(product);
}

const summary = { checkedAt: CHECKED_AT, targetPerCategory: TARGET_PER_CATEGORY, excludedImported: excludedImported.map(product => ({ id:product.id, name:product.name, category:product.category })), categories: {} };
for (const category of CATEGORIES) {
  const existingForCategory = imported.filter(product => product.category === category.name);
  let accepted = existingForCategory.length;
  let added = 0;
  let refreshed = 0;
  let inspected = 0;
  let pages = 0;
  console.log(`\n${category.name}: 既存API商品 ${accepted}件 / 目標 ${TARGET_PER_CATEGORY}件`);

  for (let page = 1; page <= MAX_PAGES && accepted < TARGET_PER_CATEGORY; page++) {
    const data = await fetchPage(category, page);
    pages = page;
    const items = responseProducts(data);
    inspected += items.length;
    for (const item of items) {
      const known = importedByProductId.get(String(item.productId));
      if (known && Number(item.salesItemCount) > 0 && item.mediumImageUrl) {
        refreshProduct(known, item);
        refreshed++;
        continue;
      }
      if (!eligible(item)) continue;
      const product = toProduct(item, category);
      products.push(product);
      imported.push(product);
      importedByProductId.set(product.rakutenProductId, product);
      usedProductIds.add(product.rakutenProductId);
      usedProductCodes.add(product.productCode);
      normalizedExistingNames.add(normalizeName(product.name));
      accepted++;
      added++;
      console.log(`  ✓ ${accepted}/${TARGET_PER_CATEGORY} ${product.name}（¥${product.price.toLocaleString("ja-JP")}）`);
      if (accepted >= TARGET_PER_CATEGORY) break;
    }
    console.log(`  p${page}: ${items.length}件確認、現在${accepted}件`);
    if (!items.length || page >= Number(data.pageCount || MAX_PAGES)) break;
    if (accepted < TARGET_PER_CATEGORY) await sleep(1100);
  }

  summary.categories[category.name] = { genreId: category.genreId, total: accepted, added, refreshed, inspected, pages };
  if (accepted < TARGET_PER_CATEGORY) console.warn(`  注意: ${category.name}は条件を満たす商品が${accepted}件でした`);
}

products.sort((left, right) => Number(left.id) - Number(right.id));
fs.writeFileSync(PRODUCT_FILE, JSON.stringify(products, null, 2) + "\n", "utf8");
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(`reports/rakuten-category-import-${CHECKED_AT}.json`, JSON.stringify({
  ...summary,
  totalProducts: products.length,
  importedProducts: products.filter(product => product.sourceType === "rakuten_product_api").length
}, null, 2) + "\n", "utf8");

console.log(`\n完了: SSoT ${products.length}商品（楽天API追加商品 ${products.filter(product => product.sourceType === "rakuten_product_api").length}件）`);
console.log(`取得条件: availability相当=salesItemCount>0、画像あり、単品本体、商品価格ナビで製品重複を抑制`);

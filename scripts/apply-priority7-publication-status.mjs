import fs from "node:fs";

const FILE = "src/products.json";
const products = JSON.parse(fs.readFileSync(FILE, "utf8"));

const bodyIds = new Set([512, 610]);
const existingBodyIds = new Set([84, 138, 160]);
const existingOtherIds = new Set([166]);

for (const product of products) {
  const apiProduct = product.sourceType === "rakuten_product_api";
  product.publicationStatus = apiProduct
    ? (product.id === 610 ? "excluded" : "pending")
    : (product.status === "previous_generation" ? "legacy" : "editorial");

  if (bodyIds.has(product.id) || existingBodyIds.has(product.id)) product.productScope = "body";
  else if (existingOtherIds.has(product.id)) product.productScope = "other";
  else if (product.productType === "makeup") product.productScope = "makeup";
  else product.productScope = "face";

  if (apiProduct) {
    product.marketLowestPrice = Number(product.marketLowestPrice ?? product.price ?? 0);
    product.marketLowestPriceCheckedAt = product.marketLowestPriceCheckedAt || product.priceCheckedAt || product.availabilityCheckedAt || "2026-08-11";
    product.priceType = "rakuten_market_lowest";
  } else {
    product.priceType = product.priceType || "editorial_reference";
  }
}

fs.writeFileSync(FILE, JSON.stringify(products, null, 2) + "\n", "utf8");

const counts = Object.fromEntries(["editorial", "verified", "pending", "excluded", "legacy"].map(status => [status, products.filter(product => product.publicationStatus === status).length]));
console.log(`✓ publicationStatus/productScope/priceTypeを${products.length}商品へ適用`);
console.log(JSON.stringify(counts));

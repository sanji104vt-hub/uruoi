import { readFileSync, writeFileSync } from "fs";

const imageUrls = JSON.parse(readFileSync("image-urls.json", "utf8"));
const path = "src/products.json";
const products = JSON.parse(readFileSync(path, "utf8"));

let inserted = 0;
let skipped = 0;

for (const product of products) {
  const url = imageUrls[String(product.id)];
  if (!url) continue;
  if (product.image) {
    skipped++;
    continue;
  }
  product.image = url;
  inserted++;
}

writeFileSync(path, JSON.stringify(products, null, 2) + "\n", "utf8");
console.log(`SSoTへ挿入: ${inserted} 件 / スキップ(既存): ${skipped} 件`);

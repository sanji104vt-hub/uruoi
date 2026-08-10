import fs from "node:fs";

const file = "public/index.html";
const html = fs.readFileSync(file, "utf8");
const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const marker = "const PRODUCTS=[";
const markerIndex = html.indexOf(marker);
if (markerIndex < 0) throw new Error("PRODUCTS marker not found");

const arrayStart = markerIndex + marker.length - 1;
let depth = 0;
let inString = false;
let quote = "";
let escaped = false;
let arrayEnd = -1;
for (let index = arrayStart; index < html.length; index++) {
  const char = html[index];
  if (escaped) { escaped = false; continue; }
  if (inString) {
    if (char === "\\") { escaped = true; continue; }
    if (char === quote) inString = false;
    continue;
  }
  if (char === '"' || char === "'") { inString = true; quote = char; continue; }
  if (char === "[") depth++;
  if (char === "]" && --depth === 0) { arrayEnd = index; break; }
}
if (arrayEnd < 0) throw new Error("PRODUCTS array end not found");

const replacement = "[\n" + products.map(product => "  " + JSON.stringify(product)).join(",\n") + "\n]";
const updated = html.slice(0, arrayStart) + replacement + html.slice(arrayEnd + 1);

// PRODUCTS配列の外側と保護対象が1文字も変わらないことを、書き込み前に保証する。
const beforeOutside = html.slice(0, arrayStart) + html.slice(arrayEnd + 1);
const afterArrayEnd = arrayStart + replacement.length;
const afterOutside = updated.slice(0, arrayStart) + updated.slice(afterArrayEnd);
if (beforeOutside !== afterOutside) throw new Error("content outside PRODUCTS would change");
for (const token of ["G-BC0FBSZSWX", "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q", "54ebba1a.f0b1f403.54ebba1b.9f0abc5f"]) {
  if ((html.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length !== (updated.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length) {
    throw new Error(`protected token count changed: ${token}`);
  }
}

fs.writeFileSync(file, updated, "utf8");
console.log(`✓ SPA PRODUCTSをSSoTの${products.length}商品へ同期（配列外は変更なし）`);

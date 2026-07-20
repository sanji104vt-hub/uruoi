// mens-candidates-final.json (34件) を PRODUCTS 配列 (public/index.html + src/products.json) にマージ。
// 既存全商品に audience: "unisex" を機械的に付与する(既に付与済みの商品は上書きしない)。

import fs from "node:fs";

const mensProducts = JSON.parse(fs.readFileSync("scripts/mens-candidates-final.json", "utf8"));
console.log(`メンズ追加商品: ${mensProducts.length}件`);

// ============ public/index.html の PRODUCTS 配列を更新 ============
let html = fs.readFileSync("public/index.html", "utf8");
const startMark = "const PRODUCTS=[";
const startIdx = html.indexOf(startMark);
let i = startIdx + startMark.length - 1, depth = 0, inStr = false, strCh = null, esc = false, endIdx = -1;
for (; i < html.length; i++){
  const c = html[i];
  if (esc){ esc = false; continue; }
  if (inStr){ if (c === "\\"){ esc = true; continue; } if (c === strCh) inStr = false; continue; }
  if (c === '"' || c === "'"){ inStr = true; strCh = c; continue; }
  if (c === "[") depth++;
  else if (c === "]"){ depth--; if (depth === 0){ endIdx = i; break; } }
}
const arrText = html.slice(startIdx + startMark.length - 1, endIdx + 1).replace(/,(\s*[\]}])/g, "$1");
const existingProducts = JSON.parse(arrText);
console.log(`既存商品: ${existingProducts.length}件`);

// 既存全商品に audience: "unisex" を付与 (未設定のみ)
let addedAudience = 0;
for (const p of existingProducts){
  if (!p.audience){ p.audience = "unisex"; addedAudience++; }
}
console.log(`既存商品への audience:"unisex" 付与: ${addedAudience}件`);

// メンズ商品を末尾に追加
const merged = [...existingProducts, ...mensProducts];
console.log(`統合後商品数: ${merged.length}件`);

// audience 内訳
const audCount = {};
for (const p of merged){ audCount[p.audience || "(未設定)"] = (audCount[p.audience || "(未設定)"] || 0) + 1; }
console.log(`audience 内訳: ${JSON.stringify(audCount)}`);

// PRODUCTS 配列を1行1商品の JSON 形式で再構築 (既存フォーマットに合わせる)
const productsBlock = merged.map(p => "  " + JSON.stringify(p)).join(",\n");
const newHtml = html.slice(0, startIdx + startMark.length) + "\n" + productsBlock + "\n" + html.slice(endIdx);
fs.writeFileSync("public/index.html", newHtml, "utf8");
console.log("→ public/index.html 更新");

// ============ src/products.json も同期 ============
fs.writeFileSync("src/products.json", JSON.stringify(merged, null, 2), "utf8");
console.log("→ src/products.json 更新");

// SKINCARE_COUNT 用の集計
const skincare = merged.filter(p => p.productType !== "makeup" && p.status !== "previous_generation");
console.log(`\n[SSoT] SKINCARE_COUNT: ${skincare.length}件 (前=${skincare.length - mensProducts.length} → 後=${skincare.length})`);
console.log(`  総合: ${merged.length} = スキンケア${skincare.length} + メイク13 + 世代違い1`);

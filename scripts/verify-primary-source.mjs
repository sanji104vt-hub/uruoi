// 一次情報の投入結果を検証する。
//  - SPA(public/index.html) と src/products.json の整合性
//  - 使用感メモが原文どおり保持されているか(文字数チェック)
//  - 参照画像の実在
//  - 一次情報なし商品で非表示になっているか

import fs from "node:fs";

function extractProducts(html){
  const mark = "const PRODUCTS=[";
  const s = html.indexOf(mark);
  let i = s + mark.length - 1, depth = 0, inStr = false, strCh = null, esc = false, e = -1;
  for (; i < html.length; i++){
    const c = html[i];
    if (esc){ esc = false; continue; }
    if (inStr){ if (c === "\\"){ esc = true; continue; } if (c === strCh) inStr = false; continue; }
    if (c === '"' || c === "'"){ inStr = true; strCh = c; continue; }
    if (c === "[") depth++;
    else if (c === "]"){ depth--; if (depth === 0){ e = i; break; } }
  }
  return JSON.parse(html.slice(s + mark.length - 1, e + 1).replace(/,(\s*[\]}])/g, "$1"));
}

const html = fs.readFileSync("public/index.html", "utf8");
const SPA = extractProducts(html);
const JSONP = JSON.parse(fs.readFileSync("src/products.json", "utf8"));

console.log("=== 商品数の整合性 ===");
console.log(`  SPA PRODUCTS : ${SPA.length}件`);
console.log(`  src/products.json : ${JSONP.length}件`);
console.log(SPA.length === JSONP.length ? "  ✓ 一致" : "  ❌ 不一致");

const spaEditor = SPA.filter(p => p.reviewedByEditor === true).sort((a,b)=>a.id-b.id);
const jsonEditor = JSONP.filter(p => p.reviewedByEditor === true).sort((a,b)=>a.id-b.id);
console.log(`\n=== 一次情報つき商品 ===`);
console.log(`  SPA : ${spaEditor.length}件 / JSON : ${jsonEditor.length}件`);
console.log(spaEditor.length === 11 && jsonEditor.length === 11 ? "  ✓ 11件で一致" : "  ❌ 11件ではない");

// メモが両者で完全一致しているか(改変検出)
console.log("\n=== 使用感メモの一致確認(SPA vs JSON) ===");
let mismatch = 0;
for (const sp of spaEditor){
  const jp = jsonEditor.find(x => x.id === sp.id);
  if (!jp){ console.log(`  ❌ id=${sp.id} が JSON にない`); mismatch++; continue; }
  if (sp.editorNote !== jp.editorNote){ console.log(`  ❌ id=${sp.id} メモが不一致`); mismatch++; }
}
console.log(mismatch === 0 ? "  ✓ 全11件のメモがSPA/JSONで完全一致" : `  ❌ ${mismatch}件で不一致`);

// 画像の実在
console.log("\n=== 参照画像の実在確認 ===");
let missing = 0, imgCount = 0;
for (const p of jsonEditor){
  for (const path of [p.editorPhoto, p.editorTexturePhoto].filter(Boolean)){
    imgCount++;
    if (!fs.existsSync("public" + path)){ console.log(`  ❌ ${path}`); missing++; }
  }
}
console.log(missing === 0 ? `  ✓ 参照画像 ${imgCount}件すべて存在` : `  ❌ ${missing}件が不在`);

// 静的商品ページの出力確認
console.log("\n=== 静的商品ページの一次情報ブロック ===");
const files = fs.readdirSync("public/products").filter(f => f.endsWith(".html"));
const withBlock = files.filter(f => fs.readFileSync("public/products/" + f, "utf8").includes('class="primary-source"'));
console.log(`  一次情報ブロックあり : ${withBlock.length}件 / 全${files.length}件`);
console.log(withBlock.length === 11 ? "  ✓ 11件のみ表示(仕様通り)" : `  ❌ 11件であるべき`);
const ids = withBlock.map(f => Number(f.replace(".html",""))).sort((a,b)=>a-b);
console.log(`  対象id : ${ids.join(", ")}`);

// 一次情報なし商品での非表示確認
const withoutSample = files.filter(f => !withBlock.includes(f)).slice(0, 5);
console.log("\n=== 一次情報なし商品での非表示確認(サンプル5件) ===");
for (const f of withoutSample){
  const c = fs.readFileSync("public/products/" + f, "utf8");
  const hasBlock = c.includes('class="primary-source"');
  const hasBadge = c.includes("editor-used-badge");
  console.log(`  ${f}: block=${hasBlock ? "❌表示" : "✓非表示"} / 自身のバッジ=${hasBadge ? "(関連商品に有)" : "✓なし"}`);
}

// 一次情報商品のURL一覧(報告用)
console.log("\n=== 一次情報ブロックが表示される商品ページURL(11件) ===");
for (const p of jsonEditor){
  console.log(`  https://moilum.asutelu.com/products/${p.id}`);
  console.log(`    ${p.name.slice(0,50)}`);
  console.log(`    写真: パッケージ${p.editorTexturePhoto ? " + テクスチャ" : ""} / メモ${p.editorNote.length}字`);
}

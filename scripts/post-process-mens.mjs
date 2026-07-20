// mens-candidates.json + mens-supplement.json を統合し、精査を適用して
// mens-candidates-final.json (34件) を出力する。

import fs from "node:fs";

const primary = JSON.parse(fs.readFileSync("scripts/mens-candidates.json", "utf8"));
const supplement = fs.existsSync("scripts/mens-supplement.json")
  ? JSON.parse(fs.readFileSync("scripts/mens-supplement.json", "utf8"))
  : [];
const cands = [...primary, ...supplement];

// 名前パターンによる除外(実在確認結果に基づく)
const EXCLUDE_NAME_PATTERNS = [
  /アルティミューン/,                       // 既存 id=27 と同シリーズ
  /ヒカキンさん/,                           // 誇大文言
  /THE HAND JELLY|ハンドクリーム メンズ/,   // ハンドケア(前段のスキンケア外方針)
  /THE BOTTLE 200mL|化粧水用詰め替えボトル/, // BULK HOMME 空ボトル(容器のみ)
  /プログライド|フレックスボール|髭剃り カミソリ/, // ジレット カミソリ本体
  /凌SHINOGI|クナイ|SHINOGI/,               // アクシーズクイン(スキンケア外)
  /5枚刃|替刃/,                             // カミソリ替刃セット
  /PROTEIN SLEEP|夜プロテイン|プロテイン 置き換え/, // BULK HOMME プロテイン飲料
];
// カテゴリ+名前による除外
function extraExclude(p){
  if (p.category === "日焼け止め" && /アクアクリーム|保湿クリーム/.test(p.name)) return true;
  if (p.category === "アフターシェーブ" && /スキンセラムウォーター/.test(p.name)) return true;
  return false;
}
// カテゴリ修正(元idベース、または名前ベース)
const RECAT_NAME = [
  { pattern: /REPAIR LOTION/, category: "化粧水" },       // BULK HOMME THE REPAIR LOTION
  { pattern: /ミクロスクラブ洗顔/, category: "洗顔" },     // メンズビオレ ミクロスクラブ (元:日焼け止め)
  { pattern: /アクティブエイジクリーム/, category: "保湿クリーム" }, // ニベアメン
  { pattern: /スキンコンディショナーバーム/, category: "保湿クリーム" }, // ニベアメン (元:アフターシェーブ)
];
const BRAND_NORMALIZE = { "ニベア": "ニベアメン" };
function cleanName(name){
  return String(name || "")
    .replace(/^\s*\d+月\d+日[」』]?\s*/g, "")
    .replace(/\s*】\s*/g, " ")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s*｜\s*/g, " ")
    .replace(/\s*\+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const filtered = [];
let newId = 208;
const excluded = [];

for (const p of cands){
  const nm = String(p.name || "");
  if (EXCLUDE_NAME_PATTERNS.some(re => re.test(nm))){
    excluded.push({ reason: "name-pattern", name: nm.slice(0, 60) });
    continue;
  }
  if (extraExclude(p)){
    excluded.push({ reason: "extra-rule", cat: p.category, name: nm.slice(0, 60) });
    continue;
  }
  const clone = { ...p };
  // カテゴリ修正
  for (const rc of RECAT_NAME){
    if (rc.pattern.test(nm)){
      clone.category = rc.category;
      const c = { "化粧水":"化粧水", "洗顔":"洗顔料", "オールインワン":"オールインワンジェル",
                  "アフターシェーブ":"アフターシェーブローション", "日焼け止め":"日焼け止め",
                  "保湿クリーム":"保湿クリーム" }[clone.category] || clone.category;
      clone.desc = `${clone.brand}のメンズ向け${c}。皮脂と乾燥のバランスに配慮した設計で、朝晩のケアに使いやすい定番のひとつ。`;
      clone.icon = { "化粧水":"💧", "洗顔":"🫧", "オールインワン":"🧴", "アフターシェーブ":"💈", "日焼け止め":"☀️", "保湿クリーム":"🧴" }[clone.category] || clone.icon;
      break;
    }
  }
  clone.name = cleanName(clone.name);
  if (BRAND_NORMALIZE[clone.brand]) clone.brand = BRAND_NORMALIZE[clone.brand];
  delete clone.__oldId;
  clone.id = newId++;
  filtered.push(clone);
}

fs.writeFileSync("scripts/mens-candidates-final.json", JSON.stringify(filtered, null, 2), "utf8");

console.log("=== 除外ログ ===");
for (const e of excluded) console.log(`  [${e.reason}] ${e.cat || ""} ${e.name}`);

const byCat = {};
for (const p of filtered){ (byCat[p.category] = byCat[p.category] || []).push(p); }
const audCount = {};
for (const p of filtered){ audCount[p.audience] = (audCount[p.audience] || 0) + 1; }

console.log(`\n=== 最終リスト ${filtered.length}件 ===\n`);
for (const cat of Object.keys(byCat)){
  console.log(`─── [${cat}] ${byCat[cat].length}件 ───`);
  for (const p of byCat[cat]){
    console.log(`  id=${p.id} ★${p.rating} ¥${p.price.toLocaleString()}  [${p.brand}] ${p.name.slice(0, 60)}${p.name.length > 60 ? "…" : ""}`);
  }
  console.log();
}
console.log(`audience内訳: ${JSON.stringify(audCount)}`);
console.log(`新id範囲: 208 〜 ${filtered.at(-1)?.id || "?"}`);

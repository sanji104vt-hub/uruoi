import { readFileSync, writeFileSync } from "fs";

const imageUrls = JSON.parse(readFileSync("image-urls.json", "utf8"));
const path = "public/index.html";
const lines = readFileSync(path, "utf8").split("\n");

let inserted = 0;
let skipped = 0;

const out = lines.map((line) => {
  // PRODUCTS の各商品行（"id": N で始まるオブジェクト行）を対象にする
  const m = line.match(/^\s*\{"id":\s*(\d+),/);
  if (!m) return line;

  const id = m[1];
  const url = imageUrls[id];
  if (!url) return line; // 画像URLが無い商品はSVGフォールバックのまま

  if (/"image"\s*:/.test(line)) {
    skipped++; // 既にimageがある → 重複防止でスキップ
    return line;
  }

  // 行末の "}," または "}" の直前に "image":"URL" を挿入
  const idx = line.lastIndexOf("}");
  if (idx === -1) return line;
  const newLine = line.slice(0, idx) + `, "image": "${url}"` + line.slice(idx);
  inserted++;
  return newLine;
});

writeFileSync(path, out.join("\n"), "utf8");
console.log(`挿入: ${inserted} 件 / スキップ(既存): ${skipped} 件`);

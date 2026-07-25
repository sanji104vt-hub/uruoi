// Downloads/商品写真/ の編集部撮影画像を public/images/editor/ に
// ASCII安全なファイル名でコピーする。
// 日本語＋全角スペースのファイル名はURLでpercent-encodingが必要になり
// 壊れやすいため、slug化して配置する。

import fs from "node:fs";
import path from "node:path";

const SRC_DIR = "C:/Users/niji1/Downloads/商品写真";
const OUT_DIR = "public/images/editor";

// 元ファイル名 → ASCII slug のマッピング
// 元ファイル名は全角スペース(　U+3000)・半角スペースが混在しているため実ファイル名で指定
const MAP = [
  { src: "CICA.jpg",                          dst: "katan-cica-serum.jpg" },
  { src: "CICA　手の甲.jpg",                   dst: "katan-cica-serum-texture.jpg" },
  { src: "Curel　クリーム.jpg",                dst: "curel-moisture-cream-jar.jpg" },
  { src: "あくねす　洗顔クリーム.jpg",           dst: "acnes-cream-wash.jpg" },
  { src: "あくねす　洗顔クリーム　手の甲.jpg",    dst: "acnes-cream-wash-texture.jpg" },
  { src: "びおれ　洗顔ジェル.jpg",              dst: "biore-ouchi-de-esthe-gel.jpg" },
  { src: "びおれ　洗顔ジェル　手の甲.jpg",       dst: "biore-ouchi-de-esthe-gel-texture.jpg" },
  { src: "めらのCC 化粧水.jpg",                dst: "melano-cc-lotion.jpg" },
  { src: "めらのCC　プレミアム.jpg",            dst: "melano-cc-premium-serum.jpg" },
  { src: "めらのCC　普通.jpg",                 dst: "melano-cc-serum.jpg" },
  { src: "スキンライフ　洗顔フォーム.jpg",       dst: "skinlife-face-wash.jpg" },
  { src: "スキンライフ洗顔フォーム　手の甲.jpg",  dst: "skinlife-face-wash-texture.jpg" },
  { src: "極潤プレミアム　乳液.jpg",            dst: "hadalabo-gokujyun-premium-milk.jpg" },
  { src: "肌美精.jpg",                        dst: "hadabisei-acne-lotion.jpg" },
  { src: "肌美精　クリーム.jpg",                dst: "hadabisei-acne-cream.jpg" },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

// 実在ファイル一覧(コピー元)を取得して照合精度を上げる
const actual = fs.readdirSync(SRC_DIR);
console.log(`コピー元: ${SRC_DIR} (${actual.length}ファイル)`);
console.log(`コピー先: ${OUT_DIR}\n`);

let ok = 0, missing = [];
for (const m of MAP) {
  const srcPath = path.join(SRC_DIR, m.src);
  if (!fs.existsSync(srcPath)) {
    missing.push(m.src);
    console.log(`  ❌ 見つからない: ${m.src}`);
    continue;
  }
  const dstPath = path.join(OUT_DIR, m.dst);
  fs.copyFileSync(srcPath, dstPath);
  const kb = (fs.statSync(dstPath).size / 1024).toFixed(0);
  console.log(`  ✓ ${m.src}  →  ${m.dst} (${kb}KB)`);
  ok++;
}

console.log(`\nコピー完了: ${ok}/${MAP.length} 件`);
if (missing.length) {
  console.log("\n⚠️ コピーできなかったファイル:");
  for (const f of missing) console.log("  " + f);
  console.log("\n実在ファイル一覧:");
  for (const f of actual) console.log("  " + f);
}

// コピー漏れ(MAPに無い実ファイル)の検出
const mapped = new Set(MAP.map(m => m.src));
const unmapped = actual.filter(f => !mapped.has(f) && /\.(jpg|jpeg|png|webp)$/i.test(f));
if (unmapped.length) {
  console.log("\n⚠️ MAPに定義がない画像ファイル(未コピー):");
  for (const f of unmapped) console.log("  " + f);
}

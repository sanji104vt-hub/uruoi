// 編集部一次情報の投入:
//   1. 未登録7商品を PRODUCTS 配列にマージ(id は末尾に連番付与)
//   2. 対象11商品に editorPhoto / editorTexturePhoto / editorNote /
//      reviewedByEditor / editorReviewedAt を付与
//
// 【重要】editorNote は一行さん(編集部)の実体験メモ。内容の加筆・創作は一切しない。
//         薬機法配慮のため調整済みの表現をそのまま使う。

import fs from "node:fs";

const REVIEWED_AT = "2026-07-26";
const IMG = "/images/editor/";

// ===== 使用感メモ(原文のまま。編集・加筆禁止) =====
// key は「既存商品のid」または「新規商品の__key」で紐づける
const EDITOR_DATA = {
  // --- 新規追加7商品(__key で紐づけ) ---
  "katan-cica": {
    photo: "katan-cica-serum.jpg",
    texture: "katan-cica-serum-texture.jpg",
    note: "塗るとかなりチクチクする刺激がありました。編集部スタッフは乾燥性の敏感肌ですが、刺激のわりに実感は得られませんでした。刺激に弱い方は、まず少量で試すことをおすすめします。",
    alt: "KATAN CICA DERMA HIT SERUM 5 のパッケージ",
    textureAlt: "KATAN CICA DERMA HIT SERUM 5 を手の甲に出したテクスチャ",
  },
  "curel-cream-jar": {
    photo: "curel-moisture-cream-jar.jpg",
    note: "もともと同ブランドのフェイスクリームを使っていましたが、コスパを優先してボディ用を顔にも流用しています。フェイス用のときに感じた肌の調子の良さは、ボディ用では同じようには感じませんでした。価格を最優先する場合の選択肢です。",
    alt: "キュレル 潤浸保湿 クリーム(ジャータイプ)のパッケージ",
  },
  "melano-premium": {
    photo: "melano-cc-premium-serum.jpg",
    note: "塗ったあとに顔がポカポカと温かくなる感覚があります。編集部スタッフの実感としては、通常版よりもこちらのほうが使用中の肌の調子が落ち着いていました。ただし温感があるため、刺激が気になる方は注意してください。",
    alt: "メラノCC 薬用しみ集中対策 プレミアム美容液のパッケージ",
  },
  "skinlife-wash": {
    photo: "skinlife-face-wash.jpg",
    texture: "skinlife-face-wash-texture.jpg",
    note: "編集部スタッフが継続使用しているなかで、最も手応えを感じた洗顔料です。使い始めてから肌が荒れにくくなったと感じています。ただし、すでにできてしまったものへの実感はありませんでした。「予防として日々使う」位置づけの一本だと考えています。",
    alt: "カウブランド スキンライフ 薬用洗顔フォームのパッケージ",
    textureAlt: "カウブランド スキンライフ 薬用洗顔フォームを手の甲に出したテクスチャ",
  },
  "gokujyun-premium-milk": {
    photo: "hadalabo-gokujyun-premium-milk.jpg",
    note: "とろみのあるテクスチャで、保湿重視の乳液です。",
    alt: "肌ラボ 極潤プレミアム ヒアルロン乳液のパッケージ",
  },
  "hadabisei-lotion": {
    photo: "hadabisei-acne-lotion.jpg",
    note: "同シリーズのクリームと合わせて使用しています。価格に対して保湿感がしっかりあり、乾燥しやすい冬場にも問題なく使えました。コスパ重視で選ぶ場合の候補です。",
    alt: "肌美精 大人のニキビ対策 薬用美白化粧水のパッケージ",
  },
  "hadabisei-cream": {
    photo: "hadabisei-acne-cream.jpg",
    note: "同シリーズの化粧水とセットで使用。しっかり保湿されるので、この価格帯としては満足度が高いと感じました。冬場も使えています。",
    alt: "肌美精 大人のニキビ対策 薬用美白クリームのパッケージ",
  },
  // --- 既存4商品(id で紐づけ) ---
  139: {
    photo: "acnes-cream-wash.jpg",
    texture: "acnes-cream-wash-texture.jpg",
    note: "香りがかなり独特で、好みが分かれる部分だと感じました。香りに敏感な方は店頭で確認してからの購入をおすすめします。",
    alt: "メンソレータム アクネス 薬用クリーム洗顔のパッケージ",
    textureAlt: "メンソレータム アクネス 薬用クリーム洗顔を手の甲に出したテクスチャ",
  },
  207: {
    photo: "biore-ouchi-de-esthe-gel.jpg",
    texture: "biore-ouchi-de-esthe-gel-texture.jpg",
    note: "鼻や顎のざらつきが、使用後にはっきり気にならなくなりました。洗い上がりの肌がなめらかになる感覚があり、ざらつきが気になる時期に使いやすい一本です。ジェルは炭配合で見た目が黒く、テクスチャはとろみのあるタイプです。",
    alt: "ビオレ おうちdeエステ 洗顔ジェルのパッケージ",
    textureAlt: "ビオレ おうちdeエステ 洗顔ジェルを手の甲に出したテクスチャ",
  },
  161: {
    photo: "melano-cc-lotion.jpg",
    note: "同ブランドの美容液と合わせて使用しています。さらっとした使用感で、ベタつきが苦手な方にも使いやすい印象でした。",
    alt: "メラノCC 薬用しみ対策 美白化粧水のパッケージ",
  },
  28: {
    photo: "melano-cc-serum.jpg",
    note: "プレミアム版と比較すると、編集部スタッフはこちらでは同じような実感は得られませんでした。まずは価格を抑えて試したい場合の入り口としては選びやすい一本です。",
    alt: "メラノCC 薬用しみ集中対策 美容液のパッケージ",
  },
};

// ===== PRODUCTS 配列を読み込み =====
const html = fs.readFileSync("public/index.html", "utf8");
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
const PRODUCTS = JSON.parse(arrText);
console.log(`既存商品: ${PRODUCTS.length}件`);

// ===== 1. 新規7商品をマージ =====
const candidates = JSON.parse(fs.readFileSync("scripts/editor-candidates.json", "utf8"));
let nextId = Math.max(...PRODUCTS.map(p => p.id)) + 1;
const keyToId = {};

for (const c of candidates){
  const key = c.__key;
  const clone = { ...c };
  delete clone.__key;
  delete clone.__rawName;
  clone.id = nextId;
  keyToId[key] = nextId;
  // フィールド順を既存商品に合わせるため id を先頭に再構築
  const ordered = { id: clone.id };
  for (const k of ["name","brand","category","price","rating","reviews","skin","concern","desc","keyIngredients","icon","origin","purchase","image","audience"]){
    if (clone[k] !== undefined) ordered[k] = clone[k];
  }
  PRODUCTS.push(ordered);
  console.log(`  + id=${nextId} [${ordered.category}] ${ordered.brand} / ${ordered.name.slice(0,45)}`);
  nextId++;
}

// ===== 2. 一次情報フィールドを付与 =====
console.log("\n一次情報の付与:");
let applied = 0;
const appliedList = [];
for (const [key, data] of Object.entries(EDITOR_DATA)){
  // key が数値なら既存id、文字列なら新規商品の __key
  const targetId = /^\d+$/.test(key) ? Number(key) : keyToId[key];
  if (targetId === undefined){
    console.log(`  ❌ key="${key}" に対応する商品が見つかりません`);
    continue;
  }
  const p = PRODUCTS.find(x => x.id === targetId);
  if (!p){
    console.log(`  ❌ id=${targetId} が PRODUCTS に存在しません`);
    continue;
  }
  p.editorPhoto = IMG + data.photo;
  p.editorPhotoAlt = data.alt;
  if (data.texture){
    p.editorTexturePhoto = IMG + data.texture;
    p.editorTexturePhotoAlt = data.textureAlt;
  }
  p.editorNote = data.note;
  p.reviewedByEditor = true;
  p.editorReviewedAt = REVIEWED_AT;
  applied++;
  appliedList.push({ id: targetId, name: p.name, hasTexture: !!data.texture });
  console.log(`  ✓ id=${targetId} ${p.name.slice(0,42)}${data.texture ? " (+テクスチャ写真)" : ""}`);
}

console.log(`\n付与完了: ${applied}/11 件`);

// ===== 3. 画像ファイルの実在チェック =====
console.log("\n画像ファイルの実在確認:");
let missingImg = 0;
for (const p of PRODUCTS.filter(x => x.reviewedByEditor)){
  for (const path of [p.editorPhoto, p.editorTexturePhoto].filter(Boolean)){
    const fsPath = "public" + path;
    if (!fs.existsSync(fsPath)){ console.log(`  ❌ 404予備軍: ${path}`); missingImg++; }
  }
}
console.log(missingImg === 0 ? "  ✓ 全画像ファイルが存在します" : `  ❌ ${missingImg}件が見つかりません`);

// ===== 4. 書き出し =====
const productsBlock = PRODUCTS.map(p => "  " + JSON.stringify(p)).join(",\n");
const newHtml = html.slice(0, startIdx + startMark.length) + "\n" + productsBlock + "\n" + html.slice(endIdx);
fs.writeFileSync("public/index.html", newHtml, "utf8");
fs.writeFileSync("src/products.json", JSON.stringify(PRODUCTS, null, 2), "utf8");

console.log(`\n総商品数: ${PRODUCTS.length}件`);
const skincare = PRODUCTS.filter(p => p.productType !== "makeup" && p.status !== "previous_generation");
console.log(`SKINCARE_COUNT: ${skincare.length}件`);
console.log(`一次情報あり: ${PRODUCTS.filter(p => p.reviewedByEditor).length}件`);

// 一次情報商品のURL一覧を出力(報告用)
console.log("\n一次情報ブロックが表示される商品ページ:");
for (const a of appliedList.sort((x,y)=>x.id-y.id)){
  console.log(`  https://moilum.asutelu.com/products/${a.id}  ${a.name.slice(0,40)}`);
}

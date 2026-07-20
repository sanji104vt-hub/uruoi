// メンズスキンケア商品を楽天API新版から取得し、
// PRODUCTS配列(public/index.html)への追加候補として scripts/mens-candidates.json に保存。
// 定番メンズブランド別にクエリを叩き、実在商品を確実に取得する。
//
// 必要な環境変数:
//   RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY / RAKUTEN_AFFILIATE_ID / RAKUTEN_ORIGIN

import fs from "node:fs";

const APP = process.env.RAKUTEN_APP_ID;
const KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFF = process.env.RAKUTEN_AFFILIATE_ID;
const ORIGIN = process.env.RAKUTEN_ORIGIN;
if (!APP || !KEY || !AFF || !ORIGIN){
  console.error("必要な環境変数が設定されていません。");
  process.exit(1);
}

const ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ブランド別クエリ定義。それぞれの定番ブランド × カテゴリで1〜3件ずつ確実に採用。
// keyword はブランド名+カテゴリ、cat は当サイトのカテゴリ、brandCanonical は表示名の正規化。
const BRAND_QUERIES = [
  // === メンズ化粧水 (10〜12) ===
  { key:"bulk-lotion",    cat:"化粧水",       keyword:"バルクオム THE TONER",        brandCanonical:"BULK HOMME",     max:1, audience:"mens" },
  { key:"orbis-mr-lotion",cat:"化粧水",       keyword:"オルビス ミスター ローション",  brandCanonical:"ORBIS Mr.",     max:1, audience:"mens" },
  { key:"uno-lotion",     cat:"化粧水",       keyword:"ウーノ スキンセラム ローション",brandCanonical:"UNO",           max:1, audience:"mens" },
  { key:"nivea-men-lotion",cat:"化粧水",      keyword:"ニベアメン アクティブエイジローション", brandCanonical:"ニベアメン", max:1, audience:"mens" },
  { key:"lipps-boy-lotion",cat:"化粧水",      keyword:"LIPPS BOY 化粧水",             brandCanonical:"LIPPS BOY",     max:1, audience:"mens" },
  { key:"zigen-lotion",   cat:"化粧水",       keyword:"ZIGEN オールインワン フェイスジェル", brandCanonical:"ZIGEN",   max:1, audience:"mens" },
  { key:"maro-lotion",    cat:"化粧水",       keyword:"マーロ MARO 男性 化粧水",       brandCanonical:"MARO",          max:1, audience:"mens" },
  { key:"muji-mens-lotion",cat:"化粧水",     keyword:"無印良品 化粧水 敏感肌用 高保湿タイプ 400ml", brandCanonical:"無印良品", max:1, audience:"unisex", skinOverride:["敏感肌","乾燥肌","混合肌"] },
  // ORBIS Mr. skin jelly (オールインワン扱い)
  { key:"orbis-mr-jelly", cat:"化粧水",       keyword:"オルビス ミスター スキンジェルローション", brandCanonical:"ORBIS Mr.", max:1, audience:"mens" },
  { key:"axe-lotion",     cat:"化粧水",       keyword:"AXE アックス フェイスミスト",   brandCanonical:"AXE",           max:1, audience:"mens" },

  // === メンズ洗顔 (8〜10) ===
  { key:"bulk-wash",      cat:"洗顔",         keyword:"バルクオム THE FACE WASH",       brandCanonical:"BULK HOMME",    max:1, audience:"mens" },
  { key:"gatsby-wash",    cat:"洗顔",         keyword:"ギャツビー フェイシャルウォッシュ", brandCanonical:"GATSBY",      max:1, audience:"mens" },
  { key:"nivea-men-wash", cat:"洗顔",         keyword:"ニベアメン ディープクリアフォーム", brandCanonical:"ニベアメン",  max:1, audience:"mens" },
  { key:"biore-men-wash", cat:"洗顔",         keyword:"メンズビオレ 泡タイプ 洗顔",     brandCanonical:"メンズビオレ",  max:1, audience:"mens" },
  { key:"uno-wash",       cat:"洗顔",         keyword:"ウーノ ホイップウォッシュ",       brandCanonical:"UNO",           max:1, audience:"mens" },
  { key:"orbis-mr-wash",  cat:"洗顔",         keyword:"オルビス ミスター フェイシャルクレンザー", brandCanonical:"ORBIS Mr.", max:1, audience:"mens" },
  { key:"maro-wash",      cat:"洗顔",         keyword:"マーロ MARO 洗顔フォーム",       brandCanonical:"MARO",          max:1, audience:"mens" },
  { key:"lipps-boy-wash", cat:"洗顔",         keyword:"LIPPS BOY 洗顔",                brandCanonical:"LIPPS BOY",     max:1, audience:"mens" },
  { key:"dhc-men-wash",   cat:"洗顔",         keyword:"DHC MEN 薬用フェースウォッシュ", brandCanonical:"DHC MEN",       max:1, audience:"mens" },

  // === アフターシェーブ (4〜6) ===
  { key:"nivea-aftershave",cat:"アフターシェーブ", keyword:"ニベアメン アフターシェーブローション", brandCanonical:"ニベアメン", max:1, audience:"mens" },
  { key:"gatsby-aftershave",cat:"アフターシェーブ",keyword:"ギャツビー アフターシェーブローション", brandCanonical:"GATSBY",  max:1, audience:"mens" },
  { key:"shiseido-aftershave",cat:"アフターシェーブ", keyword:"資生堂 アフターシェーブ",   brandCanonical:"資生堂",       max:1, audience:"mens" },
  { key:"bulk-aftershave",cat:"アフターシェーブ",  keyword:"バルクオム アフターシェーブ",   brandCanonical:"BULK HOMME",   max:1, audience:"mens" },
  { key:"maro-aftershave",cat:"アフターシェーブ",  keyword:"マンダム ギャツビー ウーノ アフターシェーブ", brandCanonical:"UNO", max:1, audience:"mens" },

  // === メンズ日焼け止め (4〜6) ===
  { key:"nivea-men-uv",   cat:"日焼け止め",   keyword:"ニベアメン UVプロテクター",       brandCanonical:"ニベアメン",   max:1, audience:"mens" },
  { key:"biore-men-uv",   cat:"日焼け止め",   keyword:"メンズビオレ ONE 全身用 日焼け止め", brandCanonical:"メンズビオレ", max:1, audience:"mens" },
  { key:"anessa-men-uv",  cat:"日焼け止め",   keyword:"アネッサ パーフェクト UV スキンケアジェル", brandCanonical:"アネッサ", max:1, audience:"unisex", skinOverride:["全肌質","混合肌","脂性肌"] },
  { key:"uno-uv",         cat:"日焼け止め",   keyword:"ウーノ バリアパーフェクションUV", brandCanonical:"UNO",           max:1, audience:"mens" },
  { key:"zigen-uv",       cat:"日焼け止め",   keyword:"ZIGEN UV フェイス プロテクトミスト", brandCanonical:"ZIGEN",     max:1, audience:"mens" },

  // === メンズオールインワンジェル (4〜6) ===
  { key:"nivea-men-aio",  cat:"オールインワン", keyword:"ニベアメン オールインワン",     brandCanonical:"ニベアメン",   max:1, audience:"mens" },
  { key:"gatsby-aio",     cat:"オールインワン", keyword:"ギャツビー オールインワン",     brandCanonical:"GATSBY",       max:1, audience:"mens" },
  { key:"uno-aio",        cat:"オールインワン", keyword:"ウーノ クリームパーフェクション",brandCanonical:"UNO",          max:1, audience:"mens" },
  { key:"maro-aio",       cat:"オールインワン", keyword:"マーロ MARO 薬用 オールインワン", brandCanonical:"MARO",       max:1, audience:"mens" },
  { key:"zigen-aio",      cat:"オールインワン", keyword:"ZIGEN オールインワン フェイスジェル 100g", brandCanonical:"ZIGEN", max:1, audience:"mens" },
  { key:"lipps-boy-aio",  cat:"オールインワン", keyword:"LIPPS BOY オールインワン",       brandCanonical:"LIPPS BOY",   max:1, audience:"mens" },

  // === 追加クエリ (0件だったブランドの別表記/シリーズで補完) ===
  { key:"nivea-men-wash-2",cat:"洗顔",         keyword:"ニベアメン フェイスウォッシュ",  brandCanonical:"ニベアメン",   max:1, audience:"mens" },
  { key:"biore-men-wash-2",cat:"洗顔",         keyword:"メンズビオレ 洗顔料",           brandCanonical:"メンズビオレ", max:1, audience:"mens" },
  { key:"dhc-men-wash-2", cat:"洗顔",         keyword:"DHC メンズ 洗顔",              brandCanonical:"DHC",          max:1, audience:"mens" },
  { key:"maro-face-wash", cat:"洗顔",         keyword:"MARO 洗顔",                   brandCanonical:"MARO",         max:1, audience:"mens" },
  { key:"biore-men-uv-2", cat:"日焼け止め",   keyword:"メンズビオレ UV",              brandCanonical:"メンズビオレ", max:1, audience:"mens" },
  { key:"nivea-men-uv-2", cat:"日焼け止め",   keyword:"ニベアメン UV",                brandCanonical:"ニベアメン",   max:1, audience:"mens" },
  { key:"gatsby-aftershave-2",cat:"アフターシェーブ", keyword:"ギャツビー パウダーデオドラント アフター", brandCanonical:"GATSBY", max:1, audience:"mens" },
  { key:"maro-lotion-2",  cat:"化粧水",       keyword:"MARO 化粧水 スキンコンディショナー", brandCanonical:"MARO",     max:1, audience:"mens" },
  { key:"zigen-cleanse",  cat:"洗顔",         keyword:"ZIGEN フェイシャルウォッシュ",  brandCanonical:"ZIGEN",        max:1, audience:"mens" },
  { key:"kose-oxy-lotion",cat:"化粧水",       keyword:"OXY オキシー ディープウォッシュ ローション", brandCanonical:"OXY", max:1, audience:"mens" },
  { key:"nivea-men-lotion-2",cat:"化粧水",   keyword:"ニベアメン センシティブ ローション", brandCanonical:"ニベアメン",  max:1, audience:"mens" },
  { key:"kose-oxy-wash",  cat:"洗顔",         keyword:"OXY オキシー 洗顔",             brandCanonical:"OXY",          max:1, audience:"mens" },
  { key:"agnesb-hg-wash", cat:"洗顔",         keyword:"アルジェラン メンズ 洗顔",       brandCanonical:"アルジェラン", max:1, audience:"mens" },
  { key:"orbis-mr-2",     cat:"化粧水",       keyword:"オルビスミスター スキンジェル",  brandCanonical:"オルビス",     max:1, audience:"mens" },
  { key:"nulls-lotion",   cat:"化粧水",       keyword:"NULL ヌル 化粧水",             brandCanonical:"NULL",         max:1, audience:"mens" },
  { key:"nulls-wash",     cat:"洗顔",         keyword:"NULL ヌル フェイスウォッシュ",   brandCanonical:"NULL",         max:1, audience:"mens" },

  // === 3回目補充: アフターシェーブと日焼け止めが不足したため追加 ===
  { key:"gatsby-uv",      cat:"日焼け止め",   keyword:"ギャツビー UV",                 brandCanonical:"GATSBY",       max:1, audience:"mens" },
  { key:"uno-uv-2",       cat:"日焼け止め",   keyword:"ウーノ UV",                    brandCanonical:"UNO",          max:1, audience:"mens" },
  { key:"nivea-men-uv-3", cat:"日焼け止め",   keyword:"NIVEA MEN UV プロテクター",     brandCanonical:"ニベアメン",   max:1, audience:"mens" },
  { key:"muji-uv",        cat:"日焼け止め",   keyword:"無印良品 UV 日焼け止めミルク",   brandCanonical:"無印良品",     max:1, audience:"unisex" },
  { key:"kose-suncut-men",cat:"日焼け止め",   keyword:"サンカット パーフェクト UV スプレー", brandCanonical:"コーセー", max:1, audience:"unisex" },
  { key:"nivea-aftershave-2",cat:"アフターシェーブ", keyword:"ニベア アフターシェーブ",  brandCanonical:"ニベア",       max:1, audience:"mens" },
  { key:"gatsby-aftershave-3",cat:"アフターシェーブ",keyword:"GATSBY ギャツビー デオドラント アフター", brandCanonical:"GATSBY", max:1, audience:"mens" },
  { key:"uno-aftershave", cat:"アフターシェーブ", keyword:"ウーノ アフターシェーブ",   brandCanonical:"UNO",          max:1, audience:"mens" },
  { key:"biore-men-aftershave",cat:"アフターシェーブ", keyword:"メンズビオレ アフター",  brandCanonical:"メンズビオレ", max:1, audience:"mens" },
  { key:"muji-aftershave",cat:"アフターシェーブ", keyword:"無印良品 敏感肌用 アフターシェーブローション", brandCanonical:"無印良品", max:1, audience:"unisex" },
  { key:"schick-aftershave", cat:"アフターシェーブ", keyword:"シック Schick ハイドロ アフター", brandCanonical:"Schick", max:1, audience:"mens" },
  { key:"bulk-face-cream",cat:"保湿クリーム", keyword:"バルクオム THE CREAM",         brandCanonical:"BULK HOMME",   max:1, audience:"mens" },
  { key:"orbis-mr-cream", cat:"保湿クリーム", keyword:"オルビス ミスター モイスチャー", brandCanonical:"ORBIS Mr.",  max:1, audience:"mens" },
];

async function fetchQuery(q){
  const url = ENDPOINT +
    "?format=json&imageFlag=1&availability=1&sort=-reviewCount" +
    "&hits=8" +
    "&applicationId=" + APP +
    "&accessKey=" + KEY +
    "&affiliateId=" + AFF +
    "&keyword=" + encodeURIComponent(q.keyword);
  for (let attempt = 0; attempt < 3; attempt++){
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Origin: ORIGIN } });
    if (r.status === 200) return (await r.json()).Items || [];
    if (r.status === 429){ await sleep(3000); continue; }
    console.warn(`  [${r.status}] ${q.key}: ${(await r.text()).slice(0, 150)}`);
    return [];
  }
  return [];
}

const PROMO = ["送料無料","ランキング","マラソン","ポイント","OFF","クーポン","限定","セール",
  "新生活","まとめ買い","即納","あす楽","数量限定","公式","正規","認定","メール便","即日発送",
  "翌日配送","即発送","最大","半額","激安","超特価","累計","突破","週連続","第1位","No,1",
  "Point","P10倍","P5倍","時間限定","キャンペーン"];
function cleanName(name){
  let s = String(name || "")
    .replace(/[【\[（(《][^】\]）)》]{0,30}[】\]）)》]/g, " ")
    .replace(/[＼\/][^＼\/]{0,20}[＼\/]/g, " ")
    .replace(/[!！★☆♪●○◆■▲◎◇×÷▼☆]/g, " ")
    .replace(/\d+%OFF/gi, " ")
    .replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(w => w && !PROMO.some(p => w.includes(p)));
  s = words.join(" ").trim();
  if (s.length > 42){
    const cut = s.slice(0, 42);
    const lastSpace = cut.lastIndexOf(" ");
    s = lastSpace > 22 ? cut.slice(0, lastSpace) : cut;
  }
  return s || String(name).slice(0, 32);
}
function bigImg(u){
  if (!u) return "";
  return /_ex=\d+x\d+/.test(u) ? u.replace(/_ex=\d+x\d+/, "_ex=512x512") : u + (u.includes("?") ? "&" : "?") + "_ex=512x512";
}
function inferSkin(name, cat, override){
  if (override) return override;
  const nm = name.toLowerCase();
  const skin = [];
  if (nm.includes("敏感") || nm.includes("低刺激") || nm.includes("シカ") || nm.includes("cica")) skin.push("敏感肌");
  if (nm.includes("さっぱり") || nm.includes("オイリー") || nm.includes("皮脂") || nm.includes("テカリ")) skin.push("脂性肌");
  if (nm.includes("しっとり") || nm.includes("うるおい") || nm.includes("乾燥")) skin.push("乾燥肌");
  if (nm.includes("混合")) skin.push("混合肌");
  if (skin.length === 0) skin.push("混合肌", "脂性肌");
  return [...new Set(skin)];
}
function inferConcern(name, cat){
  const nm = name.toLowerCase();
  const concern = [];
  if (nm.includes("ニキビ") || nm.includes("肌荒れ") || nm.includes("アクネ")) concern.push("ニキビ・吹き出物");
  if (nm.includes("毛穴") || nm.includes("黒ずみ") || nm.includes("いちご")) concern.push("毛穴の開き・黒ずみ");
  if (nm.includes("シミ") || nm.includes("くすみ") || nm.includes("美白") || nm.includes("ホワイト")) concern.push("シミ・くすみ");
  if (nm.includes("シワ") || nm.includes("たるみ") || nm.includes("ハリ") || nm.includes("エイジ") || nm.includes("アンチエイジ")) concern.push("シワ・たるみ");
  if (nm.includes("乾燥") || nm.includes("しっとり") || nm.includes("保湿") || nm.includes("うるおい")) concern.push("乾燥・かさつき");
  if (nm.includes("シェービング") || nm.includes("アフターシェーブ") || nm.includes("髭") || nm.includes("ひげ") || nm.includes("ヒゲ") || nm.includes("剃り") || cat === "アフターシェーブ") concern.push("肌荒れ・赤み");
  if (concern.length === 0){
    if (cat === "洗顔") concern.push("毛穴の開き・黒ずみ");
    else if (cat === "化粧水" || cat === "オールインワン") concern.push("乾燥・かさつき");
    else if (cat === "日焼け止め") concern.push("シミ・くすみ");
    else concern.push("乾燥・かさつき");
  }
  return [...new Set(concern)];
}
function inferIngredients(name){
  const nm = name.toLowerCase();
  const list = [];
  if (nm.includes("ヒアルロン")) list.push("ヒアルロン酸");
  if (nm.includes("セラミド")) list.push("セラミド");
  if (nm.includes("コラーゲン")) list.push("コラーゲン");
  if (nm.includes("ビタミンc") || nm.includes("vc")) list.push("ビタミンC誘導体");
  if (nm.includes("シカ") || nm.includes("cica") || nm.includes("ツボクサ")) list.push("CICA(ツボクサエキス)");
  if (nm.includes("ナイアシンアミド")) list.push("ナイアシンアミド");
  if (nm.includes("グリセリン")) list.push("グリセリン");
  if (nm.includes("スクワラン")) list.push("スクワラン");
  if (nm.includes("グリチルリチン")) list.push("グリチルリチン酸2K");
  if (nm.includes("プラセンタ")) list.push("プラセンタエキス");
  if (list.length === 0) list.push("保湿成分");
  return list.slice(0, 3);
}
function inferIcon(cat){
  return { "化粧水":"💧", "洗顔":"🫧", "オールインワン":"🧴", "アフターシェーブ":"💈", "日焼け止め":"☀️" }[cat] || "🧴";
}
function inferDesc(name, cat, brand){
  const c = { "化粧水":"化粧水", "洗顔":"洗顔料", "オールインワン":"オールインワンジェル", "アフターシェーブ":"アフターシェーブローション", "日焼け止め":"日焼け止め" }[cat] || cat;
  return `${brand}のメンズ向け${c}。皮脂と乾燥のバランスに配慮した設計で、朝晩のケアに使いやすい定番のひとつ。`;
}

// ============ 実行 ============
async function main(){
  console.log("楽天API新版に接続中(ブランド別)...");
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
  const nextId = Math.max(...PRODUCTS.map(p => p.id)) + 1;
  console.log(`  既存: ${PRODUCTS.length}件 (次id=${nextId})`);

  const existingKeys = new Set(PRODUCTS.map(p => normalize(p.name)));
  const added = [];
  let currentId = nextId;

  for (const q of BRAND_QUERIES){
    const items = await fetchQuery(q);
    let addedInQ = 0;
    // 該当ブランド名が明示されているものを優先
    const brandTokens = q.brandCanonical.toLowerCase().split(/\s+/);
    const sorted = items.map(({Item:it}) => {
      const nm = String(it.itemName || "").toLowerCase();
      const brandMatch = brandTokens.some(t => nm.includes(t.toLowerCase()));
      return { it, brandMatch };
    }).sort((a,b) => (b.brandMatch?1:0)-(a.brandMatch?1:0));

    for (const { it, brandMatch } of sorted){
      if (!brandMatch) continue; // ブランド一致必須
      const rawName = it.itemName || "";
      const clean = cleanName(rawName);
      const key = normalize(clean);
      if (existingKeys.has(key)) continue;
      const price = it.itemPrice || 0;
      if (price < 300 || price > 20000) continue;
      const rc = it.reviewCount || 0;
      // 編集部評価は独自付与。楽天レビュー値は参考情報として利用:
      // - rc>=5 かつ reviewAverage>=3.5: その値を採用
      // - rc<5 or reviewCount=0: 新規/流通少なめとしてデフォルト4.2
      // - rc>=5 && reviewAverage<3.5: 実際の評価が低い商品は除外
      let rating;
      if (rc >= 5){
        if (it.reviewAverage < 3.5) continue;
        rating = Math.round(it.reviewAverage * 10) / 10;
      } else {
        rating = 4.2; // 定番ブランドの新商品扱い
      }
      const image = bigImg(it.mediumImageUrls?.[0]?.imageUrl || "");
      added.push({
        id: currentId++,
        name: clean,
        brand: q.brandCanonical,
        category: q.cat,
        price,
        rating,
        reviews: rc,
        skin: inferSkin(clean, q.cat, q.skinOverride),
        concern: inferConcern(clean, q.cat),
        desc: inferDesc(clean, q.cat, q.brandCanonical),
        keyIngredients: inferIngredients(clean),
        icon: inferIcon(q.cat),
        origin: "日本",
        purchase: it.affiliateUrl || it.itemUrl || "https://www.amazon.co.jp/",
        image,
        audience: q.audience
      });
      existingKeys.add(key);
      addedInQ++;
      if (addedInQ >= q.max) break;
    }
    console.log(`  [${q.key}] "${q.keyword}" → 採用${addedInQ}件${addedInQ===0?" ⚠️":""}`);
    await sleep(500);
  }

  console.log(`\n=== 追加候補 ${added.length}件 ===`);
  fs.writeFileSync("scripts/mens-candidates.json", JSON.stringify(added, null, 2), "utf8");
  console.log("→ scripts/mens-candidates.json に一時保存");

  // カテゴリ別カウント
  const byCat = {};
  for (const p of added) byCat[p.category] = (byCat[p.category] || 0) + 1;
  console.log("\nカテゴリ別内訳:");
  for (const [c, n] of Object.entries(byCat)) console.log(`  ${c}: ${n}件`);
}
function normalize(s){
  return String(s || "").toLowerCase().replace(/[\s　・()（）\[\]【】+]/g, "").slice(0, 22);
}
main().catch(e => { console.error(e); process.exit(1); });

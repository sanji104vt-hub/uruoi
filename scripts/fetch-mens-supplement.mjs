// Step 1 補充フェッチ: アフターシェーブ4-5件、オールインワン2-3件、日焼け止め2件を追加。
// 出力先: scripts/mens-supplement.json (post-process 側でマージ)

import fs from "node:fs";

const APP = process.env.RAKUTEN_APP_ID;
const KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFF = process.env.RAKUTEN_AFFILIATE_ID;
const ORIGIN = process.env.RAKUTEN_ORIGIN;
if (!APP || !KEY || !AFF || !ORIGIN){ console.error("env missing"); process.exit(1); }

const ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SUPPLEMENT_QUERIES = [
  // === アフターシェーブ 4-5件目標 ===
  { key:"gillette-aftershave", cat:"アフターシェーブ", keyword:"ジレット アフターシェーブ ローション", brandCanonical:"ジレット",  max:1, audience:"mens" },
  { key:"vaseline-aftershave", cat:"アフターシェーブ", keyword:"ヴァセリン メンズ アフターシェーブ", brandCanonical:"ヴァセリン",   max:1, audience:"mens" },
  { key:"nivea-aftershave-balm",cat:"アフターシェーブ", keyword:"NIVEA MEN アフターシェーブ バーム", brandCanonical:"ニベアメン",  max:1, audience:"mens" },
  { key:"gatsby-shave-lotion",cat:"アフターシェーブ", keyword:"ギャツビー シェービング ローション",brandCanonical:"GATSBY",     max:1, audience:"mens" },
  { key:"lisir-aftershave",   cat:"アフターシェーブ", keyword:"リシーレ シェービング アフターローション", brandCanonical:"リシーレ", max:1, audience:"mens" },
  { key:"lush-aftershave",    cat:"アフターシェーブ", keyword:"LUSH ラッシュ アフターシェーブ",     brandCanonical:"LUSH",       max:1, audience:"mens" },
  { key:"clinique-aftershave",cat:"アフターシェーブ", keyword:"クリニーク フォーメン ポストシェーブ", brandCanonical:"CLINIQUE",  max:1, audience:"mens" },
  { key:"pola-aftershave",    cat:"アフターシェーブ", keyword:"ポーラ 男性用 アフターシェーブ",     brandCanonical:"POLA",       max:1, audience:"mens" },
  { key:"nivea-post-shave",   cat:"アフターシェーブ", keyword:"ニベアメン ポストシェーブ",         brandCanonical:"ニベアメン", max:1, audience:"mens" },

  // === オールインワン 2-3件目標 (BULK HOMME/ORBIS Mr.優先) ===
  { key:"bulk-aio",           cat:"オールインワン", keyword:"バルクオム THE MEN'S MOISTURE",     brandCanonical:"BULK HOMME", max:1, audience:"mens" },
  { key:"bulk-aio-2",         cat:"オールインワン", keyword:"バルクオム オールインワン",         brandCanonical:"BULK HOMME", max:1, audience:"mens" },
  { key:"orbis-mr-aio",       cat:"オールインワン", keyword:"オルビス ミスター スキン ジェルローション", brandCanonical:"ORBIS Mr.", max:1, audience:"mens" },
  { key:"orbis-mr-aio-2",     cat:"オールインワン", keyword:"オルビス Mr スキンジェルローション",brandCanonical:"オルビス",   max:1, audience:"mens" },
  { key:"maro-aio-2",         cat:"オールインワン", keyword:"MARO オールインワン ゲル",         brandCanonical:"MARO",       max:1, audience:"mens" },
  { key:"lipps-aio",          cat:"オールインワン", keyword:"リップスボーイ オールインワン ジェル", brandCanonical:"LIPPS BOY", max:1, audience:"mens" },
  { key:"orbis-mr-jelly-3",   cat:"オールインワン", keyword:"オルビスミスター スキンジェル ローション", brandCanonical:"オルビス", max:1, audience:"mens" },

  // === 日焼け止め 2件追加 (メンズ訴求) ===
  { key:"biore-men-aqua",     cat:"日焼け止め", keyword:"メンズビオレ ONE 全身UV",           brandCanonical:"メンズビオレ", max:1, audience:"mens" },
  { key:"skin-aqua-men",      cat:"日焼け止め", keyword:"スキンアクア メンズ",              brandCanonical:"ロート製薬",   max:1, audience:"mens" },
  { key:"nivea-sun-men",      cat:"日焼け止め", keyword:"ニベアサン メンズ プロテクト UV",   brandCanonical:"ニベアメン",   max:1, audience:"mens" },
  { key:"allie-genderless",   cat:"日焼け止め", keyword:"アリー ALLIE ジェンダーレス UV",    brandCanonical:"ALLIE",      max:1, audience:"unisex" },

  // === 2ラウンド目補充: まだ足りないカテゴリ ===
  { key:"gillette-shave",     cat:"アフターシェーブ", keyword:"ジレット シェービング",           brandCanonical:"ジレット",     max:1, audience:"mens" },
  { key:"axe-aftershave",     cat:"アフターシェーブ", keyword:"AXE アフター",                   brandCanonical:"AXE",         max:1, audience:"mens" },
  { key:"schick-hydro-gel",   cat:"アフターシェーブ", keyword:"シック ハイドロ シェービング",    brandCanonical:"Schick",      max:1, audience:"mens" },
  { key:"orbis-mr-jelly-4",   cat:"オールインワン",   keyword:"ORBIS Mr. スキンジェル",         brandCanonical:"ORBIS Mr.",   max:1, audience:"mens" },
  { key:"nivea-aio-2",        cat:"オールインワン",   keyword:"ニベアメン アクティブエイジ オールインワンローション", brandCanonical:"ニベアメン", max:1, audience:"mens" },
  { key:"zigen-aio-2",        cat:"オールインワン",   keyword:"ZIGEN オールインワン フェイスジェル",brandCanonical:"ZIGEN",   max:1, audience:"mens" },
  { key:"bulk-aio-3",         cat:"オールインワン",   keyword:"バルクオム オールインワン モイスチャー", brandCanonical:"BULK HOMME", max:1, audience:"mens" },
  { key:"mens-uv-gel",        cat:"日焼け止め",       keyword:"メンズ UV ジェル 顔用",           brandCanonical:"メンズビオレ", max:1, audience:"mens" },
  { key:"gatsby-uv-2",        cat:"日焼け止め",       keyword:"GATSBY UV パーフェクション",     brandCanonical:"GATSBY",      max:1, audience:"mens" },
  { key:"muji-uv-2",          cat:"日焼け止め",       keyword:"無印良品 UV日焼け止めジェル",     brandCanonical:"無印良品",     max:1, audience:"unisex" },
];

async function fetchQuery(q){
  const url = ENDPOINT +
    "?format=json&imageFlag=1&availability=1&sort=-reviewCount&hits=8" +
    "&applicationId=" + APP + "&accessKey=" + KEY + "&affiliateId=" + AFF +
    "&keyword=" + encodeURIComponent(q.keyword);
  for (let a = 0; a < 3; a++){
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Origin: ORIGIN } });
    if (r.status === 200) return (await r.json()).Items || [];
    if (r.status === 429){ await sleep(3000); continue; }
    console.warn(`  [${r.status}] ${q.key}: ${(await r.text()).slice(0,150)}`);
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
    .replace(/[!！★☆♪●○◆■▲◎◇×÷▼]/g, " ")
    .replace(/\d+%OFF/gi, " ")
    .replace(/^\s*\d+月\d+日[」』]?\s*/g, "")
    .replace(/\s*】\s*/g, " ").replace(/\s*\|\s*/g, " ").replace(/\s*｜\s*/g, " ")
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
function bigImg(u){ if (!u) return ""; return /_ex=\d+x\d+/.test(u) ? u.replace(/_ex=\d+x\d+/, "_ex=512x512") : u + (u.includes("?") ? "&" : "?") + "_ex=512x512"; }
function inferSkin(name){
  const nm = name.toLowerCase(); const skin = [];
  if (nm.includes("敏感") || nm.includes("低刺激") || nm.includes("シカ") || nm.includes("cica")) skin.push("敏感肌");
  if (nm.includes("さっぱり") || nm.includes("オイリー") || nm.includes("皮脂") || nm.includes("テカリ")) skin.push("脂性肌");
  if (nm.includes("しっとり") || nm.includes("うるおい") || nm.includes("乾燥")) skin.push("乾燥肌");
  if (skin.length === 0) skin.push("混合肌","脂性肌");
  return [...new Set(skin)];
}
function inferConcern(name, cat){
  const nm = name.toLowerCase(); const c = [];
  if (nm.includes("ニキビ") || nm.includes("肌荒れ") || nm.includes("アクネ")) c.push("ニキビ・吹き出物");
  if (nm.includes("毛穴")) c.push("毛穴の開き・黒ずみ");
  if (nm.includes("シミ") || nm.includes("くすみ") || nm.includes("美白")) c.push("シミ・くすみ");
  if (nm.includes("シワ") || nm.includes("ハリ") || nm.includes("エイジ")) c.push("シワ・たるみ");
  if (nm.includes("乾燥") || nm.includes("しっとり") || nm.includes("保湿")) c.push("乾燥・かさつき");
  if (cat === "アフターシェーブ" || nm.includes("シェービング") || nm.includes("髭") || nm.includes("ひげ") || nm.includes("剃り")) c.push("肌荒れ・赤み");
  if (c.length === 0){
    if (cat === "オールインワン") c.push("乾燥・かさつき");
    else if (cat === "日焼け止め") c.push("シミ・くすみ");
    else c.push("肌荒れ・赤み");
  }
  return [...new Set(c)];
}
function inferIngredients(name){
  const nm = name.toLowerCase(); const l = [];
  if (nm.includes("ヒアルロン")) l.push("ヒアルロン酸");
  if (nm.includes("セラミド")) l.push("セラミド");
  if (nm.includes("ビタミンc") || nm.includes("vc")) l.push("ビタミンC誘導体");
  if (nm.includes("シカ") || nm.includes("cica")) l.push("CICA(ツボクサエキス)");
  if (nm.includes("ナイアシンアミド")) l.push("ナイアシンアミド");
  if (nm.includes("グリチルリチン")) l.push("グリチルリチン酸2K");
  if (nm.includes("スクワラン")) l.push("スクワラン");
  if (nm.includes("プラセンタ")) l.push("プラセンタエキス");
  if (l.length === 0) l.push("保湿成分");
  return l.slice(0, 3);
}
function iconFor(cat){ return { "アフターシェーブ":"💈", "オールインワン":"🧴", "日焼け止め":"☀️" }[cat] || "🧴"; }
function descFor(brand, cat){
  const c = { "アフターシェーブ":"アフターシェーブローション", "オールインワン":"オールインワンジェル", "日焼け止め":"日焼け止め" }[cat] || cat;
  return `${brand}のメンズ向け${c}。皮脂と乾燥のバランスに配慮した設計で、朝晩のケアに使いやすい定番のひとつ。`;
}

async function main(){
  console.log("Step 1 補充フェッチ開始");
  // 既存の追加候補と既存192商品名を重複除外用にロード
  const finalArr = JSON.parse(fs.readFileSync("scripts/mens-candidates-final.json", "utf8"));
  const html = fs.readFileSync("public/index.html", "utf8");
  const startMark = "const PRODUCTS=[";
  const s = html.indexOf(startMark);
  let i = s + startMark.length - 1, depth = 0, inStr = false, strCh = null, esc = false, e = -1;
  for (; i < html.length; i++){
    const c = html[i];
    if (esc){ esc = false; continue; }
    if (inStr){ if (c === "\\"){ esc = true; continue; } if (c === strCh) inStr = false; continue; }
    if (c === '"' || c === "'"){ inStr = true; strCh = c; continue; }
    if (c === "[") depth++; else if (c === "]"){ depth--; if (depth === 0){ e = i; break; } }
  }
  const arrText = html.slice(s + startMark.length - 1, e + 1).replace(/,(\s*[\]}])/g, "$1");
  const existing = JSON.parse(arrText);
  const norm = s => String(s || "").toLowerCase().replace(/[\s　・()（）\[\]【】+]/g, "").slice(0, 22);
  const existingKeys = new Set([...existing.map(p => norm(p.name)), ...finalArr.map(p => norm(p.name))]);

  const added = [];
  for (const q of SUPPLEMENT_QUERIES){
    const items = await fetchQuery(q);
    let addedInQ = 0;
    const brandTokens = q.brandCanonical.toLowerCase().split(/\s+/);
    const sorted = items.map(({Item:it}) => {
      const nm = String(it.itemName || "").toLowerCase();
      return { it, brandMatch: brandTokens.some(t => nm.includes(t.toLowerCase())) };
    }).sort((a,b) => (b.brandMatch?1:0)-(a.brandMatch?1:0));

    for (const { it, brandMatch } of sorted){
      if (!brandMatch) continue;
      const clean = cleanName(it.itemName || "");
      const key = norm(clean);
      if (existingKeys.has(key)) continue;
      const price = it.itemPrice || 0;
      if (price < 300 || price > 20000) continue;
      const rc = it.reviewCount || 0;
      let rating;
      if (rc >= 5){ if (it.reviewAverage < 3.5) continue; rating = Math.round(it.reviewAverage * 10) / 10; }
      else rating = 4.2;
      added.push({
        __oldId: null, // 後で振り直し
        name: clean, brand: q.brandCanonical, category: q.cat, price, rating, reviews: rc,
        skin: inferSkin(clean), concern: inferConcern(clean, q.cat),
        desc: descFor(q.brandCanonical, q.cat), keyIngredients: inferIngredients(clean),
        icon: iconFor(q.cat), origin: "日本",
        purchase: it.affiliateUrl || it.itemUrl || "https://www.amazon.co.jp/",
        image: bigImg(it.mediumImageUrls?.[0]?.imageUrl || ""),
        audience: q.audience,
      });
      existingKeys.add(key);
      addedInQ++;
      if (addedInQ >= q.max) break;
    }
    console.log(`  [${q.key}] "${q.keyword}" → +${addedInQ}${addedInQ===0?" ⚠️":""}`);
    await sleep(500);
  }
  console.log(`\n=== 補充候補 ${added.length}件 ===`);
  fs.writeFileSync("scripts/mens-supplement.json", JSON.stringify(added, null, 2), "utf8");
  const byCat = {};
  for (const p of added){ (byCat[p.category] = byCat[p.category] || 0) + 1; byCat[p.category] = (byCat[p.category] || 0) + 1; }
  for (const [c, n] of Object.entries(byCat)) console.log(`  ${c}: ${n}件`);
}
main().catch(e => { console.error(e); process.exit(1); });

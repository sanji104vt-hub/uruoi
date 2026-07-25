// 編集部が実使用した11商品のうち、PRODUCTS配列に未登録の7商品を
// 楽天API新版から取得する。取得結果は scripts/editor-candidates.json に保存。
//
// 必要な環境変数: RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY / RAKUTEN_AFFILIATE_ID / RAKUTEN_ORIGIN

import fs from "node:fs";

const APP = process.env.RAKUTEN_APP_ID;
const KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFF = process.env.RAKUTEN_AFFILIATE_ID;
const ORIGIN = process.env.RAKUTEN_ORIGIN;
if (!APP || !KEY || !AFF || !ORIGIN){ console.error("env missing"); process.exit(1); }

const ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 未登録7商品の取得定義。
// mustInclude: 商品名に必ず含まれるべき語(誤マッチ防止)
// mustExclude: 含まれていたら除外する語(別商品・セット品の混入防止)
const QUERIES = [
  {
    // 編集部撮影写真のラベルから「ダーマヒットセラム5」(30g)と判別済み。
    // 「10」は別濃度のバリエーションなので除外する。
    key: "katan-cica",
    keyword: "KATAN Cica ダーマヒットセラム5 30g",
    brand: "KATAN", category: "美容液",
    mustInclude: ["ダーマヒットセラム5"],
    mustExclude: ["中古", "セット", "2個", "3個", "ダーマヒットセラム10"],
    skin: ["敏感肌", "混合肌"], concern: ["肌荒れ・赤み", "ニキビ・吹き出物"],
    ingredients: ["CICA(ツボクサエキス)", "保湿成分"],
    desc: "ツボクサエキス(CICA)配合の韓国発の美容液。肌荒れが気になるときの鎮静ケア向けとして販売されているアイテム。",
    icon: "🌿", origin: "韓国", audience: "unisex",
  },
  {
    key: "curel-cream-jar",
    keyword: "キュレル 潤浸保湿 クリーム ジャー 90g",
    brand: "キュレル", category: "保湿クリーム",
    mustInclude: ["キュレル"], mustExclude: ["フェイス", "セット", "詰め替え", "つめかえ"],
    skin: ["敏感肌", "乾燥肌"], concern: ["乾燥・かさつき"],
    ingredients: ["セラミド機能成分", "ユーカリエキス", "グリセリン"],
    desc: "セラミドケア成分配合の保湿クリーム。全身に使える大容量ジャータイプで、低刺激設計をうたう乾燥肌向けの定番。",
    icon: "🧴", origin: "日本", audience: "unisex",
  },
  {
    key: "melano-premium",
    keyword: "メラノCC 薬用 しみ集中対策 プレミアム美容液",
    brand: "ロート製薬", category: "美容液",
    mustInclude: ["メラノCC"], mustExclude: ["セット", "化粧水", "パック", "乳液"],
    skin: ["普通肌", "混合肌", "脂性肌"], concern: ["シミ・くすみ", "ニキビ・吹き出物"],
    ingredients: ["活性型ビタミンC", "ビタミンE誘導体", "アルピニアホワイト"],
    desc: "活性型ビタミンC配合の薬用美容液のプレミアム処方。メラニンの生成を抑え、しみ・そばかすを防ぐ医薬部外品。",
    icon: "🍋", origin: "日本", audience: "unisex",
  },
  {
    key: "skinlife-wash",
    // 「石鹸」を除外語にすると正規商品名の「牛乳石鹸」に誤マッチするため使わない。
    keyword: "スキンライフ 薬用洗顔フォーム",
    brand: "牛乳石鹸", category: "洗顔",
    mustInclude: ["スキンライフ", "洗顔"],
    mustExclude: ["ボディ", "セット", "本セット", "1点限り", "中古"],
    skin: ["混合肌", "脂性肌", "敏感肌"], concern: ["ニキビ・吹き出物", "肌荒れ・赤み"],
    ingredients: ["イソプロピルメチルフェノール", "グリチルリチン酸2K", "植物性うるおい成分"],
    desc: "ニキビを防ぐ薬用洗顔フォーム。うるおいを守りながら余分な皮脂と汚れを落とす、プチプラの定番医薬部外品。",
    icon: "🐄", origin: "日本", audience: "unisex",
  },
  {
    key: "gokujyun-premium-milk",
    keyword: "肌ラボ 極潤プレミアム ヒアルロン乳液",
    brand: "ロート製薬", category: "保湿クリーム",
    mustInclude: ["極潤"], mustExclude: ["化粧水", "クリーム", "セット", "オールインワン"],
    skin: ["乾燥肌", "普通肌"], concern: ["乾燥・かさつき"],
    ingredients: ["5種のヒアルロン酸", "スーパーヒアルロン酸", "乳酸発酵ヒアルロン酸"],
    desc: "5種のヒアルロン酸配合の高保湿乳液。とろみのあるテクスチャで、乾燥しやすい肌にうるおいを与える設計。",
    icon: "💧", origin: "日本", audience: "unisex",
  },
  {
    key: "hadabisei-lotion",
    keyword: "肌美精 大人のニキビ対策 薬用美白化粧水",
    brand: "クラシエ", category: "化粧水",
    mustInclude: ["肌美精", "化粧水"],
    mustExclude: ["マスク", "クリーム", "セット", "3D", "1点限り", "中古"],
    skin: ["混合肌", "乾燥肌"], concern: ["ニキビ・吹き出物", "シミ・くすみ"],
    ingredients: ["トラネキサム酸", "グリチルリチン酸2K", "高純度ビタミンC誘導体"],
    desc: "大人ニキビと美白ケアを両立する薬用化粧水。ニキビを防ぎながら、メラニンの生成を抑えてしみ・そばかすを防ぐ医薬部外品。",
    icon: "🌸", origin: "日本", audience: "unisex",
  },
  {
    key: "hadabisei-cream",
    keyword: "肌美精 大人のニキビ対策 薬用美白クリーム",
    brand: "クラシエ", category: "保湿クリーム",
    mustInclude: ["肌美精", "クリーム"],
    mustExclude: ["マスク", "化粧水", "セット", "3D", "1点限り", "中古"],
    skin: ["混合肌", "乾燥肌"], concern: ["ニキビ・吹き出物", "シミ・くすみ"],
    ingredients: ["トラネキサム酸", "グリチルリチン酸2K", "高純度ビタミンC誘導体"],
    desc: "大人ニキビと美白ケアを両立する薬用クリーム。うるおいを与えながらニキビを防ぎ、しみ・そばかすを防ぐ医薬部外品。",
    icon: "🌸", origin: "日本", audience: "unisex",
  },
];

async function fetchQuery(kw){
  const url = ENDPOINT +
    "?format=json&imageFlag=1&availability=1&sort=-reviewCount&hits=10" +
    "&applicationId=" + APP + "&accessKey=" + KEY + "&affiliateId=" + AFF +
    "&keyword=" + encodeURIComponent(kw);
  for (let a = 0; a < 3; a++){
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Origin: ORIGIN } });
    if (r.status === 200) return (await r.json()).Items || [];
    if (r.status === 429){ await sleep(3000); continue; }
    console.warn(`  [${r.status}] ${kw}: ${(await r.text()).slice(0,150)}`);
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
    .replace(/\s*】\s*/g, " ").replace(/\s*\|\s*/g, " ").replace(/\s*｜\s*/g, " ")
    .replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(w => w && !PROMO.some(p => w.includes(p)));
  s = words.join(" ").trim();
  if (s.length > 42){
    const cut = s.slice(0, 42);
    const sp = cut.lastIndexOf(" ");
    s = sp > 22 ? cut.slice(0, sp) : cut;
  }
  return s || String(name).slice(0, 32);
}
function bigImg(u){
  if (!u) return "";
  return /_ex=\d+x\d+/.test(u) ? u.replace(/_ex=\d+x\d+/, "_ex=512x512") : u + (u.includes("?") ? "&" : "?") + "_ex=512x512";
}

async function main(){
  console.log("編集部使用商品(未登録7件)を楽天APIから取得\n");
  const results = [];
  for (const q of QUERIES){
    const items = await fetchQuery(q.keyword);
    let picked = null;
    for (const { Item: it } of items){
      const raw = String(it.itemName || "");
      if (!q.mustInclude.every(k => raw.includes(k))) continue;
      if (q.mustExclude.some(k => raw.includes(k))) continue;
      const price = it.itemPrice || 0;
      if (price < 300 || price > 20000) continue;
      const rc = it.reviewCount || 0;
      let rating;
      if (rc >= 5){ if (it.reviewAverage < 3.5) continue; rating = Math.round(it.reviewAverage * 10) / 10; }
      else rating = 4.2;
      picked = {
        name: cleanName(raw),
        brand: q.brand, category: q.category,
        price, rating, reviews: rc,
        skin: q.skin, concern: q.concern,
        desc: q.desc, keyIngredients: q.ingredients,
        icon: q.icon, origin: q.origin,
        purchase: it.affiliateUrl || it.itemUrl || "https://www.amazon.co.jp/",
        image: bigImg(it.mediumImageUrls?.[0]?.imageUrl || ""),
        audience: q.audience,
        __key: q.key,
        __rawName: raw.slice(0, 90),
      };
      break;
    }
    if (picked){
      results.push(picked);
      console.log(`  ✓ [${q.key}] ${picked.name}`);
      console.log(`      ¥${picked.price.toLocaleString()} ★${picked.rating} (元: ${picked.__rawName})`);
    } else {
      console.log(`  ❌ [${q.key}] "${q.keyword}" 条件に合う商品が見つかりませんでした`);
    }
    await sleep(500);
  }
  console.log(`\n取得: ${results.length}/${QUERIES.length} 件`);
  fs.writeFileSync("scripts/editor-candidates.json", JSON.stringify(results, null, 2), "utf8");
  console.log("→ scripts/editor-candidates.json に保存");
}
main().catch(e => { console.error(e); process.exit(1); });

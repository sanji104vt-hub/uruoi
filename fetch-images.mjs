import { readFileSync, writeFileSync, existsSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
if (!APP_ID || !ACCESS_KEY) {
  console.error("ERROR: 環境変数 RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY を設定してください");
  process.exit(1);
}

const SITE_URL = "https://moilum.asutelu.com/";

// 既存の取得結果（あればマージ）
const results = existsSync("image-urls.json")
  ? JSON.parse(readFileSync("image-urls.json", "utf8"))
  : {};

// 商品SSoTから「image プロパティがまだ無い」商品だけを抽出
const products = JSON.parse(readFileSync("src/products.json", "utf8"));
const targets = products
  .filter((product) => !product.image)
  .map(({ id, name, brand, category }) => ({ id, name, brand, category }));

console.log(`画像未取得の商品: ${targets.length} 件を取得します`);

// キーワード整形（記号→空白）
function cleanKeyword(s) {
  return s
    .replace(/[％%＋+・／/＆&（）()【】\[\]、，,。.｜|＃#＠@～~"'`:：;；!！?？*×]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 楽天の新APIはスペース区切り3語まで。重複・1文字トークンを除いた先頭3語に絞る
function buildKeyword(brand, name) {
  const tokens = cleanKeyword(`${brand} ${name}`).split(" ").filter(Boolean);
  let filtered = tokens.filter((t) => t.length >= 2);
  if (filtered.length === 0) filtered = tokens;
  const uniq = [...new Set(filtered)];
  return uniq.slice(0, 3).join(" ");
}
function keywordAttempts(product) {
  const brandTokens = cleanKeyword(product.brand).split(" ").filter(Boolean);
  const nameTokens = cleanKeyword(product.name).split(" ").filter(Boolean);
  const brandKeys = new Set(brandTokens.map(token => token.toLowerCase()));
  const rest = nameTokens.filter(token => !brandKeys.has(token.toLowerCase()));
  return [...new Set([
    buildKeyword(product.brand, product.name),
    [...brandTokens.slice(0, 1), ...rest.slice(0, 1)].join(" "),
    rest.slice(0, 2).join(" "),
    cleanKeyword(product.name),
    [...brandTokens.slice(0, 1), product.category].join(" "),
  ].map(cleanKeyword).filter(Boolean))];
}
function normalized(value) {
  return cleanKeyword(value).normalize("NFKC").toLowerCase().replace(/\s/g, "");
}
function grams(value) {
  const source = normalized(value);
  const set = new Set();
  for (let index = 0; index <= source.length - 3; index++) set.add(source.slice(index, index + 3));
  return set;
}
function similarity(left, right) {
  const a = grams(left), b = grams(right);
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return common / (a.size + b.size - common || 1);
}

const BASE = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
let success = 0;
let fail = 0;

for (const p of targets) {
  let best = null;
  for (const keyword of keywordAttempts(p)) {
    const url = new URL(BASE);
    url.searchParams.set("accessKey", ACCESS_KEY);
    url.searchParams.set("applicationId", APP_ID);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("hits", "5");
    url.searchParams.set("imageFlag", "1");
    url.searchParams.set("formatVersion", "2");
    url.searchParams.set("elements", "itemName,mediumImageUrls,itemPrice,itemUrl");
    try {
      const res = await fetch(url.toString(), {
        headers: { "Referer": SITE_URL, "Origin": new URL(SITE_URL).origin },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 150)}`);
      }
      const data = await res.json();
      for (const item of data.Items || []) {
        if (!item.mediumImageUrls?.length) continue;
        const score = similarity(p.name, item.itemName || "");
        if (!best || score > best.score) best = { item, keyword, score };
      }
      if (best?.score >= 0.45) break;
    } catch (e) {
      console.log(`[RETRY] id:${p.id} ${p.name} (kw: ${keyword}) → ${e.message}`);
    }
    await sleep(1100); // 楽天API: 1秒1リクエスト推奨
  }
  // 商品名が近い別商品を誤って採用しないよう、低一致の候補は手動確認に回す。
  if (best && best.score >= 0.45) {
    results[p.id] = best.item.mediumImageUrls[0].replace(/\?_ex=\d+x\d+$/, "?_ex=300x300");
    success++;
    console.log(`[OK] id:${p.id} ${p.name} (score:${best.score.toFixed(2)} / kw:${best.keyword} / hit:${best.item.itemName})`);
  } else {
    fail++;
    console.log(`[NO MATCH] id:${p.id} ${p.name}${best ? ` (best:${best.score.toFixed(2)} / ${best.item.itemName})` : ""}`);
  }
  await sleep(1100);
}

writeFileSync("image-urls.json", JSON.stringify(results, null, 2), "utf8");
console.log(`\n完了: 新規成功 ${success} 件 / 失敗・画像なし ${fail} 件`);
console.log(`image-urls.json 合計: ${Object.keys(results).length} 件`);

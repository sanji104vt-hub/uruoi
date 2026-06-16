import { readFileSync, writeFileSync, existsSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
if (!APP_ID || !ACCESS_KEY) {
  console.error("ERROR: 環境変数 RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY を設定してください");
  process.exit(1);
}

const SITE_URL = "https://moilum.sanji-104vt.workers.dev/";

// 既存の取得結果（あればマージ）
const results = existsSync("image-urls.json")
  ? JSON.parse(readFileSync("image-urls.json", "utf8"))
  : {};

// public/index.html の PRODUCTS から「image プロパティがまだ無い」商品だけを抽出
const html = readFileSync("public/index.html", "utf8");
const startIdx = html.indexOf("const PRODUCTS=[");
const endIdx = html.indexOf("];", startIdx);
const block = html.slice(startIdx, endIdx);

const targets = [];
for (const line of block.split("\n")) {
  if (!/^\s*\{"id":/.test(line)) continue;
  if (/"image"\s*:/.test(line)) continue; // 既に画像あり → スキップ
  const id = parseInt(line.match(/"id":\s*(\d+)/)[1]);
  const name = line.match(/"name":\s*"([^"]+)"/)[1];
  const brand = line.match(/"brand":\s*"([^"]+)"/)[1];
  targets.push({ id, name, brand });
}

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

const BASE = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401";
let success = 0;
let fail = 0;

for (const p of targets) {
  const keyword = buildKeyword(p.brand, p.name);
  const url = new URL(BASE);
  url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("applicationId", APP_ID);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("hits", "1");
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
    const items = data.Items;
    if (items && items.length > 0 && items[0].mediumImageUrls && items[0].mediumImageUrls.length > 0) {
      const imgUrl = items[0].mediumImageUrls[0].replace(/\?_ex=\d+x\d+$/, "?_ex=300x300");
      results[p.id] = imgUrl;
      success++;
      console.log(`[OK] id:${p.id} ${p.name}  (kw: ${keyword})`);
    } else {
      fail++;
      console.log(`[NO IMAGE] id:${p.id} ${p.name}  (kw: ${keyword})`);
    }
  } catch (e) {
    fail++;
    console.log(`[ERROR] id:${p.id} ${p.name}  (kw: ${keyword}) → ${e.message}`);
  }

  await sleep(1100); // 楽天API: 1秒1リクエスト推奨
}

writeFileSync("image-urls.json", JSON.stringify(results, null, 2), "utf8");
console.log(`\n完了: 新規成功 ${success} 件 / 失敗・画像なし ${fail} 件`);
console.log(`image-urls.json 合計: ${Object.keys(results).length} 件`);

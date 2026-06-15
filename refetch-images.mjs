import { readFileSync, writeFileSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
if (!APP_ID || !ACCESS_KEY) {
  console.error("ERROR: 環境変数 RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY を設定してください");
  process.exit(1);
}

const SITE_URL = "https://moilum.sanji-104vt.workers.dev/";

// 既存の取得結果を読み込み（成功済みはスキップ）
const results = JSON.parse(readFileSync("image-urls.json", "utf8"));

// public/index.html から id/name/brand を抽出
const html = readFileSync("public/index.html", "utf8");
const startIdx = html.indexOf("const PRODUCTS=[");
const endIdx = html.indexOf("];\n", startIdx) + 2;
const block = html.slice(startIdx, endIdx);

const products = [];
const itemRegex = /\{"id":\s*(\d+),\s*"name":\s*"([^"]+)",\s*"brand":\s*"([^"]+)"/g;
let m;
while ((m = itemRegex.exec(block)) !== null) {
  products.push({ id: parseInt(m[1]), name: m[2], brand: m[3] });
}

// キーワードを楽天APIが受け付ける形に整形（記号→空白、連続空白を1つに）
function cleanKeyword(s) {
  return s
    .replace(/[％%＋+・／/＆&（）()【】\[\]、，,。.｜|＃#＠@～~"'`:：;；!！?？*×]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 楽天の新APIはスペース区切り3語までしか受け付けないため、
// 重複・1文字トークンを除いた先頭3語に絞ってキーワードを組み立てる
function buildKeyword(brand, name) {
  const tokens = cleanKeyword(`${brand} ${name}`).split(" ").filter(Boolean);
  let filtered = tokens.filter((t) => t.length >= 2); // 型番などの1文字トークンを除去
  if (filtered.length === 0) filtered = tokens;        // 全部消えたら元に戻す
  const uniq = [...new Set(filtered)];                 // ブランド重複を除去
  return uniq.slice(0, 3).join(" ");
}

const BASE = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401";
let success = 0;
let stillFail = 0;

const targets = products.filter((p) => !results[p.id]);
console.log(`未取得の商品: ${targets.length} 件を再取得します`);

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
      stillFail++;
      console.log(`[NO IMAGE] id:${p.id} ${p.name}  (kw: ${keyword})`);
    }
  } catch (e) {
    stillFail++;
    console.log(`[ERROR] id:${p.id} ${p.name}  (kw: ${keyword}) → ${e.message}`);
  }

  await sleep(1100);
}

writeFileSync("image-urls.json", JSON.stringify(results, null, 2), "utf8");
console.log(`\n再取得完了: 新規成功 ${success} 件 / 依然失敗 ${stillFail} 件`);
console.log(`合計取得済み: ${Object.keys(results).length} 件`);

import { readFileSync, writeFileSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
if (!APP_ID || !ACCESS_KEY) {
  console.error("ERROR: 環境変数 RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY を設定してください");
  process.exit(1);
}

const SITE_URL = "https://moilum.sanji-104vt.workers.dev/";

// public/index.html から PRODUCTS の id/name/brand を抽出
const html = readFileSync("public/index.html", "utf8");
const startIdx = html.indexOf("const PRODUCTS=[");
const endIdx = html.indexOf("];\n", startIdx) + 2;
const block = html.slice(startIdx, endIdx);

const products = [];
const itemRegex = /\{[^{}]*"id"\s*:\s*(\d+)[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*"brand"\s*:\s*"([^"]+)"[^{}]*/g;
let m;
while ((m = itemRegex.exec(block)) !== null) {
  products.push({ id: parseInt(m[1]), name: m[2], brand: m[3] });
}

if (products.length === 0) {
  console.error("ERROR: 商品が1件も抽出できませんでした");
  process.exit(1);
}

console.log(`対象商品数: ${products.length}`);

const BASE = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401";
const results = {};
let success = 0;
let fail = 0;

for (const p of products) {
  const keyword = `${p.brand} ${p.name}`;
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
      headers: {
        "Referer": SITE_URL,
        "Origin": new URL(SITE_URL).origin,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const items = data.Items;
    if (items && items.length > 0 && items[0].mediumImageUrls && items[0].mediumImageUrls.length > 0) {
      const imgUrl = items[0].mediumImageUrls[0].replace(/\?_ex=\d+x\d+$/, "?_ex=300x300");
      results[p.id] = imgUrl;
      success++;
      console.log(`[OK] id:${p.id} ${p.name}`);
    } else {
      fail++;
      console.log(`[NO IMAGE] id:${p.id} ${p.name}`);
    }
  } catch (e) {
    fail++;
    console.log(`[ERROR] id:${p.id} ${p.name} → ${e.message}`);
  }

  await sleep(1100);
}

writeFileSync("image-urls.json", JSON.stringify(results, null, 2), "utf8");
console.log(`\n完了: 成功 ${success} 件 / 失敗・画像なし ${fail} 件`);
console.log("image-urls.json に保存しました");

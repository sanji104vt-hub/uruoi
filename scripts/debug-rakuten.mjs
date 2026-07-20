import fs from "node:fs";
const APP = process.env.RAKUTEN_APP_ID;
const KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFF = process.env.RAKUTEN_AFFILIATE_ID;
const ORIGIN = process.env.RAKUTEN_ORIGIN;

const ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601";

async function fetchQ(kw, hits = 10){
  const url = ENDPOINT +
    "?format=json&imageFlag=1&availability=1&sort=-reviewCount" +
    "&hits=" + hits +
    "&applicationId=" + APP +
    "&accessKey=" + KEY +
    "&affiliateId=" + AFF +
    "&keyword=" + encodeURIComponent(kw);
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Origin: ORIGIN } });
  return (await r.json()).Items || [];
}

const q = process.argv[2] || "メンズ 化粧水";
const items = await fetchQ(q, 15);
console.log(`=== "${q}" 受信${items.length}件のサンプル ===`);
for (const { Item: it } of items.slice(0, 15)){
  console.log(`\n  itemName: ${it.itemName?.slice(0, 90)}`);
  console.log(`  shopName: ${it.shopName}`);
  console.log(`  price: ${it.itemPrice} / reviewAverage: ${it.reviewAverage} / reviewCount: ${it.reviewCount}`);
}

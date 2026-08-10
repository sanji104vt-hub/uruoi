// 軽量なコラム個別ページを public/columns/{slug}.html に事前生成する。
// 本文は public/index.html の COLUMNS 配列を単一の真実の源として利用し、
// 比較表・レーダーチャート・関連商品も初回HTMLに直接展開する。

import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";
const GSC_VERIFICATION = "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q";
const GA4_ID = "G-BC0FBSZSWX";
const DEFAULT_UPDATED = "2026-07-18";
const PRICE_DATE = "2026年6月";

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const columnMeta = JSON.parse(fs.readFileSync("src/columns.json", "utf8"));
const indexHtml = fs.readFileSync("public/index.html", "utf8");
const skincareCount = products.filter(p =>
  p.productType !== "makeup" && p.status !== "previous_generation"
).length;

function extractColumns(html){
  const match = html.match(/const COLUMNS=\[([\s\S]*?)\n\];\r?\n\r?\nfunction renderColumnList/);
  if (!match) throw new Error("public/index.html から COLUMNS 配列を抽出できませんでした");
  // COLUMNS はデータリテラルだけで構成され、テンプレート式も含まないことを検証してから評価する。
  if (match[1].includes("${")) throw new Error("COLUMNS に未対応のテンプレート式があります");
  return Function(`"use strict"; return [${match[1]}\n];`)();
}

const columns = extractColumns(indexHtml);
const metaById = new Map(columnMeta.map(c => [c.id, c]));
const productById = new Map(products.map(p => [Number(p.id), p]));

const bodyIds = new Set(columns.map(c => c.id));
const metaIds = new Set(columnMeta.map(c => c.id));
const onlyBody = [...bodyIds].filter(id => !metaIds.has(id));
const onlyMeta = [...metaIds].filter(id => !bodyIds.has(id));
if (onlyBody.length || onlyMeta.length){
  throw new Error(`COLUMNS と src/columns.json の不一致: 本文のみ=${onlyBody.join(",") || "なし"} / metadataのみ=${onlyMeta.join(",") || "なし"}`);
}

function escHtml(value){
  return String(value ?? "").replace(/[<>&"']/g, c => ({
    "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
function escAttr(value){ return escHtml(value); }
function truncate(value, max){
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
function safeJson(value){
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
function substituteCount(value){
  return String(value || "").replace(/\{\{SKINCARE_COUNT\}\}/g, String(skincareCount));
}
function stripHtml(value){
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function productScores(p){
  const rating = Number(p.rating) || 0;
  const price = Math.max(1, Number(p.price) || 1);
  const editorial = Math.round(Math.min(5, Math.max(1, ((rating - 4.0) / 0.9 * 4 + 1))) * 10) / 10;
  const affordability = Math.round(Math.min(5, Math.max(1, 5 - (Math.log10(price) - 2.6) / (4.6 - 2.6) * 4)) * 10) / 10;
  let dryFit = 1;
  const moistWords = ["セラミド","ヒアルロン酸","保湿","スクワラン","コラーゲン","グリセリン","パンテノール"];
  if ((p.keyIngredients || []).some(i => moistWords.some(w => String(i).includes(w)))) dryFit += 1;
  if ((p.concern || []).includes("乾燥・かさつき")) dryFit += 2;
  if (["保湿クリーム","化粧水"].includes(p.category)) dryFit += 1;
  let sensitiveFit = 1;
  if ((p.skin || []).includes("敏感肌")) sensitiveFit += 3;
  else if ((p.skin || []).includes("全肌質")) sensitiveFit += 2;
  if ((p.concern || []).includes("肌荒れ・赤み")) sensitiveFit += 1;
  return { editorial, affordability, dryFit:Math.min(5,dryFit), sensitiveFit:Math.min(5,sensitiveFit) };
}

function radarSvg(p){
  const scores = productScores(p);
  const values = [scores.editorial, scores.affordability, scores.dryFit, scores.sensitiveFit];
  const labels = ["編集部","価格目安","乾燥分類","敏感分類"];
  const cx = 130, cy = 118, radius = 78;
  const point = (index, ratio) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / labels.length;
    return `${(cx + Math.cos(angle) * radius * ratio).toFixed(1)},${(cy + Math.sin(angle) * radius * ratio).toFixed(1)}`;
  };
  const grid = [0.2,0.4,0.6,0.8,1].map(level =>
    `<polygon points="${labels.map((_, i) => point(i, level)).join(" ")}" fill="none" stroke="var(--deep)" stroke-opacity="${level === 1 ? ".58" : ".28"}" stroke-width="1"/>`
  ).join("");
  const axes = labels.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${point(i, 1).split(",")[0]}" y2="${point(i, 1).split(",")[1]}" stroke="var(--deep)" stroke-opacity=".36"/>`).join("");
  const valuePolygon = values.map((value, i) => point(i, value / 5)).join(" ");
  const labelHtml = labels.map((label, i) => {
    const [x, y] = point(i, 1.22).split(",");
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
  }).join("");
  return `<svg class="radar-svg" viewBox="0 0 260 236" role="img" aria-label="${escAttr(p.name)}の参考指標。編集部${scores.editorial}、価格目安${scores.affordability}、乾燥分類${scores.dryFit}、敏感分類${scores.sensitiveFit}">
    ${grid}${axes}
    <polygon points="${valuePolygon}" fill="var(--iris-2)" fill-opacity=".78" stroke="var(--accent)" stroke-width="2"/>
    ${values.map((value, i) => `<circle cx="${point(i, value / 5).split(",")[0]}" cy="${point(i, value / 5).split(",")[1]}" r="3" fill="var(--accent)"/>`).join("")}
    <g class="radar-labels">${labelHtml}</g>
  </svg>`;
}

function productRows(ids){
  const items = ids.map(id => productById.get(id)).filter(Boolean);
  if (!items.length) return "";
  return `<div class="col-table-wrap"><table class="col-table">
    <thead><tr><th>商品名</th><th>参考価格</th><th>編集部評価</th><th>主要成分</th><th>向く肌タイプ</th></tr></thead>
    <tbody>${items.map(p => `<tr>
      <td><a class="product-link" href="/products/${p.id}" data-product-id="${p.id}" data-product-name="${escAttr(p.name)}">${escHtml(p.name)}</a><small>${escHtml(p.brand)}</small></td>
      <td class="ct-price">¥${Number(p.price || 0).toLocaleString()}</td>
      <td class="ct-rating">${p.rating ? `★${escHtml(p.rating)}` : "—"}</td>
      <td>${escHtml((p.keyIngredients || []).slice(0,3).join("、") || "—")}</td>
      <td>${escHtml((p.skin || []).join("・") || "—")}</td>
    </tr>`).join("")}</tbody>
  </table></div>
  <p class="data-note">※価格は${PRICE_DATE}時点の参考値。★はMoilum編集部の参考指標で、ユーザー評価ではありません。</p>`;
}

function radarCards(ids){
  const items = ids.map(id => productById.get(id)).filter(Boolean);
  if (!items.length) return "";
  return `<div class="col-radar-box"><div class="col-radar-grid">
    ${items.map(p => `<div class="radar-card"><div class="cr-name"><a class="product-link" href="/products/${p.id}" data-product-id="${p.id}" data-product-name="${escAttr(p.name)}">${escHtml(truncate(p.name, 28))}</a></div>${radarSvg(p)}</div>`).join("")}
  </div><p class="data-note center">※価格・主要成分・掲載肌タイプ・掲載悩み分類などから機械整理した参考指標です。乾燥分類・敏感分類は効果や安全性を保証しません。</p></div>`;
}

function relatedProductCards(ids, label = "この記事で紹介した商品"){
  const items = ids.map(id => productById.get(id)).filter(Boolean);
  if (!items.length) return "";
  return `<section class="related-products"><h2>${escHtml(label)}</h2><div class="related-grid">
    ${items.map(p => `<a class="related-card product-link" href="/products/${p.id}" data-product-id="${p.id}" data-product-name="${escAttr(p.name)}">
      ${p.image ? `<img src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy" decoding="async">` : `<div class="no-image" aria-hidden="true">${escHtml(p.icon || "💧")}</div>`}
      <span class="rc-brand">${escHtml(p.brand)}</span><strong>${escHtml(p.name)}</strong><span class="rc-price">¥${Number(p.price || 0).toLocaleString()}</span>
    </a>`).join("")}
  </div></section>`;
}

function idsFromAttributes(attrs){
  const match = attrs.match(/data-ids=["']([^"']+)["']/i);
  return match ? match[1].split(",").map(x => Number(x.trim())).filter(Number.isFinite) : [];
}

function expandBody(rawBody){
  let body = substituteCount(rawBody);
  body = body.replace(/<div\s+class=["']col-compare["']([^>]*)><\/div>/gi, (_, attrs) => productRows(idsFromAttributes(attrs)));
  body = body.replace(/<div\s+class=["']col-radar["']([^>]*)><\/div>/gi, (_, attrs) => radarCards(idsFromAttributes(attrs)));
  body = body.replace(/<div\s+class=["']section-rec["']([^>]*)><\/div>/gi, (_, attrs) => relatedProductCards(idsFromAttributes(attrs), "このセクションでおすすめの商品"));
  // SPA専用の診断ボタンは、軽量ページでもキーボード・クローラーが辿れる通常リンクにする。
  body = body.replace(/<button\s+onclick=["']showPage\(["']diagnosis["']\)["']>([\s\S]*?)<\/button>/gi, '<a class="diagnosis-link" href="/?page=diagnosis">$1</a>');
  return body;
}

function extractFaqs(body){
  const faqs = [];
  // 各FAQは q/a の直後に閉じる単純な構造なので、開始位置ごとに次の項目までを調べる。
  const starts = [...body.matchAll(/<div\s+class=["']col-faq-item["'][^>]*>/gi)];
  for (let i = 0; i < starts.length; i++){
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
    const chunk = body.slice(start, end);
    const q = chunk.match(/<div\s+class=["']q["'][^>]*>([\s\S]*?)<\/div>/i);
    const a = chunk.match(/<div\s+class=["']a["'][^>]*>([\s\S]*?)<\/div>/i);
    if (q && a) faqs.push({ question: stripHtml(q[1]), answer: stripHtml(a[1]) });
  }
  return faqs;
}

function articleJsonLd(column, description, canonical, updated){
  return {
    "@context":"https://schema.org",
    "@type":"Article",
    "headline":column.title,
    "description":description,
    "articleSection":column.cat,
    "dateModified":updated,
    "mainEntityOfPage":{"@type":"WebPage","@id":canonical},
    "image":OGP_IMAGE,
    "author":{"@type":"Organization","name":"Moilum編集部","url":SITE_ORIGIN + "/"},
    "publisher":{"@type":"Organization","name":"Moilum","logo":{"@type":"ImageObject","url":OGP_IMAGE}}
  };
}

function breadcrumbJsonLd(column, canonical){
  return {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      {"@type":"ListItem","position":1,"name":"Moilum","item":SITE_ORIGIN + "/"},
      {"@type":"ListItem","position":2,"name":"スキンケアコラム","item":SITE_ORIGIN + "/columns"},
      {"@type":"ListItem","position":3,"name":column.title,"item":canonical}
    ]
  };
}

function faqJsonLd(faqs){
  return {
    "@context":"https://schema.org",
    "@type":"FAQPage",
    "mainEntity":faqs.map(faq => ({
      "@type":"Question",
      "name":faq.question,
      "acceptedAnswer":{"@type":"Answer","text":faq.answer}
    }))
  };
}

function getMoreColumns(column){
  const others = columns.filter(c => c.id !== column.id);
  return [
    ...others.filter(c => c.cat === column.cat),
    ...others.filter(c => c.cat !== column.cat)
  ].slice(0, 4);
}

function buildColumnHtml(column){
  const meta = metaById.get(column.id) || {};
  const description = truncate(substituteCount(meta.description || column.description || column.excerpt), 160);
  const title = truncate(`${column.title}｜Moilum スキンケアコラム`, 68);
  const canonical = `${SITE_ORIGIN}/columns/${column.id}`;
  const updated = column.updated || meta.updated || DEFAULT_UPDATED;
  const body = expandBody(column.body || "");
  const faqs = extractFaqs(body);
  const moreColumns = getMoreColumns(column);
  const relatedIds = [...new Set((column.related || []).map(Number))].filter(id => productById.has(id));
  const schemas = [articleJsonLd(column, description, canonical, updated), breadcrumbJsonLd(column, canonical)];
  if (faqs.length) schemas.push(faqJsonLd(faqs));

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escAttr(description)}">
<meta name="google-site-verification" content="${GSC_VERIFICATION}" />
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OGP_IMAGE}">
<meta property="og:site_name" content="Moilum">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(description)}">
<meta name="twitter:image" content="${OGP_IMAGE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;1,500&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Old+Mincho:wght@400;700&display=swap" rel="stylesheet">
${schemas.map(schema => `<script type="application/ld+json">${safeJson(schema)}</script>`).join("\n")}
<style>
:root{--base:#FBF9F6;--ink:#2B2622;--water:#DCEAEC;--deep:#B7CDD3;--iris-1:#E8D5E0;--iris-2:#D5E4E8;--iris-3:#E4E8D5;--accent:#6f99a4;--border:#dde6e6;--txt2:#59696c;--txt3:#829497;--radius:16px;--radius-sm:12px;--font-head:"Zen Old Mincho",serif;--font-body:"Zen Kaku Gothic New","Yu Gothic",sans-serif;--font-num:"Cormorant",serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--base);color:var(--ink);font-family:var(--font-body);line-height:1.85;-webkit-font-smoothing:antialiased}a{color:inherit}img{max-width:100%}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px clamp(16px,4vw,42px);border-bottom:1px solid var(--border);background:rgba(255,255,255,.94);position:sticky;top:0;z-index:10;backdrop-filter:blur(10px)}.logo{font-weight:800;font-size:21px;text-decoration:none}.logo span{color:var(--accent)}.column-home{font-size:13px;color:var(--accent);font-weight:700;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.pr-banner{background:var(--water);color:var(--txt2);font-size:12px;padding:8px 16px;text-align:center;line-height:1.6}
article{max-width:860px;margin:0 auto;padding:28px clamp(16px,4vw,36px) 64px}.crumb{font-size:12px;color:var(--txt3);margin-bottom:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.crumb a{color:var(--accent)}.crumb .sep{margin:0 7px}.cat-tag{display:inline-block;background:var(--water);color:var(--accent);font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:13px}
h1,h2,h3{font-family:var(--font-head);line-height:1.5;color:var(--ink)}h1{font-size:clamp(25px,5vw,38px);margin:0 0 12px}h2{font-size:clamp(20px,3.5vw,26px);margin:42px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--deep)}h3{font-size:18px;margin:28px 0 10px}p{font-size:15px;margin:0 0 18px}ul,ol{padding-left:1.5em;margin:0 0 20px}li{margin-bottom:7px}.article-meta{font-size:12px;color:var(--txt3);border-bottom:1px solid var(--border);padding-bottom:18px;margin-bottom:28px}.article-lead{color:var(--txt2)}article a{color:var(--accent);text-underline-offset:3px}
.col-conclusion{background:var(--water);border-left:4px solid var(--accent);border-radius:var(--radius);padding:17px 20px;margin:20px 0 28px}.col-conclusion .cc-label{font-size:12px;font-weight:800;color:var(--accent);letter-spacing:1px;margin-bottom:7px}.col-conclusion p{margin:0;font-size:14px;font-weight:500}
.col-table-wrap{overflow-x:auto;margin:18px 0 10px;border:1px solid var(--border);border-radius:var(--radius);background:#fff;-webkit-overflow-scrolling:touch}.col-table{width:100%;border-collapse:collapse;font-size:13px;min-width:650px}.col-table th,.col-table td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}.col-table thead th{background:var(--water);font-size:12px;color:var(--txt2);white-space:nowrap}.col-table tbody tr:last-child td{border-bottom:none}.col-table td:first-child{font-weight:700;min-width:160px}.col-table small{display:block;color:var(--txt3);font-weight:400;margin-top:3px}.ct-price{color:var(--accent);font-weight:800;white-space:nowrap}.ct-rating{white-space:nowrap}.data-note{font-size:11px;color:var(--txt3);margin:8px 0 22px}.data-note.center{text-align:center;margin-bottom:0}
.col-bars{margin:18px 0 24px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:18px}.col-bars .cb-title{font-size:13px;font-weight:800;color:var(--txt2);margin-bottom:14px}.col-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}.col-bar-label{flex:none;width:130px;font-size:12px;font-weight:600;line-height:1.4}.col-bar-track{flex:1;height:18px;background:var(--water);border-radius:9px;overflow:hidden}.col-bar-fill{height:100%;background:linear-gradient(90deg,var(--deep),var(--accent));border-radius:9px}.col-bar-val{flex:none;width:76px;font-size:12px;font-weight:800;color:var(--accent);text-align:right;font-family:var(--font-num)}
.col-radar-box{margin:18px 0 26px;background:linear-gradient(145deg,#fff,var(--water));border:1px solid var(--border);border-radius:var(--radius);padding:18px}.col-radar-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.radar-card{background:rgba(255,255,255,.75);border-radius:var(--radius-sm);padding:12px}.cr-name{font-size:13px;font-weight:800;text-align:center;min-height:44px;display:flex;align-items:center;justify-content:center}.radar-svg{display:block;width:100%;max-width:300px;margin:auto}.radar-labels{font-size:11px;fill:var(--txt2);font-family:var(--font-body)}
.col-unfit{background:#fff;border:1px solid var(--deep);border-radius:var(--radius);padding:18px;margin:24px 0}.col-unfit h3{margin-top:0}.col-faq{margin:30px 0}.col-faq h3{font-size:19px}.col-faq-item{border:1px solid var(--border);border-radius:var(--radius-sm);padding:15px 17px;margin-bottom:10px;background:#fff}.col-faq-item .q{font-size:14px;font-weight:700;margin-bottom:8px}.col-faq-item .q::before{content:"Q. ";color:var(--accent)}.col-faq-item .a{font-size:13.5px;color:var(--txt2)}.col-faq-item .a::before{content:"A. ";color:var(--deep);font-weight:800}
.col-cta{background:linear-gradient(135deg,var(--water),var(--iris-2));border-radius:var(--radius);padding:22px;text-align:center;margin:28px 0}.col-cta p{margin-bottom:12px}.diagnosis-link{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:#fff;text-decoration:none;border-radius:24px;padding:11px 26px;min-height:46px;font-size:14px;font-weight:700}
.related-products{margin:34px 0;padding-top:8px}.related-products h2{font-size:21px}.related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}.related-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:11px;text-decoration:none;transition:transform .18s,box-shadow .18s}.related-card:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(43,38,34,.07)}.related-card img,.related-card .no-image{width:100%;aspect-ratio:1/1;height:auto;object-fit:contain;border-radius:10px;background:#fff;margin-bottom:8px}.related-card .no-image{display:flex;align-items:center;justify-content:center;background:var(--water);font-size:42px}.rc-brand{font-size:10px;color:var(--txt3)}.related-card strong{font-size:12px;line-height:1.5;margin:3px 0}.rc-price{margin-top:auto;color:var(--accent);font-weight:800;font-size:13px}
.more-columns{margin-top:44px;border-top:1px solid var(--border);padding-top:28px}.more-columns h2{border:0;padding:0;margin-top:0}.more-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.more-card{display:block;background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:15px;text-decoration:none}.more-card small{color:var(--accent);font-weight:700}.more-card strong{display:block;font-family:var(--font-head);line-height:1.55;margin:5px 0}.more-card span{font-size:12px;color:var(--txt3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.disclaimer{font-size:11px;color:var(--txt3);margin-top:28px}.backhome{display:inline-flex;align-items:center;min-height:44px;margin-top:24px;color:var(--accent);font-weight:700}footer{background:#fff;border-top:1px solid var(--border);padding:25px clamp(16px,4vw,42px);font-size:12px;color:var(--txt3)}footer a{margin-right:14px;color:var(--accent)}
a:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
@media(max-width:600px){article{padding:22px 16px 44px}.more-grid{grid-template-columns:1fr}.col-bar-row{align-items:flex-start;flex-wrap:wrap}.col-bar-label{width:100%}.col-bar-val{width:62px}.related-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.topbar{padding:10px 16px}}
</style>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA4_ID}');
gtag('event','column_view',{column_id:${safeJson(column.id)},column_title:${safeJson(column.title)},column_category:${safeJson(column.cat)}});
</script>
</head>
<body>
<header class="topbar"><a class="logo" href="/">Moi<span>lum</span></a><a class="column-home" href="/columns">コラム一覧</a></header>
<div class="pr-banner">本サイトはアフィリエイト広告を利用しています。商品選定・記事内容はMoilum編集部が独自に作成しています。</div>
<article>
  <nav class="crumb"><a href="/">ホーム</a><span class="sep">›</span><a href="/columns">コラム</a><span class="sep">›</span><span>${escHtml(truncate(column.title, 28))}</span></nav>
  <span class="cat-tag">${escHtml(column.cat)}</span>
  <h1>${escHtml(column.title)}</h1>
  <div class="article-meta">執筆：Moilum編集部（一行／個人運営） ・ ${escHtml(column.readtime || "約8分")}<br>最終更新：${escHtml(updated)} ／ 掲載商品データ基準日：2026-06</div>
  ${body}
  ${relatedProductCards(relatedIds)}
  <p class="disclaimer">※本記事は一般的な情報提供を目的としたもので、医学的助言や効果を保証するものではありません。肌トラブルが続く場合は皮膚科専門医にご相談ください。</p>
  <section class="more-columns"><h2>あわせて読みたい記事</h2><div class="more-grid">
    ${moreColumns.map(c => `<a class="more-card" href="/columns/${c.id}"><small>${escHtml(c.cat)}</small><strong>${escHtml(c.title)}</strong><span>${escHtml(c.excerpt)}</span></a>`).join("")}
  </div></section>
  <a class="backhome" href="/columns">← コラム一覧に戻る</a>
</article>
<footer><div><a href="/">ホーム</a><a href="/about/rating-policy">評価方針</a><a href="/about/sources">情報源</a></div><p>© Moilum</p></footer>
<script>
(function(){
  var sent75=false;
  function trackDepth(){
    if(sent75)return;
    var root=document.documentElement;
    var max=root.scrollHeight-window.innerHeight;
    if(max>0&&window.scrollY/max>=.75){
      sent75=true;
      gtag('event','column_scroll_75',{column_id:${safeJson(column.id)},column_title:${safeJson(column.title)}});
    }
  }
  window.addEventListener('scroll',trackDepth,{passive:true});
  document.querySelectorAll('.product-link[data-product-id]').forEach(function(link){
    link.addEventListener('click',function(){
      gtag('event','product_link_click',{source:'column',column_id:${safeJson(column.id)},product_id:this.dataset.productId,product_name:this.dataset.productName});
    });
  });
  var diagnosis=document.querySelector('.diagnosis-link');
  if(diagnosis)diagnosis.addEventListener('click',function(){gtag('event','diagnosis_cta_click',{source:'column',column_id:${safeJson(column.id)}})});
})();
</script>
</body>
</html>
`;
}

const outDir = "public/columns";
fs.mkdirSync(outDir, { recursive: true });

const expectedFiles = new Set(columns.map(c => `${c.id}.html`));
for (const file of fs.readdirSync(outDir)){
  if (file.endsWith(".html") && !expectedFiles.has(file)) fs.unlinkSync(path.join(outDir, file));
}

let faqPages = 0;
let comparisonPages = 0;
let radarPages = 0;
for (const column of columns){
  const html = buildColumnHtml(column).replace(/[ \t]+$/gm, "");
  fs.writeFileSync(path.join(outDir, `${column.id}.html`), html, "utf8");
  if (html.includes('"@type":"FAQPage"')) faqPages++;
  if (html.includes('class="col-table"')) comparisonPages++;
  if (html.includes('class="radar-svg"')) radarPages++;
}

const files = fs.readdirSync(outDir).filter(file => file.endsWith(".html"));
const sizes = files.map(file => fs.statSync(path.join(outDir, file)).size);
const average = Math.round(sizes.reduce((sum, size) => sum + size, 0) / sizes.length);
console.log(`✓ 生成完了: ${files.length} コラムページ`);
console.log(`  比較表あり: ${comparisonPages} / レーダーあり: ${radarPages} / FAQ構造化データあり: ${faqPages}`);
console.log(`  ファイルサイズ: 平均 ${(average / 1024).toFixed(1)}KB / 最小 ${(Math.min(...sizes) / 1024).toFixed(1)}KB / 最大 ${(Math.max(...sizes) / 1024).toFixed(1)}KB`);

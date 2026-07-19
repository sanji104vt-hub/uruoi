// 軽量な商品個別ページ (/public/products/{id}.html) を207件分ビルドする。
// Sillageの /public/columns/{slug}.html と同パターン。
// Workerは /products/{id} → /products/{id}.html にリライトするだけ。
// GA4/GSCタグは含めるが、SPA本体のJSは含めない（軽量化＆重複コンテンツ解消）。

import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";
const GSC_VERIFICATION = "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q";
const GA4_ID = "G-BC0FBSZSWX";

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));

// ===== SPA(public/index.html)の productScores / prosConsData と同一ロジック =====
// 静的商品ページにもメリット/デメリット/向いている人/向いていない人を出すため、
// 同じ関数を移植する(新規データ捏造なし、既存アルゴリズムをそのまま再利用)。
function productScores(p){
  const overall=Math.round(((p.rating-4.0)/0.9*4+1)*10)/10;
  const popularity=Math.min(5,Math.round((Math.log10(p.reviews+1)/Math.log10(16000)*5)*10)/10);
  const priceScore=Math.max(1,5-(Math.log10(p.price)-2.6)/(4.6-2.6)*4);
  const cospa=Math.round(Math.min(5,(priceScore*0.7+p.rating/4.9*5*0.3))*10)/10;
  let moist=2.8+(p.rating-4.2)*1.5;
  const moistWords=["セラミド","ヒアルロン酸","保湿","スクワラン","コラーゲン","グリセリン","パンテノール"];
  if((p.keyIngredients||[]).some(i=>moistWords.some(w=>i.includes(w)))) moist+=1.2;
  if((p.concern||[]).includes("乾燥・かさつき")) moist+=0.5;
  if(["保湿クリーム","化粧水"].includes(p.category)) moist+=0.3;
  moist=Math.round(Math.min(5,Math.max(1,moist))*10)/10;
  let mild=2.8+(p.rating-4.2)*1.2;
  if((p.skin||[]).includes("敏感肌")) mild+=1.3;
  const mildWords=["CICA","ツボクサ","パンテノール","アラントイン","ドクダミ","グリチルリチン"];
  if((p.keyIngredients||[]).some(i=>mildWords.some(w=>i.includes(w)))) mild+=0.7;
  if((p.concern||[]).includes("肌荒れ・赤み")) mild+=0.4;
  mild=Math.round(Math.min(5,Math.max(1,mild))*10)/10;
  return {overall,popularity,cospa,moist,mild};
}
function prosConsData(p){
  const s=productScores(p);
  const pros=[], cons=[], fit=[], unfit=[];
  if(p.rating>=4.6) pros.push(`ユーザー評価が高い（★${p.rating}）`);
  if(p.reviews>=4000) pros.push(`${Math.round(p.reviews/1000)}千件超のレビューで実績豊富`);
  if(s.cospa>=4.3) pros.push("価格に対する満足度が高くコスパ良好");
  if(s.moist>=4.5) pros.push("保湿力が高く乾燥対策に向く");
  if(s.mild>=4.5) pros.push("低刺激で敏感肌でも使いやすい");
  if(p.price<=1500) pros.push("手に取りやすい価格で続けやすい");
  if((p.keyIngredients||[]).length>=4) pros.push("複数の有効成分を配合");
  if(p.price>=8000) cons.push("価格が高めで継続にはコストがかかる");
  if(s.mild<3.5) cons.push("敏感肌の人は刺激を感じる可能性");
  if(p.reviews<1500) cons.push("レビュー件数がまだ少なめ");
  if(s.cospa<3) cons.push("コスパ面では割高に感じる場合がある");
  if(!pros.length) pros.push("バランスの取れた使い心地");
  if(!cons.length) cons.push("特に大きな欠点は見当たらないが、肌との相性は個人差あり");
  (p.skin||[]).forEach(sk=>{ if(sk!=="全肌質") fit.push(`${sk}の人`); });
  if((p.skin||[]).includes("全肌質")) fit.push("肌質を選ばず使いたい人");
  (p.concern||[]).slice(0,2).forEach(c=>fit.push(`${c}が気になる人`));
  if(s.cospa>=4.3) fit.push("コスパを重視する人");
  if(p.price>=8000) unfit.push("プチプラ重視の人");
  if(s.mild<3.5) unfit.push("刺激にとても敏感な人");
  const allSkin=["乾燥肌","脂性肌","混合肌","敏感肌","普通肌"];
  const notFor=allSkin.filter(sk=>!(p.skin||[]).includes(sk)&&!(p.skin||[]).includes("全肌質"));
  if(notFor.length&&notFor.length<=2) unfit.push(`${notFor.join("・")}の人には他の選択肢も`);
  if(!unfit.length) unfit.push("特になし（幅広い人に使いやすい）");
  return {pros,cons,fit:[...new Set(fit)].slice(0,4),unfit:unfit.slice(0,3)};
}

function escHtml(s){
  return String(s == null ? "" : s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&#39;"}[c]));
}
function escAttr(s){ return escHtml(s); }
function truncate(s, n){
  const str = String(s || "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function buildProductJsonLd(p){
  const obj = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": p.name,
    "brand": { "@type": "Brand", "name": p.brand },
    "description": p.desc,
    "category": p.category,
    "url": `${SITE_ORIGIN}/products/${p.id}`
  };
  if (p.image) obj.image = p.image;
  if (p.price != null && p.price > 0){
    obj.offers = {
      "@type": "Offer",
      "price": p.price,
      "priceCurrency": "JPY",
      "availability": "https://schema.org/InStock",
      "url": p.purchase || `${SITE_ORIGIN}/products/${p.id}`
    };
  }
  // aggregateRatingは実データがある商品にのみ出力（rating >0 && reviews > 0）
  if (p.rating > 0 && p.reviews > 0){
    obj.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": p.rating,
      "reviewCount": p.reviews,
      "bestRating": 5,
      "worstRating": 1
    };
  }
  return obj;
}

function buildBreadcrumbJsonLd(p){
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Moilum", "item": SITE_ORIGIN + "/" },
      { "@type": "ListItem", "position": 2, "name": p.category, "item": SITE_ORIGIN + "/" },
      { "@type": "ListItem", "position": 3, "name": p.name, "item": `${SITE_ORIGIN}/products/${p.id}` }
    ]
  };
}

function getRelatedProducts(p, all){
  // 同カテゴリで、自分以外の商品からrating順で最大3件
  return all
    .filter(x => x.id !== p.id && x.category === p.category)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3);
}

function buildProductHtml(p, all){
  const title = truncate(`${p.name}｜${p.brand}｜Moilum`, 68);
  const desc = truncate(`${p.name}（${p.brand}）を独自スコアで比較。参考価格 ¥${(p.price || 0).toLocaleString()}／カテゴリ ${p.category}。${p.desc || ""}`, 156);
  const canonical = `${SITE_ORIGIN}/products/${p.id}`;
  const ogImage = p.image || OGP_IMAGE;
  const related = getRelatedProducts(p, all);
  const productLd = buildProductJsonLd(p);
  const crumbLd = buildBreadcrumbJsonLd(p);
  const hasRating = p.rating > 0 && p.reviews > 0;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="google-site-verification" content="${GSC_VERIFICATION}" />
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="product">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${escAttr(ogImage)}">
<meta property="og:site_name" content="Moilum">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(desc)}">
<meta name="twitter:image" content="${escAttr(ogImage)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;700&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(productLd)}</script>
<script type="application/ld+json">${JSON.stringify(crumbLd)}</script>
<style>
:root{--base:#FBF9F6;--ink:#2B2622;--water:#DCEAEC;--deep:#B7CDD3;--iris-2:#D5E4E8;--accent:#7FA8B3;--border:#e3e9e5;--txt2:#5a6b6e;--txt3:#8fa3a7}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--base);color:var(--ink);font-family:"Zen Kaku Gothic New","Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;line-height:1.75;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Zen Old Mincho",serif;font-weight:700}
a{color:inherit;text-decoration:none}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px clamp(16px,4vw,40px);border-bottom:1px solid var(--border);background:#fff;position:sticky;top:0;z-index:10}
.logo{font-weight:800;font-size:20px;letter-spacing:-.5px}
.logo span{color:var(--accent)}
.pr-banner{background:var(--water);color:var(--txt2);font-size:12px;padding:8px 16px;text-align:center;line-height:1.6}
article{max-width:820px;margin:0 auto;padding:28px clamp(16px,4vw,32px) 60px}
.crumb{font-size:12px;color:var(--txt3);margin-bottom:20px}
.crumb a{color:var(--accent)}
.crumb .sep{margin:0 8px;color:var(--txt3)}
.cat-tag{display:inline-block;background:var(--water);color:var(--accent);font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:.5px;margin-bottom:14px}
h1{font-size:clamp(22px,4vw,30px);line-height:1.45;margin-bottom:12px}
.brand{color:var(--txt2);font-size:14px;margin-bottom:18px}
.product-img{width:100%;max-width:420px;height:auto;background:#fff;border-radius:16px;border:1px solid var(--border);object-fit:contain;aspect-ratio:1/1;padding:12px;margin:0 auto 24px;display:block}
.no-image{width:100%;max-width:420px;aspect-ratio:1/1;background:linear-gradient(160deg,var(--water),var(--iris-2));border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:72px;margin:0 auto 24px}
.meta{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}
.meta-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px}
.meta-row:last-child{border-bottom:none}
.meta-label{color:var(--txt3);font-weight:600}
.meta-val{font-weight:700;color:var(--ink);text-align:right;max-width:60%}
.price{font-size:28px;font-weight:800;color:var(--accent);font-family:"Cormorant","Zen Old Mincho",serif}
.price-note{font-size:11px;color:var(--txt3);font-weight:400;margin-left:6px}
.rating{color:#f5a623;letter-spacing:2px;font-size:16px}
.desc{font-size:15px;line-height:1.9;color:var(--ink);background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}
.ingredients{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}
.ingredients h2{font-size:16px;margin-bottom:12px}
.ing-list{display:flex;flex-wrap:wrap;gap:8px}
.ing-item{background:var(--water);color:var(--accent);font-size:12px;padding:5px 12px;border-radius:20px;font-weight:600}
.suitability{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}
.suitability h2{font-size:16px;margin-bottom:10px;color:var(--ink)}
.suit-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.suit-row:last-child{margin-bottom:0}
.suit-label{font-size:13px;font-weight:700;color:var(--txt2);min-width:100px}
.suit-chips{display:flex;gap:6px;flex-wrap:wrap}
.suit-chip{background:var(--water);color:var(--accent);font-size:12px;padding:4px 10px;border-radius:20px;font-weight:600}
.proscons{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}
.proscons h2{font-size:16px;margin-bottom:14px}
.pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.pc-box{border-radius:12px;padding:14px;font-size:13.5px;line-height:1.7}
.pc-box ul{margin:6px 0 0 18px;padding:0}
.pc-box li{margin-bottom:4px}
.pc-title{font-weight:700;font-size:13px;margin-bottom:2px}
.pc-pros{background:#eefaf0;border:1px solid #cfe9d4;color:#25553a}
.pc-cons{background:#fdf0ee;border:1px solid #f4d5cf;color:#8a4a3f}
.pc-fit{background:#eff6fa;border:1px solid #d3e6f0;color:#2e5772}
.pc-unfit{background:#fdf6ec;border:1px solid #f2e0c1;color:#8a6a2f}
.pc-note{font-size:11px;color:var(--txt3);margin-top:6px;line-height:1.6}
@media(max-width:480px){.pc-grid{grid-template-columns:1fr}}
.pr-tag{display:inline-block;background:var(--txt3);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px;margin-right:6px;vertical-align:middle}
.buy-note{font-size:12px;color:var(--txt3);margin:20px 0 10px}
.buy-btns{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:30px}
.buy-btn{flex:1;min-width:120px;min-height:48px;padding:14px 20px;border-radius:12px;font-size:15px;font-weight:800;color:#fff;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.buy-btn.amazon{background:#ff9900;color:#1a1a1a}
.buy-btn.rakuten{background:#bf0000}
.buy-btn.qoo10{background:#e60012}
.related{margin-top:40px;padding-top:24px;border-top:1px solid var(--border)}
.related h2{font-size:18px;margin-bottom:16px}
.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.rel-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px;transition:transform .15s,box-shadow .2s;color:inherit;text-decoration:none;display:block}
.rel-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(43,38,34,.08)}
.rel-img{width:100%;aspect-ratio:1/1;background:#fff;border-radius:8px;object-fit:contain;margin-bottom:8px}
.rel-noimg{width:100%;aspect-ratio:1/1;background:var(--water);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:8px}
.rel-name{font-size:13px;font-weight:700;line-height:1.4;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:4px}
.rel-brand{font-size:11px;color:var(--txt3);margin-bottom:6px}
.rel-price{font-size:14px;font-weight:800;color:var(--accent)}
.backhome{display:inline-block;margin-top:30px;color:var(--accent);font-size:14px;font-weight:600;border-bottom:1px solid var(--accent);padding-bottom:2px}
footer{background:#fff;padding:24px clamp(16px,4vw,40px);border-top:1px solid var(--border);font-size:12px;color:var(--txt3);line-height:1.8;margin-top:40px}
footer a{color:var(--accent);margin-right:14px}
@media(max-width:600px){article{padding:20px 16px 40px}.buy-btn{min-width:100%}}
</style>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA4_ID}');
</script>
</head>
<body>
<header class="topbar">
  <a class="logo" href="/">Moi<span>lum</span></a>
</header>
<div class="pr-banner">本サイトはアフィリエイト広告（Amazon・楽天・Qoo10等）を利用しています。商品の選定・評価は編集部が独自に行っています。価格・在庫は各販売サイトでご確認ください。</div>
<article>
  <nav class="crumb"><a href="/">ホーム</a><span class="sep">›</span><span>${escHtml(p.category)}</span><span class="sep">›</span><span>${escHtml(truncate(p.name, 26))}</span></nav>
  <span class="cat-tag">${escHtml(p.category)}</span>
  <h1>${escHtml(p.name)}</h1>
  <div class="brand">${escHtml(p.brand)}${p.origin ? " ・ " + escHtml(p.origin) : ""}</div>
  ${p.image
    ? `<img class="product-img" src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy">`
    : `<div class="no-image" aria-hidden="true">${escHtml(p.icon || "💧")}</div>`}
  <div class="meta">
    <div class="meta-row">
      <span class="meta-label">参考価格</span>
      <span class="meta-val price">¥${(p.price || 0).toLocaleString()}<span class="price-note">（2026年6月時点）</span></span>
    </div>
    ${hasRating ? `<div class="meta-row">
      <span class="meta-label">Moilum編集部評価</span>
      <span class="meta-val"><span class="rating">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))}</span> ${p.rating} <span style="color:var(--txt3);font-weight:500;font-size:12px">（参考レビュー件数${p.reviews.toLocaleString()}件）</span></span>
    </div>
    <div style="font-size:11px;color:var(--txt3);line-height:1.6;padding:4px 0 10px">※編集部が独自に集計した参考値です。特定のECサイトの平均評価を転載したものではありません。<a href="/about/rating-policy" style="color:var(--accent)">算出基準</a></div>` : ""}
    <div class="meta-row">
      <span class="meta-label">カテゴリ</span>
      <span class="meta-val">${escHtml(p.category)}</span>
    </div>
    ${p.origin ? `<div class="meta-row"><span class="meta-label">原産国</span><span class="meta-val">${escHtml(p.origin)}</span></div>` : ""}
  </div>
  <div class="desc">${escHtml(p.desc || "")}</div>
  ${Array.isArray(p.keyIngredients) && p.keyIngredients.length ? `<div class="ingredients">
    <h2>主要成分</h2>
    <div class="ing-list">${p.keyIngredients.map(i => `<span class="ing-item">${escHtml(i)}</span>`).join("")}</div>
  </div>` : ""}
  ${(Array.isArray(p.skin) && p.skin.length) || (Array.isArray(p.concern) && p.concern.length) ? `<div class="suitability">
    <h2>こんな人に向いています</h2>
    ${Array.isArray(p.skin) && p.skin.length ? `<div class="suit-row"><span class="suit-label">適した肌タイプ</span><div class="suit-chips">${p.skin.map(s => `<span class="suit-chip">${escHtml(s)}</span>`).join("")}</div></div>` : ""}
    ${Array.isArray(p.concern) && p.concern.length ? `<div class="suit-row"><span class="suit-label">対応する悩み</span><div class="suit-chips">${p.concern.map(c => `<span class="suit-chip">${escHtml(c)}</span>`).join("")}</div></div>` : ""}
  </div>` : ""}
  ${(() => {
    const pc = prosConsData(p);
    return `<div class="proscons">
    <h2>メリット・デメリット / 向いている人・向かない人</h2>
    <div class="pc-grid">
      <div class="pc-box pc-pros">
        <div class="pc-title">👍 メリット</div>
        <ul>${pc.pros.map(x => `<li>${escHtml(x)}</li>`).join("")}</ul>
      </div>
      <div class="pc-box pc-cons">
        <div class="pc-title">👎 デメリット</div>
        <ul>${pc.cons.map(x => `<li>${escHtml(x)}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="pc-grid">
      <div class="pc-box pc-fit">
        <div class="pc-title">⭕ 向いている人</div>
        <ul>${pc.fit.map(x => `<li>${escHtml(x)}</li>`).join("")}</ul>
      </div>
      <div class="pc-box pc-unfit">
        <div class="pc-title">△ 向かない人</div>
        <ul>${pc.unfit.map(x => `<li>${escHtml(x)}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="pc-note">※ Moilum編集部が商品データ（評価・レビュー数・価格・成分・対応肌タイプ）から自動集計した参考情報です。実際の使用感には個人差があります。</div>
  </div>`;
  })()}
  <div class="buy-note"><span class="pr-tag">PR</span>以下は広告リンクです。掲載価格は2026年6月時点の参考値です。最新の価格・在庫は各販売サイトでご確認ください。</div>
  <div class="buy-btns">
    <a class="buy-btn amazon" href="https://www.amazon.co.jp/s?k=${encodeURIComponent(p.brand + " " + p.name)}" rel="nofollow sponsored noopener" target="_blank">Amazonで見る</a>
    <a class="buy-btn rakuten" href="https://hb.afl.rakuten.co.jp/hgc/54ebba1a.f0b1f403.54ebba1b.9f0abc5f/?pc=${encodeURIComponent("https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(p.brand + " " + p.name) + "/")}" rel="nofollow sponsored noopener" target="_blank">楽天で見る</a>
    <a class="buy-btn qoo10" href="https://www.qoo10.jp/s/?keyword=${encodeURIComponent(p.brand + " " + p.name)}" rel="nofollow sponsored noopener" target="_blank">Qoo10で見る</a>
  </div>
  ${related.length ? `<div class="related">
    <h2>同じカテゴリのおすすめ</h2>
    <div class="rel-grid">
      ${related.map(r => `<a class="rel-card" href="/products/${r.id}">
        ${r.image ? `<img class="rel-img" src="${escAttr(r.image)}" alt="${escAttr(r.name)}" loading="lazy">` : `<div class="rel-noimg" aria-hidden="true">${escHtml(r.icon || "💧")}</div>`}
        <div class="rel-name">${escHtml(r.name)}</div>
        <div class="rel-brand">${escHtml(r.brand)}</div>
        <div class="rel-price">¥${(r.price || 0).toLocaleString()}</div>
      </a>`).join("")}
    </div>
  </div>` : ""}
  <a class="backhome" href="/">← 商品一覧に戻る</a>
</article>
<footer>
  <div><a href="/">運営者情報</a><a href="/">プライバシーポリシー</a><a href="/">アフィリエイトについて</a></div>
  <p style="margin-top:10px">© Moilum</p>
</footer>
</body>
</html>
`;
}

const outDir = "public/products";
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
let withAggRating = 0;
let withoutAggRating = 0;
let withImage = 0;

for (const p of products){
  const html = buildProductHtml(p, products);
  fs.writeFileSync(path.join(outDir, `${p.id}.html`), html, "utf8");
  count++;
  if (p.rating > 0 && p.reviews > 0) withAggRating++; else withoutAggRating++;
  if (p.image) withImage++;
}

const files = fs.readdirSync(outDir);
const sizes = files.filter(f => f.endsWith(".html")).map(f => fs.statSync(path.join(outDir, f)).size);
const avg = Math.round(sizes.reduce((s, v) => s + v, 0) / sizes.length);
const min = Math.min(...sizes);
const max = Math.max(...sizes);

console.log(`✓ 生成完了: ${count} 商品ページ`);
console.log(`  ファイルサイズ: 平均 ${(avg/1024).toFixed(1)}KB / 最小 ${(min/1024).toFixed(1)}KB / 最大 ${(max/1024).toFixed(1)}KB`);
console.log(`  aggregateRating出力: ${withAggRating} / 省略: ${withoutAggRating}`);
console.log(`  実写真あり: ${withImage} / SVGフォールバック: ${count - withImage}`);

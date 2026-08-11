import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const GSC_VERIFICATION = "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q";
const GA4_ID = "G-BC0FBSZSWX";
const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const columns = JSON.parse(fs.readFileSync("src/columns.json", "utf8"));
const guideSlugs = JSON.parse(fs.readFileSync("src/guides-slugs.json", "utf8"));
const skincare = products.filter(p => p.productType !== "makeup" && p.status !== "previous_generation");
const relatedCategoryProducts = products.filter(p => p.productType === "makeup");
const previousGenerationProducts = products.filter(p => p.status === "previous_generation");
const outputDir = path.join("public", "hubs");

fs.mkdirSync(outputDir, { recursive: true });

function esc(value){
  return String(value ?? "").replace(/[<>&"']/g, c => ({
    "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
function safeJson(value){ return JSON.stringify(value).replace(/</g, "\\u003c"); }
function yen(value){ return Number(value || 0).toLocaleString("ja-JP"); }
function truncate(value, max = 120){
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
function productLink(product, label = product.name){
  return `<a href="/products/${encodeURIComponent(product.id)}">${esc(label)}</a>`;
}
function guideTitle(slug){
  const source = fs.readFileSync(path.join("public", "guides", `${slug}.html`), "utf8");
  return source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || slug;
}

const css = `
:root{--base:#FBF9F6;--ink:#2B2622;--water:#DCEAEC;--deep:#B7CDD3;--iris-1:#E8D5E0;--iris-2:#D5E4E8;--iris-3:#E4E8D5;--line:rgba(43,38,34,.12);--shadow:0 8px 32px rgba(43,38,34,.06);--serif:"Zen Old Mincho",serif;--sans:"Zen Kaku Gothic New",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--base);color:var(--ink);font-family:var(--sans);line-height:1.8}a{color:#385d68;text-underline-offset:3px}a:hover{color:#243f47}header{position:sticky;top:0;z-index:10;background:rgba(251,249,246,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.header-inner{max-width:1180px;margin:auto;padding:12px 20px;display:flex;align-items:center;gap:22px}.logo{font:700 24px var(--serif);color:var(--ink);text-decoration:none;white-space:nowrap}.logo span{color:#668891}nav{display:flex;gap:8px;overflow-x:auto;padding:2px}.nav-link{display:inline-flex;align-items:center;min-height:44px;padding:8px 12px;border-radius:12px;text-decoration:none;white-space:nowrap;color:var(--ink);font-size:14px}.nav-link:hover,.nav-link.active{background:var(--water);color:var(--ink)}main{max-width:1120px;margin:auto;padding:52px 20px 80px}.hero{padding:42px;border-radius:24px;background:linear-gradient(135deg,var(--base),var(--water) 70%,var(--iris-2));margin-bottom:34px}h1,h2,h3{font-family:var(--serif);line-height:1.45}h1{font-size:clamp(30px,5vw,48px);margin:0 0 14px}h2{font-size:25px;margin:42px 0 18px}.lead{max-width:760px;margin:0;color:#52666b}.note{padding:16px 18px;border-left:4px solid var(--deep);background:#fff;border-radius:0 14px 14px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--shadow)}.card h2,.card h3{margin:0 0 10px;font-size:20px}.meta{font-size:13px;color:#65777c}.pill{display:inline-block;padding:3px 9px;border-radius:999px;background:var(--water);font-size:12px;margin:0 5px 7px 0}.product-link{display:flex;align-items:center;gap:10px;min-height:44px;margin-top:9px;padding:8px 10px;border-radius:12px;background:var(--base);text-decoration:none}.product-link:hover{background:var(--water)}.icon{font-size:25px}.price{font-family:"Cormorant",serif;font-size:19px}.section-nav{display:flex;gap:8px;overflow-x:auto;margin:20px 0 32px}.section-nav a{min-height:44px;display:inline-flex;align-items:center;padding:7px 12px;background:#fff;border:1px solid var(--line);border-radius:12px;text-decoration:none;white-space:nowrap}.ranking-list{counter-reset:rank;display:grid;gap:10px}.rank-row{counter-increment:rank;display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px;background:#fff;border:1px solid var(--line);border-radius:14px}.rank-row:before{content:counter(rank);font:italic 28px "Cormorant",serif;color:#67838b;text-align:center}.rank-row a{font-weight:700}.search{width:100%;min-height:48px;border:1px solid var(--deep);border-radius:14px;padding:10px 14px;font:inherit;background:#fff;margin-bottom:22px}.question{padding:22px;background:#fff;border:1px solid var(--line);border-radius:16px;margin:16px 0}.question h2{font-size:20px;margin:0 0 14px}.options{display:flex;gap:10px;flex-wrap:wrap}.option,.primary{min-height:44px;padding:9px 15px;border:1px solid var(--deep);border-radius:12px;background:#fff;color:var(--ink);font:500 14px var(--sans);cursor:pointer}.option[aria-pressed="true"]{background:var(--water);border-color:#668891}.primary{background:#385d68;color:#fff;border-color:#385d68;font-size:16px}.result{margin-top:25px}.empty{padding:28px;border:1px dashed var(--deep);border-radius:16px;text-align:center;color:#65777c}.footer{background:var(--water);padding:34px 20px;text-align:center;font-size:13px}.footer a{margin:0 8px}.sr-status{margin:12px 0;color:#52666b}@media(max-width:768px){.header-inner{align-items:flex-start;flex-direction:column;gap:6px;padding:9px 14px}.header-inner nav{width:100%}main{padding:28px 14px 60px}.hero{padding:28px 22px}.grid{grid-template-columns:1fr}.rank-row{grid-template-columns:36px minmax(0,1fr)}.rank-row .price{grid-column:2}.card{padding:17px}}
.directory-controls{position:sticky;top:70px;z-index:5;padding:16px;margin:24px 0;background:rgba(251,249,246,.96);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}.directory-controls .search{margin:0 0 12px}.filter-row{display:flex;gap:8px;flex-wrap:wrap}.filter-chip{min-height:44px;padding:8px 13px;border:1px solid var(--deep);border-radius:999px;background:#fff;color:var(--ink);font:500 13px var(--sans);cursor:pointer}.filter-chip[aria-pressed="true"]{background:var(--water);border-color:#668891}.price-filter{min-height:44px;padding:8px 12px;border:1px solid var(--deep);border-radius:12px;background:#fff;color:var(--ink);font:inherit}.product-category{scroll-margin-top:160px}.product-category h2{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--line);padding-bottom:8px}.product-category h2 span{font:500 15px "Cormorant",serif;color:#65777c}.product-directory-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:14px}.product-directory-card{display:flex;flex-direction:column;min-height:100%;background:#fff;border:1px solid var(--line);border-radius:16px;padding:17px;box-shadow:var(--shadow)}.product-directory-card h3{font-size:17px;margin:7px 0}.product-directory-card .description{font-size:13px;color:#52666b;flex:1}.product-directory-card .product-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:12px;padding:8px 12px;border-radius:12px;background:var(--water);font-weight:700;text-decoration:none}.status-pill{background:var(--iris-1)}.guide-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.guide-list a{display:flex;align-items:center;min-height:44px;padding:10px 12px;background:#fff;border:1px solid var(--line);border-radius:12px;text-decoration:none}.brand-more{margin-top:10px}.brand-more summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:#385d68;font-weight:700}.brand-more .product-link{margin-left:8px}@media(max-width:768px){.product-directory-grid{grid-template-columns:1fr}.directory-controls{position:static}}
`;

function navigation(active){
  const items = [
    ["/products", "商品"], ["/brands", "ブランド"], ["/ranking", "ランキング"],
    ["/diagnosis", "肌診断"], ["/columns", "コラム"], ["/favorites", "お気に入り"]
  ];
  return `<header><div class="header-inner"><a class="logo" href="/">Moi<span>lum</span></a><nav aria-label="メインナビゲーション">${items.map(([href,label]) => `<a class="nav-link${active === href ? " active" : ""}" href="${href}">${label}</a>`).join("")}</nav></div></header>`;
}

function page({ file, pathName, title, description, active, body, jsonLd = [], noindex = false, script = "" }){
  const canonical = SITE_ORIGIN + pathName;
  const robots = noindex ? "noindex,follow" : "index,follow,max-image-preview:large";
  const canonicalTag = noindex ? "" : `<link rel="canonical" href="${canonical}">`;
  const ogTags = noindex ? "" : `<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${SITE_ORIGIN}/ogp-image.png">`;
  const structured = jsonLd.map(value => `<script type="application/ld+json">${safeJson(value)}</script>`).join("\n");
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}">
<meta name="google-site-verification" content="${GSC_VERIFICATION}">${canonicalTag}${ogTags}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;1,500&family=Zen+Kaku+Gothic+New:wght@400;500&family=Zen+Old+Mincho:wght@400;700&display=swap" rel="stylesheet">
${structured}<style>${css}</style>
<!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}');</script></head>
<body>${navigation(active)}<main>${body}</main><footer class="footer"><a href="/about/rating-policy">評価方針</a><a href="/about/sources">情報源</a><a href="/about/changelog">更新履歴</a><p>© Moilum 編集部</p></footer>${script ? `<script>${script}</script>` : ""}</body></html>`;
  fs.writeFileSync(path.join(outputDir, file), html, "utf8");
}

const breadcrumb = (name, pathName) => ({
  "@context":"https://schema.org", "@type":"BreadcrumbList", "itemListElement":[
    {"@type":"ListItem","position":1,"name":"ホーム","item":SITE_ORIGIN + "/"},
    {"@type":"ListItem","position":2,"name":name,"item":SITE_ORIGIN + pathName}
  ]
});

const categoryGroups = [...new Set(products.map(product => product.category))].map(category => [
  category,
  products.filter(product => product.category === category)
]);
const directoryCard = product => {
  const searchText = [product.name, product.brand, product.category, ...(product.skin || []), ...(product.concern || []), ...(product.keyIngredients || [])].join(" ").toLowerCase();
  const status = product.status === "previous_generation"
    ? `<span class="pill status-pill">前世代情報</span>`
    : product.productType === "makeup" ? `<span class="pill status-pill">関連カテゴリ</span>` : "";
  return `<article class="product-directory-card" data-product-id="${esc(product.id)}" data-category="${esc(product.category)}" data-audience="${esc(product.audience || "unisex")}" data-price="${Number(product.price || 0)}" data-search="${esc(searchText)}"><div><span class="pill">${esc(product.category)}</span>${status}</div><h3>${esc(product.name)}</h3><p class="meta">${esc(product.brand)}・編集部評価 ${esc(product.rating)}</p><p class="price">参考価格 ¥${yen(product.price)}</p><p class="description">${esc(product.desc)}</p><a class="product-cta" href="/products/${encodeURIComponent(product.id)}" aria-label="${esc(product.name)}の詳細を見る">商品詳細を見る</a></article>`;
};
const productSections = categoryGroups.map(([category, items], index) => `<section class="product-category" data-product-section id="product-category-${index + 1}"><h2>${esc(category)} <span>${items.length}商品</span></h2><div class="product-directory-grid">${items.map(directoryCard).join("")}</div></section>`).join("");
const guideLinks = guideSlugs.map(slug => `<a href="/guides/${encodeURIComponent(slug)}">${esc(guideTitle(slug))}</a>`).join("");
const productDirectoryScript = `let directoryCategory="all";let directoryMensOnly=false;const directorySearch=document.getElementById("productDirectorySearch");const directoryPrice=document.getElementById("productDirectoryPrice");const directoryStatus=document.getElementById("productDirectoryStatus");function applyDirectoryFilters(){const q=directorySearch.value.trim().toLowerCase();const price=directoryPrice.value;let shown=0;document.querySelectorAll(".product-directory-card").forEach(function(card){const amount=Number(card.dataset.price);const priceMatch=price==="all"||(price==="under2000"&&amount<2000)||(price==="2000to5000"&&amount>=2000&&amount<5000)||(price==="5000to10000"&&amount>=5000&&amount<10000)||(price==="over10000"&&amount>=10000);const visible=(directoryCategory==="all"||card.dataset.category===directoryCategory)&&(!directoryMensOnly||card.dataset.audience==="mens")&&priceMatch&&(!q||card.dataset.search.includes(q));card.hidden=!visible;if(visible)shown+=1;});document.querySelectorAll("[data-product-section]").forEach(function(section){section.hidden=!section.querySelector(".product-directory-card:not([hidden])");});directoryStatus.textContent=shown+"商品を表示中";}document.querySelectorAll("[data-directory-category]").forEach(function(button){button.addEventListener("click",function(){directoryCategory=this.dataset.directoryCategory;document.querySelectorAll("[data-directory-category]").forEach(function(item){item.setAttribute("aria-pressed",String(item===button));});applyDirectoryFilters();});});document.getElementById("productDirectoryMens").addEventListener("click",function(){directoryMensOnly=!directoryMensOnly;this.setAttribute("aria-pressed",String(directoryMensOnly));applyDirectoryFilters();});directorySearch.addEventListener("input",applyDirectoryFilters);directoryPrice.addEventListener("change",applyDirectoryFilters);`;
page({
  file:"products.html", pathName:"/products", active:"/products",
  title:`スキンケア商品一覧｜${products.length}商品をカテゴリ・肌悩み・価格で比較｜Moilum`,
  description:`Moilumの商品データ全${products.length}件を、実在する${categoryGroups.length}カテゴリ別に掲載。ブランド、参考価格、編集部評価、肌悩みから商品詳細を比較できます。`,
  body:`<section class="hero"><h1>スキンケア商品一覧</h1><p class="lead">化粧水・美容液・洗顔など、商品データ全${products.length}件を実在カテゴリ別に整理しました。各商品名から、評価根拠や向く人・向かない人を確認できます。</p></section><p class="note">トップページの現在比較対象は${skincare.length}件です。この一覧には、関連カテゴリ${relatedCategoryProducts.length}件と前世代情報${previousGenerationProducts.length}件も区別して含め、全商品ページへの入口を用意しています。</p><nav class="section-nav" aria-label="商品カテゴリ">${categoryGroups.map(([category,items],index)=>`<a href="#product-category-${index + 1}">${esc(category)}（${items.length}）</a>`).join("")}</nav><section class="directory-controls" aria-label="商品を絞り込む"><label for="productDirectorySearch">商品名・ブランド・成分・肌悩みで検索</label><input id="productDirectorySearch" class="search" type="search" placeholder="例：セラミド、乾燥肌、キュレル"><div class="filter-row"><button class="filter-chip" type="button" data-directory-category="all" aria-pressed="true">全カテゴリ</button>${categoryGroups.map(([category])=>`<button class="filter-chip" type="button" data-directory-category="${esc(category)}" aria-pressed="false">${esc(category)}</button>`).join("")}<button id="productDirectoryMens" class="filter-chip" type="button" aria-pressed="false">メンズ向け</button><label><span class="meta">価格帯 </span><select id="productDirectoryPrice" class="price-filter"><option value="all">価格すべて</option><option value="under2000">2,000円未満</option><option value="2000to5000">2,000〜4,999円</option><option value="5000to10000">5,000〜9,999円</option><option value="over10000">10,000円以上</option></select></label></div><p id="productDirectoryStatus" class="sr-status" aria-live="polite">${products.length}商品を表示中</p></section>${productSections}<section><h2>肌悩み・条件別ガイド</h2><p class="meta">商品選びの基準から絞り込みたい方はこちら。</p><div class="guide-list">${guideLinks}</div></section>`,
  jsonLd:[breadcrumb("スキンケア商品一覧", "/products"), {"@context":"https://schema.org","@type":"CollectionPage","name":"スキンケア商品一覧","url":SITE_ORIGIN + "/products","mainEntity":{"@type":"ItemList","numberOfItems":products.length}}],
  script:productDirectoryScript
});

const columnCards = columns.map(column => `<article class="card"><span class="pill">${esc(column.cat || "コラム")}</span><h2><a href="/columns/${encodeURIComponent(column.id)}">${esc(column.title)}</a></h2><p>${esc(column.excerpt || column.description)}</p><p class="meta">記事を読む →</p></article>`).join("");
page({
  file:"columns.html", pathName:"/columns", active:"/columns",
  title:"スキンケアコラム一覧｜成分・肌悩み・選び方を正直に解説｜Moilum",
  description:`スキンケアの成分、肌悩み、選び方を実商品データとともに解説するMoilumのコラム全${columns.length}本。`,
  body:`<section class="hero"><h1>スキンケアコラム一覧</h1><p class="lead">成分の特徴から肌悩み別の選び方まで、向く人だけでなく「向かない人」も含めて正直に整理しています。</p></section><p class="note">全${columns.length}本。商品名のリンクから個別の商品情報も確認できます。</p><section class="grid">${columnCards}</section>`,
  jsonLd:[breadcrumb("スキンケアコラム一覧", "/columns"), {"@context":"https://schema.org","@type":"CollectionPage","name":"スキンケアコラム一覧","url":SITE_ORIGIN + "/columns","mainEntity":{"@type":"ItemList","numberOfItems":columns.length,"itemListElement":columns.map((c,i)=>({"@type":"ListItem","position":i+1,"url":SITE_ORIGIN + "/columns/" + c.id,"name":c.title}))}}]
});

const brands = [...new Map(skincare.map(p => [p.brand, []])).entries()];
for (const product of skincare) brands.find(([brand]) => brand === product.brand)[1].push(product);
brands.sort((a,b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ja"));
const brandCards = brands.map(([brand, items]) => {
  const productRows = list => list.map(p => `<a class="product-link" href="/products/${encodeURIComponent(p.id)}"><span class="icon">${esc(p.icon || "💧")}</span><span>${esc(p.name)}<br><small>参考価格 ¥${yen(p.price)}・Moilum編集部評価 ${esc(p.rating)}</small></span></a>`).join("");
  const remaining = items.slice(3);
  return `<section class="card brand-card" data-search="${esc((brand + " " + items.map(p=>p.name).join(" ")).toLowerCase())}"><h2>${esc(brand)}</h2><p class="meta">掲載 ${items.length}商品${items[0]?.origin ? `・${esc(items[0].origin)}` : ""}</p>${productRows(items.slice(0,3))}${remaining.length ? `<details class="brand-more"><summary>残り${remaining.length}商品を見る</summary>${productRows(remaining)}</details>` : ""}</section>`;
}).join("");
const brandSearchScript = `const input=document.getElementById("brandSearch");const status=document.getElementById("brandStatus");input.addEventListener("input",function(){const q=this.value.trim().toLowerCase();let shown=0;document.querySelectorAll(".brand-card").forEach(function(card){const visible=!q||card.dataset.search.includes(q);card.hidden=!visible;if(visible)shown+=1;});status.textContent=shown+"ブランドを表示中";});`;
page({
  file:"brands.html", pathName:"/brands", active:"/brands",
  title:"スキンケアブランド一覧｜掲載商品数と代表商品を比較｜Moilum",
  description:`Moilum掲載のスキンケア${skincare.length}商品をブランド別に整理。各ブランドの掲載数と代表商品を確認できます。`,
  body:`<section class="hero"><h1>スキンケアブランド一覧</h1><p class="lead">掲載中の${brands.length}ブランドを、商品数と代表商品から探せます。</p></section><label for="brandSearch">ブランド・商品名で検索</label><input id="brandSearch" class="search" type="search" placeholder="例：キュレル、化粧水"><p id="brandStatus" class="sr-status" aria-live="polite">${brands.length}ブランドを表示中</p><section class="grid">${brandCards}</section>`,
  jsonLd:[breadcrumb("スキンケアブランド一覧", "/brands"), {"@context":"https://schema.org","@type":"CollectionPage","name":"スキンケアブランド一覧","url":SITE_ORIGIN + "/brands"}],
  script:brandSearchScript
});

function editorialSort(a,b){
  return (Number(b.rating)||0)-(Number(a.rating)||0)
    || (Number(a.price)||Infinity)-(Number(b.price)||Infinity)
    || Number(a.id)-Number(b.id);
}
const rankingGroups = [
  ["dry","乾燥肌",p=>(p.concern||[]).includes("乾燥・かさつき")],
  ["pore","毛穴・皮脂",p=>(p.concern||[]).includes("毛穴の開き・黒ずみ")],
  ["acne","ニキビ・肌荒れ",p=>(p.concern||[]).some(c=>["ニキビ・吹き出物","肌荒れ・赤み"].includes(c))],
  ["aging","エイジングケア",p=>(p.concern||[]).some(c=>["シワ・たるみ","シミ・くすみ"].includes(c))],
  ["sensitive","敏感肌",p=>(p.skin||[]).includes("敏感肌")]
];
const rankingSections = rankingGroups.map(([id,label,match]) => {
  const ranked = skincare.filter(match).sort(editorialSort).slice(0,10);
  return `<section id="${id}"><h2>${label}比較 TOP10</h2><p class="meta">掲載条件で抽出後、Moilum編集部評価順。同点は参考価格の低い順です。</p><div class="ranking-list">${ranked.map(p=>`<div class="rank-row"><div><a href="/products/${p.id}">${esc(p.name)}</a><div class="meta">${esc(p.brand)}・${esc(p.category)}・Moilum編集部評価 ${esc(p.rating)}</div></div><div class="price">¥${yen(p.price)}</div></div>`).join("")}</div></section>`;
}).join("");
page({
  file:"ranking.html", pathName:"/ranking", active:"/ranking",
  title:"スキンケア比較ランキング｜肌悩み別に掲載データで比較｜Moilum",
  description:"乾燥、毛穴、ニキビ・肌荒れ、エイジングケア、敏感肌の5テーマでスキンケア商品を比較したランキングです。",
  body:`<section class="hero"><h1>スキンケア比較ランキング</h1><p class="lead">肌悩み・掲載肌タイプで候補を抽出し、Moilum編集部評価順に比較します。同点は参考価格の低い順です。</p></section><p class="note">編集部評価はユーザー評価や実測値ではありません。価格・成分・掲載分類と合わせて候補を絞るための参考情報です。</p><nav class="section-nav" aria-label="ランキング分類">${rankingGroups.map(([id,label])=>`<a href="#${id}">${label}</a>`).join("")}</nav>${rankingSections}`,
  jsonLd:[breadcrumb("スキンケア比較ランキング", "/ranking"), {"@context":"https://schema.org","@type":"WebPage","name":"スキンケア比較ランキング","url":SITE_ORIGIN + "/ranking"}]
});

const diagnosisData = skincare.map(p => ({id:p.id,name:p.name,brand:p.brand,category:p.category,price:p.price,rating:p.rating,skin:p.skin||[],concern:p.concern||[],icon:p.icon||"💧",audience:p.audience||"unisex"}));
const diagnosisScript = `const products=${safeJson(diagnosisData)};const state={skin:"",concerns:[],budget:"",audience:"any"};document.querySelectorAll("[data-choice]").forEach(function(btn){btn.addEventListener("click",function(){const key=this.dataset.choice;const value=this.dataset.value;if(key==="concerns"){const i=state.concerns.indexOf(value);if(i>=0)state.concerns.splice(i,1);else state.concerns.push(value);this.setAttribute("aria-pressed",String(i<0));}else{state[key]=value;document.querySelectorAll('[data-choice="'+key+'"]').forEach(function(b){b.setAttribute("aria-pressed",String(b===btn));});}});});document.getElementById("diagnoseButton").addEventListener("click",function(){const out=document.getElementById("diagnosisResult");if(!state.skin||!state.budget){out.innerHTML='<p class="empty">肌タイプと予算を選んでください。</p>';return;}const ranges={low:[0,2000],mid:[2000,5000],high:[5000,10000],luxury:[10000,Infinity]};const range=ranges[state.budget];let list=products.filter(function(p){return (p.skin.includes(state.skin)||p.skin.includes("全肌質")||state.skin==="普通肌")&&p.price>=range[0]&&p.price<range[1]&&(state.audience!=="mens"||p.audience==="mens"||p.audience==="unisex");});list.sort(function(a,b){const ac=state.concerns.filter(function(c){return a.concern.includes(c);}).length;const bc=state.concerns.filter(function(c){return b.concern.includes(c);}).length;return bc-ac||b.rating-a.rating;});list=list.slice(0,4);out.replaceChildren();const heading=document.createElement("h2");heading.textContent="診断結果";out.appendChild(heading);if(!list.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="条件に合う商品がありませんでした。選択条件を変えてお試しください。";out.appendChild(empty);return;}const grid=document.createElement("div");grid.className="grid";list.forEach(function(p){const card=document.createElement("article");card.className="card";const h=document.createElement("h3");const a=document.createElement("a");a.href="/products/"+encodeURIComponent(p.id);a.textContent=p.name;h.appendChild(a);const meta=document.createElement("p");meta.className="meta";meta.textContent=p.brand+"・"+p.category+"・評価 "+p.rating;const price=document.createElement("p");price.className="price";price.textContent="参考価格 ¥"+Number(p.price).toLocaleString("ja-JP");card.append(h,meta,price);grid.appendChild(card);});out.appendChild(grid);out.scrollIntoView({behavior:"smooth",block:"start"});});`;
const optionButtons = (key, values) => values.map(([value,label])=>`<button type="button" class="option" data-choice="${key}" data-value="${esc(value)}" aria-pressed="false">${esc(label)}</button>`).join("");
page({
  file:"diagnosis.html", pathName:"/diagnosis", active:"/diagnosis",
  title:"無料スキンケア肌タイプ診断｜4問でおすすめ商品を比較｜Moilum",
  description:"肌タイプ、悩み、予算、対象の4問から、Moilum掲載商品を絞り込む無料スキンケア診断です。",
  body:`<section class="hero"><h1>4問でわかるスキンケア肌タイプ診断</h1><p class="lead">医療診断ではなく、掲載商品の比較条件を整理するための無料ツールです。結果はブラウザ上ですぐ確認できます。</p></section><form onsubmit="return false"><section class="question"><h2>1. 肌タイプ</h2><div class="options">${optionButtons("skin",[["乾燥肌","乾燥肌"],["脂性肌","脂性肌（オイリー）"],["混合肌","混合肌"],["敏感肌","敏感肌"],["普通肌","普通肌"]])}</div></section><section class="question"><h2>2. 気になる悩み（複数可）</h2><div class="options">${optionButtons("concerns",[["乾燥・かさつき","乾燥・かさつき"],["毛穴の開き・黒ずみ","毛穴の開き・黒ずみ"],["シミ・くすみ","シミ・くすみ"],["ニキビ・吹き出物","ニキビ・吹き出物"],["シワ・たるみ","シワ・たるみ"],["肌荒れ・赤み","肌荒れ・赤み"]])}</div></section><section class="question"><h2>3. 予算</h2><div class="options">${optionButtons("budget",[["low","〜2,000円"],["mid","2,000〜5,000円"],["high","5,000〜10,000円"],["luxury","10,000円以上"]])}</div></section><section class="question"><h2>4. 対象</h2><div class="options">${optionButtons("audience",[["any","指定なし"],["mens","メンズ向けを含めて探す"]])}</div></section><button id="diagnoseButton" class="primary" type="button">診断結果を見る</button></form><section id="diagnosisResult" class="result" aria-live="polite"></section>`,
  jsonLd:[breadcrumb("スキンケア肌タイプ診断", "/diagnosis"), {"@context":"https://schema.org","@type":"WebApplication","name":"スキンケア肌タイプ診断","url":SITE_ORIGIN + "/diagnosis","applicationCategory":"LifestyleApplication","operatingSystem":"Web"}],
  script:diagnosisScript
});

const favoriteData = products.map(p => ({id:p.id,name:p.name,brand:p.brand,category:p.category,price:p.price,rating:p.rating,icon:p.icon||"💧"}));
const favoritesScript = `const products=${safeJson(favoriteData)};const grid=document.getElementById("favoriteGrid");let ids=[];try{ids=JSON.parse(localStorage.getItem("ulabo_fav")||"[]");}catch(e){}const byId=new Map(products.map(function(p){return [String(p.id),p];}));const saved=ids.map(function(id){return byId.get(String(id));}).filter(Boolean);document.getElementById("favoriteCount").textContent=saved.length+"件保存されています";if(!saved.length){grid.innerHTML='<p class="empty">お気に入りはまだありません。商品ページの「お気に入り」から保存できます。</p>';}else{saved.forEach(function(p){const card=document.createElement("article");card.className="card";const h=document.createElement("h2");const a=document.createElement("a");a.href="/products/"+encodeURIComponent(p.id);a.textContent=p.name;h.appendChild(a);const meta=document.createElement("p");meta.className="meta";meta.textContent=p.brand+"・"+p.category+"・評価 "+p.rating;const price=document.createElement("p");price.className="price";price.textContent="参考価格 ¥"+Number(p.price).toLocaleString("ja-JP");card.append(h,meta,price);grid.appendChild(card);});}`;
page({
  file:"favorites.html", pathName:"/favorites", active:"/favorites", noindex:true,
  title:"お気に入り商品｜Moilum",
  description:"Moilumで保存したお気に入り商品を、この端末のブラウザから確認できます。",
  body:`<section class="hero"><h1>お気に入り商品</h1><p class="lead">この端末のブラウザに保存した商品を表示します。保存内容はサーバーへ送信されません。</p></section><p id="favoriteCount" class="sr-status" aria-live="polite">読み込み中…</p><section id="favoriteGrid" class="grid"></section><p class="note" style="margin-top:28px">コレクションの作成・編集は、<a href="/?page=favorites">従来のお気に入り管理画面</a>から利用できます。</p>`,
  jsonLd:[], script:favoritesScript
});

// トップページは scripts/build-priority6-content.mjs がSSoTから生成する。
// hub生成ではトップに触れず、専用hubとAboutページだけを更新する。

// Aboutページの商品数は src/products.json から同期し、手書き固定値の陳腐化を防ぐ。
const aboutCounts = {
  total: products.length,
  current: skincare.length,
  related: products.filter(product => product.productType === "makeup").length,
  previous: products.filter(product => product.status === "previous_generation").length,
  "editor-used": products.filter(product => product.reviewedByEditor === true).length
};
for (const aboutFile of ["public/about/sources.html", "public/about/rating-policy.html"]){
  let source = fs.readFileSync(aboutFile, "utf8");
  for (const [key, value] of Object.entries(aboutCounts)){
    const pattern = new RegExp(`(<span\\s+data-product-count=["']${key}["']>)\\d+(<\\/span>)`, "g");
    if (!pattern.test(source)) continue;
    source = source.replace(pattern, `$1${value}$2`);
  }
  fs.writeFileSync(aboutFile, source, "utf8");
}

console.log(`SEO hub pages generated: columns=${columns.length}, brands=${brands.length}, products=${products.length}, skincare=${skincare.length}`);

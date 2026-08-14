import fs from "node:fs";
import { isComparisonProduct, isDirectoryProduct, isIndexableProduct } from "./product-publication-policy.mjs";
import path from "node:path";
import { PRIORITY6_COLUMNS } from "../src/priority6-columns.mjs";

const INDEX_FILE = "public/index.html";
const PRODUCTS_FILE = "src/products.json";
const COLUMNS_FILE = "src/columns.json";
const GUIDES_FILE = "src/guides-slugs.json";
const SITE_ORIGIN = "https://moilum.asutelu.com";
const PROTECTED = [
  "G-BC0FBSZSWX",
  "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q",
  "54ebba1a.f0b1f403.54ebba1b.9f0abc5f"
];

const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
const columns = JSON.parse(fs.readFileSync(COLUMNS_FILE, "utf8"));
const guideSlugs = JSON.parse(fs.readFileSync(GUIDES_FILE, "utf8"));
const originalIndex = fs.readFileSync(INDEX_FILE, "utf8");
const targetIds = new Set(PRIORITY6_COLUMNS.map(column => column.id));
const activeProducts = products.filter(isComparisonProduct);
const directoryProducts = products.filter(isDirectoryProduct);
const editorProducts = products.filter(product => product.reviewedByEditor === true);
const publicOnlyProducts = directoryProducts.filter(product => product.reviewedByEditor !== true);
const productById = new Map(products.filter(isIndexableProduct).map(product => [Number(product.id), product]));

if (products.length < 247) throw new Error(`商品総数が基準値247件未満です: ${products.length}`);
if (columns.length !== 27) throw new Error(`コラム総数が想定外です: ${columns.length}`);
if (guideSlugs.length !== 12) throw new Error(`ガイド総数が想定外です: ${guideSlugs.length}`);
if (editorProducts.length < 8 || editorProducts.length > 16) throw new Error(`トップ掲載商品数が8〜16件の範囲外です: ${editorProducts.length}`);

function esc(value){
  return String(value ?? "").replace(/[<>&"']/g, char => ({
    "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;"
  })[char]);
}
function yen(value){ return Number(value || 0).toLocaleString("ja-JP"); }
function median(values){
  const sorted = values.map(Number).filter(Number.isFinite).sort((a,b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
function nearestRank(values, percentile){
  const sorted = values.map(Number).filter(Number.isFinite).sort((a,b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}
function pct(value, max){ return max > 0 ? Math.max(4, Math.round(value / max * 100)) : 0; }
function countToken(text, token){ return String(text).split(token).length - 1; }
function safeJson(value){ return JSON.stringify(value).replace(/</g, "\\u003c"); }
function productLink(product){ return `<a href="/products/${encodeURIComponent(product.id)}">${esc(product.name)}</a>`; }
function productImage(product){
  const source = product.editorPhoto || product.image || "";
  const fallback = `<span class="p6-featured-fallback"${source ? " hidden" : ""} aria-hidden="true">${esc(product.icon || "💧")}</span>`;
  const image = source
    ? `<img src="${esc(source)}" alt="${esc(product.name)}の商品画像" loading="lazy" decoding="async" referrerpolicy="no-referrer-when-downgrade" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
    : "";
  return `<a class="p6-featured-image" href="/products/${encodeURIComponent(product.id)}" aria-label="${esc(product.name)}の商品詳細を見る">${image}${fallback}</a>`;
}
function productText(product){
  return [product.name, product.desc, ...(product.keyIngredients || [])].join(" ");
}

function ingredientAnalysis(){
  const definitions = [
    ["セラミド系", /セラミド|スフィンゴ/],
    ["ヒアルロン酸系", /ヒアルロン/],
    ["ナイアシンアミド系", /ナイアシンアミド|ニコチン酸アミド/]
  ];
  const groups = definitions.map(([label, pattern]) => {
    const items = activeProducts.filter(product => pattern.test((product.keyIngredients || []).join(" ")));
    const categories = [...new Map([...new Set(items.map(item => item.category))].map(category => [category, items.filter(item => item.category === category).length]))]
      .sort((a,b) => b[1] - a[1]).slice(0,3);
    const skins = [...new Map([...new Set(items.flatMap(item => item.skin || []))].map(skin => [skin, items.filter(item => (item.skin || []).includes(skin)).length]))]
      .sort((a,b) => b[1] - a[1]).slice(0,3);
    const ingredientCounts = new Map();
    for (const item of items) for (const ingredient of item.keyIngredients || []){
      if (pattern.test(String(ingredient))) continue;
      ingredientCounts.set(String(ingredient), (ingredientCounts.get(String(ingredient)) || 0) + 1);
    }
    const coIngredients = [...ingredientCounts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0],"ja")).slice(0,3);
    const samples = [...items].sort((a,b) => Number(a.price) - Number(b.price));
    const sampleIndexes = [...new Set([0, Math.floor((samples.length - 1) / 2), samples.length - 1])];
    return {
      label, items, count:items.length, medianPrice:median(items.map(item => item.price)),
      categories, skins, coIngredients, samples:sampleIndexes.map(index => samples[index]).filter(Boolean)
    };
  });
  const maxCount = Math.max(...groups.map(group => group.count));
  return `<section class="p6-data-analysis" aria-labelledby="ingredientDataHeading">
  <h3 id="ingredientDataHeading">Moilum掲載データで見る3成分群</h3>
  <p class="p6-method">集計対象は現在の比較対象${activeProducts.length}商品です。各商品の「比較用成分タグ」欄に対象語がある商品を機械抽出しています。タグはMoilumの編集分類で、全成分表・配合量・濃度・効果の比較ではありません。1商品が複数群に重複する場合があります。</p>
  <div class="p6-bars">${groups.map(group => `<div class="p6-bar-row"><strong>${group.label}</strong><span><i style="width:${pct(group.count,maxCount)}%"></i></span><b>${group.count}商品</b></div>`).join("")}</div>
  <div class="p6-metric-grid">${groups.map(group => `<article><h4>${group.label}</h4><p><b>${group.count}</b>商品／参考価格中央値 <b>¥${yen(group.medianPrice)}</b></p><p>多いカテゴリ：${group.categories.map(([name,count]) => `${esc(name)} ${count}`).join("、") || "—"}</p><p>掲載肌タイプ：${group.skins.map(([name,count]) => `${esc(name)} ${count}`).join("、") || "—"}</p><p>同じ比較用成分タグ欄に多い表示：${group.coIngredients.map(([name,count]) => `${esc(name)} ${count}`).join("、") || "—"}</p><p class="p6-samples">価格の広がり：${group.samples.map(productLink).join(" ／ ") || "—"}</p></article>`).join("")}</div>
  <p class="data-note">※参考価格は商品1点の掲載価格であり、容量差を補正していません。成分名の有無だけで製品の優劣や肌との相性は判断できません。</p>
</section>`;
}

function priceAnalysis(){
  const categories = ["化粧水","乳液","美容液","保湿クリーム","洗顔","日焼け止め"];
  const rows = categories.map(category => {
    const items = activeProducts.filter(product => product.category === category && Number(product.price) > 0);
    const prices = items.map(product => Number(product.price));
    const med = median(prices);
    const near = [...items].sort((a,b) => Math.abs(Number(a.price)-med)-Math.abs(Number(b.price)-med))[0];
    return {category,items,prices,med,near};
  }).filter(row => row.items.length > 0);
  const bands = [
    ["1,999円以下", product => product.price <= 1999],
    ["2,000〜4,999円", product => product.price >= 2000 && product.price <= 4999],
    ["5,000〜9,999円", product => product.price >= 5000 && product.price <= 9999],
    ["10,000円以上", product => product.price >= 10000]
  ].map(([label,match]) => [label, activeProducts.filter(match).length]);
  const maxBand = Math.max(...bands.map(([,count]) => count));
  return `<section class="p6-data-analysis" aria-labelledby="priceDataHeading">
  <h3 id="priceDataHeading">Moilum掲載商品の価格分布</h3>
  <p class="p6-method">比較対象${activeProducts.length}商品の参考価格を、商品1点あたりで集計しました。セット数・容量・販売店差は補正していないため、価格は品質やコストパフォーマンスそのものを示しません。</p>
  <div class="p6-bars">${bands.map(([label,count]) => `<div class="p6-bar-row"><strong>${label}</strong><span><i style="width:${pct(count,maxBand)}%"></i></span><b>${count}商品</b></div>`).join("")}</div>
  <div class="col-table-wrap"><table class="col-table p6-price-table"><thead><tr><th>カテゴリ</th><th>件数</th><th>最安</th><th>第1四分位</th><th>中央値</th><th>第3四分位</th><th>最高</th><th>中央値付近の商品</th></tr></thead><tbody>${rows.map(row => `<tr><th>${row.category}</th><td>${row.items.length}</td><td>¥${yen(Math.min(...row.prices))}</td><td>¥${yen(nearestRank(row.prices,.25))}</td><td><b>¥${yen(row.med)}</b></td><td>¥${yen(nearestRank(row.prices,.75))}</td><td>¥${yen(Math.max(...row.prices))}</td><td>${productLink(row.near)}</td></tr>`).join("")}</tbody></table></div>
  <p class="data-note">※四分位は価格順に並べた掲載データをnearest-rank法で集計。中央値付近の商品は「おすすめ順位」ではありません。</p>
</section>`;
}

function sunscreenAnalysis(){
  const items = activeProducts.filter(product => product.category === "日焼け止め");
  const textOf = product => [productText(product), ...(product.editorialEvidence?.officialFeatures || []), ...Object.values(product.editorialEvidence?.specs || {})].join(" ");
  const spf50 = items.filter(product => /SPF\s*50\+?/i.test(textOf(product))).length;
  const pa4 = items.filter(product => /PA\s*\+\+\+\+/i.test(textOf(product))).length;
  const bands = [
    ["999円以下", product => product.price <= 999],
    ["1,000〜1,999円", product => product.price >= 1000 && product.price <= 1999],
    ["2,000〜2,999円", product => product.price >= 2000 && product.price <= 2999],
    ["3,000円以上", product => product.price >= 3000]
  ].map(([label,match]) => [label, items.filter(match).length]);
  const verified = items.filter(product => product.editorialEvidence?.sources?.some(source => source.type === "official-product"));
  const resistance = verified.filter(product => /UV耐水性|ウォータープルーフ|water/i.test(textOf(product))).length;
  const removable = verified.filter(product => /石けん|洗顔料|洗浄料|落とせ/i.test(textOf(product))).length;
  const maxBand = Math.max(...bands.map(([,count]) => count));
  return `<section class="p6-data-analysis" aria-labelledby="uvDataHeading">
  <h3 id="uvDataHeading">Moilum掲載UV商品の記載状況</h3>
  <p class="p6-method">日焼け止めカテゴリ${items.length}商品について、商品名・説明・比較用成分タグ・登録済み公式仕様に明記された語を集計しました。数値の記載がない商品を低性能と判断する集計ではありません。</p>
  <div class="p6-metric-grid"><article><h4>表示の明記</h4><p>SPF50/50+：<b>${spf50}</b>商品</p><p>PA++++：<b>${pa4}</b>商品</p><p>参考価格中央値：<b>¥${yen(median(items.map(product => product.price)))}</b></p></article><article><h4>公式一次情報の確認済み範囲</h4><p>公式商品ページを記録済み：<b>${verified.length}</b>商品</p><p>耐水性の記録あり：<b>${resistance}</b>商品</p><p>落とし方の記録あり：<b>${removable}</b>商品</p></article></div>
  <div class="p6-bars">${bands.map(([label,count]) => `<div class="p6-bar-row"><strong>${label}</strong><span><i style="width:${pct(count,maxBand)}%"></i></span><b>${count}商品</b></div>`).join("")}</div>
  <div class="col-table-wrap"><table class="col-table"><thead><tr><th>公式情報を記録済みの商品</th><th>参考価格</th><th>確認できる仕様</th></tr></thead><tbody>${verified.map(product => `<tr><td>${productLink(product)}</td><td>¥${yen(product.price)}</td><td>${esc(Object.values(product.editorialEvidence?.specs || {}).filter(Boolean).slice(0,5).join(" ／ ") || "公式商品ページを記録")}</td></tr>`).join("")}</tbody></table></div>
  <p class="data-note">※公式一次情報の確認済み件数は、Moilumの調査進捗を示します。未確認の商品について耐水性・落とし方・敏感肌適性を推定していません。</p>
</section>`;
}

const analyses = {ingredients:ingredientAnalysis(), prices:priceAnalysis(), sunscreen:sunscreenAnalysis()};

function expandedColumn(column){
  let body = column.body;
  body = body.replace(/<div data-p6-analysis="(ingredients|prices|sunscreen)"><\/div>/g, (_,key) => analyses[key]);
  if (/data-p6-analysis/.test(body)) throw new Error(`${column.id}: 分析プレースホルダーが残っています`);
  if (body.includes("${") || body.includes("`")) throw new Error(`${column.id}: COLUMNSへ安全に埋め込めない文字があります`);
  return {...column, body};
}

function serializeColumn(column){
  const text = value => JSON.stringify(value);
  return `  {\n    id:${text(column.id)},\n    cat:${text(column.cat)},\n    title:${text(column.title)},\n    excerpt:${text(column.excerpt)},\n    description:${text(column.description)},\n    readtime:${text(column.readtime)},\n    published:${text(column.published)},\n    updated:${text(column.updated)},\n    authorName:${text(column.authorName)},\n    related:${JSON.stringify(column.related)},\n    body:\`\n${column.body.trim()}\n\`,\n  }`;
}

function findArrayRange(source, marker){
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`配列マーカーがありません: ${marker}`);
  const start = source.indexOf("[", markerIndex);
  let depth = 0, quote = "", escaped = false;
  for (let index = start; index < source.length; index++){
    const char = source[index];
    if (escaped){ escaped = false; continue; }
    if (quote){
      if (char === "\\"){ escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`"){ quote = char; continue; }
    if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return {start,end:index};
  }
  throw new Error(`配列終端がありません: ${marker}`);
}

function objectRanges(source, arrayRange){
  const ranges = [];
  let depth = 0, start = -1, quote = "", escaped = false;
  for (let index = arrayRange.start + 1; index < arrayRange.end; index++){
    const char = source[index];
    if (escaped){ escaped = false; continue; }
    if (quote){
      if (char === "\\"){ escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`"){ quote = char; continue; }
    if (char === "{"){
      if (depth === 0) start = source.lastIndexOf("\n", index) + 1;
      depth++;
    } else if (char === "}" && depth > 0 && --depth === 0){
      ranges.push({start,end:index + 1,text:source.slice(start,index + 1)});
    }
  }
  return ranges;
}

function replaceTargetColumns(source){
  const arrayRange = findArrayRange(source, "const COLUMNS=");
  const ranges = objectRanges(source, arrayRange);
  const replacements = [];
  for (const column of PRIORITY6_COLUMNS.map(expandedColumn)){
    const range = ranges.find(candidate => new RegExp(`\\bid\\s*:\\s*[\"']${column.id}[\"']`).test(candidate.text));
    if (!range) throw new Error(`COLUMNSに対象記事がありません: ${column.id}`);
    replacements.push({...range,replacement:serializeColumn(column)});
  }
  replacements.sort((a,b) => b.start - a.start);
  for (const item of replacements) source = source.slice(0,item.start) + item.replacement + source.slice(item.end);
  return source;
}

function guideTitle(slug){
  const file = path.join("public","guides",`${slug}.html`);
  const html = fs.readFileSync(file,"utf8");
  return html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g,"").trim() || slug;
}

function homeHtml(){
  const featured = editorProducts.map(product => `<article class="p6-featured-card">${productImage(product)}<span>${esc(product.category)}・編集部使用済み</span><h3><a href="/products/${product.id}">${esc(product.name)}</a></h3><p>${esc(product.brand)} ／ 参考価格 ¥${yen(product.price)}</p></article>`).join("");
  const guideLinks = guideSlugs.map(slug => `<a href="/guides/${encodeURIComponent(slug)}">${esc(guideTitle(slug))}</a>`).join("");
  return `<div id="productsPage" class="page active">
  <!-- PRIORITY6_HOME_START -->
  <section class="hero" id="heroSection">
    <canvas id="mizukagamiCanvas" class="mizukagami-canvas" aria-hidden="true" style="display:none"></canvas>
    <div class="hero-text"><div class="brand-logo"><svg class="brand-mark" viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><defs><linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" class="brand-stop-1"/><stop offset="100%" class="brand-stop-2"/></linearGradient></defs><path d="M20 4 C20 4 7 17 7 26 a13 13 0 0 0 26 0 C33 17 20 4 20 4 Z" fill="url(#brandGrad)"/><ellipse cx="15.5" cy="23" rx="3.5" ry="5.5" fill="#fff" opacity="0.45"/></svg><div class="brand-wordmark">Moi<span>lum</span><em>モイルム</em></div></div>
      <div class="hero-badge">スキンケア比較の入口</div><h1 class="hero-title">商品・ブランド・肌悩みから探せる、<br><span>スキンケア比較サイト</span>。</h1>
      <p class="hero-sub">現在比較できる${activeProducts.length}商品を整理し、編集部使用レビュー、公的・公式情報、比較ガイドから選択肢を絞れます。</p>
      <div class="hero-actions"><a class="hero-btn primary" href="/diagnosis">肌タイプ診断をはじめる</a><a class="hero-btn ghost" href="/products">商品一覧を見る</a></div>
    </div>
    <div class="hero-visual" id="heroVisualFallback" aria-hidden="true"><div class="hero-blob blob1"></div><div class="hero-blob blob2"></div><div class="hero-bottle"><div class="hb-cap"></div><div class="hb-neck"></div><div class="hb-body"><span>Moilum</span></div></div></div>
  </section>
  <div id="underwaterSection" class="underwater-section" aria-hidden="true"><span class="bubble b1"></span><span class="bubble b2"></span><span class="bubble b3"></span><span class="bubble b4"></span><span class="bubble b5"></span><span class="bubble b6"></span></div>
  <section class="p6-home-section p6-first" aria-labelledby="p6Start"><p class="p6-kicker">START HERE</p><h2 id="p6Start">初めて使う人はここから</h2><div class="p6-entry-grid"><a href="/products"><strong>商品から探す</strong><span>${directoryProducts.length}公開商品の一覧・検索・カテゴリ比較</span></a><a href="/columns"><strong>読みながら選ぶ</strong><span>${columns.length}本のコラムと${guideSlugs.length}本の条件別ガイド</span></a><a href="/diagnosis"><strong>条件を整理する</strong><span>肌タイプ・悩み・予算から候補を絞る</span></a><a href="/about/rating-policy"><strong>評価方針を確認する</strong><span>編集部評価の考え方と限界を読む</span></a></div></section>
  <section class="p6-home-section" aria-labelledby="p6Browse"><p class="p6-kicker">BROWSE</p><h2 id="p6Browse">目的に合わせて比較する</h2><div class="p6-entry-grid"><a href="/products"><strong>商品一覧</strong><span>全商品をカテゴリ・価格・肌悩みで確認</span></a><a href="/brands"><strong>ブランド一覧</strong><span>ブランド別の掲載商品を確認</span></a><a href="/ranking"><strong>比較ランキング</strong><span>掲載条件と編集部評価で並べ替え</span></a><a href="/diagnosis"><strong>肌タイプ診断</strong><span>4つの質問で比較条件を整理</span></a><a href="/columns"><strong>コラム一覧</strong><span>成分・価格・使い方を詳しく読む</span></a></div></section>
  <section class="p6-home-section" aria-labelledby="p6Method"><p class="p6-kicker">HOW WE COMPARE</p><h2 id="p6Method">Moilumの商品比較の仕組み</h2><div class="p6-stat-grid"><article><b>${directoryProducts.length}</b><span>公開商品</span></article><article><b>${activeProducts.length}</b><span>現在の比較対象</span></article><article><b>${editorProducts.length}</b><span>編集部使用レビュー</span></article><article><b>${publicOnlyProducts.length}</b><span>公開情報中心の商品</span></article></div><p class="p6-method-note">商品データはメーカー公式情報や販売情報を確認して整理します。API取得直後の商品候補は公開せず、公式情報・カテゴリ・ブランドを確認できた商品だけを比較対象にします。編集部評価はユーザーレビューの平均ではありません。</p><p><a href="/about/sources">情報源と更新方針</a> ／ <a href="/about/rating-policy">評価方針</a> ／ <a href="/about/changelog">更新履歴</a></p></section>
  <section class="p6-home-section" aria-labelledby="p6Featured"><p class="p6-kicker">EDITOR-USED</p><h2 id="p6Featured">編集部が実際に使用した${editorProducts.length}商品</h2><p>写真と使用メモがある商品だけを掲載しています。ここでの掲載順はおすすめ順位ではありません。</p><div class="p6-featured-grid">${featured}</div><p class="p6-more"><a href="/products">全${directoryProducts.length}公開商品の一覧へ →</a></p></section>
  <section class="p6-home-section" aria-labelledby="p6Guides"><p class="p6-kicker">CONDITION GUIDES</p><h2 id="p6Guides">肌悩み・条件別の${guideSlugs.length}ガイド</h2><div class="p6-guide-grid">${guideLinks}</div></section>
  <!-- PRIORITY6_HOME_END -->
</div>

`;
}

function noscriptHtml(){
  return `<noscript><!-- PRIORITY6_NOSCRIPT_START --><main class="p6-noscript"><h1>Moilum（モイルム）｜スキンケア比較の入口</h1><p>Moilumは、商品・ブランド・肌悩み・予算からスキンケアを比較できるサイトです。JavaScriptが無効でも、以下の通常リンクから主要ページと編集部使用レビューを確認できます。</p><nav><a href="/products">商品一覧</a> <a href="/brands">ブランド一覧</a> <a href="/ranking">比較ランキング</a> <a href="/diagnosis">肌タイプ診断</a> <a href="/columns">コラム一覧</a></nav><h2>編集部が実際に使用した商品</h2><ul>${editorProducts.map(product => `<li><a href="/products/${product.id}">${esc(product.name)}</a>（${esc(product.brand)}／${esc(product.category)}／参考価格 ¥${yen(product.price)}）</li>`).join("")}</ul><p><a href="/about/rating-policy">評価方針</a>と<a href="/about/sources">情報源・更新方針</a>も公開しています。</p></main><!-- PRIORITY6_NOSCRIPT_END --></noscript>`;
}

function homeStyles(){
  return `\n/* PRIORITY6_HOME_CSS_START */
.p6-home-section{max-width:1180px;margin:0 auto;padding:56px 24px;border-bottom:1px solid var(--border)}.p6-home-section.p6-first{padding-top:42px}.p6-home-section h2{font-family:var(--font-head);font-size:clamp(24px,3vw,34px);margin:0 0 18px}.p6-kicker{font:500 italic 15px var(--font-num);letter-spacing:.14em;color:var(--txt3);margin:0 0 6px}.p6-entry-grid,.p6-featured-grid,.p6-guide-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.p6-entry-grid>a,.p6-guide-grid>a,.p6-featured-card{display:flex;flex-direction:column;min-height:112px;padding:18px;background:#fff;border:1px solid var(--border);border-radius:16px;text-decoration:none;box-shadow:0 8px 32px rgba(43,38,34,.06)}.p6-entry-grid strong{font-family:var(--font-head);font-size:18px}.p6-entry-grid span,.p6-featured-card p{font-size:12px;color:var(--txt3);margin:6px 0 0}.p6-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.p6-stat-grid article{padding:18px;text-align:center;background:var(--water);border-radius:16px}.p6-stat-grid b{display:block;font:500 italic 38px var(--font-num);color:var(--ink)}.p6-stat-grid span{font-size:12px;color:var(--txt3)}.p6-method-note{max-width:850px}.p6-featured-card span{font-size:11px;color:var(--txt3)}.p6-featured-card h3{font-family:var(--font-head);font-size:16px;line-height:1.55;margin:8px 0}.p6-featured-card h3 a{color:var(--ink);text-underline-offset:3px}.p6-more{text-align:right}.p6-guide-grid>a{min-height:64px;justify-content:center;color:var(--ink);font-weight:600}.p6-noscript{max-width:980px;margin:auto;padding:28px;font-family:sans-serif}.p6-noscript a{display:inline-block;min-height:44px;padding:10px 5px}.p6-data-analysis{margin:22px 0 30px;padding:20px;background:linear-gradient(145deg,#fff,var(--water));border:1px solid var(--border);border-radius:16px}.p6-data-analysis h3{margin-top:0}.p6-method{font-size:13px;color:var(--txt2)}.p6-bars{display:grid;gap:10px;margin:18px 0}.p6-bar-row{display:grid;grid-template-columns:125px minmax(100px,1fr) 70px;gap:10px;align-items:center;font-size:12px}.p6-bar-row>span{height:16px;background:#fff;border-radius:999px;overflow:hidden}.p6-bar-row i{display:block;height:100%;background:linear-gradient(90deg,var(--deep),var(--iris-1));border-radius:inherit}.p6-bar-row b{text-align:right;font-family:var(--font-num)}.p6-metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.p6-metric-grid article{padding:14px;background:rgba(255,255,255,.82);border-radius:12px}.p6-metric-grid h4{font-family:var(--font-head);margin:0 0 8px}.p6-metric-grid p{font-size:12px;margin:5px 0}.p6-metric-grid b{font-family:var(--font-num);font-size:18px}.p6-samples a{display:inline}.p6-sources{padding:18px;background:#fff;border:1px solid var(--border);border-radius:16px}.p6-sources h3{font-size:17px}.p6-price-table{min-width:900px}.p6-split-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}.p6-split-grid section,.p6-check-table>div{background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px}.p6-check-table{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}.p6-check-table strong,.p6-check-table span{display:block}.p6-check-table span{font-size:13px;color:var(--txt2);margin-top:6px}.p6-featured-image{display:flex;align-items:center;justify-content:center;width:100%;height:180px;margin-bottom:13px;overflow:hidden;background:#fff;border:1px solid var(--border);border-radius:12px}.p6-featured-image img{display:block;width:100%;height:100%;object-fit:contain}.p6-featured-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:42px;background:linear-gradient(145deg,var(--base),var(--water))}.p6-featured-fallback[hidden]{display:none}@media(max-width:700px){.p6-home-section{padding:40px 16px}.p6-stat-grid{grid-template-columns:repeat(2,1fr)}.p6-entry-grid,.p6-featured-grid,.p6-guide-grid,.p6-split-grid,.p6-check-table{grid-template-columns:1fr}.p6-bar-row{grid-template-columns:105px minmax(70px,1fr) 62px}.p6-data-analysis{padding:15px}.p6-featured-image{height:220px}}
/* PRIORITY6_HOME_CSS_END */\n`;
}

function replaceMarkerOrRange(source, startMarker, endMarker, replacement, fallbackStart, fallbackEnd){
  const markerStart = source.indexOf(startMarker);
  if (markerStart >= 0){
    const markerEnd = source.indexOf(endMarker, markerStart);
    if (markerEnd < 0) throw new Error(`終端マーカーがありません: ${endMarker}`);
    return source.slice(0,markerStart) + replacement + source.slice(markerEnd + endMarker.length);
  }
  const start = source.indexOf(fallbackStart);
  const end = source.indexOf(fallbackEnd,start);
  if (start < 0 || end < 0) throw new Error(`置換範囲が見つかりません: ${fallbackStart}`);
  return source.slice(0,start) + replacement + source.slice(end);
}

function updateHome(source){
  source = replaceMarkerOrRange(source,"<div id=\"productsPage\" class=\"page active\">\n  <!-- PRIORITY6_HOME_START -->","<!-- PRIORITY6_HOME_END -->\n</div>",homeHtml().trimEnd(),"<div id=\"productsPage\" class=\"page active\">","<div id=\"brandsPage\"");
  source = source.replace(/<noscript>[\s\S]*?<\/noscript>/,noscriptHtml());
  if (source.includes("PRIORITY6_HOME_CSS_START")) source = source.replace(/\/\* PRIORITY6_HOME_CSS_START \*\/[\s\S]*?\/\* PRIORITY6_HOME_CSS_END \*\//,homeStyles().trim());
  else source = source.replace("</style>",homeStyles() + "</style>");
  source = source.replace(/<a class="nav-btn active" data-page="products" href="\/products" onclick="return navigatePage\(event,'products'\)">商品<\/a>/,'<a class="nav-btn" data-page="products" href="/products">商品</a>');
  for (const [name,href,label] of [["brands","/brands","ブランド"],["ranking","/ranking","ランキング"],["diagnosis","/diagnosis","肌診断"],["column","/columns","コラム"],["favorites","/favorites","お気に入り"]]){
    const exact = `<a class="nav-btn" data-page="${name}" href="${href}" onclick="return navigatePage(event,'${name}')">${label}</a>`;
    source = source.replace(exact,`<a class="nav-btn" data-page="${name}" href="${href}">${label}</a>`);
  }
  source = source.replace("\napplyFilters();\nrenderBrands();","\nif(document.getElementById(\"products\")) applyFilters();\nrenderBrands();");
  const styleEnd = source.indexOf("</style>");
  const scriptStart = source.indexOf('<script type="application/ld+json">',styleEnd);
  const scriptEnd = source.indexOf("</script>",scriptStart) + "</script>".length;
  if (scriptStart < 0 || scriptEnd < 0) throw new Error("トップItemList JSON-LDを特定できません");
  const navSchema = {"@context":"https://schema.org","@type":"ItemList","name":"Moilumの主要な比較入口","numberOfItems":6,"itemListElement":[
    ["商品一覧","/products"],["ブランド一覧","/brands"],["比較ランキング","/ranking"],["肌タイプ診断","/diagnosis"],["スキンケアコラム","/columns"],["評価方針","/about/rating-policy"]
  ].map(([name,url],index) => ({"@type":"ListItem","position":index+1,"name":name,"url":SITE_ORIGIN+url}))};
  const replacement = `<!-- PRIORITY6_HOME_SCHEMA_START -->\n<script type="application/ld+json">${safeJson(navSchema)}</script>\n<!-- PRIORITY6_HOME_SCHEMA_END -->`;
  if (source.includes("PRIORITY6_HOME_SCHEMA_START")){
    source = source.replace(/<!-- PRIORITY6_HOME_SCHEMA_START -->[\s\S]*?<!-- PRIORITY6_HOME_SCHEMA_END -->/,replacement);
  } else source = source.slice(0,scriptStart) + replacement + source.slice(scriptEnd);
  return source;
}

function updateMetadata(){
  const originalById = new Map(columns.map(column => [column.id, structuredClone(column)]));
  const templateById = new Map(PRIORITY6_COLUMNS.map(column => [column.id,column]));
  const updated = columns.map(column => {
    const template = templateById.get(column.id);
    if (!template) return column;
    return {...column,cat:template.cat,title:template.title,excerpt:template.excerpt,description:template.description,published:template.published,updated:template.updated,authorName:template.authorName};
  });
  for (const item of updated){
    if (!targetIds.has(item.id) && JSON.stringify(item) !== JSON.stringify(originalById.get(item.id))) throw new Error(`対象外metadataが変化しました: ${item.id}`);
  }
  fs.writeFileSync(COLUMNS_FILE,JSON.stringify(updated),"utf8");
}

let updatedIndex = replaceTargetColumns(originalIndex);
updatedIndex = updateHome(updatedIndex);
for (const token of PROTECTED){
  if (countToken(originalIndex,token) !== countToken(updatedIndex,token)) throw new Error(`保護トークン数が変化しました: ${token}`);
}
if (findArrayRange(originalIndex,"const PRODUCTS=").end - findArrayRange(originalIndex,"const PRODUCTS=").start !== findArrayRange(updatedIndex,"const PRODUCTS=").end - findArrayRange(updatedIndex,"const PRODUCTS=").start){
  throw new Error("PRODUCTS配列の長さが変化しました");
}
fs.writeFileSync(INDEX_FILE,updatedIndex,"utf8");
updateMetadata();
console.log(`✓ Priority6トップをSSoT生成（登録${products.length}／比較対象${activeProducts.length}／編集部使用${editorProducts.length}／公開情報中心${publicOnlyProducts.length}）`);
console.log(`✓ 対象3コラムの本文・metadataを更新: ${[...targetIds].join(", ")}`);

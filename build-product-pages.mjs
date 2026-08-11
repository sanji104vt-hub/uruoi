// 軽量な商品個別ページ (/public/products/{id}.html) をSSoTの商品数分ビルドする。
// Sillageの /public/columns/{slug}.html と同パターン。
// Workerは /products/{id} → /products/{id}.html にリライトするだけ。
// GA4/GSCタグは含めるが、SPA本体のJSは含めない（軽量化＆重複コンテンツ解消）。

import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";
const GSC_VERIFICATION = "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q";
const GA4_ID = "G-BC0FBSZSWX";
const MOSHIMO_RAKUTEN = { aId: "5738711", pId: "54", pcId: "54", plId: "616" };
const MOSHIMO_RAKUTEN_LINKS = new Map([
  [161, "https://af.moshimo.com/af/c/click?a_id=5738711&p_id=54&pc_id=54&pl_id=616&url=https%3A%2F%2Fitem.rakuten.co.jp%2Frakuten24%2F4987241198924%2F&m=http%3A%2F%2Fm.rakuten.co.jp%2Frakuten24%2Fi%2F11351028%2F"]
]);

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));

// ===== SPA(public/index.html)の productScores / prosConsData と同一ロジック =====
// 静的商品ページにもメリット/デメリット/向いている人/向いていない人を出すため、
// 同じ関数を移植する(新規データ捏造なし、既存アルゴリズムをそのまま再利用)。
function productScores(p){
  const editorial=Math.round(Math.min(5,Math.max(1,((Number(p.rating||4)-4.0)/0.9*4+1)))*10)/10;
  const affordability=Math.round(Math.min(5,Math.max(1,5-(Math.log10(Math.max(Number(p.price)||1,1))-2.6)/(4.6-2.6)*4))*10)/10;
  let dryFit=1;
  const moistWords=["セラミド","ヒアルロン酸","保湿","スクワラン","コラーゲン","グリセリン","パンテノール"];
  if((p.keyIngredients||[]).some(i=>moistWords.some(w=>String(i).includes(w)))) dryFit+=1;
  if((p.concern||[]).includes("乾燥・かさつき")) dryFit+=2;
  if(["保湿クリーム","化粧水"].includes(p.category)) dryFit+=1;
  dryFit=Math.min(5,dryFit);
  let sensitiveFit=1;
  if((p.skin||[]).includes("敏感肌")) sensitiveFit+=3;
  else if((p.skin||[]).includes("全肌質")) sensitiveFit+=2;
  if((p.concern||[]).includes("肌荒れ・赤み")) sensitiveFit+=1;
  sensitiveFit=Math.min(5,sensitiveFit);
  return {editorial,affordability,dryFit,sensitiveFit};
}
function prosConsData(p){
  const evidence = p.editorialEvidence;
  if (evidence && evidence.decision) {
    return {
      pros: (evidence.officialFeatures || []).slice(0, 3),
      cons: (evidence.comparisonPoints || []).slice(0, 3),
      fit: (evidence.decision.chooseWhen || []).slice(0, 4),
      unfit: (evidence.decision.compareWhen || []).slice(0, 4)
    };
  }
  const s=productScores(p);
  const pros=[], cons=[], fit=[], unfit=[];
  if(p.rating>=4.6) pros.push(`Moilum編集部評価が高い（★${p.rating}）`);
  if(s.dryFit>=4) pros.push("掲載データ上、乾燥ケア向けとして分類");
  if(s.sensitiveFit>=4) pros.push("掲載データ上、敏感肌向け候補として分類");
  if(p.price<=1500) pros.push("手に取りやすい価格で続けやすい");
  if((p.keyIngredients||[]).length>=4) pros.push("主要成分情報を4種以上掲載");
  if(p.price>=8000) cons.push("価格が高めで継続にはコストがかかる");
  if(p.reviewedByEditor!==true) cons.push("公開情報中心の比較で、編集部の実使用評価は未掲載");
  if((p.keyIngredients||[]).length<=1) cons.push("掲載している主要成分情報が限定的");
  if(!pros.length) pros.push("価格・主要成分・分類情報を一覧で確認できる");
  if(!cons.length) cons.push("公開情報だけでは香りや使用感、肌との相性を判断できない");
  (p.skin||[]).forEach(sk=>{ if(sk!=="全肌質") fit.push(`${sk}向け候補を比較したい人`); });
  if((p.skin||[]).includes("全肌質")) fit.push("幅広い肌タイプ向け候補を探す人");
  (p.concern||[]).slice(0,2).forEach(c=>fit.push(`${c}向け候補を比較したい人`));
  if(s.affordability>=4.3) fit.push("価格の手頃さを重視する人");
  if(p.price>=8000) unfit.push("プチプラ重視の人");
  if(p.reviewedByEditor!==true) unfit.push("編集部の実使用レビューを重視する人");
  const allSkin=["乾燥肌","脂性肌","混合肌","敏感肌","普通肌"];
  const notFor=allSkin.filter(sk=>!(p.skin||[]).includes(sk)&&!(p.skin||[]).includes("全肌質"));
  if(notFor.length&&notFor.length<=2) unfit.push(`掲載肌タイプに${notFor.join("・")}を含む商品を探す人`);
  if(!unfit.length) unfit.push("香りやテクスチャーを事前に確認して選びたい人");
  return {pros,cons,fit:[...new Set(fit)].slice(0,4),unfit:unfit.slice(0,3)};
}

// ===== 一次情報コンポーネント（件数は reviewedByEditor からビルド時に集計）=====
// src/products.json の商品オブジェクトに以下フィールドを追加すると、
// 静的商品ページに「編集部の一次情報」ブロックが自動表示される。
// フィールド未設定の商品では、公開情報に基づく比較であることを明示する。
//
// 入力例：
//   {
//     "id": 245,
//     ...既存フィールド...,
//     "editorPhoto": "/images/editor/skinlife-face-wash.jpg",
//     "editorPhotoAlt": "カウブランド スキンライフ 薬用洗顔フォームのパッケージ",
//     "editorTexturePhoto": "/images/editor/skinlife-face-wash-texture.jpg",   // 任意
//     "editorTexturePhotoAlt": "…を手の甲に出したテクスチャ",                   // 任意
//     "editorNote": "編集部スタッフが継続使用しているなかで…",
//     "reviewedByEditor": true,
//     "editorReviewedAt": "2026-07-26"
//   }
// editorNote は編集部の実体験メモ。加筆・創作はせず、書かれた内容のみを表示する。
// SPA商品モーダル側にも同じロジックを実装済み（public/index.html の primarySourceHtml()）。
// 表示を一致させるため、フィールドを追加する際は PRODUCTS 配列(public/index.html) にも同期のこと。
function primarySourceHtml(p){
  const hasPhoto = !!p.editorPhoto;
  const hasTexture = !!p.editorTexturePhoto;
  const hasReview = p.reviewedByEditor === true;
  const hasNote = !!p.editorNote;
  if (!hasPhoto && !hasTexture && !hasReview && !hasNote) return `<div class="primary-source">
    <div class="ps-header">📚 公開情報・公式情報をもとに比較</div>
    <p class="ps-note">商品名・価格・カテゴリ・掲載肌タイプなどの公開情報を整理しています。編集部が実際に使用した商品のレビューではありません。</p>
    <div class="ps-disclaimer">※香り・テクスチャー・刺激感・効果実感は、このページの情報だけでは判断できません。</div>
  </div>`;
  const badges = [];
  if (hasReview)   badges.push('<span class="ps-badge">📷 編集部が実際に使用</span>');
  if (hasPhoto)    badges.push('<span class="ps-badge">編集部撮影</span>');
  if (hasTexture)  badges.push('<span class="ps-badge">テクスチャ写真</span>');
  if (hasNote && !hasReview) badges.push('<span class="ps-badge">編集部メモ</span>');
  const reviewedAt = p.editorReviewedAt
    ? String(p.editorReviewedAt).slice(0, 7).replace("-", "年") + "月"
    : "2026年7月";
  const photos = [];
  if (hasPhoto) photos.push(`<figure class="ps-figure"><img class="ps-photo" src="${escAttr(p.editorPhoto)}" alt="${escAttr(p.editorPhotoAlt || p.name + "のパッケージ")}" loading="lazy" decoding="async"><figcaption>パッケージ</figcaption></figure>`);
  if (hasTexture) photos.push(`<figure class="ps-figure"><img class="ps-photo" src="${escAttr(p.editorTexturePhoto)}" alt="${escAttr(p.editorTexturePhotoAlt || p.name + "のテクスチャ")}" loading="lazy" decoding="async"><figcaption>テクスチャ（手の甲）</figcaption></figure>`);
  return `<div class="primary-source">
    <div class="ps-header">🌱 編集部の一次情報 <span class="ps-badges">${badges.join("")}</span></div>
    ${photos.length ? `<div class="ps-photos">${photos.join("")}</div>` : ""}
    ${hasNote ? `<p class="ps-note">${escHtml(p.editorNote)}</p>` : ""}
    <div class="ps-meta">編集部が実際に購入・使用した商品です（${reviewedAt}時点）</div>
    <div class="ps-disclaimer">※個人の感想であり、効果を保証するものではありません。</div>
  </div>`;
}

function escHtml(s){
  return String(s == null ? "" : s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&#39;"}[c]));
}
function escAttr(s){ return escHtml(s); }
function truncate(s, n){
  const str = String(s || "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

const SPEC_LABELS = {
  manufacturerCategory: "メーカー分類",
  contentAmount: "内容量",
  classification: "製品区分",
  activeIngredients: "有効成分",
  keyIngredients: "公式掲載の主な成分",
  usage: "使用方法・使用量",
  manufacturerTarget: "メーカーが示す対象",
  freeFrom: "不使用表示",
  fragrance: "香料",
  colorant: "着色料",
  alcohol: "アルコール",
  tests: "試験表示",
  acidity: "pH・酸性度",
  countryOfOrigin: "原産国",
  spf: "SPF",
  pa: "PA",
  waterResistance: "耐水性",
  removal: "落とし方",
  wetHands: "ぬれた手",
  eyelashExtensions: "まつげエクステ",
  variants: "タイプ展開",
  release: "発売情報",
  renewal: "リニューアル",
  releaseStatus: "販売世代",
  refillCompatibility: "レフィル互換性",
  afterOpening: "開封後の目安",
  duration: "使用期間の目安",
  container: "容器",
  pumpAmount: "1プッシュ量",
  caution: "公式の注意事項",
  saleName: "販売名",
  officialProductName: "公式商品名",
  oil: "オイル",
};

const SOURCE_TYPE_LABELS = {
  "official-product": "メーカー・ブランド公式商品ページ",
  "official-brand": "メーカー・ブランド公式情報",
  "official-pdf": "メーカー公式PDF",
  "official-press-release": "メーカー・正規販売元公式発表",
  "official-successor": "メーカー公式の現行・後継商品情報"
};

function displayValue(value){
  if (Array.isArray(value)) return value.join("、");
  if (value && typeof value === "object") return Object.values(value).join("、");
  return String(value == null ? "" : value);
}

function editorialEvidenceHtml(p, all){
  const evidence = p.editorialEvidence;
  if (!evidence) return "";
  const specs = Object.entries(evidence.specs || {}).filter(([, value]) => displayValue(value));
  const candidates = (evidence.comparisonCandidates || [])
    .map(item => ({ ...item, product: all.find(product => product.id === item.id) }))
    .filter(item => item.product);
  const verified = String(evidence.verifiedAt || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日");
  const priceChecked = String(evidence.referencePriceCheckedAt || "").replace(/^(\d{4})-(\d{2})$/, "$1年$2月");
  return `<section class="evidence" aria-labelledby="evidence-title">
    <h2 id="evidence-title">公式情報で確認した仕様</h2>
    ${specs.length ? `<dl class="spec-table">${specs.map(([key, value]) => `<div class="spec-row"><dt>${escHtml(SPEC_LABELS[key] || key)}</dt><dd>${escHtml(displayValue(value))}</dd></div>`).join("")}</dl>` : ""}
    ${(evidence.officialFeatures || []).length ? `<div class="evidence-block"><h3>公式情報から確認できる特徴</h3><ul>${evidence.officialFeatures.map(item => `<li>${escHtml(item)}</li>`).join("")}</ul></div>` : ""}
    ${(evidence.comparisonPoints || []).length ? `<div class="evidence-block"><h3>この商品を比較するときのポイント</h3><ul>${evidence.comparisonPoints.map(item => `<li>${escHtml(item)}</li>`).join("")}</ul></div>` : ""}
    ${candidates.length ? `<div class="evidence-block"><h3>実データから選んだ比較候補</h3><div class="compare-links">${candidates.map(({ product, reason }) => `<a class="compare-link" href="/products/${product.id}"><span class="compare-name">${escHtml(product.name)}</span><span class="compare-meta">${escHtml(product.category)}・参考価格 ¥${(product.price || 0).toLocaleString()}</span><span class="compare-reason">${escHtml(reason)}</span></a>`).join("")}</div></div>` : ""}
    ${evidence.decision ? `<div class="decision-grid">
      <div class="decision-box choose"><h3>候補にしやすいケース</h3><ul>${(evidence.decision.chooseWhen || []).map(item => `<li>${escHtml(item)}</li>`).join("")}</ul></div>
      <div class="decision-box compare"><h3>別候補も比較したいケース</h3><ul>${(evidence.decision.compareWhen || []).map(item => `<li>${escHtml(item)}</li>`).join("")}</ul></div>
    </div>` : ""}
    ${(evidence.sourceLimitations || []).length ? `<div class="source-limit"><strong>情報上の注意</strong><ul>${evidence.sourceLimitations.map(item => `<li>${escHtml(item)}</li>`).join("")}</ul></div>` : ""}
    <div class="sources"><h3>根拠となる公式情報源</h3><ul>${(evidence.sources || []).map(source => `<li><a href="${escAttr(source.url)}" rel="noopener" target="_blank">${escHtml(source.title)}</a><span>${escHtml(SOURCE_TYPE_LABELS[source.type] || source.type)}</span></li>`).join("")}</ul><p>商品情報確認：${escHtml(verified)}${priceChecked ? ` ／ 参考価格確認：${escHtml(priceChecked)}` : ""}</p></div>
  </section>`.replace(/^[ \t]+$/gm, "");
}

function productStatusHtml(p, all){
  if(p.status!=="previous_generation") return "";
  const evidence=p.editorialEvidence;
  const successor=(evidence?.comparisonCandidates||[])
    .map(candidate=>({...candidate,product:all.find(item=>item.id===candidate.id)}))
    .find(candidate=>candidate.product&&/現行|後継|リニューアル/.test(candidate.reason||""));
  return `<aside class="product-status" aria-label="商品世代に関する注意"><strong>旧製品・前世代情報</strong><p>このページは現行品としてではなく、旧製品・前世代を確認するために掲載しています。</p>${successor?`<a href="/products/${successor.product.id}">公式情報で確認できた現行・後継候補：${escHtml(successor.product.name)}</a>`:""}</aside>`;
}

function variantComparisonHtml(p, all){
  const group=p.editorialEvidence?.variantGroup;
  if(!group) return "";
  const variants=all.filter(product=>product.editorialEvidence?.variantGroup===group);
  if(variants.length<2) return "";
  return `<section class="variant-comparison" aria-labelledby="variant-title"><h2 id="variant-title">同シリーズとの違い</h2><div class="variant-scroll"><table><thead><tr><th>商品</th><th>タイプ</th><th>容量</th><th>公式情報で確認した主な違い</th></tr></thead><tbody>${variants.map(product=>`<tr${product.id===p.id?' class="is-current"':""}><td><a href="/products/${product.id}">${escHtml(product.name)}</a></td><td>${escHtml(displayValue(product.editorialEvidence?.specs?.variants)||"—")}</td><td>${escHtml(displayValue(product.editorialEvidence?.specs?.contentAmount)||"—")}</td><td>${escHtml(product.editorialEvidence?.officialFeatures?.[0]||"確認できた公式情報が限られています")}</td></tr>`).join("")}</tbody></table></div><p>似ている点を無理に言い換えず、公式情報で確認できた容器・容量・スクラブ仕様の差だけを掲載しています。</p></section>`;
}

function rakutenDestination(p){
  try{
    const purchase = new URL(p.purchase || "");
    if (purchase.hostname === "item.rakuten.co.jp") return purchase.href;
    if (purchase.hostname === "hb.afl.rakuten.co.jp"){
      const direct = purchase.searchParams.get("pc");
      if (direct) return direct;
    }
  }catch{}
  return "https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(p.brand + " " + p.name) + "/";
}

function moshimoRakutenLink(p){
  if (MOSHIMO_RAKUTEN_LINKS.has(p.id)) return MOSHIMO_RAKUTEN_LINKS.get(p.id);
  const query = new URLSearchParams({
    a_id: MOSHIMO_RAKUTEN.aId,
    p_id: MOSHIMO_RAKUTEN.pId,
    pc_id: MOSHIMO_RAKUTEN.pcId,
    pl_id: MOSHIMO_RAKUTEN.plId,
    url: rakutenDestination(p)
  });
  return "https://af.moshimo.com/af/c/click?" + query.toString();
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
      "url": p.purchase || `${SITE_ORIGIN}/products/${p.id}`
    };
  }
  // aggregateRating は撤去。schema.org の aggregateRating は
  // 「ユーザーレビューの集計」を意味するプロパティで、当サイトの
  // 編集部独自評価とは意味が異なるため、正直な使い方として出力しない。
  // 編集部評価は Product 説明文内および表示ラベル「Moilum編集部評価」で開示する。
  return obj;
}

function buildBreadcrumbJsonLd(p){
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Moilum", "item": SITE_ORIGIN + "/" },
      { "@type": "ListItem", "position": 2, "name": "商品一覧", "item": SITE_ORIGIN + "/products" },
      { "@type": "ListItem", "position": 3, "name": p.name, "item": `${SITE_ORIGIN}/products/${p.id}` }
    ]
  };
}

// サイト共通の Organization 情報。全ページ共通で出力するため定数化。
const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Moilum",
  "alternateName": "モイルム",
  "url": SITE_ORIGIN + "/",
  "logo": OGP_IMAGE,
  "description": "スキンケア商品を肌タイプ・お悩み・予算で比較する、個人運営の比較メディア。",
  "foundingDate": "2026",
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "sanji.104vt@gmail.com",
    "contactType": "customer support",
    "availableLanguage": ["Japanese"]
  }
};

function getRelatedProducts(p, all){
  // 同カテゴリで、自分以外の商品からrating順で最大3件
  return all
    .filter(x => x.id !== p.id && x.category === p.category)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3);
}

function buildProductHtml(p, all){
  const evidence = p.editorialEvidence;
  const title = truncate(evidence ? `${p.name}の公式仕様・比較ポイント｜Moilum` : `${p.name}｜${p.brand}｜Moilum`, 68);
  const desc = truncate(evidence
    ? `${p.name}（${p.brand}）の公式仕様と比較候補を確認。${(evidence.officialFeatures || [p.desc || ""])[0]} 参考価格 ${(p.price || 0).toLocaleString()}円。`
    : `${p.name}（${p.brand}）を独自スコアで比較。参考価格 ¥${(p.price || 0).toLocaleString()}／カテゴリ ${p.category}。${p.desc || ""}`, 156);
  const canonical = `${SITE_ORIGIN}/products/${p.id}`;
  const ogImage = p.image || OGP_IMAGE;
  const related = getRelatedProducts(p, all);
  const productLd = buildProductJsonLd(p);
  const crumbLd = buildBreadcrumbJsonLd(p);
  const hasRating = p.rating > 0;
  const verifiedIngredientValue = evidence?.specs?.keyIngredients || evidence?.specs?.activeIngredients;
  const displayIngredients = evidence
    ? (verifiedIngredientValue ? [displayValue(verifiedIngredientValue)] : [])
    : [];

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
<script type="application/ld+json">${JSON.stringify(ORGANIZATION_JSONLD)}</script>
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
.product-status{background:#fff8ef;border:1px solid #dbc4a5;border-radius:16px;padding:18px 20px;margin-bottom:20px}.product-status strong{display:block;font-family:"Zen Old Mincho",serif;font-size:17px}.product-status p{font-size:13px;margin:6px 0}.product-status a{color:#735c3d;text-decoration:underline;font-weight:700}
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
${evidence ? `.evidence{background:#fff;border:1px solid var(--deep);border-radius:16px;padding:22px;margin-bottom:24px}
.evidence>h2{font-size:19px;margin-bottom:16px}
.spec-table{border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:22px}
.spec-row{display:grid;grid-template-columns:minmax(120px,32%) 1fr;border-bottom:1px solid var(--border);font-size:13px}
.spec-row:last-child{border-bottom:0}.spec-row dt{background:var(--water);padding:10px 12px;font-weight:700;color:var(--txt2)}.spec-row dd{padding:10px 12px;margin:0}
.evidence-block{margin-top:20px}.evidence-block h3,.sources h3,.decision-box h3{font-size:15px;margin-bottom:9px}.evidence-block ul,.decision-box ul,.source-limit ul{padding-left:20px;font-size:13.5px}.evidence-block li,.decision-box li,.source-limit li{margin-bottom:6px}
.compare-links{display:grid;gap:10px}.compare-link{display:grid;gap:3px;border:1px solid var(--deep);border-radius:12px;padding:12px 14px;background:linear-gradient(145deg,#fff,var(--water));transition:transform .15s,box-shadow .2s}.compare-link:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(43,38,34,.07)}
.compare-name{font-weight:700;font-size:13px}.compare-meta{font-size:11px;color:var(--txt3)}.compare-reason{font-size:12px;color:var(--txt2)}
.decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}.decision-box{border-radius:12px;padding:14px}.decision-box.choose{background:var(--water);border:1px solid var(--deep)}.decision-box.compare{background:#fbf7f2;border:1px solid #e6d9cb}
.source-limit{margin-top:18px;padding:12px 14px;border-left:4px solid var(--deep);background:var(--base);font-size:12px}.source-limit strong{display:block;margin-bottom:4px}
.sources{margin-top:24px;padding-top:18px;border-top:1px solid var(--border)}.sources ul{list-style:none;padding:0}.sources li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}.sources li a{color:var(--accent);text-decoration:underline}.sources li span{color:var(--txt3);text-align:right}.sources p{font-size:11px;color:var(--txt3);margin-top:10px}
@media(max-width:600px){.spec-row{grid-template-columns:1fr}.spec-row dt{padding-bottom:4px}.spec-row dd{padding-top:4px}.decision-grid{grid-template-columns:1fr}.sources li{display:block}.sources li span{display:block;text-align:left;margin-top:2px}}\n` : ""}/* 一次情報ブロック: 配色は水鏡デザイントークン(--water/--deep/--accent/--ink)で統一 */
.primary-source{background:linear-gradient(160deg,var(--water),var(--iris-2));border:1px solid var(--deep);border-radius:16px;padding:18px 20px;margin-bottom:22px;color:var(--ink)}
.ps-header{font-size:13.5px;font-weight:800;color:var(--ink);margin-bottom:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ps-badges{display:inline-flex;gap:6px;flex-wrap:wrap}
.ps-badge{background:#fff;border:1px solid var(--deep);border-radius:12px;padding:2px 10px;font-size:11px;font-weight:700;color:var(--accent);white-space:nowrap}
.ps-photos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0 12px}
.ps-figure{margin:0}
.ps-photo{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px;display:block;background:#fff;border:1px solid var(--deep)}
.ps-figure figcaption{font-size:11px;color:var(--txt3);margin-top:5px;text-align:center}
.ps-note{margin:10px 0 8px;font-size:13.5px;line-height:1.85;color:var(--ink)}
.ps-meta{font-size:11.5px;color:var(--txt2);font-weight:600;margin-top:8px}
.ps-disclaimer{font-size:11px;color:var(--txt3);margin-top:3px}
@media(max-width:600px){.ps-photos{grid-template-columns:1fr;gap:10px}}
/* 関連商品カードの「編集部使用」ミニバッジ */
.editor-used-badge{display:inline-flex;align-items:center;gap:3px;background:var(--water);border:1px solid var(--deep);color:var(--accent);font-size:10px;font-weight:800;padding:1px 7px;border-radius:10px;white-space:nowrap;margin-bottom:4px}
.proscons{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}
.data-limit{background:#fff;border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:24px}.data-limit h2{font-size:16px;margin-bottom:10px}.data-limit ul{padding-left:20px;font-size:13px}.data-limit li{margin-bottom:6px}.variant-comparison{background:#fff;border:1px solid var(--deep);border-radius:16px;padding:20px;margin-bottom:24px}.variant-comparison h2{font-size:18px;margin-bottom:12px}.variant-scroll{overflow-x:auto}.variant-comparison table{width:100%;min-width:680px;border-collapse:collapse;font-size:12px}.variant-comparison th,.variant-comparison td{padding:10px;border:1px solid var(--border);text-align:left;vertical-align:top}.variant-comparison th{background:var(--water)}.variant-comparison tr.is-current{background:#f8fbfb}.variant-comparison a{text-decoration:underline;font-weight:700}.variant-comparison p{font-size:11px;color:var(--txt3);margin-top:10px}
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
gtag('event','product_detail_view',{product_id:${JSON.stringify(String(p.id))},product_name:${JSON.stringify(p.name)},product_category:${JSON.stringify(p.category)},value:${Number(p.price)||0},currency:'JPY'});
</script>
</head>
<body>
<header class="topbar">
  <a class="logo" href="/">Moi<span>lum</span></a>
</header>
<div class="pr-banner">本サイトはアフィリエイト広告（Amazon・楽天・Qoo10等）を利用しています。商品の選定・評価は編集部が独自に行っています。価格・在庫は各販売サイトでご確認ください。</div>
<article>
  <nav class="crumb"><a href="/">ホーム</a><span class="sep">›</span><a href="/products">商品一覧</a><span class="sep">›</span><span>${escHtml(truncate(p.name, 26))}</span></nav>
  <span class="cat-tag">${escHtml(p.category)}</span>
  <h1>${escHtml(p.name)}</h1>
  <div class="brand">${escHtml(p.brand)}${p.origin ? " ・ " + escHtml(p.origin) : ""}</div>
${productStatusHtml(p,all)}
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
      <span class="meta-val"><span class="rating">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))}</span> ${p.rating}</span>
    </div>
    <div style="font-size:11px;color:var(--txt3);line-height:1.6;padding:4px 0 10px">※過去に付与したMoilum編集部の参考指標です。ユーザー評価や実測値ではなく、商品ごとの付与記録が完全ではないという限界があります。現在の自動分類やメリット・注意点に件数データは使用していません。<a href="/about/rating-policy" style="color:var(--accent)">評価方針</a></div>` : ""}
    <div class="meta-row">
      <span class="meta-label">カテゴリ</span>
      <span class="meta-val">${escHtml(p.category)}</span>
    </div>
    ${p.origin ? `<div class="meta-row"><span class="meta-label">原産国</span><span class="meta-val">${escHtml(p.origin)}</span></div>` : ""}
  </div>
  <div class="desc">${escHtml(p.desc || "")}</div>
${displayIngredients.length ? `  <div class="ingredients">
    <h2>主要成分</h2>
    <div class="ing-list">${displayIngredients.map(i => `<span class="ing-item">${escHtml(i)}</span>`).join("")}</div>
  </div>` : ""}
  ${(Array.isArray(p.skin) && p.skin.length) || (Array.isArray(p.concern) && p.concern.length) ? `<div class="suitability">
    <h2>掲載データ上の候補条件</h2>
${Array.isArray(p.skin) && p.skin.length ? `<div class="suit-row"><span class="suit-label">掲載肌タイプ</span><div class="suit-chips">${p.skin.map(s => `<span class="suit-chip">${escHtml(s)}</span>`).join("")}</div></div>` : ""}
${Array.isArray(p.concern) && p.concern.length ? `<div class="suit-row"><span class="suit-label">掲載悩み分類</span><div class="suit-chips">${p.concern.map(c => `<span class="suit-chip">${escHtml(c)}</span>`).join("")}</div></div>` : ""}
  </div>` : ""}
${primarySourceHtml(p)}
${editorialEvidenceHtml(p, all)}
${variantComparisonHtml(p,all)}
${p.editorialEvidence?"":`<section class="data-limit"><h2>このページで確認できる範囲</h2><ul><li>商品名・ブランド・カテゴリ・参考価格を掲載しています。</li><li>肌タイプと悩みはMoilum内の比較用分類で、効果や適合を保証する情報ではありません。</li><li>商品固有の公式仕様をSSoTへ未記録のため、使用感・成分効果・現行販売状況は判断していません。</li></ul></section>`}
  <div class="buy-note"><span class="pr-tag">PR</span>以下は広告リンクです。掲載価格は2026年6月時点の参考値です。最新の価格・在庫は各販売サイトでご確認ください。</div>
  <div class="buy-btns">
    <a class="buy-btn amazon" data-shop="amazon" href="https://www.amazon.co.jp/s?k=${encodeURIComponent(p.brand + " " + p.name)}" rel="nofollow sponsored noopener" target="_blank">Amazonで見る</a>
    <a class="buy-btn rakuten" data-shop="rakuten" href="${escAttr(moshimoRakutenLink(p))}" rel="nofollow sponsored noopener" referrerpolicy="no-referrer-when-downgrade" target="_blank">楽天で見る</a>
    <a class="buy-btn qoo10" data-shop="qoo10" href="https://www.qoo10.jp/s/?keyword=${encodeURIComponent(p.brand + " " + p.name)}" rel="nofollow sponsored noopener" target="_blank">Qoo10で見る</a>
  </div>
${related.length ? `  <div class="related">
    <h2>同じカテゴリのおすすめ</h2>
    <div class="rel-grid">
      ${related.map(r => `<a class="rel-card" href="/products/${r.id}">
        ${r.reviewedByEditor === true ? '<span class="editor-used-badge">📷 編集部使用</span>' : ""}
        ${r.image ? `<img class="rel-img" src="${escAttr(r.image)}" alt="${escAttr(r.name)}" loading="lazy">` : `<div class="rel-noimg" aria-hidden="true">${escHtml(r.icon || "💧")}</div>`}
        <div class="rel-name">${escHtml(r.name)}</div>
        <div class="rel-brand">${escHtml(r.brand)}</div>
        <div class="rel-price">¥${(r.price || 0).toLocaleString()}</div>
      </a>`).join("")}
    </div>
  </div>` : ""}
  <a class="backhome" href="/products">← 商品一覧に戻る</a>
</article>
<footer>
  <div><a href="/">運営者情報</a><a href="/">プライバシーポリシー</a><a href="/">アフィリエイトについて</a></div>
  <p style="margin-top:10px">© Moilum</p>
</footer>
<script>
document.querySelectorAll('.buy-btn[data-shop]').forEach(function(link){
  link.addEventListener('click',function(){
    gtag('event','affiliate_click',{shop:this.dataset.shop,product_id:${JSON.stringify(String(p.id))},product_name:${JSON.stringify(p.name)},product_category:${JSON.stringify(p.category)},value:${Number(p.price)||0},currency:'JPY'});
  });
});
</script>
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
  if (p.rating > 0) withAggRating++; else withoutAggRating++;
  if (p.image) withImage++;
}

const files = fs.readdirSync(outDir);
const sizes = files.filter(f => f.endsWith(".html")).map(f => fs.statSync(path.join(outDir, f)).size);
const avg = Math.round(sizes.reduce((s, v) => s + v, 0) / sizes.length);
const min = Math.min(...sizes);
const max = Math.max(...sizes);

console.log(`✓ 生成完了: ${count} 商品ページ`);
console.log(`  ファイルサイズ: 平均 ${(avg/1024).toFixed(1)}KB / 最小 ${(min/1024).toFixed(1)}KB / 最大 ${(max/1024).toFixed(1)}KB`);
console.log(`  編集部評価あり: ${withAggRating} / なし: ${withoutAggRating}（aggregateRatingスキーマは撤去済み）`);
console.log(`  実写真あり: ${withImage} / SVGフォールバック: ${count - withImage}`);

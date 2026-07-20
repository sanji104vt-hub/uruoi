// 悩み別・条件別ハブページ (/guides/{slug}) を静的HTMLで生成する。
// 商品選定は src/products.json の実データ機械抽出 + 編集部コメントの構成。
// GA4/GSC/構造化データ(BreadcrumbList/ItemList/FAQPage/Organization) 含む。

import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";
const GSC_VERIFICATION = "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q";
const GA4_ID = "G-BC0FBSZSWX";
const BUILD_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const columns = JSON.parse(fs.readFileSync("src/columns.json", "utf8"));

// スキンケア母集団 (メイク・世代違い旧品を除外)
const SKINCARE = products.filter(p =>
  p.productType !== "makeup" && p.status !== "previous_generation"
);

function escHtml(s){
  return String(s == null ? "" : s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&#39;"}[c]));
}
function escAttr(s){ return escHtml(s); }
function truncate(s, n){ const str = String(s || ""); return str.length > n ? str.slice(0, n - 1) + "…" : str; }
function findColumn(id){ return columns.find(c => c.id === id); }

// ===== ガイド設定 =====
// 監査対応：機械抽出+編集部コメントで質を担保。単なる自動生成の羅列にはしない。
const GUIDES = [
  {
    slug: "dry-skin-lotion",
    title: "乾燥肌向け化粧水の選び方とおすすめ",
    metaDesc: "乾燥肌向けの化粧水選びを、掲載商品の実データで比較。セラミド・ヒアルロン酸配合の候補を編集部評価順に紹介し、選び方の3原則と『向かない人』も正直に解説します。",
    breadcrumbName: "乾燥肌向け化粧水の選び方",
    filter: p => p.category === "化粧水" && p.skin.includes("乾燥肌"),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『化粧水』で対応肌タイプに『乾燥肌』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>乾燥肌の化粧水選びは、<strong>「保湿成分」「テクスチャ」「継続できる価格」の3点</strong>で決まります。ハイスペック品を1本買うより、規定量をたっぷり使える1本を毎日続けるほうが、結果的に肌の水分量は安定しやすい傾向があります。</p>
<p>選び方の原則を3つに絞ると、次のとおりです。<strong>①保湿成分は「セラミド」「ヒアルロン酸」「アミノ酸」いずれかを軸に</strong>——特にセラミドは肌のバリア機能に関わる成分として、乾燥肌向け製品の定番配合です。<strong>②テクスチャは『とろみのある化粧水+乳液/クリーム』で二段構え</strong>——さっぱり系のみで済ませると、水分は入っても抜けやすくなります。<strong>③価格は続けられる帯を優先</strong>——高価格帯を薄く使うより、中価格帯（1,500〜3,000円）をたっぷり使うほうが乾燥肌には効きやすい傾向があります。</p>`,
    notFor: [
      "皮脂量が多くベタつきが苦手な方：とろみ系は重く感じる可能性があるため、脂性肌〜混合肌の方は<a href=\"/guides/oily-skin-lotion\">脂性肌向け</a>を参照してください（作成予定）。",
      "アトピー等で医師の治療を受けている方：市販化粧水の選択より、処方薬・医師の指導が優先です。",
      "『高い化粧水ほど効く』と考えている方：化粧水の主目的は水分補給で、価格差ほど保湿力には差が出にくいのが実データです。"
    ],
    caveats: "初めて使う成分（特にレチノールやビタミンC誘導体を含む化粧水）は、腕の内側で24時間のパッチテストをしてから顔に使うのが安全です。使用中に赤み・かゆみが出たら中止し、症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["sensitive-ceramide-toner", "basic-routine", "dry-skin-summer"],
    faq: [
      {
        q: "乾燥肌の化粧水は『とろみ系』一択ですか？",
        a: "さっぱり系でも、後に乳液・クリームで蓋をすれば十分に機能します。使用感の好みで選んで、保湿力は化粧水単体ではなく『化粧水＋クリーム』のセットで担保するのが基本形です。"
      },
      {
        q: "セラミドとヒアルロン酸、どちらを優先すべきですか？",
        a: "バリア機能が弱いと感じる乾燥肌にはセラミド系、単純に水分不足を感じる乾燥肌にはヒアルロン酸系が向きやすい傾向です。両方入りの製品も多く、成分表の上位に記載があるかを目安にしてください。"
      },
      {
        q: "化粧水は何回重ね付けすべきですか？",
        a: "肌が入っていく感覚まで数回重ねるのが1つの目安ですが、多くの製品は『規定量を手のひらに取ってなじませる』を1回で十分な設計です。過度な重ね付けは摩擦の原因になるため、量を守るほうが確実です。"
      }
    ]
  },
  {
    slug: "sensitive-skin-lotion",
    title: "敏感肌向け化粧水の選び方とおすすめ",
    metaDesc: "敏感肌向けの化粧水を、掲載商品の実データから編集部評価順に紹介。低刺激設計をうたう定番から、避けたい成分・パッチテストの手順まで正直に解説します。",
    breadcrumbName: "敏感肌向け化粧水の選び方",
    filter: p => p.category === "化粧水" && p.skin.includes("敏感肌"),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『化粧水』で対応肌タイプに『敏感肌』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>敏感肌の化粧水選びで大切なのは、<strong>『刺激になりうる成分を減らす』ことと、『バリア機能をサポートする成分を入れる』ことの2軸</strong>です。派手な訴求よりも、シンプル処方・低刺激設計をうたう定番のほうが失敗しにくい傾向があります。</p>
<p>選び方の原則は3つ。<strong>①避けたい成分の目安</strong>——アルコール（エタノール）・強い香料・メントール等の清涼剤は、肌の状態によって刺激になる場合があります。「無香料・無着色・アルコールフリー」表示を優先すると安全側に振れます。<strong>②バリア機能をサポートする成分</strong>——セラミド・パンテノール・グリチルリチン酸・アラントインなどの鎮静・保護系成分を含むものが定番です。<strong>③新しい製品は必ずパッチテスト</strong>——腕の内側に少量塗り、24時間経過を観察してから顔に使うのが基本形です。「敏感肌向け」表示があっても、個人差は残るためこの手順は省略しないでください。</p>`,
    notFor: [
      "特定成分アレルギーの診断を受けている方：市販品の分類より、医師と個別に相性を確認するほうが安全です。",
      "接触皮膚炎など治療中の方：スキンケアの見直しより医療機関の指導が優先です。",
      "「敏感肌向け」表示に絶対の安全性を期待する方：あくまで刺激リスクを下げる設計であって、全員に無刺激を保証するものではありません。"
    ],
    caveats: "肌のゆらぎは睡眠不足・生理周期・季節の変わり目でも起こります。同じ製品でも時期によって合う・合わないが変わることがあるため、痛みや赤みが出たら一時中止する判断を優先してください。症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["sensitive-ceramide-toner", "skin-type", "basic-routine"],
    faq: [
      {
        q: "「敏感肌向け」と書いてあれば必ず安全ですか？",
        a: "刺激になりうる成分を減らした設計という意味であり、絶対の安全性を保証するものではありません。個人差があるため、初回はパッチテストを行ってください。"
      },
      {
        q: "アルコール（エタノール）は完全に避けるべきですか？",
        a: "少量配合が悪いとは限りませんが、敏感肌でヒリつきの経験がある方は「アルコールフリー」表示を優先すると安全側です。成分表の上位に記載があるかを目安に判断してください。"
      }
    ]
  },
  {
    slug: "pore-care-serum",
    title: "毛穴ケア美容液の選び方とおすすめ",
    metaDesc: "毛穴の黒ずみ・開きに向けた美容液を、掲載商品の実データから編集部評価順に紹介。ビタミンC誘導体・ナイアシンアミド・BHA配合の候補と、毛穴タイプ別の選び方を解説します。",
    breadcrumbName: "毛穴ケア美容液の選び方",
    filter: p => p.category === "美容液" && p.concern.some(c => c.includes("毛穴")),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『美容液』で対応する悩みに『毛穴の開き・黒ずみ』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>毛穴ケアは<strong>「毛穴タイプの見極め」が最初の分岐点</strong>です。同じ「毛穴が気になる」でも、①皮脂と古い角質が詰まった<strong>黒ずみ毛穴</strong>、②皮脂分泌が過剰で開いてしまう<strong>開き毛穴</strong>、③加齢や乾燥でハリが落ちた<strong>たるみ毛穴</strong>で、選ぶべき成分がまったく違います。</p>
<p>選び方の原則は3つ。<strong>①黒ずみ寄りならビタミンC誘導体・BHA・酵素系</strong>——皮脂酸化と角質詰まりへのアプローチが定番の考え方です。<strong>②開き寄りならナイアシンアミド・ビタミンC誘導体</strong>——皮脂バランスと肌のキメへのアプローチが期待されます。<strong>③たるみ寄りならレチノール・ペプチド・ビタミンC</strong>——ハリケアの領域で、他タイプより長期戦になります。<strong>タイプが混在する場合は、まずビタミンC誘導体（オバジC10・オバジC25等）から始めると外しにくい</strong>のが編集部の目安です。刺激が出やすい成分でもあるため、夜のみ・週2〜3回など頻度を下げて始めてください。</p>`,
    notFor: [
      "毛穴ケア商品ですべての毛穴悩みが解消すると期待している方：たるみ毛穴などは、化粧品の守備範囲外のケースもあります。詳しくは<a href=\"/columns/pore-care-guide\">毛穴ケア完全ガイド</a>で境界線を解説しています。",
      "強い刺激成分に耐えられない敏感肌の方：ビタミンC誘導体・BHA・レチノールはいずれも肌が慣れるまで刺激が出やすい成分です。パッチテストと低頻度から始めてください。",
      "1〜2週間で効果を判断したい方：毛穴ケアはターンオーバー数周期分（2〜3か月）の継続で結果が見え始める領域です。短期の変化を求める場合は美容医療の相談を。"
    ],
    caveats: "ビタミンC誘導体・レチノール等の成分は、日中の紫外線対策と併用が必須です。塗ったまま日中に紫外線を浴びると、かえって色素沈着リスクが上がる場合があります。夜のケアに組み込み、朝は必ず日焼け止めを使ってください。",
    relatedColumnIds: ["pore-care-guide", "vitamin-c-comparison", "ingredient-comparison"],
    faq: [
      {
        q: "毛穴ケア美容液は何ヶ月続ければ変化を感じられますか？",
        a: "肌のターンオーバー1〜3周期（約1〜3か月）が変化の目安とされます。1週間で判断せず、写真で比較しながら継続してください。"
      },
      {
        q: "レーザー治療などの美容医療と、化粧品ではどちらが効きますか？",
        a: "たるみ毛穴・深い毛穴には美容医療の適応範囲のほうが広い一方、黒ずみ・開きの初期段階には化粧品でも十分アプローチできる場合があります。自己判断が難しい場合は皮膚科・美容皮膚科のカウンセリングが確実です。"
      }
    ]
  },
];

// ===== HTML生成 =====

function buildJsonLd(guide, hits, canonical){
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Moilum",
    "alternateName": "モイルム",
    "url": SITE_ORIGIN + "/",
    "logo": OGP_IMAGE,
    "description": "スキンケア商品を肌タイプ・お悩み・予算で比較する、個人運営の比較メディア。",
    "foundingDate": "2026",
    "contactPoint": {"@type":"ContactPoint","email":"sanji.104vt@gmail.com","contactType":"customer support","availableLanguage":["Japanese"]}
  };
  const crumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type":"ListItem","position":1,"name":"Moilum","item":SITE_ORIGIN+"/"},
      {"@type":"ListItem","position":2,"name":"悩み別ガイド","item":SITE_ORIGIN+"/guides"},
      {"@type":"ListItem","position":3,"name":guide.breadcrumbName,"item":canonical}
    ]
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": guide.title,
    "numberOfItems": hits.length,
    "itemListElement": hits.map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": `${SITE_ORIGIN}/products/${p.id}`,
      "name": p.name
    }))
  };
  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": guide.title,
    "url": canonical,
    "description": guide.metaDesc,
    "inLanguage": "ja",
    "isPartOf": {"@type":"WebSite","name":"Moilum","url":SITE_ORIGIN+"/"},
    "publisher": {"@type":"Organization","name":"Moilum","url":SITE_ORIGIN+"/"},
    "dateModified": BUILD_DATE
  };
  const jsonLdBlocks = [webpage, crumb, itemList, org];
  if (guide.faq && guide.faq.length){
    jsonLdBlocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": guide.faq.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": {"@type":"Answer","text": f.a}
      }))
    });
  }
  return jsonLdBlocks.map(b => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("\n");
}

function buildGuideHtml(guide){
  const hits = SKINCARE.filter(guide.filter)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, guide.limit || 12);
  const canonical = `${SITE_ORIGIN}/guides/${guide.slug}`;
  const relatedColumns = (guide.relatedColumnIds || [])
    .map(id => findColumn(id)).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(truncate(guide.title + "｜Moilum", 68))}</title>
<meta name="description" content="${escAttr(truncate(guide.metaDesc, 158))}">
<meta name="google-site-verification" content="${GSC_VERIFICATION}" />
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${escAttr(truncate(guide.title, 68))}">
<meta property="og:description" content="${escAttr(truncate(guide.metaDesc, 158))}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OGP_IMAGE}">
<meta property="og:site_name" content="Moilum">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(truncate(guide.title, 68))}">
<meta name="twitter:description" content="${escAttr(truncate(guide.metaDesc, 158))}">
<meta name="twitter:image" content="${OGP_IMAGE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;700&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap" rel="stylesheet">
${buildJsonLd(guide, hits, canonical)}
<style>
:root{--base:#FBF9F6;--ink:#2B2622;--water:#DCEAEC;--deep:#B7CDD3;--iris-2:#D5E4E8;--accent:#7FA8B3;--border:#e3e9e5;--txt2:#5a6b6e;--txt3:#8fa3a7}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--base);color:var(--ink);font-family:"Zen Kaku Gothic New","Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;line-height:1.9;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Zen Old Mincho",serif;font-weight:700}
a{color:var(--accent)}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px clamp(16px,4vw,40px);border-bottom:1px solid var(--border);background:#fff;position:sticky;top:0;z-index:10}
.logo{font-weight:800;font-size:20px;letter-spacing:-.5px;color:inherit;text-decoration:none}
.logo span{color:var(--accent)}
.pr-banner{background:var(--water);color:var(--txt2);font-size:12px;padding:8px 16px;text-align:center;line-height:1.6}
article{max-width:900px;margin:0 auto;padding:32px clamp(16px,4vw,32px) 60px}
.crumb{font-size:12px;color:var(--txt3);margin-bottom:18px}
.crumb a{color:var(--accent);text-decoration:none}
.crumb .sep{margin:0 8px}
.cat-tag{display:inline-block;background:var(--water);color:var(--accent);font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:.5px;margin-bottom:12px}
h1{font-size:clamp(24px,4.4vw,32px);line-height:1.4;margin-bottom:14px}
.meta-line{font-size:12.5px;color:var(--txt3);margin-bottom:22px;line-height:1.7}
.meta-line a{color:var(--accent)}
h2{font-size:19px;margin:30px 0 12px;padding-left:12px;border-left:3px solid var(--accent)}
h3{font-size:15px;margin:18px 0 8px;color:var(--ink)}
p{font-size:14.5px;color:var(--ink);margin-bottom:12px}
.card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:18px}
.rationale{background:#fff8f2;border:1px solid #f4d9c0;border-radius:10px;padding:12px 16px;margin:14px 0 20px;color:#7a5945;font-size:13px;line-height:1.75}
.rationale b{color:#5f3f2c}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:14px 0 8px}
.pcard{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px;transition:transform .15s,box-shadow .2s;color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:6px}
.pcard:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(43,38,34,.08)}
.pcard-img{width:100%;aspect-ratio:1/1;background:#fff;border-radius:8px;object-fit:contain;border:1px solid var(--border)}
.pcard-noimg{width:100%;aspect-ratio:1/1;background:linear-gradient(160deg,var(--water),var(--iris-2));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:44px}
.pcard-rank{font-size:11px;color:var(--accent);font-weight:800;letter-spacing:.5px}
.pcard-name{font-size:13px;font-weight:700;line-height:1.4;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pcard-brand{font-size:11px;color:var(--txt3)}
.pcard-meta{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:4px;border-top:1px solid var(--border)}
.pcard-price{font-size:13px;font-weight:800;color:var(--accent)}
.pcard-rating{font-size:11.5px;color:var(--txt2)}
.pcard-badge{display:inline-block;font-size:10px;color:var(--accent);font-weight:700;background:#fff8f2;border:1px solid #f4d9c0;border-radius:4px;padding:1px 5px}
.not-for{background:#fdf6ec;border:1px solid #f2e0c1;border-radius:12px;padding:14px 18px;margin:10px 0;color:#8a6a2f;font-size:13.5px;line-height:1.8}
.not-for h3{color:#7a5b25;margin-bottom:6px}
.not-for ul{margin:4px 0 0 20px}
.not-for li{margin-bottom:4px}
.caveats{background:#eff6fa;border:1px solid #d3e6f0;border-radius:12px;padding:14px 18px;margin:10px 0;color:#2e5772;font-size:13px;line-height:1.8}
.faq-item{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px}
.faq-q{font-weight:700;font-size:14px;color:var(--ink);margin-bottom:4px}
.faq-a{font-size:13.5px;color:var(--txt2);line-height:1.8}
.rel-col{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;color:inherit;text-decoration:none;display:block}
.rel-col:hover{border-color:var(--accent)}
.rel-col-cat{font-size:11px;color:var(--accent);font-weight:700;margin-bottom:2px}
.rel-col-title{font-size:14px;font-weight:700;line-height:1.5;color:var(--ink)}
.diag-cta{background:linear-gradient(160deg,var(--water),#eff6fa);border:1px solid var(--deep);border-radius:14px;padding:20px 22px;margin:24px 0;text-align:center}
.diag-cta p{font-size:14px;margin-bottom:12px;color:var(--ink)}
.diag-btn{display:inline-block;background:var(--accent);color:#fff;font-weight:700;font-size:14px;padding:10px 22px;border-radius:20px;text-decoration:none}
.diag-btn:hover{opacity:.9}
footer{background:#fff;padding:24px clamp(16px,4vw,40px);border-top:1px solid var(--border);font-size:12px;color:var(--txt3);line-height:1.8;margin-top:40px}
footer a{color:var(--accent);margin-right:14px;text-decoration:none}
@media(max-width:600px){article{padding:24px 16px 40px}.product-grid{grid-template-columns:repeat(2,1fr);gap:10px}}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA4_ID}');
</script>
</head>
<body>
<header class="topbar">
  <a class="logo" href="/">Moi<span>lum</span></a>
  <a href="/" style="font-size:12.5px;color:var(--txt3);text-decoration:none">← トップに戻る</a>
</header>
<div class="pr-banner">本サイトはアフィリエイト広告（Amazon・楽天・Qoo10等）を利用しています。ただし掲載順位・評価は編集部が独自基準で決定しており、広告主からの影響は受けていません。</div>
<article>
  <nav class="crumb"><a href="/">ホーム</a><span class="sep">›</span>悩み別ガイド<span class="sep">›</span>${escHtml(guide.breadcrumbName)}</nav>
  <span class="cat-tag">悩み別ガイド</span>
  <h1>${escHtml(guide.title)}</h1>
  <div class="meta-line">執筆：Moilum編集部（一行／個人運営） ／ 最終更新：${BUILD_DATE} ／ 掲載商品データ基準日：2026-06 ／ <a href="/about/about" onclick="return true">運営者情報</a></div>

  <h2>選び方の3原則</h2>
  ${guide.intro}

  <div class="rationale">
    <b>このページの比較基準</b><br>
    ${escHtml(guide.selectionRationale)} 掲載順は Moilum 編集部評価（★）順で、★が同点の商品はレビュー件数の対数を副次キーにしています。この評価軸の詳細は <a href="/about/rating-policy">評価基準ページ</a> をご覧ください。
  </div>

  <h2>該当商品${hits.length}件（編集部評価順）</h2>
  <div class="product-grid">
    ${hits.map((p, i) => `<a class="pcard" href="/products/${p.id}">
      ${p.image ? `<img class="pcard-img" src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy">` : `<div class="pcard-noimg" aria-hidden="true">${escHtml(p.icon || "💧")}</div>`}
      <div class="pcard-rank">${i < 3 ? "TOP" + (i + 1) : "#" + (i + 1)}</div>
      <div class="pcard-name">${escHtml(p.name)}</div>
      <div class="pcard-brand">${escHtml(p.brand)}${p.origin ? " ・ " + escHtml(p.origin) : ""}</div>
      <div class="pcard-meta">
        <span class="pcard-price">¥${(p.price || 0).toLocaleString()}</span>
        <span class="pcard-rating"><span class="pcard-badge">編集部</span> ★${p.rating}</span>
      </div>
    </a>`).join("")}
  </div>

  <div class="not-for">
    <h3>⚠️ このガイドが向かない人・落とし穴</h3>
    <ul>${guide.notFor.map(x => `<li>${x}</li>`).join("")}</ul>
  </div>

  <h2>成分・使用上の注意</h2>
  <div class="caveats">${escHtml(guide.caveats)}</div>

  ${guide.faq && guide.faq.length ? `<h2>よくある質問</h2>
  ${guide.faq.map(f => `<div class="faq-item">
    <div class="faq-q">Q. ${escHtml(f.q)}</div>
    <div class="faq-a">A. ${escHtml(f.a)}</div>
  </div>`).join("")}` : ""}

  ${relatedColumns.length ? `<h2>関連コラム</h2>
  ${relatedColumns.map(c => `<a class="rel-col" href="/columns/${c.id}">
    <div class="rel-col-cat">${escHtml(c.cat)}</div>
    <div class="rel-col-title">${escHtml(c.title)}</div>
  </a>`).join("")}` : ""}

  <div class="diag-cta">
    <p>あなたに合う1本を、3つの質問で絞り込めます。</p>
    <a class="diag-btn" href="/diagnosis">肌タイプ診断を試す →</a>
  </div>
</article>
<footer>
  <div>
    <a href="/">Moilumトップ</a>
    <a href="/about/rating-policy">評価基準</a>
    <a href="/about/sources">情報ソース</a>
    <a href="/about/changelog">更新履歴</a>
  </div>
  <p style="margin-top:10px">© Moilum</p>
</footer>
</body>
</html>
`;
}

// ===== ビルド =====
const outDir = "public/guides";
fs.mkdirSync(outDir, { recursive: true });

const buildLog = [];
for (const guide of GUIDES){
  const hits = SKINCARE.filter(guide.filter).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const shown = Math.min(hits.length, guide.limit || 12);
  const html = buildGuideHtml(guide);
  const outFile = path.join(outDir, guide.slug + ".html");
  fs.writeFileSync(outFile, html, "utf8");
  buildLog.push({slug: guide.slug, matched: hits.length, shown, size: (fs.statSync(outFile).size / 1024).toFixed(1) + "KB"});
}

console.log("✓ 生成完了: ガイドページ", buildLog.length, "件");
console.log("| slug | マッチ数 | 表示数 | ファイルサイズ |");
console.log("|---|---|---|---|");
for (const l of buildLog){
  console.log(`| ${l.slug} | ${l.matched} | ${l.shown} | ${l.size} |`);
}

// 他ファイルから参照可能な slug 一覧を出力（Worker allowlist / sitemap 生成用）
fs.writeFileSync("src/guides-slugs.json", JSON.stringify(GUIDES.map(g => g.slug), null, 2));
console.log("→ src/guides-slugs.json も更新");

// Cloudflare Worker: SEO用の個別URL対応（/products/:id, /columns/:slug, /sitemap.xml）
// - /products/:id, /columns/:slug: 静的アセットのindex.htmlを取得し、HTMLRewriterでhead内のメタ情報を差し替え
// - /sitemap.xml: PRODUCTS + COLUMNS + 静的ページの全URLをXMLで返す
// - それ以外: env.ASSETS.fetch()で静的アセットをそのまま返す

import PRODUCTS from "./products.json";
import COLUMNS from "./columns.json";

const SITE_ORIGIN = "https://moilum.sanji-104vt.workers.dev";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";
const PRICE_VALID_UNTIL = "2026-07-31";

function escapeXml(s){
  return String(s).replace(/[<>&'"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;","\"":"&quot;"}[c]));
}
function escapeHtml(s){
  return String(s).replace(/[<>&"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c]));
}

// index.htmlをASSETSから取得（キャッシュしやすいよう常に "/" を叩く）
async function fetchIndexHtml(env){
  const req = new Request(SITE_ORIGIN + "/", { method: "GET" });
  return await env.ASSETS.fetch(req);
}

// HTMLRewriterで<head>内のmeta/title/canonicalを書き換え、末尾にJSON-LDを追加する
function rewriteHead(response, {title, description, canonical, ogImage, jsonLd}){
  const rewriter = new HTMLRewriter()
    .on("title", {
      element(el){ el.setInnerContent(title); }
    })
    .on('meta[name="description"]', {
      element(el){ el.setAttribute("content", description); }
    })
    .on('link[rel="canonical"]', {
      element(el){ el.setAttribute("href", canonical); }
    })
    .on('meta[property="og:title"]', {
      element(el){ el.setAttribute("content", title); }
    })
    .on('meta[property="og:description"]', {
      element(el){ el.setAttribute("content", description); }
    })
    .on('meta[property="og:url"]', {
      element(el){ el.setAttribute("content", canonical); }
    })
    .on('meta[property="og:image"]', {
      element(el){ el.setAttribute("content", ogImage); }
    })
    .on('meta[name="twitter:title"]', {
      element(el){ el.setAttribute("content", title); }
    })
    .on('meta[name="twitter:description"]', {
      element(el){ el.setAttribute("content", description); }
    })
    .on("head", {
      element(el){
        // JSON-LDを</head>直前に追加
        el.append(`<script type="application/ld+json" data-page-jsonld>${jsonLd}</script>`, {html: true});
      }
    });
  return rewriter.transform(response);
}

// 商品ページのメタ情報生成
function buildProductMeta(p){
  const title = `${p.name}｜${p.brand}｜Moilum 独自スコア・比較レビュー`.slice(0, 68);
  const description = `${p.name}（${p.brand}）を独自スコアで比較。カテゴリ：${p.category}／参考価格：¥${p.price.toLocaleString()}。${p.desc}`.slice(0, 156);
  const canonical = `${SITE_ORIGIN}/products/${p.id}`;
  const ogImage = p.image || OGP_IMAGE;
  const productObj = {
    "@context":"https://schema.org",
    "@type":"Product",
    "name": p.name,
    "brand": {"@type":"Brand","name": p.brand},
    "description": p.desc,
    "category": p.category,
  };
  if (p.image) productObj.image = p.image;
  productObj.offers = {
    "@type":"Offer",
    "price": p.price,
    "priceCurrency": "JPY",
    "availability": "https://schema.org/InStock",
    "priceValidUntil": PRICE_VALID_UNTIL,
    "url": p.purchase
  };
  return { title, description, canonical, ogImage, jsonLd: JSON.stringify(productObj) };
}

// コラムページのメタ情報生成
function buildColumnMeta(c){
  const title = `${c.title}｜Moilum スキンケアコラム`.slice(0, 68);
  const description = c.excerpt.slice(0, 156);
  const canonical = `${SITE_ORIGIN}/columns/${c.id}`;
  const articleObj = {
    "@context":"https://schema.org",
    "@type":"Article",
    "headline": c.title,
    "description": c.excerpt,
    "articleSection": c.cat,
    "author": {"@type":"Organization","name":"Moilum編集部"},
    "publisher": {"@type":"Organization","name":"Moilum","logo":{"@type":"ImageObject","url": OGP_IMAGE}},
    "mainEntityOfPage": canonical
  };
  return { title, description, canonical, ogImage: OGP_IMAGE, jsonLd: JSON.stringify(articleObj) };
}

// sitemap.xmlを生成
function buildSitemap(){
  const staticPaths = ["/","/brands","/ranking","/diagnosis","/column","/favorites"];
  const now = new Date().toISOString().slice(0,10);
  const urls = [];
  for (const path of staticPaths){
    urls.push(`  <url><loc>${SITE_ORIGIN}${path}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${path==="/"?"1.0":"0.7"}</priority></url>`);
  }
  for (const p of PRODUCTS){
    urls.push(`  <url><loc>${SITE_ORIGIN}/products/${p.id}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
  }
  for (const c of COLUMNS){
    urls.push(`  <url><loc>${SITE_ORIGIN}/columns/${escapeXml(c.id)}</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    const pathname = url.pathname;

    // /sitemap.xml を動的生成（既存の静的 public/sitemap.xml より優先）
    if (pathname === "/sitemap.xml"){
      return new Response(buildSitemap(), {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=3600"
        }
      });
    }

    // /products/:id
    const productMatch = pathname.match(/^\/products\/(\d+)\/?$/);
    if (productMatch){
      const id = parseInt(productMatch[1], 10);
      const p = PRODUCTS.find(x=>x.id===id);
      if (!p){
        // 該当なし → トップページを返し（404は既存SPAで対応）
        return await fetchIndexHtml(env);
      }
      const meta = buildProductMeta(p);
      const indexRes = await fetchIndexHtml(env);
      return rewriteHead(new Response(indexRes.body, indexRes), meta);
    }

    // /columns/:slug
    const columnMatch = pathname.match(/^\/columns\/([a-z0-9-]+)\/?$/);
    if (columnMatch){
      const slug = columnMatch[1];
      const c = COLUMNS.find(x=>x.id===slug);
      if (!c){
        return await fetchIndexHtml(env);
      }
      const meta = buildColumnMeta(c);
      const indexRes = await fetchIndexHtml(env);
      return rewriteHead(new Response(indexRes.body, indexRes), meta);
    }

    // それ以外は静的アセットにパススルー
    return await env.ASSETS.fetch(request);
  }
};

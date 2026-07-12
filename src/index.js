// Cloudflare Worker: SEO用個別URL対応
// - "/products/{id}" → /products/{id}.html (静的ビルド済み軽量HTML)
// - "/columns/{slug}" → /index.html (SPA側でルーティング)
// - "/sitemap.xml" → 動的生成 (PRODUCTS + COLUMNS + 静的ページ)
// - それ以外 → 静的アセットを素通し
//
// 軽量商品ページは build-product-pages.mjs で事前生成し public/products/*.html に配置済み。
// Sillage の /public/columns/{slug}.html と同パターン。

import PRODUCTS from "./products.json";
import COLUMNS from "./columns.json";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";

function escapeXml(s){
  return String(s).replace(/[<>&'"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;","\"":"&quot;"}[c]));
}

// SPA(index.html)のheadを書き換えてコラム個別URL用にする
function rewriteColumnHead(response, c){
  const canonical = `${SITE_ORIGIN}/columns/${c.id}`;
  const title = `${c.title}｜Moilum スキンケアコラム`.slice(0, 68);
  const description = c.excerpt.slice(0, 156);
  const articleJson = JSON.stringify({
    "@context":"https://schema.org",
    "@type":"Article",
    "headline": c.title,
    "description": c.excerpt,
    "articleSection": c.cat,
    "author": {"@type":"Organization","name":"Moilum編集部"},
    "publisher": {"@type":"Organization","name":"Moilum","logo":{"@type":"ImageObject","url": OGP_IMAGE}},
    "mainEntityOfPage": canonical
  });
  return new HTMLRewriter()
    .on("title", { element(el){ el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el){ el.setAttribute("content", description); } })
    .on('link[rel="canonical"]', { element(el){ el.setAttribute("href", canonical); } })
    .on('meta[property="og:title"]', { element(el){ el.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(el){ el.setAttribute("content", description); } })
    .on('meta[property="og:url"]', { element(el){ el.setAttribute("content", canonical); } })
    .on('meta[name="twitter:title"]', { element(el){ el.setAttribute("content", title); } })
    .on('meta[name="twitter:description"]', { element(el){ el.setAttribute("content", description); } })
    .on("head", {
      element(el){
        el.append(`<script type="application/ld+json" data-page-jsonld>${articleJson}</script>`, {html: true});
      }
    })
    .transform(response);
}

function buildSitemap(){
  const staticPaths = ["/","/brands","/ranking","/diagnosis","/column","/favorites"];
  const now = new Date().toISOString().slice(0,10);
  const urls = [];
  for (const path of staticPaths){
    const priority = path === "/" ? "1.0" : "0.7";
    urls.push(`  <url><loc>${SITE_ORIGIN}${path}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`);
  }
  for (const p of PRODUCTS){
    urls.push(`  <url><loc>${SITE_ORIGIN}/products/${p.id}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
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
  async fetch(request, env){
    const url = new URL(request.url);

    // workers.dev → asutelu.com への 301 リダイレクト（カスタムドメインを正規URLに統一）
    if (url.hostname.endsWith("workers.dev")){
      return Response.redirect("https://moilum.asutelu.com" + url.pathname + url.search, 301);
    }

    const pathname = url.pathname;

    // / → /index.html (html_handling: none のためWorker側で明示的にリライト)
    if (pathname === "/" || pathname === ""){
      const rewriteUrl = new URL(request.url);
      rewriteUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(rewriteUrl, request));
    }

    // /sitemap.xml → 動的生成
    if (pathname === "/sitemap.xml"){
      return new Response(buildSitemap(), {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=3600"
        }
      });
    }

    // /products/{id} → /products/{id}.html リライト（Sillageの/columns/{slug}と同パターン）
    const productMatch = pathname.match(/^\/products\/(\d+)\/?$/);
    if (productMatch){
      const id = parseInt(productMatch[1], 10);
      const p = PRODUCTS.find(x => x.id === id);
      if (p){
        const rewriteUrl = new URL(request.url);
        rewriteUrl.pathname = `/products/${id}.html`;
        return env.ASSETS.fetch(new Request(rewriteUrl, request));
      }
      // 該当なし → SPA(トップ)にフォールバック
      const fallbackUrl = new URL(request.url);
      fallbackUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(fallbackUrl, request));
    }

    // /columns/{slug} → SPA本体の head を書き換えて返す
    const columnMatch = pathname.match(/^\/columns\/([a-z0-9-]+)\/?$/);
    if (columnMatch){
      const slug = columnMatch[1];
      const c = COLUMNS.find(x => x.id === slug);
      if (c){
        const indexReq = new Request(SITE_ORIGIN + "/index.html", { method: "GET" });
        const indexRes = await env.ASSETS.fetch(indexReq);
        return rewriteColumnHead(new Response(indexRes.body, indexRes), c);
      }
      // 該当スラッグなし: トップにフォールバック
      const fallbackUrl = new URL(request.url);
      fallbackUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(fallbackUrl, request));
    }

    // それ以外は静的アセットにパススルー
    return env.ASSETS.fetch(request);
  }
};

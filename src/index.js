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

// 商品数の単一の真実の源(SSoT)。makeup productType は除外してカウント。
// メタ description 等に {{SKINCARE_COUNT}} プレースホルダを含む場合は本値で置換する。
const SKINCARE_COUNT = PRODUCTS.filter(p => p.productType !== "makeup").length;
function substituteCount(s){ return String(s || "").replace(/\{\{SKINCARE_COUNT\}\}/g, SKINCARE_COUNT); }

function escapeXml(s){
  return String(s).replace(/[<>&'"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;","\"":"&quot;"}[c]));
}

// SPA(index.html)のheadを書き換えてコラム個別URL用にする
function rewriteColumnHead(response, c){
  const canonical = `${SITE_ORIGIN}/columns/${c.id}`;
  const title = `${c.title}｜Moilum スキンケアコラム`.slice(0, 68);
  // SEO用description(120〜160字)を優先。無ければexcerptにフォールバック。
  // {{SKINCARE_COUNT}} プレースホルダを実数(SSoT)に置換してから注入する。
  const description = substituteCount(c.description || c.excerpt).slice(0, 160);
  const articleJson = JSON.stringify({
    "@context":"https://schema.org",
    "@type":"Article",
    "headline": c.title,
    "description": description,
    "articleSection": c.cat,
    "author": {"@type":"Organization","name":"Moilum編集部"},
    "publisher": {"@type":"Organization","name":"Moilum","logo":{"@type":"ImageObject","url": OGP_IMAGE}},
    "mainEntityOfPage": canonical
  });
  // コラム個別ページ用 BreadcrumbList（トップ → スキンケアコラム → 記事タイトル）
  const crumbJson = JSON.stringify({
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      {"@type":"ListItem","position":1,"name":"Moilum","item":SITE_ORIGIN+"/"},
      {"@type":"ListItem","position":2,"name":"スキンケアコラム","item":SITE_ORIGIN+"/column"},
      {"@type":"ListItem","position":3,"name":c.title,"item":canonical}
    ]
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
        // Article と BreadcrumbList を追加注入。Organization はトップ index.html に
        // 静的で入っており、このコラムページも同じindex.htmlをベースにするため二重注入不要。
        el.append(`<script type="application/ld+json" data-page-jsonld="article">${articleJson}</script>`, {html: true});
        el.append(`<script type="application/ld+json" data-page-jsonld="breadcrumb">${crumbJson}</script>`, {html: true});
      }
    })
    .transform(response);
}

// /about/{slug} で公開している静的ページのallowlist（Workerリライト用）
const ABOUT_SLUGS = new Set(["rating-policy", "sources", "changelog"]);

function buildSitemap(){
  const staticPaths = ["/","/brands","/ranking","/diagnosis","/column","/favorites","/about/rating-policy","/about/sources","/about/changelog"];
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
  async fetch(request, env, ctx){
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

    // /sitemap.xml → 動的生成（Cache API で Worker 側にもキャッシュし、生成コストを削減）
    // キーはクエリ文字列を除外した canonical URL に固定（?bust= のようなキャッシュバスターで
    // 別キー扱いになるのを防ぐ）。TTL は Cache-Control ヘッダー(max-age=3600)に従う。
    if (pathname === "/sitemap.xml"){
      const cacheKey = new Request("https://moilum.asutelu.com/sitemap.xml", { method: "GET" });
      const cache = caches.default;
      let cached = await cache.match(cacheKey);
      if (cached) return cached;
      const body = buildSitemap();
      const response = new Response(body, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "x-generated-at": new Date().toISOString()
        }
      });
      // レスポンス返却後にキャッシュへ書き込み（応答時間を伸ばさない）
      if (ctx && typeof ctx.waitUntil === "function"){
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
      return response;
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

    // /about/{slug} → /about/{slug}.html リライト（allowlistで既知slugのみ受ける）
    const aboutMatch = pathname.match(/^\/about\/([a-z0-9-]+)\/?$/);
    if (aboutMatch){
      const slug = aboutMatch[1];
      if (ABOUT_SLUGS.has(slug)){
        const rewriteUrl = new URL(request.url);
        rewriteUrl.pathname = `/about/${slug}.html`;
        return env.ASSETS.fetch(new Request(rewriteUrl, request));
      }
      // 該当なし → SPAトップにフォールバック
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

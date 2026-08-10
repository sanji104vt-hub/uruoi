// Cloudflare Worker: SEO用個別URL対応
// - "/products/{id}" → /products/{id}.html (静的ビルド済み軽量HTML)
// - "/columns/{slug}" → /columns/{slug}.html (静的ビルド済み軽量HTML)
// - "/sitemap.xml" → 動的生成 (PRODUCTS + COLUMNS + 静的ページ)
// - それ以外 → 静的アセットを素通し
//
// 軽量商品ページは build-product-pages.mjs、軽量コラムページは build-column-pages.mjs で
// 事前生成し public/products/*.html / public/columns/*.html に配置済み。
// Sillage の /public/columns/{slug}.html と同パターン。

import PRODUCTS from "./products.json";
import COLUMNS from "./columns.json";
import GUIDE_SLUGS from "./guides-slugs.json";

const SITE_ORIGIN = "https://moilum.asutelu.com";

function escapeXml(s){
  return String(s).replace(/[<>&'"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;","\"":"&quot;"}[c]));
}

// /about/{slug} で公開している静的ページのallowlist（Workerリライト用）
const ABOUT_SLUGS = new Set(["rating-policy", "sources", "changelog"]);
// /guides/{slug} で公開している悩み別ハブページの allowlist（生成物由来）
const GUIDE_SLUG_SET = new Set(GUIDE_SLUGS);

// 統合・削除された商品IDから統合先IDへの 301 リダイレクトマップ。
// 重複商品の統合時に旧URLを新URLに恒久的に転送する（SEOの被リンク集約用）。
const PRODUCT_REDIRECTS = {
  164: 53,   // Anua クレンジングオイル ヘチマ70 (完全同一商品として統合)
};

function buildSitemap(){
  const staticPaths = ["/","/columns","/brands","/ranking","/diagnosis","/about/rating-policy","/about/sources","/about/changelog"];
  const now = new Date().toISOString().slice(0,10);
  const urls = [];
  for (const path of staticPaths){
    const priority = path === "/" ? "1.0" : "0.7";
    urls.push(`  <url><loc>${SITE_ORIGIN}${path}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`);
  }
  for (const slug of GUIDE_SLUGS){
    urls.push(`  <url><loc>${SITE_ORIGIN}/guides/${escapeXml(slug)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
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
      const cacheKey = new Request("https://moilum.asutelu.com/sitemap.xml?version=seo-priority2-v1", { method: "GET" });
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

    // 旧コラム一覧URLは、正規URLへ1回だけ恒久転送する。
    if (pathname === "/column" || pathname === "/column/"){
      return Response.redirect(`${SITE_ORIGIN}/columns`, 301);
    }

    // SPAと同じ内容を返さず、検索エンジンが初回HTMLだけで理解できる専用ページを返す。
    const hubPages = {
      "/columns": "columns",
      "/brands": "brands",
      "/ranking": "ranking",
      "/diagnosis": "diagnosis",
      "/favorites": "favorites"
    };
    const hubName = hubPages[pathname.replace(/\/$/, "")];
    if (hubName){
      const rewriteUrl = new URL(request.url);
      rewriteUrl.pathname = `/hubs/${hubName}.html`;
      return env.ASSETS.fetch(new Request(rewriteUrl, request));
    }

    // /products/{id} → /products/{id}.html リライト（Sillageの/columns/{slug}と同パターン）
    const productMatch = pathname.match(/^\/products\/(\d+)\/?$/);
    if (productMatch){
      const id = parseInt(productMatch[1], 10);
      // 統合済み商品IDは統合先へ301恒久リダイレクト（旧URLの被リンクを新URLへ集約）
      if (PRODUCT_REDIRECTS[id]){
        return Response.redirect(`${SITE_ORIGIN}/products/${PRODUCT_REDIRECTS[id]}`, 301);
      }
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

    // /guides/{slug} → /guides/{slug}.html リライト（悩み別ガイドページ）
    const guideMatch = pathname.match(/^\/guides\/([a-z0-9-]+)\/?$/);
    if (guideMatch){
      const slug = guideMatch[1];
      if (GUIDE_SLUG_SET.has(slug)){
        const rewriteUrl = new URL(request.url);
        rewriteUrl.pathname = `/guides/${slug}.html`;
        return env.ASSETS.fetch(new Request(rewriteUrl, request));
      }
      const fallbackUrl = new URL(request.url);
      fallbackUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(fallbackUrl, request));
    }

    // /columns/{slug}.html が直接共有された場合は、正規の拡張子なしURLへ301転送
    const columnHtmlMatch = pathname.match(/^\/columns\/([a-z0-9-]+)\.html$/);
    if (columnHtmlMatch){
      const slug = columnHtmlMatch[1];
      if (COLUMNS.some(x => x.id === slug)){
        return Response.redirect(`${SITE_ORIGIN}/columns/${slug}`, 301);
      }
    }

    // /columns/{slug} → 軽量な静的コラムページへ内部リライト
    const columnMatch = pathname.match(/^\/columns\/([a-z0-9-]+)\/?$/);
    if (columnMatch){
      const slug = columnMatch[1];
      const c = COLUMNS.find(x => x.id === slug);
      if (c){
        const rewriteUrl = new URL(request.url);
        rewriteUrl.pathname = `/columns/${slug}.html`;
        return env.ASSETS.fetch(new Request(rewriteUrl, request));
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

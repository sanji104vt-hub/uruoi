import fs from "node:fs";
import { isIndexableProduct } from "./product-publication-policy.mjs";

const SITE = "https://moilum.asutelu.com";
const DATE = "2026-08-14";
const products = JSON.parse(fs.readFileSync("src/products.json","utf8"));
const columns = JSON.parse(fs.readFileSync("src/columns.json","utf8"));
const guides = JSON.parse(fs.readFileSync("src/guides-slugs.json","utf8"));
const staticPaths = ["/","/products","/columns","/brands","/ranking","/diagnosis","/about/rating-policy","/about/sources","/about/changelog"];
const escapeXml = value => String(value).replace(/[<>&'"]/g, character => ({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[character]));
const paths = [
  ...staticPaths,
  ...guides.map(slug=>`/guides/${slug}`),
  ...products.filter(isIndexableProduct).map(product=>`/products/${product.id}`),
  ...columns.map(column=>`/columns/${column.id}`)
];
const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path=>`  <url><loc>${SITE}${escapeXml(path)}</loc><lastmod>${DATE}</lastmod></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync("public/sitemap.xml",body,"utf8");
console.log(`✓ static sitemap: ${paths.length} URL / products ${products.filter(isIndexableProduct).length}`);

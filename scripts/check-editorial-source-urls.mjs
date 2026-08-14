import fs from "node:fs";
import { EDITORIAL_AUDIT_DATE, sourceList } from "./editorial-source-audit-policy.mjs";

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"))
  .filter(product => ["editorial", "legacy"].includes(product.publicationStatus));
const entries = new Map();
for (const product of products) {
  for (const source of sourceList(product)) {
    if (!entries.has(source.url)) entries.set(source.url, { source, products: [] });
    entries.get(source.url).products.push({ id: product.id, name: product.name });
  }
}

async function request(url, method = "HEAD") {
  return fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: {
      "user-agent": "MoilumSourceAudit/1.0 (+https://moilum.asutelu.com/about/sources)",
      ...(method === "GET" ? { range: "bytes=0-2048" } : {})
    }
  });
}

async function check([url, entry]) {
  const started = Date.now();
  try {
    let response = await request(url, "HEAD");
    if ([405, 501].includes(response.status)) response = await request(url, "GET");
    const category = response.status === 404 || response.status === 410
      ? "not_found"
      : [401, 403, 429].includes(response.status)
        ? "blocked"
        : response.redirected && response.ok
          ? "redirect"
          : response.ok
            ? "ok"
            : "http_error";
    return {
      url,
      finalUrl: response.url,
      status: category,
      httpStatus: response.status,
      elapsedMs: Date.now() - started,
      sourceType: entry.source.type,
      productIds: entry.products.map(product => product.id).join(" | "),
      productNames: entry.products.map(product => product.name).join(" | "),
      error: ""
    };
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      url,
      finalUrl: "",
      status: timeout ? "timeout" : "blocked",
      httpStatus: "",
      elapsedMs: Date.now() - started,
      sourceType: entry.source.type,
      productIds: entry.products.map(product => product.id).join(" | "),
      productNames: entry.products.map(product => product.name).join(" | "),
      error: String(error?.message || error)
    };
  }
}

const queue = [...entries.entries()];
const results = [];
async function worker() {
  while (queue.length) {
    const entry = queue.shift();
    const result = await check(entry);
    results.push(result);
    console.log(`[${results.length}/${entries.size}] ${result.status} ${result.httpStatus || "-"} ${result.url}`);
  }
}
await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
results.sort((a, b) => a.url.localeCompare(b.url));

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const headers = Object.keys(results[0] || {});
const csvFile = `reports/editorial-source-http-audit-${EDITORIAL_AUDIT_DATE}.csv`;
const mdFile = `reports/editorial-source-http-audit-${EDITORIAL_AUDIT_DATE}.md`;
fs.writeFileSync(csvFile, [headers.join(","), ...results.map(row => headers.map(header => csv(row[header])).join(","))].join("\n") + "\n", "utf8");
const counts = results.reduce((summary, result) => {
  summary[result.status] = (summary[result.status] || 0) + 1;
  return summary;
}, {});
const problems = results.filter(result => !["ok", "redirect"].includes(result.status));
fs.writeFileSync(mdFile, `# editorial公式ソース HTTP監査（${EDITORIAL_AUDIT_DATE}）

この検査は外部サイトのbot制限や一時障害の影響を受けるため、CIのblocking条件にはしません。

| status | URL数 |
|---|---:|
${["ok", "redirect", "blocked", "timeout", "not_found", "http_error"].map(status => `| ${status} | ${counts[status] || 0} |`).join("\n")}

## 要確認URL

${problems.length ? problems.map(result => `- ${result.status} / HTTP ${result.httpStatus || "-"} / ${result.url} / 商品ID ${result.productIds}${result.error ? ` / ${result.error}` : ""}`).join("\n") : "- なし"}
`, "utf8");
console.log(`✓ source HTTP audit: ${results.length} URLs / ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(" ")}`);

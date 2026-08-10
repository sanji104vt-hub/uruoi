import fs from "node:fs";

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const sources = [];
for (const product of products) {
  for (const source of product.editorialEvidence?.sources || []) sources.push({ productId: product.id, productName: product.name, ...source });
}

async function check(source){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(source.url, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 MoilumSourceAudit/1.0" } });
    const status = response.status;
    const result = status >= 300 && status < 400 ? "redirect" : status >= 200 && status < 300 ? "ok" : [401,403,429].includes(status) ? "blocked" : "http-error";
    return { ...source, result, status, location: response.headers.get("location") || "" };
  } catch (error) {
    return { ...source, result: error.name === "AbortError" ? "timeout" : "network-error", status: "", location: "" };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let index = 0; index < sources.length; index += 6) {
  results.push(...await Promise.all(sources.slice(index, index + 6).map(check)));
  console.log(`checked ${Math.min(index + 6, sources.length)}/${sources.length}`);
}
const quote = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const columns = ["productId","productName","type","scope","title","url","result","status","location"];
const csv = [columns.join(","), ...results.map(row => columns.map(column => quote(row[column])).join(","))].join("\n") + "\n";
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/official-source-check-2026-08-10.csv", csv, "utf8");
const counts = Object.groupBy ? Object.groupBy(results, row => row.result) : results.reduce((all, row) => ((all[row.result] ||= []).push(row), all), {});
console.log(Object.fromEntries(Object.entries(counts).map(([key, rows]) => [key, rows.length])));
console.log("report: reports/official-source-check-2026-08-10.csv");

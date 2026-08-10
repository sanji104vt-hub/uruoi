import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_DATE = "2026-08-07";
const REPORT_DATE = "2026-08-10";
const PAST_UNINDEXED_IDS = [95,10,36,40,205,157,199,19,22,28,203,24,17,64,75,135,196,179,82,39,142,38,37,206,177,23,49,3,56,159,122,168,193,154,30,166,192,117,62,91];
const INDEXED_CONTROL_IDS = [44,121,110,101,102,163,104,147,175,180,99,58,162,112,158];
const mode = process.argv[2] || "before";
if (!new Set(["before", "pilot", "after"]).has(mode)) throw new Error("mode must be before, pilot, or after");

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const byId = new Map(products.map(product => [product.id, product]));
const targetIds = new Set([...PAST_UNINDEXED_IDS, ...INDEXED_CONTROL_IDS]);
for (const id of targetIds) if (!byId.has(id)) throw new Error(`cohort product missing: ${id}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function textFromHtml(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function extract(source, regex) {
  return regex.exec(source)?.[1] || "";
}

function productHtml(id) {
  return fs.readFileSync(path.join("public", "products", `${id}.html`), "utf8");
}

function statusOf(product) {
  if (product.status === "previous_generation") return "前世代";
  if (["メイクアップ", "ヘアケア", "ボディケア", "オーラルケア", "サプリメント"].includes(product.productType)) return "関連カテゴリ";
  const relatedIds = new Set([100,106,108,114,115,138,143,151,163,166,190,196,199]);
  return relatedIds.has(product.id) ? "関連カテゴリ" : "現在比較対象";
}

function evidenceOf(product) {
  return product.editorialEvidence && typeof product.editorialEvidence === "object" ? product.editorialEvidence : {};
}

function specsOf(product) {
  const specs = evidenceOf(product).specs;
  return specs && typeof specs === "object" ? specs : {};
}

function flattenValues(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (typeof value === "object") return Object.values(value).flatMap(flattenValues);
  return [String(value)];
}

function specificParts(product, html) {
  const evidence = evidenceOf(product);
  const parts = [
    product.name, product.brand, product.category, product.desc,
    ...(product.keyIngredients || []), ...(product.skin || []), ...(product.concern || []),
    ...flattenValues(evidence.officialFeatures), ...flattenValues(evidence.comparisonPoints),
    ...flattenValues(evidence.decision), ...flattenValues(specsOf(product)),
  ];
  for (const className of ["pc-pros", "pc-cons", "pc-fit", "pc-unfit"]) {
    const block = extract(html, new RegExp(`<div class="pc-box ${className}">([\\s\\S]*?)<\\/div>`));
    parts.push(...[...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => textFromHtml(match[1])));
  }
  return parts.map(textFromHtml).filter(Boolean);
}

function sentenceList(product, html) {
  const chunks = specificParts(product, html);
  return chunks.flatMap(chunk => chunk.split(/[。！？!?]|(?:\s*／\s*)/))
    .map(sentence => sentence.replace(/\s+/g, " ").trim())
    .filter(sentence => sentence.length >= 8);
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function ngrams(value, size = 3) {
  const source = normalized(value);
  const result = new Set();
  if (source.length <= size) {
    if (source) result.add(source);
    return result;
  }
  for (let index = 0; index <= source.length - size; index += 1) result.add(source.slice(index, index + size));
  return result;
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

const htmlById = new Map(products.map(product => [product.id, productHtml(product.id)]));
const partsById = new Map(products.map(product => [product.id, specificParts(product, htmlById.get(product.id))]));
const sentencesById = new Map(products.map(product => [product.id, sentenceList(product, htmlById.get(product.id))]));
const gramsById = new Map(products.map(product => [product.id, ngrams(partsById.get(product.id).join("。"))]));

const sentenceProducts = new Map();
for (const [id, sentences] of sentencesById) {
  for (const sentence of new Set(sentences.map(normalized).filter(Boolean))) {
    if (!sentenceProducts.has(sentence)) sentenceProducts.set(sentence, new Set());
    sentenceProducts.get(sentence).add(id);
  }
}

const publicHtmlFiles = walk("public").filter(file => file.endsWith(".html"));
const linkCounts = new Map(products.map(product => [product.id, {
  total: 0, productsHub: 0, brands: 0, ranking: 0, columns: 0, guides: 0, related: 0,
}]));
for (const file of publicHtmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const normalizedPath = file.replace(/\\/g, "/");
  for (const match of source.matchAll(/href=["']\/products\/(\d+)(?:["'#?])/g)) {
    const id = Number(match[1]);
    const counts = linkCounts.get(id);
    if (!counts) continue;
    counts.total += 1;
    if (normalizedPath === "public/hubs/products.html") counts.productsHub += 1;
    if (normalizedPath === "public/hubs/brands.html") counts.brands += 1;
    if (normalizedPath === "public/hubs/ranking.html") counts.ranking += 1;
    if (normalizedPath.startsWith("public/columns/")) counts.columns += 1;
    if (normalizedPath.startsWith("public/guides/")) counts.guides += 1;
    if (normalizedPath.startsWith("public/products/")) counts.related += 1;
  }
}

const similarities = [];
const similarityById = new Map(products.map(product => [product.id, { max: 0, maxId: null, sameCategoryMax: 0, sameCategoryId: null }]));
for (let leftIndex = 0; leftIndex < products.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < products.length; rightIndex += 1) {
    const left = products[leftIndex];
    const right = products[rightIndex];
    const score = jaccard(gramsById.get(left.id), gramsById.get(right.id));
    similarities.push({ left: left.id, right: right.id, score, sameCategory: left.category === right.category });
    for (const [product, other] of [[left, right], [right, left]]) {
      const record = similarityById.get(product.id);
      if (score > record.max) {
        record.max = score;
        record.maxId = other.id;
      }
      if (left.category === right.category && score > record.sameCategoryMax) {
        record.sameCategoryMax = score;
        record.sameCategoryId = other.id;
      }
    }
  }
}

function sourceSummary(product) {
  const sources = Array.isArray(evidenceOf(product).sources) ? evidenceOf(product).sources : [];
  const types = sources.map(source => source.type || "");
  return {
    count: sources.length,
    productPage: types.includes("official-product"),
    brandOnly: sources.length > 0 && types.every(type => type === "official-brand"),
    press: types.includes("official-press-release"),
    domestic: sources.some(source => source.locale === "ja-JP" || /(?:\.jp|\/ja(?:\/|$)|japan)/i.test(source.url || "")),
    verifiedAt: evidenceOf(product).verifiedAt || "",
    updatedAt: evidenceOf(product).updatedAt || "",
  };
}

function metrics(product, cohort) {
  const html = htmlById.get(product.id);
  const article = extract(html, /<article>([\s\S]*?)<\/article>/);
  const title = textFromHtml(extract(html, /<title>([\s\S]*?)<\/title>/));
  const meta = decodeHtml(extract(html, /<meta name="description" content="([^"]*)"/));
  const source = sourceSummary(product);
  const specs = specsOf(product);
  const sentences = sentencesById.get(product.id);
  const duplicateSentences = sentences.filter(sentence => (sentenceProducts.get(normalized(sentence))?.size || 0) > 1);
  const comparisonCandidates = Array.isArray(evidenceOf(product).comparisonCandidates) ? evidenceOf(product).comparisonCandidates : [];
  const similarity = similarityById.get(product.id);
  const counts = linkCounts.get(product.id);
  const specKeys = Object.entries(specs).filter(([, value]) => flattenValues(value).length > 0).map(([key]) => key);
  const sectionCount = (article.match(/<h2\b/g) || []).length;
  const prosCount = (extract(html, /<div class="pc-box pc-pros">([\s\S]*?)<\/div>/).match(/<li>/g) || []).length;
  const consCount = (extract(html, /<div class="pc-box pc-cons">([\s\S]*?)<\/div>/).match(/<li>/g) || []).length;
  return {
    cohort, id: product.id, name: product.name, brand: product.brand, category: product.category,
    productStatus: statusOf(product), editorialUse: product.reviewedByEditor === true ? "編集部実使用あり" : "公開情報のみ",
    mainChars: textFromHtml(article).length, specificChars: partsById.get(product.id).join("。").length,
    titleChars: title.length, metaDescriptionChars: meta.length,
    ingredientCount: (product.keyIngredients || []).length, skinCount: (product.skin || []).length,
    concernCount: (product.concern || []).length, prosCount, consCount, uniqueSectionCount: sectionCount,
    officialSourceCount: source.count, officialProductPage: Number(source.productPage), officialBrandOnly: Number(source.brandOnly),
    pressRelease: Number(source.press), domesticOfficial: Number(source.domestic), verifiedAt: source.verifiedAt, updatedAt: source.updatedAt,
    contentAmount: specs.contentAmount || "", spf: specs.spf || "", pa: specs.pa || "", classification: specs.classification || "",
    activeIngredients: flattenValues(specs.activeIngredients).join(" / "), usage: specs.usage || "",
    manufacturerTarget: specs.manufacturerTarget || "", manufacturerFeatures: flattenValues(evidenceOf(product).officialFeatures).join(" / "),
    freeFrom: flattenValues(specs.freeFrom).join(" / "), countryOfOrigin: specs.countryOfOrigin || product.origin || "",
    specCount: specKeys.length, comparisonCandidateCount: comparisonCandidates.length,
    inboundTotal: counts.total, fromProducts: counts.productsHub, fromBrands: counts.brands, fromRanking: counts.ranking,
    fromColumns: counts.columns, fromGuides: counts.guides, fromRelatedProducts: counts.related,
    identicalSentenceRate: sentences.length ? duplicateSentences.length / sentences.length : 0,
    duplicateSentenceCount: duplicateSentences.length, maxSimilarity: similarity.max, nearDuplicateId: similarity.maxId,
    sameCategorySimilarity: similarity.sameCategoryMax, sameCategoryNearId: similarity.sameCategoryId,
  };
}

const rows = [
  ...PAST_UNINDEXED_IDS.map(id => metrics(byId.get(id), "過去未登録40")),
  ...INDEXED_CONTROL_IDS.map(id => metrics(byId.get(id), "登録済み対照15")),
];

const numericFields = [
  "mainChars", "specificChars", "titleChars", "metaDescriptionChars", "ingredientCount", "skinCount", "concernCount",
  "prosCount", "consCount", "uniqueSectionCount", "officialSourceCount", "officialProductPage", "pressRelease", "domesticOfficial",
  "specCount", "comparisonCandidateCount", "inboundTotal", "fromProducts", "fromBrands", "fromRanking", "fromColumns", "fromGuides",
  "fromRelatedProducts", "identicalSentenceRate", "duplicateSentenceCount", "maxSimilarity", "sameCategorySimilarity",
];

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(cohort) {
  const cohortRows = rows.filter(row => row.cohort === cohort);
  return Object.fromEntries(numericFields.map(field => [field, {
    average: average(cohortRows.map(row => Number(row[field]) || 0)),
    median: median(cohortRows.map(row => Number(row[field]) || 0)),
  }]));
}

const summaries = {
  pastUnindexed: summarize("過去未登録40"),
  indexedControl: summarize("登録済み対照15"),
};

const repeatedSentences = [...sentenceProducts.entries()]
  .filter(([, ids]) => ids.size >= 5)
  .map(([sentence, ids]) => ({ sentence, count: ids.size, ids: [...ids].sort((a, b) => a - b) }))
  .sort((left, right) => right.count - left.count || right.sentence.length - left.sentence.length);

const topPairs = similarities
  .sort((left, right) => right.score - left.score)
  .slice(0, 20)
  .map(pair => ({
    ...pair,
    leftName: byId.get(pair.left).name,
    rightName: byId.get(pair.right).name,
  }));

function csvEscape(value) {
  const source = String(value ?? "");
  return /[",\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}

function writeCsv(file, data) {
  const headers = Object.keys(data[0]);
  const lines = [headers.join(","), ...data.map(row => headers.map(header => csvEscape(row[header])).join(","))];
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

function formatMetric(value, field) {
  return /Rate|Similarity/.test(field) ? value.toFixed(3) : value.toFixed(1);
}

const comparisonFields = [
  ["mainChars", "main本文文字数"], ["specificChars", "固有本文文字数"], ["officialSourceCount", "公式ソース数"],
  ["officialProductPage", "公式商品ページ保有率"], ["specCount", "固有仕様項目数"], ["ingredientCount", "主要成分数"],
  ["inboundTotal", "内部被リンク"], ["fromColumns", "コラム文脈リンク"], ["fromGuides", "ガイド文脈リンク"],
  ["comparisonCandidateCount", "比較候補数"], ["identicalSentenceRate", "同一文章率"], ["maxSimilarity", "最大類似度"],
  ["sameCategorySimilarity", "同カテゴリ最大類似度"],
];

const reportDir = "reports";
fs.mkdirSync(reportDir, { recursive: true });
const csvPath = path.join(reportDir, `indexing-cohort-${REPORT_DATE}-${mode}.csv`);
const mdPath = path.join(reportDir, `indexing-cohort-${REPORT_DATE}-${mode}.md`);
const pairsPath = path.join(reportDir, `near-duplicates-${REPORT_DATE}-${mode}.csv`);
writeCsv(csvPath, rows);
writeCsv(pairsPath, topPairs);

const md = `# Moilum インデックス比較コホート分析（${mode}）

- Search Consoleスナップショット: ${SNAPSHOT_DATE}
- 計測日: ${REPORT_DATE}
- 過去にクロール済み・未登録だった商品: ${PAST_UNINDEXED_IDS.length}件
- 同時点で登録済みだった対照商品: ${INDEXED_CONTROL_IDS.length}件
- 注意: 現在のインデックス状況やGoogleの因果を示すものではなく、過去コホートの比較です。

## 40件 vs 15件

| 指標 | 過去未登録40 平均 | 過去未登録40 中央値 | 登録済み15 平均 | 登録済み15 中央値 |
|---|---:|---:|---:|---:|
${comparisonFields.map(([field, label]) => `| ${label} | ${formatMetric(summaries.pastUnindexed[field].average, field)} | ${formatMetric(summaries.pastUnindexed[field].median, field)} | ${formatMetric(summaries.indexedControl[field].average, field)} | ${formatMetric(summaries.indexedControl[field].median, field)} |`).join("\n")}

## 5商品以上で重複する文章

${repeatedSentences.length ? repeatedSentences.slice(0, 30).map(item => `- ${item.count}商品: ${item.sentence}（ID: ${item.ids.join(", ")}）`).join("\n") : "- 該当なし"}

## near duplicate 上位20組

| 類似度 | 同カテゴリ | 商品A | 商品B |
|---:|:---:|---|---|
${topPairs.map(pair => `| ${pair.score.toFixed(3)} | ${pair.sameCategory ? "○" : "—"} | ${pair.left}: ${pair.leftName} | ${pair.right}: ${pair.rightName} |`).join("\n")}

## 計測方法

- main本文文字数: 生成HTMLのarticle要素をテキスト化して計測。
- 固有本文文字数: 商品名・ブランド・説明・主要成分・肌タイプ・悩み分類・メリット/注意点・公式根拠・仕様・比較情報を連結し、共通ヘッダー/フッター/PR/UIを除外。
- 類似度: 固有本文をNFKC正規化し、記号と空白を除いた文字3-gramのJaccard係数。
- 同一文章率: 商品固有文を文単位に分け、2商品以上に完全一致する文の比率。
- 内部被リンク: public配下の静的HTMLに存在する通常のhref=/products/{id}を経路別に集計。
- 公式情報・仕様: src/products.jsonのeditorialEvidenceを集計。未設定も0として比較。
`;
fs.writeFileSync(mdPath, md, "utf8");

console.log(`cohort analysis (${mode}): ${rows.length} rows`);
console.log(`reports: ${mdPath}, ${csvPath}, ${pairsPath}`);
console.log(`repeated sentences used by 5+ products: ${repeatedSentences.length}`);
console.log(`top similarity: ${topPairs[0].score.toFixed(3)} (${topPairs[0].left}/${topPairs[0].right})`);

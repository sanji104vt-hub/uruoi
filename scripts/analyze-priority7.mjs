import fs from "node:fs";
import path from "node:path";
import { REPORT_DATE, RISK_TERMS, EXPERIENCE_TERMS, evidenceOf, flatten, sourceQuality, productStatus, hasKnownSuccessor, factualSummary, riskMatches, claimDisposition, normalize } from "./priority7-policy.mjs";

const mode = process.argv[2] || "before";
if (!new Set(["before","after"]).has(mode)) throw new Error("mode must be before or after");
const products = JSON.parse(fs.readFileSync("src/products.json","utf8"));
if (products.length !== 247) throw new Error(`expected 247 products, got ${products.length}`);
const byId = new Map(products.map(product => [product.id, product]));
const reportDir = "reports";
fs.mkdirSync(reportDir,{recursive:true});

function decode(value){
  return String(value || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ");
}
function textFromHtml(value){
  return decode(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
}
function extract(source, regex){ return regex.exec(source)?.[1] || ""; }
function productHtml(id){ return fs.readFileSync(path.join("public","products",`${id}.html`),"utf8"); }
function specificText(html){
  const blocks = [
    /<div class="desc">([\s\S]*?)<\/div>/,
    /<div class="ingredients">([\s\S]*?)<\/div>/,
    /<div class="suitability">([\s\S]*?)<\/div>/,
    /<section class="evidence"[\s\S]*?<\/section>/,
    /<div class="proscons">([\s\S]*?)<\/div>\s*<\/div>/,
    /<section class="variant-comparison"[\s\S]*?<\/section>/,
    /<aside class="product-status"[\s\S]*?<\/aside>/
  ];
  return blocks.map(regex => textFromHtml(extract(html,regex))).filter(Boolean).join("。 ");
}
function grams(value,size=3){
  const source=normalize(value), map=new Map();
  if (!source) return map;
  if (source.length <= size) return new Map([[source,1]]);
  for(let i=0;i<=source.length-size;i++){const gram=source.slice(i,i+size);map.set(gram,(map.get(gram)||0)+1);}
  return map;
}
function jaccard(left,right){
  const a=new Set(left.keys()),b=new Set(right.keys()); let intersection=0;
  for(const item of a) if(b.has(item)) intersection++;
  return intersection/(a.size+b.size-intersection||1);
}
function cosine(left,right){
  let dot=0,a2=0,b2=0;
  for(const value of left.values()) a2+=value*value;
  for(const value of right.values()) b2+=value*value;
  for(const [key,value] of left) dot+=value*(right.get(key)||0);
  return dot/(Math.sqrt(a2)*Math.sqrt(b2)||1);
}
function similarity(left,right){ const a=grams(left),b=grams(right); return {jaccard:jaccard(a,b),cosine:cosine(a,b)}; }
function csvEscape(value){ const source=String(value??""); return /[",\n]/.test(source)?`"${source.replace(/"/g,'""')}"`:source; }
function writeCsv(file,rows,append=false){
  if(!rows.length) return;
  const headers=Object.keys(rows[0]);
  const lines=rows.map(row=>headers.map(header=>csvEscape(row[header])).join(","));
  if(append && fs.existsSync(file)){
    const existing=fs.readFileSync(file,"utf8").trimEnd().split(/\r?\n/);
    const header=existing.shift()||headers.join(",");
    const phaseIndex=headers.indexOf("phase");
    const kept=existing.filter(line=>{
      if(phaseIndex===0)return !line.startsWith(`${mode},`);
      if(phaseIndex===1)return !new RegExp(`^\\d+,${mode},`).test(line);
      return true;
    });
    fs.writeFileSync(file,[header,...kept,...lines].join("\n")+"\n","utf8");
  }else fs.writeFileSync(file,[headers.join(","),...lines].join("\n")+"\n","utf8");
}
function walk(dir){ return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]); }

const htmlById=new Map(products.map(product=>[product.id,productHtml(product.id)]));
const specificById=new Map(products.map(product=>[product.id,specificText(htmlById.get(product.id))]));
const claimRows=[];
let publicTextCount=0;
for(const product of products){
  const evidence=evidenceOf(product);
  const fields=[
    ["desc",product.desc],
    ...flatten(evidence?.officialFeatures).map((value,index)=>[`editorialEvidence.officialFeatures.${index}`,value]),
    ...flatten(evidence?.comparisonPoints).map((value,index)=>[`editorialEvidence.comparisonPoints.${index}`,value]),
    ...flatten(evidence?.decision?.chooseWhen).map((value,index)=>[`editorialEvidence.decision.chooseWhen.${index}`,value]),
    ...flatten(evidence?.decision?.compareWhen).map((value,index)=>[`editorialEvidence.decision.compareWhen.${index}`,value]),
    ...(product.editorNote?[["editorNote",product.editorNote]]:[])
  ].filter(([,value])=>String(value||"").trim());
  publicTextCount+=fields.length;
  for(const [field,text] of fields){
    const terms=[...new Set([...riskMatches(text),...EXPERIENCE_TERMS.filter(term=>String(text).includes(term))])];
    for(const term of terms){
      const disposition=claimDisposition(product,field,text);
      claimRows.push({phase:mode,id:product.id,name:product.name,field,term,statement:text,evidenceStatus:disposition.status,action:disposition.action,sourceQuality:sourceQuality(product).grade,reason:disposition.reason,sourceUrls:(evidence?.sources||[]).map(source=>source.url).join(" | ")});
    }
  }
}

const pairs=[];
for(let i=0;i<products.length;i++) for(let j=i+1;j<products.length;j++){
  const left=products[i],right=products[j];
  const score=similarity(specificById.get(left.id),specificById.get(right.id));
  pairs.push({left,right,...score,score:Math.max(score.cosine,score.jaccard)});
}

function nameStem(product){
  return normalize(product.name.replace(product.brand,"").replace(/\d+(?:\.\d+)?\s*(?:ml|mL|g|枚|個|本)/gi,"").replace(/つめかえ用?|詰め替え用?|本体|しっとり|さっぱり|モイスト|ライト|タイプ|医薬部外品/g,""));
}
const reviewedPairClassifications=new Map([
  ["11/180",{classification:"B",reason:"同じダイブイン系だが、液状トナーと拭き取り用トナーパッドという剤形違い"}],
  ["65/174",{classification:"B",reason:"同じCICAデイリースージングマスクの通常品と限定パッケージ候補"}],
  ["100/190",{classification:"B",reason:"同じグラスティング系のリップだが、ウォーターティントとバームというタイプ違い"}],
  ["121/175",{classification:"D",reason:"商品名・分類・掲載情報が実質同一。容量・SKU未記録のため統合候補として要手動確認（自動統合しない）"}],
  ["165/202",{classification:"B",reason:"同ブランドの洗顔パウダーで、シリーズ・仕様違い候補。公式SKU確認前は統合しない"}],
  ["210/231",{classification:"A",reason:"同じアクティブエイジ系だが、ローションとクリームという役割の異なる商品"}],
  ["247/248",{classification:"A",reason:"同じ大人のニキビ対策ラインだが、化粧水とクリームという役割の異なる商品"}],
]);
function classifyPair(pair){
  const {left,right}=pair;
  const ids=[left.id,right.id].sort((a,b)=>a-b).join("/");
  if(ids==="217/227") return evidenceOf(left)&&evidenceOf(right)
    ? {classification:"A",reason:"同ブランドの別仕様。泡タイプ詰め替えとダブルスクラブの実差分を公式情報で確認済み"}
    : {classification:"E",reason:"泡タイプ詰め替えとダブルスクラブという別仕様なのに説明文が完全一致"};
  if(reviewedPairClassifications.has(ids)) return reviewedPairClassifications.get(ids);
  if((productStatus(left)==="legacy"||productStatus(right)==="legacy")&&left.brand===right.brand) return {classification:"C",reason:"同ブランド内の旧製品・前世代関係候補"};
  if(normalize(left.name)===normalize(right.name)) return {classification:"D",reason:"商品名が実質同一。URL統合可否を個別確認する対象"};
  if(left.brand===right.brand){
    const stems=similarity(nameStem(left),nameStem(right));
    if(stems.cosine>=.72||stems.jaccard>=.55) return {classification:"B",reason:"同シリーズの容量・タイプ・用途違い候補"};
    return {classification:"A",reason:"同ブランド・近接カテゴリに由来する正当な類似"};
  }
  if(left.desc===right.desc) return {classification:"E",reason:"別ブランドの商品で公開説明文が完全一致"};
  if(!evidenceOf(left)&&!evidenceOf(right)) return {classification:"F",reason:"双方とも商品固有一次情報が未記録で、掲載分類中心のため類似"};
  return {classification:"E",reason:"ブランドが異なり、共通テンプレート由来の類似を優先確認"};
}
const topPairs=pairs.sort((a,b)=>b.score-a.score||b.cosine-a.cosine).slice(0,50).map((pair,index)=>({rank:index+1,phase:mode,leftId:pair.left.id,leftName:pair.left.name,leftBrand:pair.left.brand,rightId:pair.right.id,rightName:pair.right.name,rightBrand:pair.right.brand,cosine:pair.cosine.toFixed(4),jaccard:pair.jaccard.toFixed(4),...classifyPair(pair)}));

const descriptions=products.map(product=>{
  const html=htmlById.get(product.id);
  return {product,meta:decode(extract(html,/<meta name="description" content="([^"]*)"/i)),title:textFromHtml(extract(html,/<title>([\s\S]*?)<\/title>/i))};
});
let metaExact=0,meta90=0,meta80=0,titleExact=0,titlePractical=0;
for(let i=0;i<descriptions.length;i++) for(let j=i+1;j<descriptions.length;j++){
  const a=descriptions[i],b=descriptions[j];
  if(a.meta===b.meta) metaExact++;
  const metaScore=Math.max(...Object.values(similarity(a.meta,b.meta)));
  if(metaScore>=.9) meta90++; if(metaScore>=.8) meta80++;
  if(a.title===b.title) titleExact++;
  if(normalize(a.title.replace(a.product.name,""))===normalize(b.title.replace(b.product.name,""))) titlePractical++;
}

const linkCounts=new Map(products.map(product=>[product.id,{products:0,brands:0,ranking:0,top:0,related:0,columns:0,guides:0,totalPages:0}]));
for(const file of walk("public").filter(file=>file.endsWith(".html"))){
  const source=fs.readFileSync(file,"utf8"),normalizedPath=file.replace(/\\/g,"/");
  const ids=new Set([...source.matchAll(/href=["']\/products\/(\d+)(?:["'#?])/g)].map(match=>Number(match[1])));
  for(const id of ids){ const counts=linkCounts.get(id); if(!counts) continue; counts.totalPages++;
    if(normalizedPath==="public/hubs/products.html") counts.products++;
    else if(normalizedPath==="public/hubs/brands.html") counts.brands++;
    else if(normalizedPath==="public/hubs/ranking.html") counts.ranking++;
    else if(normalizedPath==="public/index.html") counts.top++;
    else if(normalizedPath.startsWith("public/products/")) counts.related++;
    else if(normalizedPath.startsWith("public/columns/")) counts.columns++;
    else if(normalizedPath.startsWith("public/guides/")) counts.guides++;
  }
}

const sourceGrades={A:0,B:0,C:0,D:0},statuses={"current-confirmed":0,legacy:0,discontinued:0,"status-unknown":0};
for(const product of products){sourceGrades[sourceQuality(product).grade]++;statuses[productStatus(product)]++;}
const highCounts={over80:pairs.filter(pair=>pair.score>=.8).length,over70:pairs.filter(pair=>pair.score>=.7).length,over60:pairs.filter(pair=>pair.score>=.6).length};
const riskTotal=claimRows.length;
const verifiedClaims=claimRows.filter(row=>row.evidenceStatus.startsWith("verified")||row.evidenceStatus==="catalog-classification").length;
const unsupportedClaims=claimRows.filter(row=>row.evidenceStatus==="unsupported").length;
const coverageReview=claimRows.filter(row=>row.evidenceStatus==="needs-coverage-review").length;
const lowInternal=[...linkCounts.entries()].filter(([,counts])=>counts.products>0&&(counts.brands+counts.ranking+counts.top+counts.related+counts.columns+counts.guides)===0).map(([id])=>id);
const metrics={products:products.length,publicTextCount,riskTotal,verifiedClaims,unsupportedClaims,coverageReview,sourceGrades,statuses,knownSuccessors:products.filter(hasKnownSuccessor).length,...highCounts,metaExact,meta90,meta80,titleExact,titlePractical,lowInternal:lowInternal.length};

const claimFile=path.join(reportDir,`product-claim-audit-${REPORT_DATE}.csv`);
const duplicateFile=path.join(reportDir,`product-near-duplicates-${REPORT_DATE}.csv`);
writeCsv(claimFile,claimRows,mode==="after");
writeCsv(duplicateFile,topPairs,mode==="after");

let beforeMetrics=null;
if(mode==="after"){
  const before=fs.readFileSync(path.join(reportDir,`priority7-before-${REPORT_DATE}.md`),"utf8");
  const raw=extract(before,/<!-- PRIORITY7_METRICS ([\s\S]*?) -->/);
  beforeMetrics=raw?JSON.parse(raw):null;
}
const comparison=beforeMetrics?`\n## 修正前後\n\n| 指標 | 修正前 | 修正後 |\n|---|---:|---:|\n${[
  ["リスク表現",beforeMetrics.riskTotal,metrics.riskTotal],["根拠・分類を説明可能",beforeMetrics.verifiedClaims,metrics.verifiedClaims],["根拠不足",beforeMetrics.unsupportedClaims,metrics.unsupportedClaims],
  ["near-duplicate 80%以上",beforeMetrics.over80,metrics.over80],["70%以上",beforeMetrics.over70,metrics.over70],["60%以上",beforeMetrics.over60,metrics.over60],
  ["meta完全重複",beforeMetrics.metaExact,metrics.metaExact],["meta 90%以上",beforeMetrics.meta90,metrics.meta90],["meta 80%以上",beforeMetrics.meta80,metrics.meta80],["status不明",beforeMetrics.statuses["status-unknown"],metrics.statuses["status-unknown"]]
].map(row=>`| ${row[0]} | ${row[1]} | ${row[2]} |`).join("\n")}\n`:"";
const md=`# Moilum Priority 7 ${mode==="before"?"修正前":"修正後"}監査（${REPORT_DATE}）\n\n- 対象: 全${products.length}商品\n- 公開文章: ${publicTextCount}件（desc・公式特徴・比較判断・編集部メモ）\n- 注意: リスク語の存在だけでは違反判定せず、商品区分・公式source・実使用情報と照合。\n\n## Claim監査\n\n- リスク表現総数: ${riskTotal}\n- 根拠確認済み／掲載分類として説明可能: ${verifiedClaims}\n- 根拠不足: ${unsupportedClaims}\n- 公式根拠との対応を人手確認する候補: ${coverageReview}\n\n## ソース品質\n\n| 品質 | 商品数 | 定義 |\n|---|---:|---|\n| A | ${sourceGrades.A} | 商品専用メーカー公式ページで主要表示内容を確認 |\n| B | ${sourceGrades.B} | メーカー公式情報を複数ページまたは限定範囲で確認 |\n| C | ${sourceGrades.C} | 海外公式・国内正規販売元等が中心 |\n| D | ${sourceGrades.D} | 商品固有一次情報をSSoTへ未記録 |\n\n## 商品status\n\n- current-confirmed: ${statuses["current-confirmed"]}\n- legacy: ${statuses.legacy}\n- discontinued: ${statuses.discontinued}\n- status-unknown: ${statuses["status-unknown"]}\n- successor確認情報あり: ${metrics.knownSuccessors}\n\n## near-duplicate\n\n- 80%以上: ${highCounts.over80}ペア\n- 70%以上: ${highCounts.over70}ペア\n- 60%以上: ${highCounts.over60}ペア\n\n| 順位 | Cosine | Jaccard | 商品A | 商品B | 分類 | 原因 |\n|---:|---:|---:|---|---|:---:|---|\n${topPairs.slice(0,10).map(pair=>`| ${pair.rank} | ${pair.cosine} | ${pair.jaccard} | ${pair.leftId}: ${pair.leftName} | ${pair.rightId}: ${pair.rightName} | ${pair.classification} | ${pair.reason} |`).join("\n")}\n\n上位50ペアの全分類は \`reports/product-near-duplicates-${REPORT_DATE}.csv\` に記録。\n\n## meta / title\n\n- meta description完全一致: ${metaExact}ペア\n- meta description 90%以上: ${meta90}ペア\n- meta description 80%以上: ${meta80}ペア\n- title完全一致: ${titleExact}ペア\n- 商品名を除いたtitle構造一致: ${titlePractical}ペア（共通サイト接尾辞は許容）\n\n## 内部リンク\n\n- /products以外の通常リンクが0の商品: ${lowInternal.length}件${lowInternal.length?`（ID: ${lowInternal.join(", ")}）`:""}\n- コラム・ガイド0のみでは警告にしない。ブランド・ランキング・トップ・関連商品を含むグラフ全体で判定。\n${comparison}\n## ID 217 / 227\n\n- 217: ${byId.get(217).name}\n- 227: ${byId.get(227).name}\n- Cosine/Jaccard: ${(()=>{const pair=pairs.find(item=>[item.left.id,item.right.id].sort((a,b)=>a-b).join("/")==="217/227");return `${pair.cosine.toFixed(4)} / ${pair.jaccard.toFixed(4)}`})()}\n- 判定: ${classifyPair(pairs.find(item=>[item.left.id,item.right.id].sort((a,b)=>a-b).join("/")==="217/227")).reason}\n\n<!-- PRIORITY7_METRICS ${JSON.stringify(metrics)} -->\n`;
fs.writeFileSync(path.join(reportDir,`priority7-${mode}-${REPORT_DATE}.md`),md,"utf8");
console.log(`Priority 7 ${mode}: products=${products.length}, publicTexts=${publicTextCount}, risks=${riskTotal}, unsupported=${unsupportedClaims}`);
console.log(`source A/B/C/D=${sourceGrades.A}/${sourceGrades.B}/${sourceGrades.C}/${sourceGrades.D}`);
console.log(`near duplicate >=80/70/60=${highCounts.over80}/${highCounts.over70}/${highCounts.over60}`);
console.log(`meta exact/90/80=${metaExact}/${meta90}/${meta80}; status unknown=${statuses["status-unknown"]}`);
console.log(`reports: priority7-${mode}-${REPORT_DATE}.md, ${path.basename(claimFile)}, ${path.basename(duplicateFile)}`);

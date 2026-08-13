import fs from "node:fs";
import path from "node:path";
import { factualSummary, evidenceOf, sourceQuality, productStatus, riskMatches, claimDisposition, EXPERIENCE_TERMS, normalize } from "./priority7-policy.mjs";
import { isDirectoryProduct, isExcludedProduct, isPendingProduct } from "./product-publication-policy.mjs";

const SITE_ORIGIN="https://moilum.asutelu.com";
const errors=[],warnings=[];
const fail=message=>errors.push(message),warn=message=>warnings.push(message);
const products=JSON.parse(fs.readFileSync("src/products.json","utf8"));
const productById=new Map(products.map(product=>[product.id,product]));
const spa=fs.readFileSync("public/index.html","utf8");
const hub=fs.readFileSync("public/hubs/products.html","utf8");

function extractProducts(html){
  const marker="const PRODUCTS=[",start=html.indexOf(marker);
  if(start<0) throw new Error("SPA PRODUCTS marker not found");
  let index=start+marker.length-1,depth=0,inString=false,quote="",escaped=false,end=-1;
  for(;index<html.length;index++){
    const char=html[index];
    if(escaped){escaped=false;continue;} if(inString){if(char==="\\"){escaped=true;continue;}if(char===quote)inString=false;continue;}
    if(char==='"'||char==="'"){inString=true;quote=char;continue;} if(char==="[")depth++; else if(char==="]"&&--depth===0){end=index;break;}
  }
  return JSON.parse(html.slice(start+marker.length-1,end+1));
}
function decode(value){return String(value||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ");}
function text(value){return decode(String(value||"").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();}
function grams(value){const source=normalize(value),set=new Set();for(let i=0;i<=source.length-3;i++)set.add(source.slice(i,i+3));return set;}
function jaccard(left,right){let intersection=0;for(const item of left)if(right.has(item))intersection++;return intersection/(left.size+right.size-intersection||1);}
const medicalClaimPattern=/(?:シミ|ニキビ|炎症|湿疹|肌荒れ).{0,8}(?:治す|治る|消す|消える|改善する)|肌の奥深くまで浸透|治療(?:する|できる)/;
const genericSourceTerms=new Set(["化粧水","美容液","乳液","クリーム","洗顔料","洗顔","日焼け止め","パック","マスク","ジェル","ローション","セラム","公式","商品"]);
function sourceMatchesProduct(product,source){
  if(source.type!=="official-product")return true;
  const sourceTitle=normalize(source.title||"");
  const productName=normalize(product.name||"");
  if(sourceTitle.length>=5&&(sourceTitle.includes(productName)||productName.includes(sourceTitle)))return true;
  const brand=normalize(product.brand||"");
  if(brand.length>=3&&sourceTitle.includes(brand))return true;
  const tokens=String(product.name||"").replace(product.brand||"","").split(/[\s・／/（）()＋+｜|]+/).map(normalize).filter(token=>token.length>=3&&!genericSourceTerms.has(token));
  return tokens.some(token=>sourceTitle.includes(token));
}

const spaProducts=extractProducts(spa);
if(products.length<247||spaProducts.length!==products.length)fail(`商品数またはSPA同期が不正です: SSoT=${products.length}, SPA=${spaProducts.length}`);
if(JSON.stringify(products)!==JSON.stringify(spaProducts))fail("SSoTとSPA PRODUCTSが一致しません");

const canonicals=new Set(),metas=[];
let sourceD=0,statusUnknown=0,stale=0,unsupported=0,variantGroups=0;
for(const product of products){
  if(product.desc!==factualSummary(product))fail(`商品ID ${product.id}: factual summary生成規則とdescが不一致です`);
  const disposition=claimDisposition(product,"desc",product.desc);
  if(disposition.status==="unsupported"||disposition.status==="needs-coverage-review"){unsupported++;fail(`商品ID ${product.id}: 公開summaryの根拠対応が未解決です (${disposition.status})`);}
  if(!evidenceOf(product)&&medicalClaimPattern.test(product.desc))fail(`商品ID ${product.id}: 根拠未記録summaryに医療・効果断定があります`);
  if(product.reviewedByEditor!==true){
    const publicSpecific=JSON.stringify({desc:product.desc,evidence:product.editorialEvidence||null});
    if(EXPERIENCE_TERMS.some(term=>publicSpecific.includes(term)))fail(`商品ID ${product.id}: 非実使用商品に使用感断定があります`);
  }
  const evidence=evidenceOf(product);
  if(sourceQuality(product).grade==="D")sourceD++;
  if(productStatus(product)==="status-unknown")statusUnknown++;
  if(evidence){
    if((evidence.officialFeatures||[]).length&&!(evidence.sources||[]).length)fail(`商品ID ${product.id}: 公式特徴にsourceがありません`);
    if(Object.keys(evidence.specs||{}).length&&!(evidence.sources||[]).length)fail(`商品ID ${product.id}: 公式仕様にsourceがありません`);
    for(const source of evidence.sources||[]){
      try{const url=new URL(source.url);if(url.protocol!=="https:")throw new Error();}catch{fail(`商品ID ${product.id}: source URLが不正です`);}
      if(!sourceMatchesProduct(product,source))fail(`商品ID ${product.id}: official-product sourceのタイトルが商品名と対応しません (${source.title||"titleなし"})`);
    }
    const checked=Date.parse(evidence.verifiedAt||"");
    if(!Number.isFinite(checked))fail(`商品ID ${product.id}: verifiedAtが不正です`);
    else if(Date.parse("2026-08-11")-checked>366*86400000)stale++;
  }
  const file=path.join("public","products",`${product.id}.html`);
  if(isExcludedProduct(product)){
    if(fs.existsSync(file))fail(`商品ID ${product.id}: excludedページが生成されています`);
    continue;
  }
  if(!fs.existsSync(file)){fail(`商品ID ${product.id}: 商品ページがありません`);continue;}
  const html=fs.readFileSync(file,"utf8");
  const canonical=html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1]||"";
  if(canonical!==`${SITE_ORIGIN}/products/${product.id}`)fail(`商品ID ${product.id}: canonical不正`);
  if(canonicals.has(canonical))fail(`商品ID ${product.id}: canonical重複`); else canonicals.add(canonical);
  const desc=text(html.match(/<div class="desc">([\s\S]*?)<\/div>/i)?.[1]||"");
  if(!isPendingProduct(product)&&desc!==product.desc)fail(`商品ID ${product.id}: 商品詳細summaryがSSoTと矛盾`);
  const meta=decode(html.match(/<meta name="description" content="([^"]+)"/i)?.[1]||"");
  metas.push({id:product.id,value:meta});
  if(isPendingProduct(product)){
    if(!/noindex\s*,\s*follow/i.test(html))fail(`商品ID ${product.id}: pendingがnoindexではありません`);
    if(!html.includes("Moilumで公式情報を確認中です"))fail(`商品ID ${product.id}: pending表示がありません`);
    if(/楽天レビュー|Moilum編集部評価|class="related"/.test(html))fail(`商品ID ${product.id}: pendingに評価・関連商品があります`);
  }else if(!evidence){
    if(/<div class="ingredients">/.test(html))fail(`商品ID ${product.id}: 根拠未記録の成分一覧を表示しています`);
    if(/<div class="proscons">/.test(html))fail(`商品ID ${product.id}: 根拠未記録のメリデメ自動生成が残っています`);
    if(!html.includes('class="data-limit"'))fail(`商品ID ${product.id}: 情報不足の明示がありません`);
  }else if(!html.includes("根拠となる公式情報源"))fail(`商品ID ${product.id}: 公式情報源の可視表示がありません`);
  if(product.status==="previous_generation"&&!html.includes("旧製品・前世代情報"))fail(`商品ID ${product.id}: 前世代表示がありません`);
  for(const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)){
    const raw=match[1];JSON.parse(raw);
    if(/"(?:aggregateRating|reviewCount|ratingCount|review)"\s*:/.test(raw))fail(`商品ID ${product.id}: レビュー系JSON-LDが復活しています`);
  }
  const card=hub.match(new RegExp(`<article class="product-directory-card"[^>]*data-product-id="${product.id}"[\\s\\S]*?<\\/article>`))?.[0]||"";
  if(isDirectoryProduct(product)&&!card)fail(`商品ID ${product.id}: /productsカードがありません`);
  else if(!isDirectoryProduct(product)&&card)fail(`商品ID ${product.id}: 公開対象外なのに/productsカードがあります`);
  else if(isDirectoryProduct(product)&&text(card.match(/<p class="description">([\s\S]*?)<\/p>/)?.[1]||"")!==product.desc)fail(`商品ID ${product.id}: 商品カードと詳細summaryが矛盾`);
}

const groups=new Map();
for(const product of products){const group=product.editorialEvidence?.variantGroup;if(!group)continue;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(product);}
for(const [group,variants] of groups){
  variantGroups++;
  for(const product of variants){const html=fs.readFileSync(path.join("public","products",`${product.id}.html`),"utf8");for(const variant of variants)if(!html.includes(`href="/products/${variant.id}"`))fail(`variant ${group}: 商品ID ${product.id}から${variant.id}へのリンクがありません`);}
}

let meta90=0;
for(let i=0;i<metas.length;i++)for(let j=i+1;j<metas.length;j++)if(jaccard(grams(metas[i].value),grams(metas[j].value))>=.9)meta90++;
const report=fs.readFileSync("reports/priority7-after-2026-08-11.md","utf8");
const duplicate80=Number(report.match(/80%以上: (\d+)ペア/)?.[1]||0);
const lowInternal=Number(report.match(/\/products以外の通常リンクが0の商品: (\d+)件/)?.[1]||0);
if(sourceD)warn(`商品固有一次情報が未記録の商品: ${sourceD}件（強い商品固有主張は非表示）`);
if(statusUnknown)warn(`現行・旧製品status未確認: ${statusUnknown}件`);
if(stale)warn(`公式情報の確認日が1年以上前: ${stale}件`);
if(duplicate80)warn(`商品固有本文のnear-duplicate 80%以上: ${duplicate80}ペア（原因分類CSVを参照）`);
if(meta90)warn(`meta description 90%以上類似: ${meta90}ペア`);
if(lowInternal)warn(`商品一覧以外の内部導線が0: ${lowInternal}件`);

for(const [id,url] of [[217,"4901301261991"],[227,"4901301257666"],[230,"4901301257680"]]){
  const source=productById.get(id)?.editorialEvidence?.sources?.[0]?.url||"";
  if(!source.includes(url))fail(`商品ID ${id}: 花王公式URLとJANが一致しません`);
}
if(!fs.readFileSync("public/products/217.html","utf8").includes("130ml")||!fs.readFileSync("public/products/227.html","utf8").includes("130g"))fail("ID217/227の容量差が表示されていません");
if(unsupported)fail(`unsupported summaryが${unsupported}件残っています`);
console.log(`Priority 7 CI: products=${products.length}, errors=${errors.length}, warnings=${warnings.length}, sourceD=${sourceD}, statusUnknown=${statusUnknown}`);
for(const message of warnings)console.warn(`WARNING: ${message}`);
if(errors.length){for(const message of errors)console.error(`FAIL: ${message}`);process.exit(1);}
console.log(`✓ ${products.length}商品のclaim coverage・カード整合・status・variant・canonical・レビュー系ガードを確認（variant group ${variantGroups}件）`);

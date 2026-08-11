import fs from "node:fs";
import { factualSummary } from "./priority7-policy.mjs";

const file = "src/products.json";
const products = JSON.parse(fs.readFileSync(file,"utf8"));
if(products.length<247) throw new Error(`expected at least 247 products, got ${products.length}`);
const byId=new Map(products.map(product=>[product.id,product]));

function requireProduct(id){
  const product=byId.get(id);
  if(!product) throw new Error(`product missing: ${id}`);
  return product;
}

Object.assign(requireProduct(217),{
  skin:["普通肌"],
  concern:[],
  keyIngredients:["グリセリン"],
  editorialEvidence:{
    verifiedAt:"2026-08-11",
    updatedAt:"2026-08-11",
    referencePriceCheckedAt:"2026-06",
    variantGroup:"mens-biore-face-wash",
    sources:[{
      type:"official-product",
      title:"メンズビオレ 泡タイプ洗顔 つめかえ用｜花王公式",
      url:"https://www.kao-kirei.com/ja/item/khg/mensbiore/4901301261991/",
      scope:"domestic",
      locale:"ja-JP"
    }],
    specs:{
      manufacturerCategory:"洗顔・ソープ",
      contentAmount:"130ml",
      classification:"化粧品",
      saleName:"メンズビオレ泡タイプ洗顔c",
      keyIngredients:["グリセリン（成分表示）"],
      fragrance:"マイルドシトラスの香り",
      variants:"つめかえ用",
      refillCompatibility:"メンズビオレ泡タイプ洗顔の使用済み容器専用",
      countryOfOrigin:"日本"
    },
    officialFeatures:[
      "泡で出てくる洗顔料で、シェービングにも使用できると案内されています。",
      "つめかえ用は130mlで、専用の使用済み容器へ全量をつめかえる商品です。"
    ],
    comparisonPoints:[
      "スクラブを含む洗顔料ではなく、ポンプ容器に補充して泡で使うタイプです。",
      "本体は150ml、掲載している商品は130mlのつめかえ用です。"
    ],
    decision:{
      chooseWhen:["泡で出る洗顔料のつめかえ用を探している","シェービングにも使える洗顔料を比較したい"],
      compareWhen:["スクラブ入りのさっぱりした洗顔料を探している","専用本体を持っていない"]
    },
    comparisonCandidates:[
      {id:227,reason:"同ブランドのダブルスクラブ入りチューブ洗顔との違いを比較"},
      {id:230,reason:"同ブランドのミクロスクラブ洗顔との違いを比較"},
      {id:226,reason:"同価格帯のメンズ向け洗顔料と比較"}
    ],
    sourceLimitations:["詰め替え先・容量・成分・香りは花王公式商品ページで確認。肌との相性や使用感は編集部未確認です。"]
  }
});

Object.assign(requireProduct(227),{
  keyIngredients:["グリセリン","メントール","ダブルスクラブ"],
  editorialEvidence:{
    verifiedAt:"2026-08-11",
    updatedAt:"2026-08-11",
    referencePriceCheckedAt:"2026-06",
    variantGroup:"mens-biore-face-wash",
    sources:[{
      type:"official-product",
      title:"メンズビオレ ダブルスクラブ洗顔｜花王公式",
      url:"https://www.kao-kirei.com/ja/item/khg/mensbiore/4901301257666/",
      scope:"domestic",
      locale:"ja-JP"
    }],
    specs:{
      manufacturerCategory:"洗顔・ソープ",
      contentAmount:"130g",
      classification:"化粧品",
      saleName:"メンズビオレ ダブルスクラブ洗顔c",
      keyIngredients:["グリセリン","メントール（清涼成分）","黒・白のスクラブ"],
      fragrance:"シトラスグリーンの香り",
      usage:"約2cmを水またはお湯で泡立てて洗い、よく流す",
      variants:"チューブタイプ",
      countryOfOrigin:"ベトナム"
    },
    officialFeatures:[
      "黒と白のダブルスクラブを採用したチューブタイプの洗顔料です。",
      "メントール（清涼成分）配合で、シトラスグリーンの香りと案内されています。"
    ],
    comparisonPoints:[
      "130gのチューブタイプで、泡タイプ洗顔のつめかえ商品とは容器・使用方法が異なります。",
      "スクラブ粒やメントールの冷感刺激が苦手な場合は別タイプも比較が必要です。"
    ],
    decision:{
      chooseWhen:["スクラブ入りのチューブ洗顔を比較したい","メントール配合の洗顔料を探している"],
      compareWhen:["スクラブ粒やメントールの冷感刺激を避けたい","泡で出るポンプ式洗顔料を探している"]
    },
    comparisonCandidates:[
      {id:230,reason:"同ブランドのミクロスクラブタイプとスクラブ仕様を比較"},
      {id:217,reason:"同ブランドの泡タイプ洗顔つめかえと容器・使い方を比較"},
      {id:216,reason:"別ブランドのスクラブ洗顔と価格・掲載仕様を比較"}
    ],
    sourceLimitations:["容量・成分・使用方法・注意事項は花王公式商品ページで確認。洗浄力や使用感を編集部が実測したものではありません。"]
  }
});

Object.assign(requireProduct(230),{
  keyIngredients:["ソルビトール","メントール","ミクロスクラブ"],
  editorialEvidence:{
    verifiedAt:"2026-08-11",
    updatedAt:"2026-08-11",
    referencePriceCheckedAt:"2026-06",
    variantGroup:"mens-biore-face-wash",
    sources:[{
      type:"official-product",
      title:"メンズビオレ ミクロスクラブ洗顔｜花王公式",
      url:"https://www.kao-kirei.com/ja/item/khg/mensbiore/4901301257680/",
      scope:"domestic",
      locale:"ja-JP"
    }],
    specs:{
      manufacturerCategory:"洗顔・ソープ",
      contentAmount:"130g",
      classification:"化粧品",
      saleName:"メンズビオレ ミクロスクラブ洗顔b",
      keyIngredients:["ソルビトール","メントール（清涼成分）","ミクロスクラブ"],
      fragrance:"マイルドシトラスの香り",
      usage:"約2cmを水またはお湯で泡立てて洗い、よく流す",
      variants:"チューブタイプ",
      countryOfOrigin:"ベトナム"
    },
    officialFeatures:[
      "洗う間に細かくなるミクロスクラブを採用したチューブタイプの洗顔料です。",
      "メントール（清涼成分）配合で、マイルドシトラスの香りと案内されています。"
    ],
    comparisonPoints:[
      "ダブルスクラブ洗顔とはスクラブの仕様と香りの案内が異なります。",
      "泡タイプ洗顔つめかえとは容器・使用方法が異なります。"
    ],
    decision:{
      chooseWhen:["細かなスクラブのチューブ洗顔を比較したい","マイルドシトラスの香りを確認して選びたい"],
      compareWhen:["スクラブ粒やメントールの冷感刺激を避けたい","泡で出るポンプ式洗顔料を探している"]
    },
    comparisonCandidates:[
      {id:227,reason:"同ブランドのダブルスクラブタイプと違いを比較"},
      {id:217,reason:"同ブランドの泡タイプ洗顔つめかえと容器・使い方を比較"},
      {id:216,reason:"別ブランドのスクラブ洗顔と価格・掲載仕様を比較"}
    ],
    sourceLimitations:["容量・成分・使用方法は花王公式商品ページで確認。使用感は編集部未確認です。"]
  }
});

let changed=0;
for(const product of products){
  const summary=factualSummary(product);
  if(product.desc!==summary){ product.desc=summary; changed++; }
}
fs.writeFileSync(file,JSON.stringify(products,null,2)+"\n","utf8");
console.log(`✓ Priority 7 factual summaryを${products.length}商品へ適用（変更${changed}件）`);
console.log("✓ ID 217/227/230の公式仕様とvariant関係を追加");

# Moilum SEO優先順位6 修正後監査

- 計測日: 2026-08-11
- 対象: `/` / `/columns/ingredient-comparison` / `/columns/depacos-vs-puchipura` / `/columns/sunscreen`
- GSCの状態は2026年8月7日時点の過去スナップショットであり、現在も未登録とは断定しません。

## HTTP・meta・本文量

| URL | HTTP | canonical | robots | HTML | main本文 | 内部リンク | 商品リンク | 外部情報源 | H2/H3 |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| / | 200 | https://moilum.asutelu.com/ | index,follow | 722.8KB | 2,442字 | 56 | 22 | 0 | 6/11 |
| /columns/ingredient-comparison | 200 | https://moilum.asutelu.com/columns/ingredient-comparison | index,follow,max-image-preview:large | 31.6KB | 4,001字 | 26 | 14 | 5 | 11/3 |
| /columns/depacos-vs-puchipura | 200 | https://moilum.asutelu.com/columns/depacos-vs-puchipura | index,follow,max-image-preview:large | 28.8KB | 3,117字 | 23 | 10 | 2 | 10/5 |
| /columns/sunscreen | 200 | https://moilum.asutelu.com/columns/sunscreen | index,follow,max-image-preview:large | 29.6KB | 3,429字 | 20 | 9 | 4 | 11/3 |

## title・description

### /

- title: Moilum（モイルム）｜スキンケア商品を肌悩み別に比較・肌タイプ診断
- description: 化粧水・美容液・日焼け止めなどスキンケア商品を、肌タイプ・お悩み・予算で比較。キュレル・Anua・SK-IIなど人気ブランドを網羅。無料の肌タイプ診断（ルールベース）で、条件に合う一本を絞り込みできます。

### /columns/ingredient-comparison

- title: セラミド・ヒアルロン酸・ナイアシンアミドの違い｜掲載商品データで比較｜Moilum スキンケアコラム
- description: セラミド・ヒアルロン酸・ナイアシンアミドの違いを、公的資料と査読済み研究をもとに整理。Moilum掲載商品の主要成分欄を自動集計し、商品数・参考価格中央値・カテゴリ分布・併用成分の傾向を比較します。

### /columns/depacos-vs-puchipura

- title: デパコスとプチプラを価格だけで分けない｜掲載商品の価格帯分析｜Moilum スキンケアコラム
- description: デパコスとプチプラを単純な価格線で分類せず、Moilum掲載商品の参考価格をカテゴリ別に自動集計。商品数・最安値・第1四分位・中央値・第3四分位・最高値から、確認できる範囲で予算の決め方を整理します。

### /columns/sunscreen

- title: 日焼け止めの選び方｜SPF・PA・UV耐水性を正しく確認する｜Moilum スキンケアコラム
- description: 日焼け止めのSPF・PA・UV耐水性を日本化粧品工業会の現行説明に沿って整理。Moilum掲載UV商品のSPF50+・PA++++明記率、参考価格中央値、価格帯分布、公式仕様の保持状況を自動集計します。

## 独自性・テンプレート分析

| URL | 他コラムとの最大類似度 | 比較先 | 共通テンプレート文章率 | 商品データ由来文章率 | 自動生成の独自集計 |
|---|---:|---|---:|---:|---|
| / | — | — | 0.0% | 64.1% | なし |
| /columns/ingredient-comparison | 11.1% | depacos-vs-puchipura | 10.0% | 54.4% | あり |
| /columns/depacos-vs-puchipura | 11.1% | ingredient-comparison | 12.6% | 25.8% | あり |
| /columns/sunscreen | 10.9% | depacos-vs-puchipura | 9.0% | 23.2% | あり |

## トップと商品ハブの重複

- `/` と `/products` のmain本文5文字gram類似度: **2.9%**

## 計測定義

- main本文: トップはbody先頭からブランドSPA領域直前まで、コラムはarticle要素内。script/style/svgは除外。
- 他コラム類似度: 正規化した本文の5文字gram Jaccard係数。27記事のうち最大値。
- 共通テンプレート文章率: 20文字以上の文のうち、3記事以上に同じ正規化文がある文字量の比率。
- 商品データ由来文章率: 商品名・ブランド・主要成分・価格表記を含む文の文字量比率。
- 独自集計: Priority 6のビルド時集計マーカー `p6-data-analysis` の有無。既存の固定比較表やレーダーだけでは「あり」にしない。

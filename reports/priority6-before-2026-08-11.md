# Moilum SEO優先順位6 修正前監査

- 計測日: 2026-08-11
- 対象: `/` / `/columns/ingredient-comparison` / `/columns/depacos-vs-puchipura` / `/columns/sunscreen`
- GSCの状態は2026年8月7日時点の過去スナップショットであり、現在も未登録とは断定しません。

## HTTP・meta・本文量

| URL | HTTP | canonical | robots | HTML | main本文 | 内部リンク | 商品リンク | 外部情報源 | H2/H3 |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| / | 200 | https://moilum.asutelu.com/ | index,follow | 767.8KB | 14,508字 | 10 | 8 | 0 | 8/8 |
| /columns/ingredient-comparison | 200 | https://moilum.asutelu.com/columns/ingredient-comparison | index,follow,max-image-preview:large | 35.3KB | 3,747字 | 17 | 9 | 0 | 10/2 |
| /columns/depacos-vs-puchipura | 200 | https://moilum.asutelu.com/columns/depacos-vs-puchipura | index,follow,max-image-preview:large | 35.0KB | 3,538字 | 18 | 10 | 0 | 10/2 |
| /columns/sunscreen | 200 | https://moilum.asutelu.com/columns/sunscreen | index,follow,max-image-preview:large | 35.1KB | 3,601字 | 17 | 9 | 0 | 10/2 |

## title・description

### /

- title: Moilum（モイルム）｜スキンケア商品を肌悩み別に比較・肌タイプ診断
- description: 化粧水・美容液・日焼け止めなどスキンケア商品を、肌タイプ・お悩み・予算で比較。キュレル・Anua・SK-IIなど人気ブランドを網羅。無料の肌タイプ診断（ルールベース）で、条件に合う一本を絞り込みできます。

### /columns/ingredient-comparison

- title: 人気保湿成分を徹底比較｜セラミド・ヒアルロン酸・ナイアシンアミドの違い｜Moilum スキンケアコラム
- description: セラミド・ヒアルロン酸・ナイアシンアミドは働きも向く肌質も別物です。3成分の役割を比較表で整理し、掲載233商品の実データから自分に合う選び方を解説。効果を実感しにくいケースや向かない人まで正直に書いた、Moilum編集部の成分比較ガイドです。

### /columns/depacos-vs-puchipura

- title: デパコスとプチプラ、どう選ぶ？価格別スキンケアの考え方｜Moilum スキンケアコラム
- description: 高い化粧品ほど効くとは限りません。デパコスとプチプラの価格差の正体（成分・使用感・容器・広告費）を分解し、お金をかける価値がある工程とプチプラで十分な工程を実データ比較で提案。デパコスが向かない人のケースも正直に解説する予算配分ガイドです。

### /columns/sunscreen

- title: 日焼け止めの選び方｜SPFとPAの意味、塗る量の目安｜Moilum スキンケアコラム
- description: SPF50が常に正解とは限りません。SPF・PAの意味と、通勤・買い物・屋外レジャーなどシーン別の選び方、効果を発揮させる塗る量・塗り直しのコツを解説。数値が高いほど肌への負担も増えやすいというデメリットまで正直に書いた日焼け止めガイドです。

## 独自性・テンプレート分析

| URL | 他コラムとの最大類似度 | 比較先 | 共通テンプレート文章率 | 商品データ由来文章率 | 自動生成の独自集計 |
|---|---:|---|---:|---:|---|
| / | — | — | 0.0% | 78.5% | なし |
| /columns/ingredient-comparison | 17.5% | ingredients | 12.4% | 58.6% | なし |
| /columns/depacos-vs-puchipura | 15.7% | lotion-price-comparison | 12.8% | 26.7% | なし |
| /columns/sunscreen | 17.8% | sensitive-sunscreen | 10.3% | 28.9% | なし |

## トップと商品ハブの重複

- `/` と `/products` のmain本文5文字gram類似度: **36.6%**

## 計測定義

- main本文: トップはbody先頭からブランドSPA領域直前まで、コラムはarticle要素内。script/style/svgは除外。
- 他コラム類似度: 正規化した本文の5文字gram Jaccard係数。27記事のうち最大値。
- 共通テンプレート文章率: 20文字以上の文のうち、3記事以上に同じ正規化文がある文字量の比率。
- 商品データ由来文章率: 商品名・ブランド・主要成分・価格表記を含む文の文字量比率。
- 独自集計: Priority 6のビルド時集計マーカー `p6-data-analysis` の有無。既存の固定比較表やレーダーだけでは「あり」にしない。

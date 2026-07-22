// 悩み別・条件別ハブページ (/guides/{slug}) を静的HTMLで生成する。
// 商品選定は src/products.json の実データ機械抽出 + 編集部コメントの構成。
// GA4/GSC/構造化データ(BreadcrumbList/ItemList/FAQPage/Organization) 含む。

import fs from "node:fs";
import path from "node:path";

const SITE_ORIGIN = "https://moilum.asutelu.com";
const OGP_IMAGE = SITE_ORIGIN + "/ogp-image.png";
const GSC_VERIFICATION = "UucVcbwbG6YhXKLVS3GGS8nVk_egyJCLywDHkw6J-5Q";
const GA4_ID = "G-BC0FBSZSWX";
const BUILD_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const products = JSON.parse(fs.readFileSync("src/products.json", "utf8"));
const columns = JSON.parse(fs.readFileSync("src/columns.json", "utf8"));

// スキンケア母集団 (メイク・世代違い旧品を除外)
const SKINCARE = products.filter(p =>
  p.productType !== "makeup" && p.status !== "previous_generation"
);

function escHtml(s){
  return String(s == null ? "" : s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&#39;"}[c]));
}
function escAttr(s){ return escHtml(s); }
function truncate(s, n){ const str = String(s || ""); return str.length > n ? str.slice(0, n - 1) + "…" : str; }
function findColumn(id){ return columns.find(c => c.id === id); }

// ===== ガイド設定 =====
// 監査対応：機械抽出+編集部コメントで質を担保。単なる自動生成の羅列にはしない。
const GUIDES = [
  {
    slug: "dry-skin-lotion",
    title: "乾燥肌向け化粧水の選び方とおすすめ",
    metaDesc: "乾燥肌向けの化粧水選びを、掲載商品の実データで比較。セラミド・ヒアルロン酸配合の候補を編集部評価順に紹介し、選び方の3原則と『向かない人』も正直に解説します。",
    breadcrumbName: "乾燥肌向け化粧水の選び方",
    filter: p => p.category === "化粧水" && p.skin.includes("乾燥肌"),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『化粧水』で対応肌タイプに『乾燥肌』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>乾燥肌の化粧水選びは、<strong>「保湿成分」「テクスチャ」「継続できる価格」の3点</strong>で決まります。ハイスペック品を1本買うより、規定量をたっぷり使える1本を毎日続けるほうが、結果的に肌の水分量は安定しやすい傾向があります。</p>
<p>選び方の原則を3つに絞ると、次のとおりです。<strong>①保湿成分は「セラミド」「ヒアルロン酸」「アミノ酸」いずれかを軸に</strong>——特にセラミドは肌のバリア機能に関わる成分として、乾燥肌向け製品の定番配合です。<strong>②テクスチャは『とろみのある化粧水+乳液/クリーム』で二段構え</strong>——さっぱり系のみで済ませると、水分は入っても抜けやすくなります。<strong>③価格は続けられる帯を優先</strong>——高価格帯を薄く使うより、中価格帯（1,500〜3,000円）をたっぷり使うほうが乾燥肌には効きやすい傾向があります。</p>`,
    notFor: [
      "皮脂量が多くベタつきが苦手な方：とろみ系は重く感じる可能性があるため、脂性肌〜混合肌の方は<a href=\"/guides/oily-skin-lotion\">脂性肌向け</a>を参照してください（作成予定）。",
      "アトピー等で医師の治療を受けている方：市販化粧水の選択より、処方薬・医師の指導が優先です。",
      "『高い化粧水ほど効く』と考えている方：化粧水の主目的は水分補給で、価格差ほど保湿力には差が出にくいのが実データです。"
    ],
    caveats: "初めて使う成分（特にレチノールやビタミンC誘導体を含む化粧水）は、腕の内側で24時間のパッチテストをしてから顔に使うのが安全です。使用中に赤み・かゆみが出たら中止し、症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["sensitive-ceramide-toner", "basic-routine", "dry-skin-summer"],
    faq: [
      {
        q: "乾燥肌の化粧水は『とろみ系』一択ですか？",
        a: "さっぱり系でも、後に乳液・クリームで蓋をすれば十分に機能します。使用感の好みで選んで、保湿力は化粧水単体ではなく『化粧水＋クリーム』のセットで担保するのが基本形です。"
      },
      {
        q: "セラミドとヒアルロン酸、どちらを優先すべきですか？",
        a: "バリア機能が弱いと感じる乾燥肌にはセラミド系、単純に水分不足を感じる乾燥肌にはヒアルロン酸系が向きやすい傾向です。両方入りの製品も多く、成分表の上位に記載があるかを目安にしてください。"
      },
      {
        q: "化粧水は何回重ね付けすべきですか？",
        a: "肌が入っていく感覚まで数回重ねるのが1つの目安ですが、多くの製品は『規定量を手のひらに取ってなじませる』を1回で十分な設計です。過度な重ね付けは摩擦の原因になるため、量を守るほうが確実です。"
      }
    ]
  },
  {
    slug: "sensitive-skin-lotion",
    title: "敏感肌向け化粧水の選び方とおすすめ",
    metaDesc: "敏感肌向けの化粧水を、掲載商品の実データから編集部評価順に紹介。低刺激設計をうたう定番から、避けたい成分・パッチテストの手順まで正直に解説します。",
    breadcrumbName: "敏感肌向け化粧水の選び方",
    filter: p => p.category === "化粧水" && p.skin.includes("敏感肌"),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『化粧水』で対応肌タイプに『敏感肌』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>敏感肌の化粧水選びで大切なのは、<strong>『刺激になりうる成分を減らす』ことと、『バリア機能をサポートする成分を入れる』ことの2軸</strong>です。派手な訴求よりも、シンプル処方・低刺激設計をうたう定番のほうが失敗しにくい傾向があります。</p>
<p>選び方の原則は3つ。<strong>①避けたい成分の目安</strong>——アルコール（エタノール）・強い香料・メントール等の清涼剤は、肌の状態によって刺激になる場合があります。「無香料・無着色・アルコールフリー」表示を優先すると安全側に振れます。<strong>②バリア機能をサポートする成分</strong>——セラミド・パンテノール・グリチルリチン酸・アラントインなどの鎮静・保護系成分を含むものが定番です。<strong>③新しい製品は必ずパッチテスト</strong>——腕の内側に少量塗り、24時間経過を観察してから顔に使うのが基本形です。「敏感肌向け」表示があっても、個人差は残るためこの手順は省略しないでください。</p>`,
    notFor: [
      "特定成分アレルギーの診断を受けている方：市販品の分類より、医師と個別に相性を確認するほうが安全です。",
      "接触皮膚炎など治療中の方：スキンケアの見直しより医療機関の指導が優先です。",
      "「敏感肌向け」表示に絶対の安全性を期待する方：あくまで刺激リスクを下げる設計であって、全員に無刺激を保証するものではありません。"
    ],
    caveats: "肌のゆらぎは睡眠不足・生理周期・季節の変わり目でも起こります。同じ製品でも時期によって合う・合わないが変わることがあるため、痛みや赤みが出たら一時中止する判断を優先してください。症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["sensitive-ceramide-toner", "skin-type", "basic-routine"],
    faq: [
      {
        q: "「敏感肌向け」と書いてあれば必ず安全ですか？",
        a: "刺激になりうる成分を減らした設計という意味であり、絶対の安全性を保証するものではありません。個人差があるため、初回はパッチテストを行ってください。"
      },
      {
        q: "アルコール（エタノール）は完全に避けるべきですか？",
        a: "少量配合が悪いとは限りませんが、敏感肌でヒリつきの経験がある方は「アルコールフリー」表示を優先すると安全側です。成分表の上位に記載があるかを目安に判断してください。"
      }
    ]
  },
  {
    slug: "acne-face-wash",
    title: "ニキビ・肌荒れ向け洗顔料の選び方",
    metaDesc: "ニキビ・肌荒れが気になる肌向けの洗顔料を、掲載商品の実データから編集部評価順に紹介。皮脂と角質のバランス・鎮静成分・洗いすぎの避け方まで正直に解説します。",
    breadcrumbName: "ニキビ・肌荒れ向け洗顔料の選び方",
    filter: p => p.category === "洗顔" && p.concern.some(c => c.includes("ニキビ") || c.includes("肌荒れ")),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『洗顔』で対応する悩みに『ニキビ・吹き出物』または『肌荒れ・赤み』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>ニキビ・肌荒れ向けの洗顔料選びは、<strong>「落としすぎない」「刺激しすぎない」「必要なものは落とす」の3点のバランス</strong>で決まります。過剰な洗浄はバリア機能を下げ、かえって炎症を悪化させる場合があります。</p>
<p>選び方の原則を3つに絞ると、次のとおりです。<strong>①皮脂と角質を落とすアプローチは、鎮静成分と両立している設計を選ぶ</strong>——グリチルリチン酸・アラントイン・CICA（ツボクサ）等の鎮静成分が含まれていると、洗浄後の肌が落ち着きやすい傾向があります。<strong>②スクラブ・強い刺激成分は炎症時は避ける</strong>——赤みや腫れがあるニキビにゴシゴシ洗いは逆効果。泡でなでる程度の摩擦に留めるのが原則です。<strong>③朝と夜で使い分けを検討する</strong>——皮脂の多い夜はニキビ対応品、乾燥しやすい朝は低刺激な洗顔料か水洗顔、と使い分けるのも1つの手です。</p>`,
    notFor: [
      "強い炎症・膿を持つニキビが多発している方：洗顔料選び以前に、皮膚科の診察と処方薬による治療が優先です。市販品で長引かせず、早めに受診してください。",
      "乾燥肌にニキビが出る大人ニキビの方：脂性肌向けのさっぱり洗顔は乾燥を助長し、かえって皮脂分泌を刺激することがあります。低刺激・保湿系の洗顔と併せて<a href=\"/columns/acne-scar-reality\">跡ケアの現実</a>もご参照ください。",
      "洗顔で毛穴汚れが完全に消えると期待する方：洗顔は落とすのが仕事で、毛穴の詰まりや黒ずみの根本ケアは美容液や生活習慣の見直しが中心になります。"
    ],
    caveats: "ニキビ肌はバリア機能が下がっていることが多く、洗顔後は速やかに保湿してください。同じ製品でも生理周期や季節で合わなくなる場合があります。強い痛みを伴うニキビや、色素沈着が濃く残る場合は自己判断せず皮膚科を受診してください。",
    relatedColumnIds: ["acne-scar-reality", "morning-face-wash", "sensitive-ceramide-toner"],
    faq: [
      {
        q: "ニキビ肌に薬用洗顔は必須ですか？",
        a: "必須ではありません。医薬部外品の薬用洗顔は炎症予防成分の効果が期待できますが、洗浄力の強すぎるものは避けて、鎮静成分を含む低刺激設計との相性を優先してください。"
      },
      {
        q: "1日に何回洗顔すべきですか？",
        a: "基本は朝と夜の1日2回。皮脂が気になっても3回以上はバリア機能を下げるリスクがあります。日中はティッシュで軽く抑える程度に留めてください。"
      }
    ]
  },
  {
    slug: "under-2000-sunscreen",
    title: "2,000円以下の日焼け止め比較",
    metaDesc: "2,000円以下で毎日使える日焼け止めを、掲載商品の実データから編集部評価順に紹介。SPF・PA表示の見方、シーン別の選び方、プチプラで妥協しない条件まで正直に解説します。",
    breadcrumbName: "2,000円以下の日焼け止め比較",
    filter: p => p.category === "日焼け止め" && p.price <= 2000,
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『日焼け止め』で価格が2,000円以下のものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>日焼け止めは<strong>「続けられる価格」×「シーンに合う機能」</strong>で選ぶのが結論。SPF50が常に正解ではなく、日常はSPF30〜、レジャーはSPF50+と使い分けるほうが肌負担と紫外線対策の両立になります。</p>
<p>プチプラ帯で選ぶ原則は3つ。<strong>①日常はSPF30〜50、PA+++ 以上で十分</strong>——通勤・買い物中心なら1日を通じて充分な守備範囲です。<strong>②テクスチャは「毎日ストレスなく塗れる」もの</strong>——ベタつきや白浮きが強いと塗る頻度が落ち、結局UV対策として機能しません。プチプラ帯には軽い使用感の製品が豊富にあります。<strong>③レジャー時のみ高SPF＋耐水性を追加</strong>——普段用に1本＋アクティブ用に1本の2本使いで、コストと効果の両立を狙う考え方が現実的です。</p>`,
    notFor: [
      "海・プール・スポーツがメインの方：耐水性・耐摩擦の高い専用品が別途必要です。2,000円以下でも該当品はありますが、ラベルの「耐水性」表示を必ず確認してください。",
      "「安いから効かない」と決めつけている方：プチプラ帯にも国内大手ブランドの実力派が複数あり、価格差=効果差ではありません。塗り直しやすさで日焼け止めは決まる場面が多いです。",
      "デリケートな敏感肌で紫外線吸収剤が合わない方：ノンケミカル（吸収剤不使用）の選択肢は<a href=\"/columns/sensitive-sunscreen\">敏感肌向け日焼け止め</a>で解説しています。"
    ],
    caveats: "SPFやPAはあくまで規定量（顔全体で500円玉2枚分等）を塗った場合の値です。実使用量は規定の半分以下と言われるため、こまめな塗り直し（2〜3時間ごと）が実効の防御力に直結します。プチプラだからこそケチらずに使うのが本質です。",
    relatedColumnIds: ["sunscreen", "sensitive-sunscreen", "dry-skin-summer"],
    faq: [
      {
        q: "プチプラ日焼け止めは効果が弱いですか？",
        a: "SPF/PA値と効果は価格ではなく処方で決まります。プチプラでもSPF50+ PA++++ の製品は多く、日常紫外線には十分な守備範囲を持ちます。"
      },
      {
        q: "毎日塗る必要はありますか？",
        a: "紫外線A波（UVA）は曇りや室内窓越しでも肌に届き、シワ・シミの主因とされます。日焼け止めを日常習慣にするほうがスキンケア投資の中で最も費用対効果が高い部類です。"
      }
    ]
  },
  {
    slug: "oily-skin-lotion",
    title: "脂性肌・テカリ向け化粧水の選び方",
    metaDesc: "脂性肌向けの化粧水を、掲載商品の実データから編集部評価順に紹介。皮脂バランス・清涼感と保湿の両立・拭き取りタイプの使い分けまで正直に解説します。",
    breadcrumbName: "脂性肌向け化粧水の選び方",
    filter: p => p.category === "化粧水" && p.skin.includes("脂性肌"),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『化粧水』で対応肌タイプに『脂性肌』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>脂性肌の化粧水選びで最も避けたいのは、<strong>「テカリを抑えたい」→「さっぱり系一択」→「乾燥→さらなる皮脂分泌」の悪循環</strong>です。皮脂の多い肌でも、水分量が不足しているインナードライのケースは多く、保湿を軽視すると事態が悪化しがちです。</p>
<p>選び方の原則は3つ。<strong>①「さっぱり」と「保湿」を両立する処方を選ぶ</strong>——ベタつかないテクスチャで、ヒアルロン酸・グリセリン等の保湿成分を含む製品が定番です。<strong>②毛穴・皮脂対策の成分を含むものを検討</strong>——ドクダミ、CICA、ナイアシンアミド、BHA等が定番。ただし刺激強めの成分は敏感時期は避けます。<strong>③拭き取り化粧水は角質ケアの1手段、常用は不要</strong>——古い角質が気になるときの週数回使用が基本で、毎日使うと肌に負担がかかる場合があります。</p>`,
    notFor: [
      "乾燥肌との混合肌で頬が乾く方：Tゾーンだけ脂性肌タイプの化粧水を使う「ゾーン別ケア」のほうが向く場合があります。<a href=\"/columns/combination-skin-guide\">混合肌のゾーン別ケア</a>を参照してください。",
      "極端にさっぱり系のみで済ませたい方：水分不足が皮脂分泌をさらに刺激する悪循環に入りやすいため、油分の少ない乳液やジェルとのセットケアが結果的にテカリを抑える近道です。",
      "皮脂が多いのはニキビの直接原因と考えている方：ニキビは皮脂＋アクネ菌＋角質詰まり＋炎症の複合要因で、化粧水だけで解決できないケースも多いです。"
    ],
    caveats: "拭き取り化粧水を毎日使うと角質層への摩擦が積み重なり、かえって皮脂分泌が過剰になる場合があります。頻度・力加減の調整が必要です。ニキビが多発する時期は医薬部外品や皮膚科での治療も並行検討してください。",
    relatedColumnIds: ["combination-skin-guide", "pore-care-guide", "skin-type"],
    faq: [
      {
        q: "脂性肌でも乳液は必要ですか？",
        a: "多くの場合は必要です。皮脂と水分は別の話で、水分保持のためには油分での蓋も必要になります。オイルフリーの乳液やジェルタイプなら、脂性肌の重さも軽減できます。"
      },
      {
        q: "収れん化粧水は使ったほうがよいですか？",
        a: "収れん成分（アルコール・タンニン等）は一時的な毛穴引き締めが期待できますが、刺激になる場合もあります。肌の状態を見て、Tゾーンのみ・週数回に留めるのが安全側です。"
      }
    ]
  },
  {
    slug: "whitening-serum",
    title: "美白ケア美容液の選び方（医薬部外品の見方）",
    metaDesc: "美白ケア美容液を、掲載商品の実データから編集部評価順に紹介。医薬部外品と化粧品の違い、有効成分（ビタミンC誘導体・トラネキサム酸・ナイアシンアミド）の役割、UV対策とのセット必須の理由まで正直に解説します。",
    breadcrumbName: "美白ケア美容液の選び方",
    filter: p => p.category === "美容液" && p.concern.some(c => c.includes("シミ") || c.includes("くすみ")),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『美容液』で対応する悩みに『シミ・くすみ』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>美白ケアで最初に知っておきたいのは、<strong>「美白」という言葉は化粧品では『メラニンの生成を抑え、しみ・そばかすを防ぐ』機能を指す</strong>（既にできたシミを消す意味ではない）ということ。医薬部外品の美白有効成分が承認されている商品は、この防御的アプローチを設計上うたえます。</p>
<p>選び方の原則は3つ。<strong>①医薬部外品の有効成分を目安に</strong>——ビタミンC誘導体・トラネキサム酸・ナイアシンアミド・アルブチン・4MSK等が代表的。パッケージに「薬用」「医薬部外品」の表記があるかを見ます。<strong>②UV対策と必ずセットで使う</strong>——美白美容液だけを塗って日焼け止めを怠ると効果を打ち消す関係。朝は日焼け止めを必須のセットに。<strong>③長期戦を前提に</strong>——肌のターンオーバー数周期（2〜3か月〜）で変化を判断してください。1週間で効かないと切り替えるパターンが最も損しやすい買い方です。</p>`,
    notFor: [
      "既に濃く定着したシミ・肝斑を短期間で消したい方：市販の美白美容液の主目的は『生成を抑えて予防・穏やかにケア』であり、濃いシミへの積極的アプローチは美容医療（レーザー・内服薬等）の領域です。",
      "刺激に敏感な肌でビタミンCが合わない方：純粋型ビタミンCはピリつきが出やすい成分です。<a href=\"/columns/vitamin-c-comparison\">ビタミンC美容液本音比較</a>で誘導体タイプとの使い分けを解説しています。",
      "美白ケア中もUV対策を軽視する方：紫外線対策なしの美白ケアは、蛇口を開けたままバケツで水を汲むような状態になります。"
    ],
    caveats: "医薬部外品の効果効能表記は薬機法で厳密に規定されており、「消す」「無くなる」等の断定は認められません。当ページでも「防ぐ」「サポート」「アプローチ」等の表現に留めています。個人差があり、赤み・かゆみが出た場合は使用を中止し、症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["vitamin-c-comparison", "acne-scar-reality", "ingredient-comparison"],
    faq: [
      {
        q: "美白美容液で今あるシミは消えますか？",
        a: "化粧品の美白ケアは主に予防と穏やかなサポートの領域です。既存のシミへの積極的アプローチは美容医療の範囲になります。誇大な期待は避けてください。"
      },
      {
        q: "医薬部外品と化粧品の違いは何ですか？",
        a: "医薬部外品は特定の有効成分について厚生労働省が効能を認めたものです。化粧品よりも訴求範囲が広い一方、必ずしも全員に効くわけではありません。有効成分名で判断するのが確実です。"
      }
    ]
  },
  {
    slug: "mens-lotion",
    title: "メンズにも使いやすい化粧水の選び方",
    metaDesc: "男性の肌傾向（皮脂多め・髭剃り後の刺激）に合う化粧水を、掲載商品の実データから編集部評価順に紹介。「メンズ用」と女性向けの成分差の実態、シンプル処方の候補まで解説します。",
    breadcrumbName: "メンズにも使いやすい化粧水の選び方",
    filter: p => p.category === "化粧水" && (p.skin.includes("脂性肌") || p.skin.includes("混合肌") || p.skin.includes("全肌質")),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『化粧水』で対応肌タイプに『脂性肌・混合肌・全肌質』のいずれかを含むもの（男性に多い肌傾向にマッチする条件）を、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>「メンズ用」と表記された化粧水と、性別表記のない化粧水の<strong>成分差は実は少ない</strong>のが実態です。男性の肌傾向（皮脂量が多め・水分量が少なめ・髭剃りでバリアが弱りやすい）に合う設計を成分ベースで選ぶほうが、性別表記より確実です。</p>
<p>選び方の原則は3つ。<strong>①皮脂多めなら「さっぱり系＋保湿成分」の両立処方</strong>——ベタつかないが乾燥もさせないバランス設計。ヒアルロン酸・グリセリン等を含むさっぱり系が向きます。<strong>②髭剃り後の刺激対策に鎮静成分</strong>——CICA・パンテノール・グリチルリチン酸配合のものが定番。剃った直後のヒリつきに1本あると便利です。<strong>③シンプル処方を優先</strong>——「メンズ用」に多いエタノールの清涼感やメントール系は、爽快感はあるものの肌への刺激になる場合があります。無香料・アルコールフリーを軸に選ぶと外しにくい傾向です。</p>`,
    notFor: [
      "メンズ用ブランドの香り・パッケージを楽しみたい方：機能ではなく体験を含めた選び方なら、メンズブランド専用品の価値もあります（BULK HOMME等）。当ページは成分ベースの選び方に絞っています。",
      "スキンケア工程を最小化したい方：化粧水1本より「洗顔＋日焼け止め」の徹底のほうが優先度が高い場合があります。<a href=\"/columns/mens-skincare-basics\">メンズスキンケア入門</a>で優先順位を解説しています。",
      "ヒゲが濃く、剃った直後の赤みが強い方：市販化粧水の範囲を超える炎症の場合は皮膚科での相談も検討してください。"
    ],
    caveats: "髭剃り直後は肌が特に敏感な状態です。アルコール高配合の化粧水はしみる感覚が強く出ることがあります。しみる場合は使用を中止し、鎮静系の低刺激品への切り替えを検討してください。",
    relatedColumnIds: ["mens-skincare-basics", "morning-face-wash", "basic-routine"],
    faq: [
      {
        q: "男性は男性用化粧水を選ぶべきですか？",
        a: "必ずしも必要ありません。皮脂多めに向く「さっぱり系＋保湿」処方であれば、性別表記に関わらず使えます。成分表と肌タイプでの判断のほうが確実です。"
      },
      {
        q: "オールインワンとどちらがよいですか？",
        a: "スキンケアの継続性を最優先するなら、工程数の少ないオールインワンも合理的な選択です。ただし機能特化の面では、化粧水＋乳液の別使いのほうが調整の幅が広くなります。"
      }
    ]
  },
  {
    slug: "korean-skincare-starter",
    title: "韓国スキンケア入門セットの組み方",
    metaDesc: "韓国スキンケアの入門セット（化粧水・美容液・クリーム）を、掲載商品の実データから編集部評価順に紹介。CICA・PDRN・ドクダミ等の話題成分の役割と、日本人肌への注意点まで正直に解説します。",
    breadcrumbName: "韓国スキンケア入門セットの組み方",
    filter: p => p.origin === "韓国" && ["化粧水","美容液","保湿クリーム"].includes(p.category),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、原産国が『韓国』でカテゴリが『化粧水・美容液・保湿クリーム』のいずれかのもの（入門セットの基本3カテゴリ）を、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>韓国スキンケアの魅力は<strong>「新しい成分を早く取り入れる開発サイクル」と「使用感の心地よさ」</strong>にあります。ただし「話題成分＝万人に合う」ではなく、初めての場合は基本3ステップ（化粧水→美容液→クリーム）から始めるのが安全です。</p>
<p>入門セットの組み方の原則は3つ。<strong>①化粧水は鎮静系・保湿系から</strong>——Anua ドクダミ77% や Torriden ダイブイン等、鎮静・低分子ヒアルロン酸系が定番の入り口です。<strong>②美容液は自分の悩みに合わせて1本だけ</strong>——PDRN（ハリ）・ナイアシンアミド（毛穴・くすみ）・シカ（鎮静）の中から目的で選ぶ。複数を同時にスタートすると相性判定ができなくなります。<strong>③クリームは水分保持型を最初に</strong>——AESTURA アトバリア365 のようなセラミド系クリームで水分を閉じ込めるところから。テクスチャは軽めから始めて調整してください。</p>`,
    notFor: [
      "特定成分（アルコール・香料等）に敏感な方：韓国コスメには清涼感を出すためのエタノールや香料が入る製品があります。成分表を必ずご確認ください。",
      "10ステップスキンケアを模倣したい方：工程を増やせば効果が上がるわけではなく、摩擦と刺激の機会も増えます。日本人の肌質・生活リズムに合わせて3〜5ステップで十分な場合が多数です。",
      "並行輸入や個人輸入で少しでも安く買いたい方：真贋・保管状態のリスクがあり、肌につけるものとしてはおすすめしません。公式・Qoo10公式ストア・国内バラエティショップの正規流通品を推奨します。"
    ],
    caveats: "海外製品は日本人向けの臨床テストが十分でない場合があります。新しい製品は必ずパッチテストし、少量から始めてください。かゆみ・赤みが出た場合は使用を中止し、症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["k-beauty", "k-beauty-dry-skin", "ingredient-comparison"],
    faq: [
      {
        q: "韓国コスメと日本コスメ、どちらが優れていますか？",
        a: "優劣ではなく設計思想の違いです。韓国は新成分の採用スピードと使用感、日本は敏感肌配慮と品質安定が得意分野の傾向。両方の良さを組み合わせるハイブリッドも実用的です。"
      },
      {
        q: "話題の成分は全部試すべきですか？",
        a: "同時に複数の新成分を始めると、合わなかった場合の原因特定ができません。1つずつ、2〜4週間の間隔で追加するのが基本形です。"
      }
    ]
  },
  {
    slug: "anti-aging-cream",
    title: "エイジングケアクリームの選び方",
    metaDesc: "エイジングケア向けのクリームを、掲載商品の実データから編集部評価順に紹介。レチノール・ペプチド・ビタミンC等のハリケア成分の使い分け、価格帯と続けやすさの現実解まで正直に解説します。",
    breadcrumbName: "エイジングケアクリームの選び方",
    filter: p => p.category === "保湿クリーム" && p.concern.some(c => c.includes("シワ") || c.includes("たるみ")),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『保湿クリーム』で対応する悩みに『シワ・たるみ』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>エイジングケアクリームの効果は<strong>「成分×継続」で決まります</strong>。1本だけで劇的に変わることはなく、ターンオーバー数周期（2〜3か月〜）の継続で肌のコンディションが徐々に変化してくる領域です。「高価な1本を薄く」より「続けられる価格でたっぷり」のほうが結果を出しやすい傾向があります。</p>
<p>選び方の原則は3つ。<strong>①ハリケア成分を1つは含む処方を選ぶ</strong>——レチノール（純粋型・誘導体）・ペプチド・ナイアシンアミド・ビタミンC・PDRN 等が代表的。医薬部外品の「シワ改善」承認成分（純粋レチノール・ナイアシンアミド等）を含む製品はうたえる範囲が広めです。<strong>②テクスチャは乾燥度合いに合わせて選ぶ</strong>——夜だけ濃厚クリーム、朝は軽めジェル、と時間帯で使い分けるのも実用的です。<strong>③レチノール初心者は低頻度からスタート</strong>——A反応（赤み・皮むけ）で挫折しないよう、週2回・夜のみ・低濃度から始めてください。</p>`,
    notFor: [
      "妊娠中・授乳中の方：レチノール（特にA-レチノイン酸系）の使用は控えるのが一般的です。使用可能な成分は医師にご確認ください。",
      "1〜2週間で劇的な変化を求める方：エイジングケアは長期戦の領域です。短期の変化を求めるなら美容医療（レーザー・ボトックス等）の相談を検討してください。",
      "強い刺激が苦手な超敏感肌の方：レチノール導入時は肌が慣れるまで刺激が出やすい成分です。CICA等の鎮静系との併用や、無理せず休むタイミングも計画してください。"
    ],
    caveats: "レチノール等のエイジングケア成分は、日中の紫外線対策と必ずセットで使ってください。塗った後の紫外線曝露は、かえって色素沈着リスクを上げる場合があります。開始1〜2週間で赤み・皮むけが出ても慣れの過程であることが多いですが、症状が強い場合は頻度を落とすか中止し、皮膚科にご相談ください。",
    relatedColumnIds: ["retinol-beginner-guide", "skincare-in-30s", "depacos-vs-puchipura"],
    faq: [
      {
        q: "エイジングケアクリームは何歳から始めるべきですか？",
        a: "年齢よりも「肌のハリ・キメの変化を感じたとき」が開始のサインです。予防的には20代後半からの保湿・UV徹底が最良のエイジングケアで、それだけで数年後の差が出やすい領域です。"
      },
      {
        q: "デパコスとプチプラで効果差はありますか？",
        a: "有効成分の種類・濃度・処方の複雑さで差は出ますが、価格差ほど効果差は開かないというのが実データからの示唆です。<a href=\"/columns/depacos-vs-puchipura\">デパコスとプチプラ選び方</a>もご参照ください。"
      }
    ]
  },
  {
    slug: "pore-care-serum",
    title: "毛穴ケア美容液の選び方とおすすめ",
    metaDesc: "毛穴の黒ずみ・開きに向けた美容液を、掲載商品の実データから編集部評価順に紹介。ビタミンC誘導体・ナイアシンアミド・BHA配合の候補と、毛穴タイプ別の選び方を解説します。",
    breadcrumbName: "毛穴ケア美容液の選び方",
    filter: p => p.category === "美容液" && p.concern.some(c => c.includes("毛穴")),
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、カテゴリが『美容液』で対応する悩みに『毛穴の開き・黒ずみ』を含むものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>毛穴ケアは<strong>「毛穴タイプの見極め」が最初の分岐点</strong>です。同じ「毛穴が気になる」でも、①皮脂と古い角質が詰まった<strong>黒ずみ毛穴</strong>、②皮脂分泌が過剰で開いてしまう<strong>開き毛穴</strong>、③加齢や乾燥でハリが落ちた<strong>たるみ毛穴</strong>で、選ぶべき成分がまったく違います。</p>
<p>選び方の原則は3つ。<strong>①黒ずみ寄りならビタミンC誘導体・BHA・酵素系</strong>——皮脂酸化と角質詰まりへのアプローチが定番の考え方です。<strong>②開き寄りならナイアシンアミド・ビタミンC誘導体</strong>——皮脂バランスと肌のキメへのアプローチが期待されます。<strong>③たるみ寄りならレチノール・ペプチド・ビタミンC</strong>——ハリケアの領域で、他タイプより長期戦になります。<strong>タイプが混在する場合は、まずビタミンC誘導体（オバジC10・オバジC25等）から始めると外しにくい</strong>のが編集部の目安です。刺激が出やすい成分でもあるため、夜のみ・週2〜3回など頻度を下げて始めてください。</p>`,
    notFor: [
      "毛穴ケア商品ですべての毛穴悩みが解消すると期待している方：たるみ毛穴などは、化粧品の守備範囲外のケースもあります。詳しくは<a href=\"/columns/pore-care-guide\">毛穴ケア完全ガイド</a>で境界線を解説しています。",
      "強い刺激成分に耐えられない敏感肌の方：ビタミンC誘導体・BHA・レチノールはいずれも肌が慣れるまで刺激が出やすい成分です。パッチテストと低頻度から始めてください。",
      "1〜2週間で効果を判断したい方：毛穴ケアはターンオーバー数周期分（2〜3か月）の継続で結果が見え始める領域です。短期の変化を求める場合は美容医療の相談を。"
    ],
    caveats: "ビタミンC誘導体・レチノール等の成分は、日中の紫外線対策と併用が必須です。塗ったまま日中に紫外線を浴びると、かえって色素沈着リスクが上がる場合があります。夜のケアに組み込み、朝は必ず日焼け止めを使ってください。",
    relatedColumnIds: ["pore-care-guide", "vitamin-c-comparison", "ingredient-comparison"],
    faq: [
      {
        q: "毛穴ケア美容液は何ヶ月続ければ変化を感じられますか？",
        a: "肌のターンオーバー1〜3周期（約1〜3か月）が変化の目安とされます。1週間で判断せず、写真で比較しながら継続してください。"
      },
      {
        q: "レーザー治療などの美容医療と、化粧品ではどちらが効きますか？",
        a: "たるみ毛穴・深い毛穴には美容医療の適応範囲のほうが広い一方、黒ずみ・開きの初期段階には化粧品でも十分アプローチできる場合があります。自己判断が難しい場合は皮膚科・美容皮膚科のカウンセリングが確実です。"
      }
    ]
  },
  {
    slug: "mens-face-wash",
    title: "メンズ洗顔料の選び方とおすすめ",
    metaDesc: "メンズ向け洗顔料の選び方を、掲載商品の実データで比較。皮脂と保湿のバランス・スクラブ系の使いすぎリスク・朝晩の使い分けまで、GATSBY・OXY・メンズビオレ・BULK HOMME等の定番12本を編集部評価順に紹介します。",
    breadcrumbName: "メンズ洗顔料の選び方",
    filter: p => p.audience === "mens" && p.category === "洗顔",
    limit: 12,
    selectionRationale: "掲載スキンケア商品の中から、対象(audience)が『メンズ』でカテゴリが『洗顔』のものを、編集部評価順に上位12件まで機械抽出しました。",
    intro: `<p>男性の洗顔料選びで最も避けたいのは、<strong>「テカリが気になるから洗浄力の強いものを毎日ゴシゴシ」</strong>のパターンです。皮脂を落としすぎるとバリア機能が下がり、乾燥を防ぐために皮脂分泌がさらに増える悪循環に入ります。この選び方ガイドでは、日常使いに適した泡洗顔と、皮脂が特に気になる日のスペシャルケア(スクラブ・クレイ系)の使い分けを軸に、掲載メンズ洗顔12本を比較します。</p>
<p>選び方の原則は3つ。<strong>①日常はマイルドな泡洗顔を軸に</strong>——毎日使うベース商品はメンズビオレ 泡タイプやニベアメン フェイスウォッシュのような穏やかな設計から選ぶと、洗いすぎのリスクを下げられます。<strong>②スクラブ・炭系は週2〜3回まで</strong>——GATSBYのパーフェクトスクラブやOXYディープウォッシュ等の強力洗浄タイプは、毛穴詰まりへのアプローチ力が高い反面、毎日使いは角層への摩擦負担が積み重なります。<strong>③洗顔後の保湿は必須</strong>——ベタつきが苦手でも、化粧水と薄い乳液まではセットで。「洗って終わり」は皮脂過剰の元凶です。</p>`,
    notFor: [
      "強い炎症ニキビ・膿を持つニキビが多発している方：市販洗顔料の範囲を超えるケースです。皮膚科での治療(外用薬・内服)を優先してください。",
      "スクラブや薬用フォームを毎日使いたい方：粒子入り・強めの薬用フォームの毎日使用は、角層への摩擦とバリア機能低下を招きます。日常はマイルド泡洗顔をベースに、スペシャルケアは週数回に留めるのが安全側です。",
      "髭剃り直後の敏感な肌にスクラブを使いたい方：剃り直後の肌はバリアが一時的に下がっている状態なので、スクラブ・ピーリング系は使用しないほうが無難です。詳しくは<a href=\"/columns/razor-burn-care\">髭剃り負けのスキンケア</a>で解説しています。"
    ],
    caveats: "「洗い上がりの突っ張り感が強い」「頬に粉ふきが出始めた」は洗浄力が過剰なサインです。使用中に赤み・かゆみ・湿疹が出た場合は使用を中止し、症状が続く場合は皮膚科にご相談ください。ニキビと乾燥が同時に起こる大人ニキビは、洗顔料選びよりも保湿の見直しが優先されることが多い領域です。",
    relatedColumnIds: ["mens-oily-skin-care", "mens-pore-care", "razor-burn-care"],
    faq: [
      {
        q: "朝も洗顔料を使うべきですか？",
        a: "皮脂の程度によります。夜にしっかり汚れをリセットしていれば、朝は水洗顔でも問題ない男性は多いです。逆に朝起きて顔がベタつく方は、軽いマイルド泡洗顔を朝も使うと日中のテカリが軽減しやすくなります。"
      },
      {
        q: "洗顔ブラシは使ったほうがいいですか？",
        a: "必須ではありません。手のひらでよく泡立てた泡で洗うだけで、多くの汚れは落ちます。ブラシを使う場合も、力を入れずに転がすように使い、週2〜3回程度に留めるのが安全側です。"
      },
      {
        q: "1本で朝晩・週数回のスペシャルケアも兼ねる洗顔はありますか？",
        a: "難しい両立です。1本で兼ねようとすると洗浄力が中途半端になるため、朝晩用のマイルド洗顔＋週2〜3回のスペシャル洗顔の2本使い分けが現実的です。合計1,000〜1,500円で揃うので、コスト面のハードルも低い部類です。"
      }
    ]
  },
  {
    slug: "mens-all-in-one",
    title: "メンズオールインワンの選び方とおすすめ",
    metaDesc: "メンズ向けオールインワンジェルを、掲載商品の実データで比較。他カテゴリに比べて選択肢が少ないカテゴリのため、定番3本(ニベアメン/GATSBY/UNO)の特徴を丁寧に整理し、化粧水＋乳液の疑似オールインワン代替案まで解説します。",
    breadcrumbName: "メンズオールインワンの選び方",
    filter: p => p.audience === "mens" && p.category === "オールインワン",
    limit: 6,
    selectionRationale: "掲載スキンケア商品の中から、対象(audience)が『メンズ』でカテゴリが『オールインワン』のもの3件を編集部評価順に掲載しました。このカテゴリは他ジャンルに比べて掲載本数が少なく、比較というより定番3本の特徴を知っていただく構成にしています。",
    intro: `<p>まずお断りすると、<strong>本サイトに掲載しているメンズ向けオールインワンは現時点で3本のみ</strong>です。既存の選び方ガイド(通常は8〜12本を比較)より掲載数が少ないため、この記事は「比較」よりも「定番3本の特徴を丁寧に知り、あなたの生活パターンに合う1本を選ぶ」構成にしています。加えて、化粧水＋乳液の別売り2本使いでも「オールインワン相当のシンプルさ」は実現できるため、その代替案も後半で解説します。</p>
<p>メンズ向けオールインワンが少ない理由は、<strong>この市場では「化粧水＋乳液」を別売りで揃えるブランド(BULK HOMME・ORBIS Mr.等)が主軸で、単品オールインワンは補完的な位置づけ</strong>だから、と編集部は見ています。とはいえ「1本で完結する手軽さ」を求める男性層は確実に存在するため、以下3本はいずれもドラッグストア入手のしやすさと価格の手頃さで実利ある選択肢です。</p>
<p>選び方の原則は3つ。<strong>①手軽さを最優先するならUNO バイタルクリームパーフェクション</strong>——1本で顔全体のケアが完結する使い勝手で、初心者の1本目に向きます。<strong>②朝の皮脂対策も一緒にしたいならニベアメン モーニング10</strong>——朝用の皮脂ブロック設計で、日中のテカリが気になる男性向け。<strong>③コスパと基本機能を両立させるならGATSBY EXパーフェクトエッセンス</strong>——最安価格帯の定番で、まず試してみたい方に。</p>`,
    notFor: [
      "肌の悩みが明確な方(乾燥・ニキビ・シワ等)：オールインワンは「悩みが特にない・とにかく手軽に」向けの設計です。特定の悩みに集中して対応したい場合は、化粧水と美容液を別々に選ぶほうが機能特化できます。",
      "本格的なエイジングケアを求める40代以降の方：オールインワンだけでは物足りない場合が多く、<a href=\"/columns/mens-skincare-over30\">30代・40代男性のスキンケア入門</a>で解説している段階的な導入がおすすめです。",
      "各工程の量や順番を自分で調整したい方：オールインワンは1本で完結する反面、化粧水を厚めに、乳液を薄めに、といった調整はできません。使い分けの自由度を重視するなら化粧水+乳液の別売りがおすすめです。"
    ],
    caveats: "オールインワンは「多機能を1本で」実現するため、各機能(化粧水・美容液・乳液等)は単品の高機能品に比べると穏やかな設計になっているケースが多いです。「1本で全部が最高」を期待せず、「手軽さと最低限の機能を両立する現実解」として位置づけて選ぶと満足度が上がります。使用中に赤み・かゆみが出た場合は使用を中止し、症状が続く場合は皮膚科にご相談ください。",
    relatedColumnIds: ["mens-skincare-over30", "mens-skincare-basics", "mens-dry-skin"],
    faq: [
      {
        q: "オールインワン1本で本当に全部OK？",
        a: "「手軽さを取るなら十分」というのが正直な答えです。単品の化粧水・乳液・美容液を組み合わせるより機能特化はしないので、肌の悩みが明確な方は別売り2本使いのほうが結果が出やすい場合もあります。忙しさで挫折するくらいなら、オールインワン1本を毎日続けるほうが結果的にプラスです。"
      },
      {
        q: "3本しか選択肢が無いのは寂しいのですが…",
        a: "確かに他カテゴリの化粧水(10本)・洗顔(12本)と比べると少ない選択肢です。ただしメンズ向けオールインワンは市場自体が「化粧水＋乳液の別売り」を主軸としており、この3本は実売ドラッグストアで入手しやすい定番の代表格です。別の選択肢として、化粧水＋薄い乳液の2本使いも『疑似オールインワン』として機能します。"
      },
      {
        q: "『疑似オールインワン』の組み方を教えてください",
        a: "例えばBULK HOMME THE REPAIR LOTION(化粧水)＋ニベアメン アクティブエイジクリーム(保湿クリーム)の2本を朝晩使うと、実質的なオールインワン運用になります。単品オールインワンより機能は上がりますが、その分価格は2倍程度になります。工数と機能のバランスで選んでください。"
      }
    ]
  },
];

// ===== HTML生成 =====

function buildJsonLd(guide, hits, canonical){
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Moilum",
    "alternateName": "モイルム",
    "url": SITE_ORIGIN + "/",
    "logo": OGP_IMAGE,
    "description": "スキンケア商品を肌タイプ・お悩み・予算で比較する、個人運営の比較メディア。",
    "foundingDate": "2026",
    "contactPoint": {"@type":"ContactPoint","email":"sanji.104vt@gmail.com","contactType":"customer support","availableLanguage":["Japanese"]}
  };
  const crumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type":"ListItem","position":1,"name":"Moilum","item":SITE_ORIGIN+"/"},
      {"@type":"ListItem","position":2,"name":"悩み別ガイド","item":SITE_ORIGIN+"/guides"},
      {"@type":"ListItem","position":3,"name":guide.breadcrumbName,"item":canonical}
    ]
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": guide.title,
    "numberOfItems": hits.length,
    "itemListElement": hits.map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": `${SITE_ORIGIN}/products/${p.id}`,
      "name": p.name
    }))
  };
  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": guide.title,
    "url": canonical,
    "description": guide.metaDesc,
    "inLanguage": "ja",
    "isPartOf": {"@type":"WebSite","name":"Moilum","url":SITE_ORIGIN+"/"},
    "publisher": {"@type":"Organization","name":"Moilum","url":SITE_ORIGIN+"/"},
    "dateModified": BUILD_DATE
  };
  const jsonLdBlocks = [webpage, crumb, itemList, org];
  if (guide.faq && guide.faq.length){
    jsonLdBlocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": guide.faq.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": {"@type":"Answer","text": f.a}
      }))
    });
  }
  return jsonLdBlocks.map(b => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("\n");
}

function buildGuideHtml(guide){
  const hits = SKINCARE.filter(guide.filter)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, guide.limit || 12);
  const canonical = `${SITE_ORIGIN}/guides/${guide.slug}`;
  const relatedColumns = (guide.relatedColumnIds || [])
    .map(id => findColumn(id)).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(truncate(guide.title + "｜Moilum", 68))}</title>
<meta name="description" content="${escAttr(truncate(guide.metaDesc, 158))}">
<meta name="google-site-verification" content="${GSC_VERIFICATION}" />
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${escAttr(truncate(guide.title, 68))}">
<meta property="og:description" content="${escAttr(truncate(guide.metaDesc, 158))}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OGP_IMAGE}">
<meta property="og:site_name" content="Moilum">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(truncate(guide.title, 68))}">
<meta name="twitter:description" content="${escAttr(truncate(guide.metaDesc, 158))}">
<meta name="twitter:image" content="${OGP_IMAGE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;700&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap" rel="stylesheet">
${buildJsonLd(guide, hits, canonical)}
<style>
:root{--base:#FBF9F6;--ink:#2B2622;--water:#DCEAEC;--deep:#B7CDD3;--iris-2:#D5E4E8;--accent:#7FA8B3;--border:#e3e9e5;--txt2:#5a6b6e;--txt3:#8fa3a7}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--base);color:var(--ink);font-family:"Zen Kaku Gothic New","Hiragino Kaku Gothic Pro","Yu Gothic",sans-serif;line-height:1.9;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Zen Old Mincho",serif;font-weight:700}
a{color:var(--accent)}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px clamp(16px,4vw,40px);border-bottom:1px solid var(--border);background:#fff;position:sticky;top:0;z-index:10}
.logo{font-weight:800;font-size:20px;letter-spacing:-.5px;color:inherit;text-decoration:none}
.logo span{color:var(--accent)}
.pr-banner{background:var(--water);color:var(--txt2);font-size:12px;padding:8px 16px;text-align:center;line-height:1.6}
article{max-width:900px;margin:0 auto;padding:32px clamp(16px,4vw,32px) 60px}
.crumb{font-size:12px;color:var(--txt3);margin-bottom:18px}
.crumb a{color:var(--accent);text-decoration:none}
.crumb .sep{margin:0 8px}
.cat-tag{display:inline-block;background:var(--water);color:var(--accent);font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:.5px;margin-bottom:12px}
h1{font-size:clamp(24px,4.4vw,32px);line-height:1.4;margin-bottom:14px}
.meta-line{font-size:12.5px;color:var(--txt3);margin-bottom:22px;line-height:1.7}
.meta-line a{color:var(--accent)}
h2{font-size:19px;margin:30px 0 12px;padding-left:12px;border-left:3px solid var(--accent)}
h3{font-size:15px;margin:18px 0 8px;color:var(--ink)}
p{font-size:14.5px;color:var(--ink);margin-bottom:12px}
.card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:18px}
.rationale{background:#fff8f2;border:1px solid #f4d9c0;border-radius:10px;padding:12px 16px;margin:14px 0 20px;color:#7a5945;font-size:13px;line-height:1.75}
.rationale b{color:#5f3f2c}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:14px 0 8px}
.pcard{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px;transition:transform .15s,box-shadow .2s;color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:6px}
.pcard:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(43,38,34,.08)}
.pcard-img{width:100%;aspect-ratio:1/1;background:#fff;border-radius:8px;object-fit:contain;border:1px solid var(--border)}
.pcard-noimg{width:100%;aspect-ratio:1/1;background:linear-gradient(160deg,var(--water),var(--iris-2));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:44px}
.pcard-rank{font-size:11px;color:var(--accent);font-weight:800;letter-spacing:.5px}
.pcard-name{font-size:13px;font-weight:700;line-height:1.4;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pcard-brand{font-size:11px;color:var(--txt3)}
.pcard-meta{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:4px;border-top:1px solid var(--border)}
.pcard-price{font-size:13px;font-weight:800;color:var(--accent)}
.pcard-rating{font-size:11.5px;color:var(--txt2)}
.pcard-badge{display:inline-block;font-size:10px;color:var(--accent);font-weight:700;background:#fff8f2;border:1px solid #f4d9c0;border-radius:4px;padding:1px 5px}
.not-for{background:#fdf6ec;border:1px solid #f2e0c1;border-radius:12px;padding:14px 18px;margin:10px 0;color:#8a6a2f;font-size:13.5px;line-height:1.8}
.not-for h3{color:#7a5b25;margin-bottom:6px}
.not-for ul{margin:4px 0 0 20px}
.not-for li{margin-bottom:4px}
.caveats{background:#eff6fa;border:1px solid #d3e6f0;border-radius:12px;padding:14px 18px;margin:10px 0;color:#2e5772;font-size:13px;line-height:1.8}
.faq-item{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px}
.faq-q{font-weight:700;font-size:14px;color:var(--ink);margin-bottom:4px}
.faq-a{font-size:13.5px;color:var(--txt2);line-height:1.8}
.rel-col{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;color:inherit;text-decoration:none;display:block}
.rel-col:hover{border-color:var(--accent)}
.rel-col-cat{font-size:11px;color:var(--accent);font-weight:700;margin-bottom:2px}
.rel-col-title{font-size:14px;font-weight:700;line-height:1.5;color:var(--ink)}
.diag-cta{background:linear-gradient(160deg,var(--water),#eff6fa);border:1px solid var(--deep);border-radius:14px;padding:20px 22px;margin:24px 0;text-align:center}
.diag-cta p{font-size:14px;margin-bottom:12px;color:var(--ink)}
.diag-btn{display:inline-block;background:var(--accent);color:#fff;font-weight:700;font-size:14px;padding:10px 22px;border-radius:20px;text-decoration:none}
.diag-btn:hover{opacity:.9}
footer{background:#fff;padding:24px clamp(16px,4vw,40px);border-top:1px solid var(--border);font-size:12px;color:var(--txt3);line-height:1.8;margin-top:40px}
footer a{color:var(--accent);margin-right:14px;text-decoration:none}
@media(max-width:600px){article{padding:24px 16px 40px}.product-grid{grid-template-columns:repeat(2,1fr);gap:10px}}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA4_ID}');
</script>
</head>
<body>
<header class="topbar">
  <a class="logo" href="/">Moi<span>lum</span></a>
  <a href="/" style="font-size:12.5px;color:var(--txt3);text-decoration:none">← トップに戻る</a>
</header>
<div class="pr-banner">本サイトはアフィリエイト広告（Amazon・楽天・Qoo10等）を利用しています。ただし掲載順位・評価は編集部が独自基準で決定しており、広告主からの影響は受けていません。</div>
<article>
  <nav class="crumb"><a href="/">ホーム</a><span class="sep">›</span>悩み別ガイド<span class="sep">›</span>${escHtml(guide.breadcrumbName)}</nav>
  <span class="cat-tag">悩み別ガイド</span>
  <h1>${escHtml(guide.title)}</h1>
  <div class="meta-line">執筆：Moilum編集部（一行／個人運営） ／ 最終更新：${BUILD_DATE} ／ 掲載商品データ基準日：2026-06 ／ <a href="/about/about" onclick="return true">運営者情報</a></div>

  <h2>選び方の3原則</h2>
  ${guide.intro}

  <div class="rationale">
    <b>このページの比較基準</b><br>
    ${escHtml(guide.selectionRationale)} 掲載順は Moilum 編集部評価（★）順で、★が同点の商品はレビュー件数の対数を副次キーにしています。この評価軸の詳細は <a href="/about/rating-policy">評価基準ページ</a> をご覧ください。
  </div>

  <h2>該当商品${hits.length}件（編集部評価順）</h2>
  <div class="product-grid">
    ${hits.map((p, i) => `<a class="pcard" href="/products/${p.id}">
      ${p.image ? `<img class="pcard-img" src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy">` : `<div class="pcard-noimg" aria-hidden="true">${escHtml(p.icon || "💧")}</div>`}
      <div class="pcard-rank">${i < 3 ? "TOP" + (i + 1) : "#" + (i + 1)}</div>
      <div class="pcard-name">${escHtml(p.name)}</div>
      <div class="pcard-brand">${escHtml(p.brand)}${p.origin ? " ・ " + escHtml(p.origin) : ""}</div>
      <div class="pcard-meta">
        <span class="pcard-price">¥${(p.price || 0).toLocaleString()}</span>
        <span class="pcard-rating"><span class="pcard-badge">編集部</span> ★${p.rating}</span>
      </div>
    </a>`).join("")}
  </div>

  <div class="not-for">
    <h3>⚠️ このガイドが向かない人・落とし穴</h3>
    <ul>${guide.notFor.map(x => `<li>${x}</li>`).join("")}</ul>
  </div>

  <h2>成分・使用上の注意</h2>
  <div class="caveats">${escHtml(guide.caveats)}</div>

  ${guide.faq && guide.faq.length ? `<h2>よくある質問</h2>
  ${guide.faq.map(f => `<div class="faq-item">
    <div class="faq-q">Q. ${escHtml(f.q)}</div>
    <div class="faq-a">A. ${escHtml(f.a)}</div>
  </div>`).join("")}` : ""}

  ${relatedColumns.length ? `<h2>関連コラム</h2>
  ${relatedColumns.map(c => `<a class="rel-col" href="/columns/${c.id}">
    <div class="rel-col-cat">${escHtml(c.cat)}</div>
    <div class="rel-col-title">${escHtml(c.title)}</div>
  </a>`).join("")}` : ""}

  <div class="diag-cta">
    <p>あなたに合う1本を、4つの質問で絞り込めます。</p>
    <a class="diag-btn" href="/diagnosis">肌タイプ診断を試す →</a>
  </div>
</article>
<footer>
  <div>
    <a href="/">Moilumトップ</a>
    <a href="/about/rating-policy">評価基準</a>
    <a href="/about/sources">情報ソース</a>
    <a href="/about/changelog">更新履歴</a>
  </div>
  <p style="margin-top:10px">© Moilum</p>
</footer>
</body>
</html>
`;
}

// ===== ビルド =====
const outDir = "public/guides";
fs.mkdirSync(outDir, { recursive: true });

const buildLog = [];
for (const guide of GUIDES){
  const hits = SKINCARE.filter(guide.filter).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const shown = Math.min(hits.length, guide.limit || 12);
  const html = buildGuideHtml(guide);
  const outFile = path.join(outDir, guide.slug + ".html");
  fs.writeFileSync(outFile, html, "utf8");
  buildLog.push({slug: guide.slug, matched: hits.length, shown, size: (fs.statSync(outFile).size / 1024).toFixed(1) + "KB"});
}

console.log("✓ 生成完了: ガイドページ", buildLog.length, "件");
console.log("| slug | マッチ数 | 表示数 | ファイルサイズ |");
console.log("|---|---|---|---|");
for (const l of buildLog){
  console.log(`| ${l.slug} | ${l.matched} | ${l.shown} | ${l.size} |`);
}

// 他ファイルから参照可能な slug 一覧を出力（Worker allowlist / sitemap 生成用）
fs.writeFileSync("src/guides-slugs.json", JSON.stringify(GUIDES.map(g => g.slug), null, 2));
console.log("→ src/guides-slugs.json も更新");

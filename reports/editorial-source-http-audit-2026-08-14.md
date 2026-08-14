# editorial公式ソース HTTP監査（2026-08-14）

この検査は外部サイトのbot制限や一時障害の影響を受けるため、CIのblocking条件にはしません。

| status | URL数 |
|---|---:|
| ok | 52 |
| redirect | 1 |
| blocked | 4 |
| timeout | 2 |
| not_found | 0 |
| http_error | 0 |

## 要確認URL

- blocked / HTTP 403 / https://www.esteelauder.jp/product/689/77491/product-catalog/skincare/repair-serum/advanced-night-repair/synchronized-multi-recovery-complex / 商品ID 75
- blocked / HTTP 403 / https://www.kiehls.jp/skincare/face-product/face-eye/creamy-eye-treatment-with-avocado/3700194714413.html / 商品ID 91
- blocked / HTTP 403 / https://www.kiehls.jp/skincare/face-product/face-serums/retinol-skin-renewing-daily-micro-dose-serum/WW0124KIE.html / 商品ID 192
- blocked / HTTP 403 / https://www.laroche-posay.jp/product/cicaplast-baume-b5.html / 商品ID 122
- timeout / HTTP - / https://www.muji.com/jp/ja/store/cmdty/detail/4550583434991 / 商品ID 3 / The operation was aborted due to timeout
- timeout / HTTP - / https://www.muji.com/jp/ja/store/cmdty/detail/4550584085369 / 商品ID 154 / The operation was aborted due to timeout

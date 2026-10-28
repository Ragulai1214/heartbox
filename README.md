# HEART BOX

隠したハートとシールドを読み合う、2人用のブラウザゲーム。ランダムCPU対戦と同じ端末でのローカル対戦に対応します。

## 起動

プロジェクト直下で `python -m http.server 8000` を実行し、`http://localhost:8000` を開きます。ビルドや外部ライブラリのインストールは不要です。ES Modulesを使うため、HTMLを直接開かずHTTP経由で利用してください。

## テスト

`node --test` でルール・進行処理・ランダム5000試合を検証します。

## 文書

- `docs/requirements.md`: 推奨案を採用した確定要件
- `docs/spec.md`: プロトタイプ仕様
- `docs/proposal.md`: 企画意図
- `docs/implementation-plan.md`: 実装手順

## 公開

リポジトリ: https://github.com/Ragulai1214/heartbox

GitHub Pagesでは `main` ブランチのルートを公開元にします。Pagesの公開設定と公開URLでの動作確認は別途必要です。

試合の保存機能はありません。ページの再読み込みでホームに戻ります。

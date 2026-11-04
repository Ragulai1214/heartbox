# NN学習環境

Python 3.14.6、CPU版PyTorch 2.15.0+cpu、Node.js 24.11.1で検証。公開ゲームは引き続きビルド不要・外部ライブラリ不要です。

## セットアップ（リポジトリ直下、PowerShell）

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r training/requirements.txt
node --test
.\.venv\Scripts\python.exe training/test_training.py
```

## 試運転

```powershell
.\.venv\Scripts\python.exe training/train.py --smoke --output training/runs/smoke
```

128学習試合と、学習前80・学習後100の評価試合を行います。最初の8試合は4種類を各2試合、続く20試合ごとのブロックは過去NNを含む5種類を各4試合。更新バッチは128判断、ミニバッチ64に短縮します。他の報酬・ルール・PPO設定は本学習と同じです。

途中停止と再開の確認例（新しい保存先を使用）：

```powershell
.\.venv\Scripts\python.exe training/train.py --smoke --output training/runs/resume-test --stop-after 28
.\.venv\Scripts\python.exe training/train.py --smoke --output training/runs/resume-test --resume
```

`--stop-after` は保存境界（試運転は8,28,48,…,128）だけを受け付けます。試合途中でプロセスが終了した場合、最後の保存済みブロックから再開し、不完全なブロックは完了件数に含めません。

## 本学習（試運転完了後に実行）

```powershell
.\.venv\Scripts\python.exe training/train.py --output training/runs/full-v1
```

`config.json` の10,000学習試合で停止。最初の1,000試合は4種類を各250、以後は1,000試合ごとに5種類を各200。③は保存済みの過去NNから均等に抽選し、1試合中の相手を固定します。初期・5,000・10,000試合時の評価は学習と別の乱数で実施し、合計14,500評価試合です。

試運転の保存先を本学習に再利用できません。既存保存先への上書きは禁止し、`--resume` では設定・ルール・特徴量仕様・Gitコミット・ソースSHA256を照合します。再開には、その保存先の自分で生成したチェックポイントだけを使ってください。

## 学習方法と保存

- PPOのクリップ目的関数、GAE、マスク付きCategorical分布を使用。
- 1回の環境stepは1攻撃の解決。学習者が攻撃・防御のどちらでも、その行動の結果を同じstepで返す。
- ハート命中は攻撃側にハート箱の点数÷2、防御側にその逆符号。シールド命中は防御側にシールド箱の点数÷2、攻撃側にその逆符号。空箱は0。終端の勝敗±7/0は最後の遷移だけに加算。設定は `config.json` の `reward` に記録。
- 1試合全体を採取してからGAEを計算。試合途中で更新バッチを切らないため、バッチは目安の判断回数を最大29件超えうるが、試合数は超過しない。
- ゲームごとに履歴をリセット。学習者のA/Bと先攻/後攻の4組み合わせは4試合ごとに均等に割り当てる。
- 保存境界で未更新のデータを更新し、NN重み、Adam状態、Python/Torch乱数、完了件数、配分、過去モデル、全試合ログを保存。
- Node側の相手用乱数は試合ごとにPythonが発行したseedで初期化する。保存時に進行中の試合は存在しない。
- `checkpoint.pt` は一時ファイルからの置換で保存。レポート・JSONLはチェックポイントの記録から再生成可能。
- 非有限の損失・勾配・重み、不正手、通信エラーを検出したら停止する。

出力は `initial.json`、`model-試合数.json`、`checkpoint.pt`、`report.json`、`games.jsonl`。`training/runs/` と `.venv/` はGit対象外です。試運転モデルは公開ゲームに追加しません。

独立評価：

```powershell
.\.venv\Scripts\python.exe training/evaluate.py training/runs/full-v1/model-10000.json --past training/runs/full-v1/model-1000.json --games-per-opponent 2000 --output training/runs/full-v1/independent-evaluation.json --seed 2900000
```

各相手の試合数は4の倍数。勝率とWilsonの95%信頼区間、引き分けを0.5勝とした成績、平均得点差・終了ターンを出力します。評価中は重みを更新せず、呼び出し元のTorch乱数を復元します。

## 実装上の選択

初期実装は常駐NodeプロセスとJSON Linesで接続する単一環境です。複数環境のバッチ通信は未実装です。まずルール一致・報酬・再開再現性を優先し、実測速度を本学習時間の目安にします。

NN推論は `CpuNnController` に実装済みですが、学習後の評価・採用判断とブラウザのモデル読み込みUIは後工程です。現在の4種類の対戦CPUは変わりません。

参考： [PPO原論文](https://arxiv.org/abs/1707.06347)、[PyTorch Categorical公式仕様](https://docs.pytorch.org/docs/stable/distributions.html#torch.distributions.categorical.Categorical)。

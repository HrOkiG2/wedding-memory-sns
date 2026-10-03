# NPM Scripts リファレンス

すべてのスクリプトはプロジェクトルートから `npm run <script>` で実行します。

---

## フロントエンド開発

| スクリプト | 説明 |
| :--- | :--- |
| `npm run dev` | 開発サーバーを起動（ホットリロード有効） |
| `npm run build` | SSR用にビルド |
| `npm run generate` | 静的サイトとしてビルド（本番デプロイ用） |
| `npm run lint` | ESLintでコードチェック |
| `npm run lint:fix` | ESLintでコードチェック＋自動修正 |

---

## フロントエンドデプロイ

| スクリプト | 説明 |
| :--- | :--- |
| `npm run front:deploy` | ビルド → S3アップロード → CloudFrontキャッシュ削除まで一括実行 |
| `npm run front:deploy:dry` | デプロイ内容を確認するだけ（実際には反映しない） |
| `npm run front:deploy:skip-build` | ビルドをスキップしてS3アップロード以降のみ実行 |

```bash
# 通常のデプロイ
npm run front:deploy

# 既にビルド済みの場合（再ビルド不要なとき）
npm run front:deploy:skip-build
```

---

## AWSインフラ (CDK)

| スクリプト | 説明 |
| :--- | :--- |
| `npm run cdk:synth` | CloudFormationテンプレートを生成して確認 |
| `npm run cdk:diff` | 現在のAWSリソースと差分を確認 |
| `npm run cdk:deploy` | 全スタックをAWSにデプロイ |
| `npm run cdk:destroy` | 全スタックを削除 |
| `npm run cdk -- <args>` | CDKコマンドを直接実行 |

```bash
# デプロイ前に差分確認
npm run cdk:diff

# 全スタックをデプロイ
npm run cdk:deploy

# 特定のスタックのみデプロイ
npm run cdk -- deploy WeddingApiStack
```

> **注意:** `cdk:destroy` 実行前に [operation.md](./operation.md) の「事後対応」を参照してください。
> S3バケットに `removalPolicy: RETAIN` が設定されている場合、バケットはdestroyされません。

---

## DB（ゲスト認証）シード

ゲストの認証トークンを生成・DynamoDBへ登録するスクリプトです。
初回デプロイ後、または認証情報をリセットする際に実行します。

| スクリプト | 説明 |
| :--- | :--- |
| `npm run db:seed:generate` | `aws/scripts/auth/guests.json` をランダムトークンで新規生成 |
| `npm run db:seed:dry` | DynamoDBへの登録内容を確認するだけ（実際には登録しない） |
| `npm run db:seed` | DynamoDBにゲスト認証情報を登録 |
| `npm run db:seed:list` | DynamoDB上の現在の登録内容を一覧表示 |

```bash
# 初回セットアップの流れ
npm run db:seed:generate   # guests.json を生成
npm run db:seed:dry        # 登録内容を確認
npm run db:seed            # DynamoDB に登録
```

> **注意:** `guests.json` には認証トークンが含まれるため `.gitignore` で管理対象外にしています。
> 紛失した場合は `db:seed:generate` で再生成して `db:seed` を再実行してください。

---

## 認証URL生成（ローカル開発用）

> ⚠️ **注意:** このスクリプトは `guests.json` を読み込みません。ローカル開発用に固定された疑似トークン(`dev-table-1`等)と`http://localhost:3002`向けのURLを表示するだけです。**本番用のログインURLはこれでは生成できません**。本番URLは `https://<本番ドメイン>/?token=<guests.jsonのauthToken>` の形で、各テーブルのトークンを見ながら組み立ててください。

| スクリプト | 説明 |
| :--- | :--- |
| `npm run auth-url` | ローカル開発用の疑似ログインURLを表示（`aws/scripts/auth/generate-auth-url.ts`） |

```bash
npm run auth-url
```

詳細は [auth.md](./auth.md) を参照してください。

---

## 典型的なワークフロー

### 初回インフラ構築

```bash
npm run cdk:deploy          # AWSリソースを作成
npm run db:seed:generate    # 認証トークンを生成（aws/scripts/auth/guests.json）
npm run db:seed             # DynamoDBに登録
npm run front:deploy        # フロントエンドをデプロイ
```

QRコード用の本番URLは、`guests.json`の各`authToken`を元に `https://<本番ドメイン>/?token=<authToken>` の形で組み立てて発行してください（`npm run auth-url`はローカル開発用のため使用しません）。

### フロントエンドのみ更新

```bash
npm run front:deploy
```

### インフラ変更の適用

```bash
npm run cdk:diff            # 差分確認
npm run cdk:deploy          # 適用
```

### 結婚式後のリソース削除

```bash
# S3データを手動でバックアップしてから実行
npm run cdk:destroy
```

# Wedding Photo SNS - AWS Infrastructure

AWS CDK で構築する結婚式写真共有アプリのインフラストラクチャです。

## アーキテクチャ

```
                                    ┌─────────────────────────────────────┐
                                    │           Route53                    │
                                    │    (wedding.example.com)            │
                                    └─────────────┬───────────────────────┘
                                                  │
                                    ┌─────────────▼───────────────────────┐
                                    │         CloudFront                   │
                                    │     (CDN Distribution)              │
                                    │   ┌───────────────────────────┐     │
                                    │   │ /       → S3 (Web)        │     │
                                    │   │ /api/*  → API Gateway     │     │
                                    │   └───────────────────────────┘     │
                                    └──────┬─────────────────┬────────────┘
                                           │                 │
                          ┌────────────────▼────┐   ┌───────▼────────────┐
                          │     S3 Bucket       │   │    API Gateway     │
                          │   (Web Hosting)     │   │    (HTTP API)      │
                          └─────────────────────┘   └───────┬────────────┘
                                                            │
                                        ┌───────────────────┼───────────────────┐
                                        │                   │                   │
                               ┌────────▼────────┐ ┌───────▼─────────┐         │
                               │  Auth Lambda    │ │  Photos Lambda  │         │
                               └────────┬────────┘ └───────┬─────────┘         │
                                        │                   │                   │
         ┌──────────────────────────────┼───────────────────┼───────────────────┤
         │                              │                   │                   │
┌────────▼────────┐  ┌──────────▼───────┐  ┌────────▼───────┐  ┌──────────▼─────────┐
│   DynamoDB      │  │   DynamoDB       │  │   DynamoDB     │  │    S3 Bucket       │
│  (GuestAuth)    │  │   (Photos)       │  │  (RateLimit)   │  │   (Photo Storage)  │
└─────────────────┘  └──────────────────┘  └────────────────┘  └────────────────────┘
```

## スタック構成

| スタック名 | 説明 | リソース |
|-----------|------|---------|
| WeddingDatabaseStack | データベース | DynamoDB (GuestAuth, Photos, RateLimit) |
| WeddingStorageStack | ストレージ | S3 (Photos, Web), Secrets Manager (JWT) |
| WeddingApiStack | API | Lambda (Auth, Photos), API Gateway |
| WeddingCdnStack | CDN | CloudFront Distribution, Route53 A Record |
| WeddingDnsStack | DNS・証明書 | ACM Certificate (us-east-1) ※カスタムドメイン使用時のみ |

## 前提条件

- Node.js 20.x 以上
- AWS CLI v2 設定済み
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS アカウント & IAM 権限

## セットアップ

### 1. 依存関係のインストール

```bash
cd aws
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```bash
# 必須設定
CDK_DEFAULT_ACCOUNT=123456789012        # AWSアカウントID
CDK_DEFAULT_REGION=ap-northeast-1       # デプロイ先リージョン

# カスタムドメイン設定（オプション - 3つ全て設定で有効化）
DOMAIN_NAME=wedding.example.com         # サブドメイン（CloudFrontで使用）
ROOT_DOMAIN=example.com                 # 親ドメイン（Route53のホストゾーン）
HOSTED_ZONE_ID=Z1234567890ABC           # Route53ホストゾーンID
```

### 3. CDK Bootstrap（初回のみ）

```bash
# 環境変数を読み込んでbootstrap
source .env
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

カスタムドメインを使用する場合、us-east-1 もブートストラップが必要:

```bash
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-east-1
```

## デプロイ

### 環境変数を読み込んでデプロイ

```bash
# .envを読み込む
set -a && source .env && set +a

# 全スタックをデプロイ
npx cdk deploy --all --require-approval never
```

### 個別スタックのデプロイ

```bash
# データベースのみ
npx cdk deploy WeddingDatabaseStack

# ストレージのみ
npx cdk deploy WeddingStorageStack

# API のみ（Database, Storage に依存）
npx cdk deploy WeddingApiStack

# CDN のみ（Storage, API に依存）
npx cdk deploy WeddingCdnStack
```

## デプロイ後の出力

デプロイ完了後、以下の出力が表示されます:

| 出力名 | 説明 |
|--------|------|
| WebsiteUrl | フロントエンドのURL |
| ApiEndpoint | API Gateway エンドポイント |
| PhotoBucketName | 写真保存用S3バケット名 |
| WebBucketName | Web配信用S3バケット名 |
| DistributionId | CloudFront Distribution ID |
| CloudFrontDomain | CloudFront ドメイン名 |

## フロントエンドのデプロイ

```bash
# ビルド
cd ../app
npm run generate

# S3にアップロード
aws s3 sync dist/ s3://$(aws cloudformation describe-stacks \
  --stack-name WeddingStorageStack \
  --query 'Stacks[0].Outputs[?ExportName==`WebBucketName`].OutputValue' \
  --output text) --delete

# CloudFrontキャッシュ無効化
aws cloudfront create-invalidation \
  --distribution-id $(aws cloudformation describe-stacks \
    --stack-name WeddingCdnStack \
    --query 'Stacks[0].Outputs[?ExportName==`DistributionId`].OutputValue' \
    --output text) \
  --paths "/*"
```

## 削除

```bash
# 全スタック削除
npx cdk destroy --all

# 個別削除（依存関係の逆順）
npx cdk destroy WeddingCdnStack
npx cdk destroy WeddingDnsStack      # カスタムドメイン使用時
npx cdk destroy WeddingApiStack
npx cdk destroy WeddingStorageStack
npx cdk destroy WeddingDatabaseStack
```

## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm run build` | TypeScript をコンパイル |
| `npm run watch` | ファイル変更を監視してコンパイル |
| `npm run test` | Jest テストを実行 |
| `npx cdk synth` | CloudFormation テンプレートを生成 |
| `npx cdk diff` | デプロイ済みスタックとの差分を表示 |
| `npx cdk deploy` | スタックをデプロイ |
| `npx cdk destroy` | スタックを削除 |

## Lambda 関数

### Auth Lambda (`wedding-auth`)

認証処理を担当:
- `POST /auth/login` - ゲストトークンでログイン、JWT発行
- Rate Limiting 対応

### Photos Lambda (`wedding-photos`)

写真操作を担当:
- `GET /photos` - 写真一覧取得
- `POST /photos` - 写真メタデータ登録
- `POST /photos/upload-url` - S3署名付きURL発行
- `GET /photos/slideshow` - スライドショー用データ取得
- `DELETE /photos/{photoId}` - 写真削除
- `POST /photos/{photoId}/like` - いいね

## DynamoDB テーブル

### Wedding_GuestAuth

| 属性 | 型 | キー |
|-----|-----|-----|
| authToken | String | PK |
| guestName | String | - |
| eventId | String | - |
| createdAt | String | - |
| validUntil | String | - |

### Wedding_Photos

| 属性 | 型 | キー |
|-----|-----|-----|
| eventId | String | PK |
| createdAt | String | SK |
| photoId | String | - |
| s3Key | String | - |
| uploadedBy | String | - |
| guestName | String | - |
| likes | Number | - |

### Wedding_RateLimit

| 属性 | 型 | キー |
|-----|-----|-----|
| pk | String | PK |
| count | Number | - |
| expiresAt | Number | TTL |

## コスト概算（月額）

少人数利用（〜100人、1000リクエスト/日）想定:

| サービス | 概算 |
|----------|------|
| DynamoDB (On-Demand) | $1-5 |
| S3 (10GB) | $0.25 |
| Lambda | $0 (無料枠) |
| API Gateway | $0-1 |
| CloudFront | $0-2 |
| Secrets Manager | $0.40 |
| ACM Certificate | $0 (無料) |
| **合計** | **$2-10/月** |

※ 実際のコストは使用状況により変動します。

## トラブルシューティング

### Bootstrap エラー

```
Error: This stack uses assets, so the toolkit stack must be deployed
```

→ `cdk bootstrap` を実行してください。

### クロスリージョン参照エラー

```
Error: Stack depends on Stack 'WeddingDnsStack' which is not present
```

→ カスタムドメイン設定時は、`.env` の3つの変数（DOMAIN_NAME, ROOT_DOMAIN, HOSTED_ZONE_ID）全てを設定してください。

### 証明書検証タイムアウト

```
Error: Resource handler returned message: "Timed out waiting for the certificate to become valid"
```

→ Route53 ホストゾーンが正しく設定されているか確認してください。DNS検証レコードが自動作成されるまで最大30分かかる場合があります。

### Lambda ビルドエラー

```
Error: Cannot find module 'esbuild'
```

→ `npm install` を再実行してください。

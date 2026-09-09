# wedding-memory-sns

結婚式当日にゲストが撮影した写真をリアルタイムで共有・スライドショー表示するためのWebアプリケーションです。
コスト効率とスケーラビリティに優れた AWS Serverless アーキテクチャを採用しています。

## 📖 Documentation
詳細な設計書は `docs/` ディレクトリに格納されています。

* [**Data Schema (DynamoDB & S3)**](docs/schema.md) - データ構造、論理削除、S3キー設計
* [**Authentication**](docs/auth.md) - QRコードログイン、JWT認証フロー
* [**Operation Manual**](docs/operation.md) - 当日の運用、トークン発行、データ回収手順

---

## 🏗 Technology Stack

* **Frontend:** Nuxt 3, Tailwind CSS
* **Infrastructure (IaC):** AWS CDK (TypeScript)
* **Backend (Serverless):**
    * **Auth:** Lambda (JWT Issue) + DynamoDB
    * **API:** API Gateway + Lambda
    * **Storage:** S3 + CloudFront
    * **Database:** DynamoDB (On-Demand)

### Key Features
* **QRCode Login:** パスワードレスで簡単ログイン (UUIDトークン)
* **Presigned URL:** S3へのダイレクトアップロード（サーバー負荷軽減）
* **Client-Side Compression:** アップロード前の画像圧縮・リサイズ
* **Realtime Slideshow:** 5分のタイムラグを設けた安全なスライドショー
* **Self-Moderation:** テーブル単位での削除権限管理
* **UI Theme Switching:** 環境変数 (`NUXT_PUBLIC_UI_THEME`) でデザインテーマを切り替え（詳細は [Operation Manual](docs/operation.md#4-環境変数-environment-variables)）

---

## 💰 Cost Estimation (Running Costs)

**「AWS 常時無料枠 (Always Free)」** を最大限活用し、数百円/月 以下での運用を想定しています。
※ 12ヶ月無料枠が終了しているアカウントでの試算です。

| Service | 想定利用量 (ゲスト100人規模) | 予想コスト | 備考 |
| :--- | :--- | :--- | :--- |
| **Lambda** | ~50,000 requests | **¥0** | 毎月100万回まで無料 (常時無料枠) |
| **CloudFront** | ~100GB Data Transfer | **¥0** | 毎月1TBまで無料 (常時無料枠) |
| **DynamoDB** | On-Demand (R/W) | **~¥10 - ¥50** | 無料枠対象外のため従量課金 (安価) |
| **S3** | Storage & Put Requests | **~¥10 - ¥20** | 保存容量とPUT数に応じた従量課金 |
| **Route53** | Hosted Zone | **~¥70 / month** | ドメイン維持費は別途必要 |
| **Total** | | **約 ¥150 / month** | 缶コーヒー1本分程度 |

> **⚠️ 注意:** CDKの設定で `NAT Gateway` を作成すると、使用しなくても月額4,000円以上かかります。本構成では **VPCを使用しない (Public Lambda)** 設定にすることでこれを回避します。

---

## 🚀 Setup & Deployment

### Prerequisites
* Node.js (v18 or later)
* AWS CLI (configured with `aws configure`)

### 1. Install Dependencies
```bash
npm install
```
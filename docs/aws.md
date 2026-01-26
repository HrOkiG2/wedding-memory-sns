# Infrastructure Architecture

本プロジェクトのAWSインフラストラクチャ設計書です。
AWS CDK (TypeScript) を使用して構築され、完全なサーバーレス構成を採用しています。

## 1. Architecture Diagram

```mermaid
graph TD
    User((Guest User))
    Admin((Admin))

    subgraph "Frontend Hosting"
        CF[CloudFront Distribution]
        WebBucket[S3 Bucket: Web Assets]
    end

    subgraph "Backend API"
        APIGW[API Gateway (HTTP API)]
        AuthFn[Lambda: Auth]
        PhotoFn[Lambda: Photos]
    end

    subgraph "Data Store"
        DDB[DynamoDB: GuestAuth / Photos]
        PhotoBucket[S3 Bucket: Uploaded Photos]
    end

    %% Flows
    User -- HTTPS --> CF
    CF -- OAC --> WebBucket
    
    User -- API Req (JWT) --> APIGW
    APIGW --> AuthFn
    APIGW --> PhotoFn
    
    AuthFn -- Read --> DDB
    PhotoFn -- Read/Write --> DDB
    
    PhotoFn -- Generate Presigned URL --> PhotoBucket
    User -- Direct Upload (Presigned URL) --> PhotoBucket
    
    Admin -- Admin API --> APIGW
```

---

## 2. Resource Details
### 2-1. Network & CDN (CloudFront)

静的コンテンツの配信とHTTPS終端を担当します。

| リソース / 設定項目 | 設定内容 | 理由・備考 |
| :--- | :--- | :--- |
| **Price Class** | `PriceClass_200` (推奨) または `100` | コスト最適化とパフォーマンスのバランスを考慮。 |
| **Origin Access Control (OAC)** | **Enabled** | S3バケットへの直接アクセスを禁止し、CloudFront経由のみに限定してセキュリティを強化するため。 |
| **Viewer Protocol Policy** | **Redirect to HTTPS** | セキュリティ上の必須要件。すべての通信を暗号化。 |
| **Geo Restriction** | Optional (`Allow: JP only`) | 海外からの攻撃リスクを低減する場合に設定（日本国内の式典限定であれば推奨）。 |

### 2-2. Frontend Storage (S3)

Nuxtアプリケーション（SPA/SSGビルド）のホスティング先。

| Resource / Configuration | 設定内容 | Note |
| :--- | :--- | :--- |
| **S3 Bucket** | **BlockPublicAccess: BLOCK_ALL** | Web公開はCloudFrontのOAC経由で行うため、バケット自体のパブリックアクセスは完全にブロックします。 |
| **Encryption** | **S3_MANAGED (SSE-S3)** | AWS管理の鍵を使用したサーバー側の暗号化を有効にし、データの安全性を確保します。 |

### 2-3. Backend Compute (Lambda)

ビジネスロジックを実行する関数群。

| Resource / Configuration | 設定内容 | Note |
| :--- | :--- | :--- |
| **Runtime** | **Node.js 20.x** | 最新のLTS（長期サポート）バージョンを使用し、安定性とパフォーマンスを確保。 |
| **Architecture** | **ARM64 (Graviton2)** | 従来のx86_64アーキテクチャよりもコスト効率が良く、実行速度も高速。 |
| **Memory** | **512MB - 1024MB** | メモリを増やすことでCPUパワーも向上するため、画像処理やコールドスタート対策として多めの割り当てを推奨。 |
| **Timeout** | **10 - 29 seconds** | API Gatewayのタイムアウト制限（30秒）に合わせ、余裕を持った設定にする。 |


### 2-4. API Gateway

フロントエンドからのリクエストを受け付けるエントリポイント。

- Type: HTTP API (v2)
- REST API (v1) よりも低コストかつ低レイテンシ。
- CORS
    - Allow Origin: CloudFrontのドメイン (またはカスタムドメイン)
    - Allow Methods: GET, POST, OPTIONS, DELETE
- Authorizer
    - Lambda Authorizer (または各Lambda内でJWT検証ロジックを実装)

### 2-5. Database (DynamoDB)

メタデータストア。

- Mode: On-Demand (Pay-per-request)
    - スパイクアクセスに対応するため。
- Tables
    - Wedding_GuestAuth: 認証情報
    - Wedding_Photos: 写真メタデータ
- Backup: Point-in-Time Recovery (PITR) 推奨（式の最中のデータロスト防止）。

### 2-6. Photo Storage (S3)
ユーザーがアップロードした画像の保存先。

- CORS:クライアント(ブラウザ)からの直接 PUT を許可するために必須。
    - Allow Origin: App Domain
    - Allow Methods: GET, PUT
    - Access Control: Private
- 画像アップロード: 署名付きURL (Presigned URL) で一時的に許可。
- 画像閲覧: CloudFront + Signed URL または API経由での署名付きURL発行。

---

## 3. Security Policies (IAM)
最小権限の原則 (Least Privilege) に基づき、Lambdaに付与する権限を制限します。

**Auth Lambda Role**
- dynamodb:GetItem (GuestAuth Table)
- dynamodb:PutItem (Login Logs - Optional)

**Photo Lambda Role**
- dynamodb:Query
- dynamodb:PutItem
- dynamodb:UpdateItem (Photos Table)
- s3:PutObject, s3:GetObject (Photo Bucket - for Presigned URL generation)

※ s3:PutObject 自体はLambdaが実行するのではなく、署名権限として使用。

---

## 4. Scalability & Limits (スケーラビリティと制限)

結婚式当日のスパイク負荷（一斉投稿など）に対する考慮事項です。

| Component | Limit / Constraint | Strategy |
| :--- | :--- | :--- |
| **Lambda Concurrency** | Default: 1,000 | 100人規模のイベントなら全く問題なし。大規模な場合は必要に応じて上限緩和申請。 |
| **API Gateway** | 10,000 RPS | 十分な余裕あり。 |
| **DynamoDB** | Adaptive Capacity | **オンデマンドモード**（On-demand）設定であれば、スパイクに合わせて自動スケール。 |
| **S3** | 3,500 PUT/sec | 画像アップロードにおいて十分な余裕あり。 |

* **Google スプレッドシートにエクスポート**（データのバックアップ・集計用）

---

## 5. Cost Strategy (コスト戦略)

運用コストを最小限に抑えるための設定です。

* **VPC:** **使用しない**
    * LambdaをVPC内に配置するとNAT Gatewayが必要になり、固定費（月額約$30〜）が発生するため、コスト回避のためにパブリック配置とする。
* **Logs (CloudWatch Logs):**
    * 保持期間（Retention）を **1 week** または **1 month** に設定。無期限保存を避け、ストレージコストを削減。
* **S3 Lifecycle:**
    * 式終了から一定期間（例：90日）経過後にデータを自動削除、またはGlacierへの移行を検討。
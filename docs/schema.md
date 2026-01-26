# Data Schema & Storage Design

## 1. DynamoDB Schema

結婚式というイベント特性（短時間のアクセス集中）に合わせ、Capacity Modeは **On-Demand** を採用します。

### Table 1: `GuestAuth`
QRコードの認証トークンを管理するテーブルです。

* **TableName:** `Wedding_GuestAuth`
* **Partition Key (PK):** `authToken` (String) - QRコードに含まれるUUID

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `authToken` | String | **(PK)** 認証用トークン |
| `tableId` | String | システム内部のテーブルID (例: `TABLE_A`, `ADMIN`) |
| `tableName` | String | UI表示用のテーブル名 (例: "A卓: 新郎友人") |

**主なアクセスパターン:**
* **Login:** `GetItem(Key={authToken})`
    * トークンが存在すればログイン成功とし、`tableId` を返却する。

---

### Table 2: `Photos`
写真のメタデータと状態を管理するメインテーブルです。

* **TableName:** `Wedding_Photos`
* **Partition Key (PK):** `eventId` (String) - イベント全体を束ねるID (例: `WEDDING_202X`)
* **Sort Key (SK):** `createdAt` (String) - ISO8601形式のタイムスタンプ

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `eventId` | String | **(PK)** 固定値。全件取得に使用。 |
| `createdAt` | String | **(SK)** 撮影日時 (`YYYY-MM-DDTHH:mm:ss.sssZ`) |
| `photoId` | String | 写真固有のUUID (フロントエンドのkey用) |
| `tableId` | String | 投稿者のテーブルID (権限判定用) |
| `s3Key` | String | S3上のオブジェクトキー |
| `mimeType` | String | 画像形式 (例: `image/jpeg`) |
| `isVisible` | Boolean | 論理削除フラグ (Default: `true`) |
| `likes` | Number | いいね数 |

**主なアクセスパターン:**

1.  **フィード一覧取得 (リアルタイム)**
    * **Query:** `PK = "WEDDING_202X"`
    * **Filter:** `isVisible = true`
    * **Order:** 降順 (最新が上)

2.  **スライドショー取得 (5分遅れ)**
    * **Query:** `PK = "WEDDING_202X" AND SK <= :fiveMinutesAgo`
    * **Filter:** `isVisible = true`
    * **Note:** `:fiveMinutesAgo` はLambda側で計算した日時文字列。

3.  **写真削除 (論理削除)**
    * **Update:** `SET isVisible = false`
    * **Condition:** `tableId = :requesterTableId OR :requesterTableId = 'ADMIN'`
    * **Note:** 「自分のテーブルの写真」または「管理者」のみ削除許可。

4.  **いいね**
    * **Update:** `SET likes = likes + 1`

---

### Table 3: `RateLimit`
認証エンドポイントへの総当たり攻撃を防止するためのレート制限テーブルです。

* **TableName:** `Wedding_RateLimit`
* **Partition Key (PK):** `pk` (String) - IPアドレスをキーとした識別子
* **TTL:** `expiresAt` - 自動削除用のUnixタイムスタンプ

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `pk` | String | **(PK)** `ip#{clientIp}` 形式 (例: `ip#192.168.1.1`) |
| `attempts` | Number | 試行回数 |
| `firstAttempt` | Number | 最初の試行時刻 (Unix timestamp) |
| `expiresAt` | Number | **(TTL)** レコード自動削除時刻 (Unix timestamp) |

**主なアクセスパターン:**

1.  **レート制限チェック**
    * **Get:** `GetItem(Key={pk: "ip#{clientIp}"})`
    * `attempts >= MAX_ATTEMPTS` の場合は `429 Too Many Requests` を返却。

2.  **試行回数インクリメント**
    * **Update:** `SET attempts = if_not_exists(attempts, 0) + 1, expiresAt = :ttl`
    * TTL により Window 時間経過後にレコードは自動削除される。

**CDK 定義例:**
```typescript
const rateLimitTable = new dynamodb.Table(this, "RateLimitTable", {
  tableName: "Wedding_RateLimit",
  partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境用。本番は RETAIN を検討
});
```

---

## 2. S3 Storage Design

### Bucket Configuration
* **Access Control:** Private (CloudFront OAI/OAC経由でのみ公開)
* **CORS:** アプリのドメインからの `PUT`/`GET` を許可
* **Lifecycle Rule:** 作成から30日後に削除 (コスト削減とデータ整理のため)

### Object Key Structure
ダウンロード時の整理を容易にするため、テーブルIDをディレクトリとして使用します。

Format: `photos/{tableId}/{timestamp}_{uuid}.jpg`

* **例:** `photos/TABLE_A/20260126-120000_f47ac10b.jpg`

### Validation & Optimization (Client-Side)
S3へのアップロード前に、フロントエンド(Nuxt)側で以下の処理を行います。

* **File Type:** `image/jpeg`, `image/png`, `image/heic`(変換必須)
* **Max Size:** 5MB (推奨: 圧縮して1MB以下にする)
* **Exif:**
    * Orientation情報を適用して画像を正位置に回転させる。
    * 個人情報保護のため、位置情報(GPS)は削除する。
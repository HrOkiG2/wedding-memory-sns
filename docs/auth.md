# Authentication & Authorization Specification

結婚式当日、ゲストがストレスなく、かつ安全に利用できる「QRコード認証」の仕様です。

## 1. Auth Strategy Overview

* **方式:** パスワードレス認証
* **エントリーポイント:** QRコードに含まれるURLパラメータ (`?token=UUID`)
* **セッション管理:** JWT (JSON Web Token) または UUIDのローカルストレージ保存
    * *本設計では実装コストとセキュリティのバランスから、Lambdaで UUID を検証し、署名付きJWTを発行する方式を推奨します。*

---

## 2. Authentication Flow

### Phase 1: Access & Login
ゲストがQRコードをスキャンしてから、認証済み状態になるまでのフロー。

1.  **QR Scan:**
    * User accesses: `https://app.com/?token=12345-abcde-uuid`
2.  **Client (Nuxt):**
    * `onMounted` で URL クエリパラメータ `token` を取得。
    * API `POST /auth/login` へトークンを送信。
3.  **Server (Lambda):**
    * DynamoDB `Wedding_GuestAuth` を検索。
    * ヒットした場合:
        * そのトークンに紐づく `tableId` (例: `TABLE_A`) と `role` (例: `GUEST`) を取得。
        * **JWT** を生成して返却。
    * ヒットしない場合:
        * `401 Unauthorized` を返却。
4.  **Client (Nuxt):**
    * 受け取った JWT を `LocalStorage` に保存。
    * 以降の API リクエストの `Authorization` ヘッダに付与。

### Phase 2: API Authorization
ログイン後の各操作における権限チェック。

| Action | API Path | Required Logic |
| :--- | :--- | :--- |
| **写真一覧取得** | `GET /photos` | JWTが有効であれば誰でもOK。 |
| **写真アップロード** | `POST /photos/upload-url` | JWTが有効であればOK。<br>JWT内の `tableId` をメタデータとして保存。 |
| **写真削除** | `DELETE /photos/{id}` | **権限チェック必須**<br>TargetPhoto.tableId === JWT.tableId OR JWT.role === 'ADMIN' |

---

## 3. Token & Data Structure

### 3-1. QR Code Token (Entrance Key)
物理的に配布されるQRコードに含まれるデータ。

* **Format:** UUID v4
* **Example:** `f47ac10b-58cc-4372-a567-0e02b2c3d479`

### 3-2. JWT Payload (Session Key)
API通信時に使用するアクセストークンの中身。
DynamoDBへのアクセス回数を減らすため、権限情報はここに内包します。

```json
{
  "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479", // 元のAuthToken
  "tableId": "TABLE_A",                          // どのテーブルの所属か
  "role": "GUEST",                               // "GUEST" or "ADMIN"
  "iat": 1700000000,
  "exp": 1700086400                              // 有効期限 (例: 24時間)
}
```

---

## 4. Security Considerations

### 4-1. JWT Secret Key Management
JWTの署名に使用する秘密鍵は、ソースコードや環境変数に直接記述せず、AWS Secrets Managerで安全に管理します。

**Secrets Manager 設定:**
```json
{
  "SecretName": "wedding-app/jwt-secret",
  "SecretString": {
    "key": "your-256-bit-secret-key-here",
    "algorithm": "HS256"
  }
}
```

**Lambda での取得例:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "ap-northeast-1" });

// キャッシュ用（Lambda のコールドスタート対策）
let cachedSecret: string | null = null;

async function getJwtSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const command = new GetSecretValueCommand({
    SecretId: "wedding-app/jwt-secret",
  });
  const response = await client.send(command);
  const secret = JSON.parse(response.SecretString!);
  cachedSecret = secret.key;
  return cachedSecret;
}
```

**ベストプラクティス:**
| 項目 | 推奨設定 |
|:-----|:---------|
| **鍵の長さ** | 256bit 以上（HS256の場合） |
| **ローテーション** | Secrets Manager の自動ローテーション機能を有効化（30-90日） |
| **アクセス制御** | Auth Lambda の IAM Role にのみ `secretsmanager:GetSecretValue` を許可 |
| **監査ログ** | CloudTrail で Secrets Manager へのアクセスを記録 |

---

### 4-2. Rate Limiting (認証トークンの総当たり攻撃対策)
QRコードのトークン（UUID）が漏洩・推測された場合に備え、認証エンドポイントにレート制限を設けます。

**API Gateway レベルでの制限:**
```yaml
# serverless.yml または CDK での設定例
throttle:
  burstLimit: 10      # 瞬間的な最大リクエスト数
  rateLimit: 5        # 1秒あたりのリクエスト数
```

**Lambda レベルでの IP ベース制限:**
DynamoDB を使用して、同一 IP からの認証試行を追跡・制限します。

```typescript
// DynamoDB テーブル: Wedding_RateLimit
// PK: ip#{clientIp}
// TTL: expiresAt (自動削除用)

interface RateLimitRecord {
  pk: string;           // "ip#192.168.1.1"
  attempts: number;     // 試行回数
  firstAttempt: number; // 最初の試行時刻 (Unix timestamp)
  expiresAt: number;    // TTL (15分後に自動削除)
}

async function checkRateLimit(clientIp: string): Promise<boolean> {
  const WINDOW_SECONDS = 900;  // 15分
  const MAX_ATTEMPTS = 10;     // 15分間に10回まで

  const record = await dynamodb.get({
    TableName: "Wedding_RateLimit",
    Key: { pk: `ip#${clientIp}` }
  });

  if (record.Item && record.Item.attempts >= MAX_ATTEMPTS) {
    // レート制限超過
    return false;
  }

  // カウンターをインクリメント
  await dynamodb.update({
    TableName: "Wedding_RateLimit",
    Key: { pk: `ip#${clientIp}` },
    UpdateExpression: "SET attempts = if_not_exists(attempts, :zero) + :inc, expiresAt = :ttl",
    ExpressionAttributeValues: {
      ":zero": 0,
      ":inc": 1,
      ":ttl": Math.floor(Date.now() / 1000) + WINDOW_SECONDS
    }
  });

  return true;
}
```

**制限値の推奨設定:**
| シナリオ | Window | Max Attempts | 理由 |
|:---------|:-------|:-------------|:-----|
| **認証エンドポイント** | 15分 | 10回 | QRスキャン失敗の再試行を考慮しつつ、総当たりを防止 |
| **写真アップロード** | 1分 | 30回 | 連続アップロードを許容しつつ、濫用を防止 |
| **写真削除** | 1分 | 10回 | 誤操作防止も兼ねる |

**レート制限超過時のレスポンス:**
```json
{
  "statusCode": 429,
  "body": {
    "error": "TOO_MANY_REQUESTS",
    "message": "しばらく時間をおいてから再度お試しください",
    "retryAfter": 900
  }
}
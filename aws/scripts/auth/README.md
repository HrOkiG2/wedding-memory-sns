# Scripts

運用・管理用のCLIスクリプト集です。

## 前提条件

- Node.js 20+
- AWS CLI が設定済み（`aws configure`）
- 適切なIAM権限（DynamoDB読み書き）

## ゲストデータ登録 (`seed-guests.ts`)

GuestAuthテーブルにゲスト認証データを登録します。

### クイックスタート

```bash
# 1. サンプルデータを生成（10テーブル分）
npx tsx scripts/auth/seed-guests.ts --generate 10

# 2. guests.json を確認・編集
code scripts/auth/guests.json

# 3. ドライランでプレビュー
npx tsx scripts/auth/seed-guests.ts --dry-run

# 4. 本番登録
npx tsx scripts/auth/seed-guests.ts
```

### コマンドオプション

| オプション | 説明 |
|-----------|------|
| `--generate N` | Nテーブル分のサンプルデータを `guests.json` に生成 |
| `--file FILE` | 指定したJSONファイルからデータを読み込み |
| `--dry-run` | 実際には登録せずプレビュー表示 |
| `--list` | 既存のゲストデータを一覧表示 |

### データ形式

`guests.json` の形式：

```json
[
  {
    "authToken": "unique-token-string",
    "tableId": "TABLE_01",
    "tableName": "テーブル 1 (新郎親族)"
  },
  {
    "authToken": "admin-token-string",
    "tableId": "ADMIN",
    "tableName": "新郎新婦"
  }
]
```

| フィールド | 説明 |
|-----------|------|
| `authToken` | QRコードに埋め込む一意のトークン |
| `tableId` | テーブル識別子（`ADMIN` で管理者権限） |
| `tableName` | 表示用のテーブル名 |

### 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `AWS_REGION` | `ap-northeast-1` | AWSリージョン |
| `GUEST_AUTH_TABLE` | `Wedding_GuestAuth` | DynamoDBテーブル名 |

### 例: 本番環境への登録

```bash
# 本番用のデータファイルを使用
AWS_REGION=ap-northeast-1 \
GUEST_AUTH_TABLE=Wedding_GuestAuth \
npx tsx scripts/auth/seed-guests.ts --file guests-production.json
```

---

## 認証URL生成 (`generate-auth-url.ts`)

ローカル開発用の認証URLを生成します。

```bash
# すべてのテストURLを表示
npx tsx scripts/auth/generate-auth-url.ts

# 特定のテーブル用URLのみ
npx tsx scripts/auth/generate-auth-url.ts --table 1

# 管理者用URLのみ
npx tsx scripts/auth/generate-auth-url.ts --admin
```

---

## QRコード生成ワークフロー

本番運用でのQRコード生成フロー：

```
1. guests.json を作成
   └─ テーブル名、トークンを定義

2. seed-guests.ts で DynamoDB に登録
   └─ npx tsx scripts/auth/seed-guests.ts

3. QRコードを生成
   └─ URL形式: https://{domain}/?token={authToken}
   └─ 各テーブル用のQRコードを印刷

4. 当日配布
   └─ 各テーブルにQRコードを設置
```

### QRコード生成ツール（外部）

- [QR Code Generator](https://www.qr-code-generator.com/)
- `qrcode` npm パッケージ
- Google Charts API

```bash
# qrcodeパッケージを使う場合
npm install -g qrcode
qrcode -o table1.png "https://example.com/?token=xxxxx"
```


# Frontend Implementation Guideline

Nuxt 3 アプリケーションの実装ガイドラインです。  
開発時は本ドキュメントのルールに従い、コードの統一性と品質を保ちます。

---

## 1. Project Overview & Tech Stack

* **Framework:** Nuxt 3 (Vue 3 + TypeScript)
* **Rendering:** Client-Side Rendering (CSR) / SPA Mode
    * `nuxt.config.ts` で `ssr: false` を設定。
    * S3ホスティングのため、サーバーサイド処理を含めないこと。
* **Styling:** Tailwind CSS
* **Icons:** アイコンライブラリは導入せず、絵文字（🎉👑🪑❤️等）で表現する方針を採用しています。

---

## 2. Directory Structure

現状はNuxtの標準構成に沿ったフラットな構成を採っています（`components/`をui/features等に細分化する運用は今のところ導入していません。プロジェクト規模的にオーバーヘッドが大きいと判断したため）。

```text
app/
├── assets/             # グローバルCSS
├── components/         # コンポーネント（サブディレクトリなしのフラット構成）
├── composables/        # ビジネスロジック、状態管理 (useAuth, useApi, useUpload, useImageConverter)
├── middleware/         # ルーティングガード (auth.ts)。各ページで definePageMeta({ middleware: 'auth' }) として個別に適用する
├── pages/              # ページコンポーネント (feed.vue, upload.vue, slideshow.vue 等)
├── public/             # 静的ファイル (favicon等)
├── server/api/         # ローカル開発用のモックAPI（本番はAWS Lambda側のAPIを使用）
└── types/              # TypeScript型定義
```

## 3. Implementation Rules

### 3-1. Script & Syntax
* **Composition API**: 全てのコンポーネントで `<script setup lang="ts">` を採用する。
* **Options API**: **使用禁止**。
* **Explicit Imports**: NuxtのAuto Import（`ref`, `computed` 等）を基本とするが、カスタムコンポーザブルや外部ライブラリなど、コードの可読性を損なう可能性がある場合は、明示的にインポートを行う。

### 3-2. Styling (Tailwind CSS)
* **Utility First**: スタイルは原則として `class` 属性に直接記述する。
* **Design Tokens**: 色、フォントサイズ、間隔などは `tailwind.config.ts` の `theme.extend` に定義したものを使用し、マジックナンバー（ハードコード）を排除する。
    * ✅ **Good**: `class="bg-wedding-gray text-main-gold"`
    * ❌ **Bad**: `class="bg-[#f0f0f0] text-[#d4af37]"`
* **Complex Styles**: クラス定義が4-5行に渡り可読性が低下する場合は、以下のいずれかで対応する。
    1.  `@apply` を用いたCSSクラスの定義
    2.  コンポーネントの細分化（小さなUI部品に切り出す）

### 3-3. Type Safety
* **any の禁止**: `any` 型の使用は極力避け、型定義を徹底する。
* **型定義の集約**: APIレスポンスや共通で利用するインターフェースは `types/api.d.ts` や `types/index.ts` に集約し、プロジェクト全体で一貫性を保つ。

---

## 4. Key Implementation Patterns

### 4-1. API Communication (useApi Wrapper)
生の `$fetch`/`useFetch` を直接各ページで呼ばず、`composables/useApi.ts` を経由してください。認証ヘッダーの付与は `composables/useAuth.ts` の `getAuthHeader()` が担当します（JWTは `wedding_jwt` という名前のCookieに保存）。

```typescript
// composables/useApi.ts (実際の実装、抜粋)
export function useApi() {
  const { getAuthHeader } = useAuth();
  const apiBase = useRuntimeConfig().public.apiEndpoint;

  const fetchPhotos = async (nextToken?: string) => {
    return await $fetch(`${apiBase}/photos`, {
      headers: getAuthHeader(),
    });
  };
  // ...
}
```

### 4-2. Image Upload Flow (Critical)
画像アップロードは、サーバー負荷軽減とUX向上のため、以下の**クライアントサイド処理**を厳守してください。

#### A. UI Implementation (Camera vs Gallery)
ゲストの「今、この瞬間を撮りたい」という意欲を削がないよう、UIでカメラ起動とギャラリー選択を明確に分けます。

| 項目 | 実装方法 (HTML) | 挙動 / 特徴 |
| :--- | :--- | :--- |
| **Take Photo (Camera)** | `<input type="file" capture="environment" accept="image/*">` | モバイル端末の標準カメラが直接起動（背面カメラ優先）。 |
| **Select from Gallery** | `<input type="file" multiple accept="image/*">` | 端末の画像フォルダ/アルバム選択画面を表示。 |

#### B. Processing Flow


1.  **File Selection**: 上記の `input` から `File` オブジェクトを取得（`composables/useUpload.ts`）。事前にファイル形式(JPEG/PNG/HEIC)・サイズ(5MB以下)をバリデーション。
2.  **Compression**: 外部ライブラリは使わず、`createImageBitmap` + `OffscreenCanvas` を用いてクライアント側でリサイズ・JPEG変換（`composables/useImageConverter.ts`）。
    * **Max Dimension**: 長辺2048px
    * **JPEG Quality**: 0.85
    * ライブラリ非依存にすることで依存関係を減らし、バンドルサイズを抑えている。
3.  **Presigned URL**: 自社APIからS3アップロード用の「署名付きURL」を取得。
4.  **Direct Upload**: 取得したURLへ、S3へ直接 `PUT` 送信（アプリケーションサーバーの帯域を消費させない）。
5.  **DB Registration**: アップロード完了後、APIへメタデータ（s3Key等）の保存通知を送る。

---

### 4-3. Authentication & Middleware
認証状態の維持とページ保護を共通化します。

* **Routing Guard**: `middleware/auth.ts` を作成。
    * 実行タイミング：認証が必要な各ページで `definePageMeta({ middleware: 'auth' })` として個別に指定する（自動適用の `.global.ts` ではない）。ページ追加時は指定を忘れないこと。
    * 公開ページ（ログイン画面など）は `publicRoutes` 配列に明示的に含める。
    * 挙動：有効な認証トークンがないユーザーをログインページへ強制リダイレクト。**スライドショーのような「誰でもアクセスできそうに見えるページ」も、招待客以外に写真が見えてしまうため必ず認証必須にすること**（会場のPC/iPadでも事前にQRコードでログインしてから使う運用とする）。
* **Persistence (永続化)**:
    * トークン管理には `useCookie`（Cookie名: `wedding_jwt`、有効期限24時間）を使用。
    * ブラウザを閉じたりリロードしたりした後もセッションを維持し、再ログインの手間を省く。

## 5. UI/UX Guidelines (Wedding Specific)
結婚式当日のゲスト（老若男女 / 飲酒による注意散漫の可能性）を想定し、極限までストレスを排除した設計にします。

### 5-1. Feedback is King
* **Loading State**: 通信中・処理中は、必ずローディングスピナーや「送信中...」のテキストを表示する。
    * 通信環境が不安定な会場が多いため、**ボタンの二重押し防止（Disabled処理）**は必須。
* **Toast Notification**: アクションの成功・失敗は、トースト通知（画面端に浮き出る通知）で即座にフィードバックする。

### 5-2. Touch Friendly
* **Button Size**: 指の太いゲストでも誤操作しないよう、タップ領域は `min-height: 44px` 以上を確保する。
* **Inputs**: 入力負荷を減らすため、適切なキーボードが自動で起動するよう `type` 属性や `inputmode` を指定する。

### 5-3. Slideshow Mode
* **Immersive Experience**: スライドショーページは没入感を高めるため、ヘッダー・フッターを排除した全画面構成とする。
* **Wake Lock API**: 画面の自動消灯（スリープ）を防ぐため、`navigator.wakeLock` APIの実装を検討する。

---

### 5-4. Okinawa Theming Strategy (リゾート婚演出)
UI全体で「沖縄感」を演出し、リラックスした祝祭感を表現します。

* **Typography**:
    * 可読性を優先しつつ、少し丸みのあるリラックスした日本語フォントの適用を検討する（※Webフォントの読み込み速度に留意）。
* **Visual Motifs**:
    * **背景**: 単なるベタ塗りを避け、薄い波模様（青海波）や砂浜のテクスチャをCSSでうっすらと敷く。
    * **アニメーション**: ローディングスピナーにハイビスカスや波の動きを取り入れる。
    * **Empty State**: 写真が1枚もない状態などのイラストに、シーサーやヤシの木を採用する。
* **ミンサー柄（五つと四つの文様）**:
    * 「いつ（五つ）の世（四つ）までも末永く」という縁起の良い意味を持つミンサー織の柄を、区切り線や装飾パーツとして採用する。



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
* **Icons:** Lucide Vue (推奨) or Heroicons

---

## 2. Directory Structure

Nuxtの標準構成に加え、ビジネスロジックの分離を意識します。

```text
root/
├── assets/             # グローバルCSS, 画像
├── components/
│   ├── ui/             # 汎用UIパーツ (Button, Input, Card) - ロジックを持たない
│   ├── features/       # 機能単位のコンポーネント (PhotoList, Uploader)
│   └── layouts/        # ヘッダー、フッターなどのレイアウト部品
├── composables/        # ビジネスロジック、状態管理 (useAuth, usePhotos)
├── layouts/            # ページレイアウト定義 (default.vue, slideshow.vue)
├── middleware/         # ルーティングガード (auth.global.ts)
├── pages/              # ページコンポーネント
├── public/             # 静的ファイル (favicon等)
├── types/              # TypeScript型定義
└── utils/              # 純粋な関数 (画像圧縮ロジック等はここ)
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

### 4-1. API Communication (useFetch Wrapper)
生の `useFetch` を直接各ページで呼ばず、認証ヘッダー付与やエラーハンドリングを共通化したコンポーザブルを経由してください。

```typescript
// composables/useApiClient.ts (Example)
export const useApiClient = <T>(url: string, options: UseFetchOptions<T> = {}) => {
  const token = useCookie('auth_token')
  
  return useFetch(url, {
    baseURL: useRuntimeConfig().public.apiBase,
    headers: {
      Authorization: token.value ? `Bearer ${token.value}` : ''
    },
    ...options
  })
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


1.  **File Selection**: 上記の `input` から `File` オブジェクトを取得。
2.  **Compression**: `browser-image-compression` 等を使用し、クライアント側でリサイズ。
    * **Max Size**: 1.5MB 程度
    * **Max Width**: 1920px
    * **Orientation**: Exif情報に基づく回転補正を必須とする（カメラ直接撮影時の縦横逆転を防止）。
3.  **Presigned URL**: 自社APIからS3アップロード用の「署名付きURL」を取得。
4.  **Direct Upload**: 取得したURLへ、S3へ直接 `PUT` 送信（アプリケーションサーバーの帯域を消費させない）。
5.  **DB Registration**: アップロード完了後、APIへメタデータ（ファイルパス等）の保存通知を送る。

---

### 4-3. Authentication & Middleware
認証状態の維持とページ保護を共通化します。

* **Routing Guard**: `middleware/auth.global.ts` を作成。
    * 実行タイミング：全ルート移動時（グローバルミドルウェア）。
    * 挙動：有効な認証トークンがないユーザーをログインページ（またはQRスキャン専用ページ）へ強制リダイレクト。
* **Persistence (永続化)**:
    * トークン管理には `useCookie` を使用。
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


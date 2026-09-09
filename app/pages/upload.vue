<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
});

const router = useRouter();
const { getUploadUrl, uploadToS3, registerPhoto } = useApi();
const { isConverting, convertProgress, convertToJpeg, createPreviewUrl } = useImageConverter();

const selectedFile = ref<File | null>(null);
const convertedBlob = ref<Blob | null>(null);
const previewUrl = ref<string | null>(null);
const isUploading = ref(false);
const uploadProgress = ref(0);
const error = ref('');
const showSuccess = ref<boolean>(false);

// 変換前の最大サイズ（変換後は小さくなるので緩和）
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
// 変換するのでより多くの形式を受け入れ
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp'
];

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    error.value = 'JPEG、PNG、HEIC、WebP形式の画像を選択してください';
    return;
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    error.value = 'ファイルサイズは20MB以下にしてください';
    return;
  }

  error.value = '';
  selectedFile.value = file;

  try {
    // 画像を変換（JPEG化 + リサイズ）
    const result = await convertToJpeg(file);
    convertedBlob.value = result.blob;

    // 変換後の画像でプレビュー生成
    previewUrl.value = await createPreviewUrl(result.blob);
  } catch (e) {
    console.error('Image conversion failed:', e);
    error.value = '画像の変換に失敗しました。別の画像をお試しください。';
    clearSelection();
  }
};

const handleUpload = async () => {
  if (!convertedBlob.value) return;

  isUploading.value = true;
  uploadProgress.value = 0;
  error.value = '';

  try {
    // 変換済みのJPEGをアップロード
    const mimeType = 'image/jpeg';
    const fileName = selectedFile.value?.name.replace(/\.[^.]+$/, '.jpg') || 'photo.jpg';

    // 1. Get presigned URL
    uploadProgress.value = 20;
    const { uploadUrl, s3Key } = await getUploadUrl(mimeType, fileName);

    // 2. Upload to S3
    uploadProgress.value = 50;
    await uploadToS3(uploadUrl, convertedBlob.value, mimeType);

    // 3. Register photo metadata
    uploadProgress.value = 80;
    await registerPhoto(s3Key, mimeType);

    uploadProgress.value = 100;

    showSuccess.value = true;

    // Success - redirect to feed
    setTimeout(() => {
      showSuccess.value = false;
      router.push('/feed');
    }, 3000);
  } catch (e) {
    error.value = 'アップロードに失敗しました。もう一度お試しください。';
    console.error(e);
  } finally {
    isUploading.value = false;
  }
};

const clearSelection = () => {
  selectedFile.value = null;
  convertedBlob.value = null;
  previewUrl.value = null;
  error.value = '';
};
</script>

<template>
  <div class="upload-page">
    <header class="header">
      <NuxtLink to="/feed" class="back-btn">←</NuxtLink>
      <h1>写真を投稿</h1>
      <div style="width: 40px"/>
    </header>

    <div class="upload-container">
      <!-- 変換中の表示 -->
      <div v-if="isConverting" class="file-select">
        <div class="converting">
          <div class="spinner" />
          <p>画像を変換中...</p>
          <div class="progress">
            <div class="progress-bar" :style="{ width: convertProgress + '%' }"/>
          </div>
        </div>
      </div>

      <div v-else-if="!previewUrl" class="file-select">
        <label class="select-btn">
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
            hidden
            @change="handleFileSelect"
          />
          <span>写真を選択</span>
        </label>
        <p class="hint">JPEG, PNG, HEIC, WebP (最大20MB)</p>
      </div>

      <div v-else class="preview">
        <img :src="previewUrl" alt="Preview" />

        <div v-if="isUploading" class="progress">
          <div class="progress-bar" :style="{ width: uploadProgress + '%' }"/>
          <span>{{ uploadProgress }}%</span>
        </div>

        <div v-else class="actions">
          <button class="cancel-btn" @click="clearSelection">キャンセル</button>
          <button class="upload-btn" @click="handleUpload">投稿する</button>
        </div>
      </div>

      <div v-if="error" class="error">
        <p>{{ error }}</p>
      </div>
    </div>
    <UploadSuccess 
      :visible="showSuccess"
      @close="showSuccess = false"
    />
  </div>
</template>

<style scoped>
.upload-page {
  min-height: 100vh;
  background: var(--c-bg);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--c-surface);
  border-bottom: var(--c-border-w) solid var(--c-border);
}

.header h1 {
  font-family: var(--font-heading);
  font-size: 1.25rem;
  color: var(--c-ink);
  margin: 0;
}

.back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  text-decoration: none;
  color: var(--c-ink);
}

.upload-container {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.file-select {
  background: var(--c-surface);
  border: 2px dashed var(--c-border);
  border-radius: var(--radius-card);
  padding: 3rem;
  text-align: center;
}

.select-btn {
  display: inline-block;
  padding: 1rem 2rem;
  background: var(--c-primary);
  color: var(--c-ink);
  border: var(--c-border-w) solid var(--c-border);
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
}

.hint {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: var(--c-ink);
  opacity: 0.6;
}

.preview {
  background: var(--c-surface);
  border: var(--c-border-w) solid var(--c-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-pop-card);
}

.preview img {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  background: #000;
}

.progress {
  padding: 1rem;
  text-align: center;
}

.progress-bar {
  height: 8px;
  background: var(--c-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.actions {
  display: flex;
  gap: 1rem;
  padding: 1rem;
}

.cancel-btn,
.upload-btn {
  flex: 1;
  padding: 1rem;
  border: var(--c-border-w) solid var(--c-border);
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
}

.cancel-btn {
  background: var(--c-bg);
  color: var(--c-ink);
}

.upload-btn {
  background: var(--c-primary);
  color: var(--c-ink);
}

.error {
  margin-top: 1rem;
  padding: 1rem;
  background: #ffe0e0;
  color: #dc3545;
  border-radius: 0.5rem;
  text-align: center;
}

.converting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.converting p {
  font-size: 1rem;
  color: var(--c-ink);
  opacity: 0.7;
}

.converting .progress {
  width: 100%;
  max-width: 200px;
  height: 8px;
  background: var(--c-bg);
  border-radius: 4px;
  overflow: hidden;
}

.converting .progress-bar {
  height: 100%;
  background: var(--c-primary);
  transition: width 0.3s ease;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--c-bg);
  border-top-color: var(--c-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

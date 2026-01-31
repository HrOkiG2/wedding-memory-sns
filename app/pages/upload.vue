<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
});

const router = useRouter();
const { getUploadUrl, uploadToS3, registerPhoto } = useApi();

const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const isUploading = ref(false);
const uploadProgress = ref(0);
const error = ref('');
const showSuccess = ref<boolean>(false)

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic'];

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    error.value = 'JPEG、PNG、HEIC形式の画像を選択してください';
    return;
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    error.value = 'ファイルサイズは5MB以下にしてください';
    return;
  }

  error.value = '';
  selectedFile.value = file;

  // Create preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewUrl.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const handleUpload = async () => {
  if (!selectedFile.value) return;

  isUploading.value = true;
  uploadProgress.value = 0;
  error.value = '';

  try {
    // 1. Get presigned URL
    uploadProgress.value = 20;
    const { uploadUrl, s3Key } = await getUploadUrl(
      selectedFile.value.type,
      selectedFile.value.name
    );

    // 2. Upload to S3
    uploadProgress.value = 50;
    await uploadToS3(uploadUrl, selectedFile.value, selectedFile.value.type);

    // 3. Register photo metadata
    uploadProgress.value = 80;
    await registerPhoto(s3Key, selectedFile.value.type);

    uploadProgress.value = 100;

    showSuccess.value = true

    // Success - redirect to feed
    setTimeout(() => {
      showSuccess.value = false
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
      <div v-if="!previewUrl" class="file-select">
        <label class="select-btn">
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic"
            hidden
            @change="handleFileSelect"
          />
          <span>写真を選択</span>
        </label>
        <p class="hint">JPEG, PNG, HEIC (最大5MB)</p>
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
  background: #f5f5f5;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header h1 {
  font-size: 1.25rem;
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
  color: #333;
}

.upload-container {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.file-select {
  background: white;
  border: 2px dashed #ccc;
  border-radius: 1rem;
  padding: 3rem;
  text-align: center;
}

.select-btn {
  display: inline-block;
  padding: 1rem 2rem;
  background: #007bff;
  color: white;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
}

.hint {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #888;
}

.preview {
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
  background: #007bff;
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
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
}

.cancel-btn {
  background: #f0f0f0;
  color: #333;
}

.upload-btn {
  background: #007bff;
  color: white;
}

.error {
  margin-top: 1rem;
  padding: 1rem;
  background: #ffe0e0;
  color: #dc3545;
  border-radius: 0.5rem;
  text-align: center;
}
</style>

<script setup lang="ts">
import FooterNavigation from '~/components/FooterNavigation.vue';
import Header from '~/components/Header.vue';
import TakePicture from '~/components/TakePicture.vue';
import SelectPicture from '~/components/SelectPicture.vue';
import UploadPreviewModal from '~/components/UploadPreviewModal.vue';
import type { Photo } from '~/types';

definePageMeta({
  middleware: 'auth',
});

const { authState, canDeletePhoto } = useAuth();
const { fetchPhotos, deletePhoto, likePhoto } = useApi();
const { previewUrl, isUploading, uploadProgress, uploadError, selectFile, upload, clear } =
  useUpload();

const photos = ref<Photo[]>([]);
const isLoading = ref(true);
const error = ref('');
const selectPictureRef = ref<InstanceType<typeof SelectPicture> | null>(null);

// Fetch photos on mount
onMounted(async () => {
  await loadPhotos();
});

const loadPhotos = async () => {
  try {
    isLoading.value = true;
    const response = await fetchPhotos();
    photos.value = response.photos;
  } catch (e) {
    error.value = '写真の読み込みに失敗しました';
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

const handleDelete = async (photo: Photo) => {
  if (!confirm('この写真を削除しますか？')) return;

  try {
    await deletePhoto(photo.photoId, photo.createdAt);
    photos.value = photos.value.filter((p) => p.photoId !== photo.photoId);
  } catch (e) {
    alert('削除に失敗しました');
    console.error(e);
  }
};

const handleLike = async (photo: Photo) => {
  try {
    await likePhoto(photo.photoId, photo.createdAt);
    const target = photos.value.find((p) => p.photoId === photo.photoId);
    if (target) {
      target.likes++;
    }
  } catch (e) {
    console.error(e);
  }
};

// Upload handlers
const handleFileSelect = (file: File) => {
  selectFile(file);
};

const handleUpload = async () => {
  const result = await upload();
  if (result.success && result.photo) {
    photos.value.unshift(result.photo);
    setTimeout(() => clear(), 500);
  }
};

// Get rotation class for photo cards (alternating slight rotation)
const getRotation = (index: number): string => {
  const rotations = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2'];
  return rotations[index % rotations.length];
};

// Get table badge color
const getTableColor = (tableId: string): string => {
  if (tableId === authState.value.payload?.tableId) return 'bg-gray-200';
  const colors = ['bg-oki-blue', 'bg-oki-yellow', 'bg-oki-pink', 'bg-green-300'];
  const hash = tableId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};
</script>

<template>
  <div class="bg-oki-sand text-oki-text font-bold min-h-screen pb-24">
    <Header />

    <main class="px-4">
      <!-- Upload Card -->
      <div
        class="bg-white border-4 border-black rounded-[32px] p-6 mb-8 shadow-pop-card relative overflow-hidden"
      >
        <div class="absolute -top-4 -right-4 text-6xl opacity-20 rotate-12">🌺</div>

        <h2 class="text-xl mb-4 text-center">写真をシェアしてね！</h2>

        <div class="grid grid-cols-2 gap-3">
          <TakePicture @select="handleFileSelect" />
          <SelectPicture ref="selectPictureRef" @select="handleFileSelect" />
        </div>
      </div>

      <!-- Section Title -->
      <div class="mb-4 flex items-center gap-2">
        <span class="text-xl">New Photos</span>
        <div class="h-1 bg-black flex-grow rounded-full" />
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="text-center py-8">
        <p>読み込み中...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <p class="text-red-500">{{ error }}</p>
        <button
          class="mt-4 bg-oki-blue border-2 border-black rounded-full px-6 py-2 shadow-pop btn-press"
          @click="loadPhotos"
        >
          再読み込み
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="photos.length === 0" class="text-center py-8">
        <p class="text-lg mb-4">まだ写真がありません</p>
        <button
          class="inline-block bg-oki-yellow border-2 border-black rounded-full px-6 py-2 shadow-pop btn-press"
          @click="selectPictureRef?.open()"
        >
          最初の写真を投稿する
        </button>
      </div>

      <!-- Photo Grid -->
      <div v-else class="grid grid-cols-2 gap-4">
        <div
          v-for="(photo, index) in photos"
          :key="photo.photoId"
          class="bg-white border-2 border-black rounded-2xl p-2 shadow-pop"
          :class="[getRotation(index), index % 3 === 1 ? 'mt-4' : '']"
        >
          <div
            class="bg-gray-200 aspect-square rounded-xl mb-2 overflow-hidden border border-black relative"
          >
            <img
              :src="photo.url"
              :alt="'Photo by ' + photo.tableId"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <button
              v-if="canDeletePhoto(photo.tableId)"
              class="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full border border-black flex items-center justify-center text-xs"
              @click="handleDelete(photo)"
            >
              🗑️
            </button>
            <span
              class="absolute top-1 left-1 text-xs px-2 py-0.5 rounded-full border border-black bg-gray-200"
              :class="getTableColor(photo.tableId)"
            >
              {{ photo.tableId === authState.payload?.tableId ? 'Me' : '' }}
            </span>
          </div>
          <div class="flex justify-end items-center px-1">
            <button
              class="hover:scale-110 transition"
              :class="photo.likes > 0 ? 'text-red-500' : 'text-gray-400'"
              @click="handleLike(photo)"
            >
              {{ photo.likes > 0 ? '❤️' : '♡' }} {{ photo.likes }}
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Bottom Navigation -->
    <FooterNavigation />

    <!-- Upload Preview Modal -->
    <UploadPreviewModal
      v-if="previewUrl"
      :preview-url="previewUrl"
      :is-uploading="isUploading"
      :upload-progress="uploadProgress"
      :upload-error="uploadError"
      @upload="handleUpload"
      @cancel="clear"
    />
  </div>
</template>

<style scoped>
.btn-press:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0px 0px rgba(0, 0, 0, 1);
}
</style>

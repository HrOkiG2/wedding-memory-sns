<script setup lang="ts">
import type { Photo } from '~/types';

definePageMeta({
  middleware: 'auth',
});

const { canDeletePhoto } = useAuth();
const { fetchPhotos, deletePhoto, likePhoto } = useApi();

const photos = ref<Photo[]>([]);
const isLoading = ref(true);
const error = ref('');

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
</script>

<template>
  <div class="feed-page">
    <header class="header">
      <h1>Photos</h1>
      <NuxtLink to="/upload" class="upload-btn">+</NuxtLink>
    </header>

    <div v-if="isLoading" class="loading">
      <p>読み込み中...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="loadPhotos">再読み込み</button>
    </div>

    <div v-else-if="photos.length === 0" class="empty">
      <p>まだ写真がありません</p>
      <NuxtLink to="/upload" class="upload-link">最初の写真を投稿する</NuxtLink>
    </div>

    <div v-else class="photo-grid">
      <div v-for="photo in photos" :key="photo.photoId" class="photo-card">
        <img :src="photo.url" :alt="'Photo by ' + photo.tableId" loading="lazy" />
        <div class="photo-actions">
          <button class="like-btn" @click="handleLike(photo)">
            ♥ {{ photo.likes }}
          </button>
          <button
            v-if="canDeletePhoto(photo.tableId)"
            class="delete-btn"
            @click="handleDelete(photo)"
          >
            🗑️
          </button>
        </div>
        <div class="photo-meta">
          <span>{{ photo.tableId }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feed-page {
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
  position: sticky;
  top: 0;
  z-index: 10;
}

.header h1 {
  font-size: 1.25rem;
  margin: 0;
}

.upload-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #007bff;
  color: white;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.loading,
.error,
.empty {
  text-align: center;
  padding: 2rem;
}

.error button,
.upload-link {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 0.5rem;
  text-decoration: none;
  display: inline-block;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  padding: 1rem;
}

.photo-card {
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.photo-card img {
  width: 100%;
  height: 300px;
  object-fit: cover;
}

.photo-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
}

.like-btn,
.delete-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}

.like-btn {
  background: #ffe0e0;
  color: #dc3545;
}

.delete-btn {
  background: #f0f0f0;
}

.photo-meta {
  padding: 0.5rem;
  font-size: 0.875rem;
  color: #666;
  border-top: 1px solid #eee;
}
</style>

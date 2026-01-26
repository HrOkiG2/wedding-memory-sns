<script setup lang="ts">
import type { Photo } from '~/types';

definePageMeta({
  middleware: 'auth',
});

const { fetchSlideshowPhotos } = useApi();

const photos = ref<Photo[]>([]);
const currentIndex = ref(0);
const isLoading = ref(true);

// Slideshow settings
const SLIDE_INTERVAL = 5000; // 5 seconds per photo
const POLL_INTERVAL = 30000; // 30 seconds to fetch new photos

let slideTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const currentPhoto = computed(() => photos.value[currentIndex.value]);

const loadPhotos = async () => {
  try {
    const response = await fetchSlideshowPhotos();
    // Merge new photos, avoiding duplicates
    const existingIds = new Set(photos.value.map((p) => p.photoId));
    const newPhotos = response.photos.filter((p) => !existingIds.has(p.photoId));
    if (newPhotos.length > 0) {
      photos.value = [...photos.value, ...newPhotos];
    }
  } catch (e) {
    console.error('Failed to load photos:', e);
  } finally {
    isLoading.value = false;
  }
};

const nextSlide = () => {
  if (photos.value.length === 0) return;
  currentIndex.value = (currentIndex.value + 1) % photos.value.length;
};

const startSlideshow = () => {
  // Clear existing timers
  if (slideTimer) clearInterval(slideTimer);
  if (pollTimer) clearInterval(pollTimer);

  // Start slide rotation
  slideTimer = setInterval(nextSlide, SLIDE_INTERVAL);

  // Start polling for new photos
  pollTimer = setInterval(loadPhotos, POLL_INTERVAL);
};

onMounted(async () => {
  await loadPhotos();
  startSlideshow();
});

onUnmounted(() => {
  if (slideTimer) clearInterval(slideTimer);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="slideshow-page">
    <div v-if="isLoading" class="loading">
      <p>読み込み中...</p>
    </div>

    <div v-else-if="photos.length === 0" class="empty">
      <p>まだ写真がありません</p>
      <p class="hint">写真が投稿されるとここに表示されます</p>
    </div>

    <div v-else class="slideshow">
      <transition name="fade" mode="out-in">
        <div :key="currentPhoto?.photoId" class="slide">
          <img :src="currentPhoto?.url" :alt="'Photo by ' + currentPhoto?.tableId" />
          <div class="slide-info">
            <span class="table-name">{{ currentPhoto?.tableId }}</span>
            <span class="likes">♥ {{ currentPhoto?.likes }}</span>
          </div>
        </div>
      </transition>

      <div class="progress-dots">
        <span
          v-for="(_, index) in photos"
          :key="index"
          :class="['dot', { active: index === currentIndex }]"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.slideshow-page {
  min-height: 100vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading,
.empty {
  color: white;
  text-align: center;
}

.hint {
  font-size: 0.875rem;
  color: #888;
  margin-top: 0.5rem;
}

.slideshow {
  width: 100%;
  height: 100vh;
  position: relative;
}

.slide {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slide img {
  max-width: 100%;
  max-height: 100vh;
  object-fit: contain;
}

.slide-info {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.7);
  padding: 0.75rem 1.5rem;
  border-radius: 2rem;
  color: white;
}

.table-name {
  font-weight: bold;
}

.likes {
  color: #ff6b6b;
}

.progress-dots {
  position: absolute;
  bottom: 5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.5rem;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transition: background 0.3s ease;
}

.dot.active {
  background: white;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

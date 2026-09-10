<script setup lang="ts">
import FooterNavigation from '~/components/FooterNavigation.vue';
import type { Photo } from '~/types';

definePageMeta({
  middleware: 'auth',
});

const { fetchSlideshowPhotos } = useApi();
const { theme } = useTheme();

// テーマごとの飾り絵文字（南国のハート💕 / 葉っぱ🌿）
const decorEmoji = computed(() => (theme.value === 'botanical' ? '🌿' : '💕'));

const photos = ref<Photo[]>([]);
const currentIndex = ref(0);
const isLoading = ref(true);
const isFlipped = ref(false); // 対角線の位置を切り替え

// Slideshow settings
const SLIDE_INTERVAL = 5000; // 5 seconds
const POLL_INTERVAL = 30000; // 30 seconds to fetch new photos

let slideTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// 直近で取得済みの写真のうち最新のcreatedAt。次回ポーリング時にsinceとして渡し、
// それ以降に追加された写真だけを取得することで、写真が増えても
// ポーリング1回あたりの転送量を一定に保つ。
let lastSeenCreatedAt: string | null = null;

// PC用: 2枚の写真
const photo1 = computed(() => photos.value[currentIndex.value]);
const photo2 = computed(() => {
  if (photos.value.length < 2) return null;
  return photos.value[(currentIndex.value + 1) % photos.value.length];
});

const loadPhotos = async () => {
  try {
    const response = await fetchSlideshowPhotos(lastSeenCreatedAt ?? undefined);
    const existingIds = new Set(photos.value.map((p) => p.photoId));
    const newPhotos = response.photos.filter((p) => !existingIds.has(p.photoId));
    if (newPhotos.length > 0) {
      photos.value = [...photos.value, ...newPhotos];
    }
    for (const photo of response.photos) {
      if (!lastSeenCreatedAt || photo.createdAt > lastSeenCreatedAt) {
        lastSeenCreatedAt = photo.createdAt;
      }
    }
  } catch (e) {
    console.error('Failed to load photos:', e);
  } finally {
    isLoading.value = false;
  }
};

const nextSlide = () => {
  if (photos.value.length === 0) return;
  // 対角線位置を切り替え
  isFlipped.value = !isFlipped.value;
  // 2枚ずつ進める（PCモード用）、1枚しかない場合は1枚ずつ
  const step = photos.value.length >= 2 ? 2 : 1;
  currentIndex.value = (currentIndex.value + step) % photos.value.length;
};

const startSlideshow = () => {
  if (slideTimer) clearInterval(slideTimer);
  if (pollTimer) clearInterval(pollTimer);

  slideTimer = setInterval(nextSlide, SLIDE_INTERVAL);
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
  <section class="min-h-screen bg-oki-sand">
    <!-- Header -->
    <header class="bg-oki-surface border-b-theme-lg border-oki-border p-4 flex items-center justify-center relative">
      <h1 class="font-heading text-xl font-bold">Photo Slideshow</h1>
    </header>

    <!-- Main Content -->
    <main class="p-4 pb-24 min-h-[calc(100vh-140px)]">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="text-6xl mb-4 animate-bounce">📷</div>
          <p class="text-xl font-bold">読み込み中...</p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="photos.length === 0" class="flex items-center justify-center h-full">
        <div class="bg-oki-surface border-theme-lg border-oki-border rounded-3xl p-8 shadow-pop-card max-w-sm mx-auto text-center">
          <div class="text-6xl mb-4">📭</div>
          <p class="text-xl font-bold mb-2">まだ写真がありません</p>
          <p class="text-gray-500">写真が投稿されると<br/>ここに表示されます</p>
        </div>
      </div>

      <!-- Slideshow -->
      <div v-else class="h-full">
        <!-- 会場スクリーン用: 画面幅に関わらず常に2枚配置 (対角線) -->
        <div class="relative h-[calc(100vh-200px)]">
          <transition name="slide-diagonal" mode="out-in">
            <div :key="currentIndex + '-' + isFlipped" class="absolute inset-0">
              <!-- Photo 1 -->
              <div
                class="photo-card absolute w-[45%] transition-all duration-700"
                :class="isFlipped ? 'top-4 left-4 rotate-[-3deg]' : 'top-4 right-4 rotate-[3deg]'"
              >
                <div class="bg-oki-surface border-theme-lg border-oki-border rounded-3xl p-3 shadow-pop-card">
                  <div class="bg-black rounded-2xl overflow-hidden border-theme border-oki-border aspect-[4/3]">
                    <img
                      :src="photo1?.url"
                      :alt="'Photo by ' + photo1?.tableId"
                      class="w-full h-full object-contain"
                    />
                  </div>
                  <div class="mt-3 flex items-center justify-end">
                    <div class="flex items-center gap-1 bg-oki-pink px-3 py-1 rounded-full border-theme border-oki-border">
                      <span>❤️</span>
                      <span class="font-bold">{{ photo1?.likes }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Photo 2 -->
              <div
                v-if="photo2"
                class="photo-card absolute w-[45%] transition-all duration-700"
                :class="isFlipped ? 'bottom-4 right-4 rotate-[2deg]' : 'bottom-4 left-4 rotate-[-2deg]'"
              >
                <div class="bg-oki-surface border-theme-lg border-oki-border rounded-3xl p-3 shadow-pop-card">
                  <div class="bg-black rounded-2xl overflow-hidden border-theme border-oki-border aspect-[4/3]">
                    <img
                      :src="photo2?.url"
                      :alt="'Photo by ' + photo2?.tableId"
                      class="w-full h-full object-contain"
                    />
                  </div>
                  <div class="mt-3 flex items-center justify-end">
                    <div class="flex items-center gap-1 bg-oki-pink px-3 py-1 rounded-full border-theme border-oki-border">
                      <span>❤️</span>
                      <span class="font-bold">{{ photo2?.likes }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>

          <!-- Decorations -->
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl opacity-20 pointer-events-none">
            {{ decorEmoji }}
          </div>

          <!-- Counter -->
          <div class="absolute bottom-2 left-1/2 -translate-x-1/2 text-center">
            <span class="bg-oki-surface px-4 py-2 rounded-full border-theme border-oki-border font-bold inline-block shadow-pop">
              {{ currentIndex + 1 }} / {{ photos.length }}
            </span>
          </div>
        </div>
      </div>
    </main>

    <FooterNavigation />
  </section>
</template>

<style scoped>
/* Diagonal slide transition */
.slide-diagonal-enter-active {
  animation: diagonal-in 0.6s ease-out;
}
.slide-diagonal-leave-active {
  animation: diagonal-out 0.4s ease-in;
}

@keyframes diagonal-in {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes diagonal-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.95);
  }
}

.photo-card {
  animation: float 3s ease-in-out infinite;
}

.photo-card:nth-child(2) {
  animation-delay: 1.5s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
</style>

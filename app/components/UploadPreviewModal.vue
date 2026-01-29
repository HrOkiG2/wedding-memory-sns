<script setup lang="ts">
defineProps<{
  previewUrl: string;
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string;
}>();

const emit = defineEmits<{
  upload: [];
  cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div
        class="bg-white border-4 border-black rounded-3xl max-w-md w-full overflow-hidden shadow-pop-card"
      >
        <!-- Preview Image -->
        <div class="aspect-square bg-black">
          <img :src="previewUrl" alt="Preview" class="w-full h-full object-contain" />
        </div>

        <!-- Progress Bar -->
        <div v-if="isUploading" class="p-4">
          <div class="bg-gray-200 rounded-full h-3 border border-black overflow-hidden">
            <div
              class="bg-oki-blue h-full transition-all duration-300"
              :style="{ width: uploadProgress + '%' }"
            />
          </div>
          <p class="text-center mt-2 font-bold">{{ uploadProgress }}%</p>
        </div>

        <!-- Error Message -->
        <div v-if="uploadError" class="px-4 py-2 bg-red-100 text-red-600 text-center font-bold">
          {{ uploadError }}
        </div>

        <!-- Actions -->
        <div v-if="!isUploading" class="grid grid-cols-2 gap-3 p-4">
          <button
            class="btn-press bg-gray-200 border-2 border-black rounded-2xl py-3 shadow-pop font-bold"
            @click="emit('cancel')"
          >
            キャンセル
          </button>
          <button
            class="btn-press bg-oki-blue border-2 border-black rounded-2xl py-3 shadow-pop font-bold"
            @click="emit('upload')"
          >
            投稿する
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.btn-press:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0px 0px rgba(0, 0, 0, 1);
}
</style>
<template>
  <div class="photo-detail">
    <img :src="photoUrl" class="main-image" />

    <button 
    :disabled="isDownloading"
    class="download-btn"
    @click="handleDownload"
    >
      <span v-if="isDownloading">保存準備中...</span>
      <span v-else>💾 写真を保存する</span>
    </button>
    
    <p class="hint">※iPhoneの方は「画像を保存」を選択してください</p>
  </div>
</template>

<script setup lang="ts">
import { downloadPhoto } from '~/composables/useImageDownload';

const props = defineProps<{ photoUrl: string }>();
const isDownloading = ref(false);

const handleDownload = async () => {
  isDownloading.value = true;
  await downloadPhoto(props.photoUrl, `wedding_${Date.now()}.jpg`);
  isDownloading.value = false;
};
</script>

<style scoped>
.download-btn {
  background: #333;
  color: white;
  padding: 10px 20px;
  border-radius: 30px;
  border: none;
  font-weight: bold;
  margin-top: 10px;
}
.hint {
  font-size: 12px;
  color: #666;
  margin-top: 5px;
}
</style>
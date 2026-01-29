<script setup lang="ts">
const emit = defineEmits<{
  select: [file: File];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const open = () => {
  inputRef.value?.click();
};

const handleChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (file) {
    emit('select', file);
  }

  // Reset input for re-selection
  input.value = '';
};

defineExpose({ open });
</script>

<template>
  <div>
    <input
      ref="inputRef"
      type="file"
      accept="image/jpeg,image/png,image/heic"
      hidden
      @change="handleChange"
    />
    <button
      type="button"
      class="btn-press bg-oki-pink text-white border-2 border-black rounded-2xl p-4 flex flex-col items-center justify-center shadow-pop w-full"
      @click="open"
    >
      <span class="text-3xl mb-1">📂</span>
      <span>選ぶ</span>
    </button>
  </div>
</template>

<style scoped>
.btn-press:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0px 0px rgba(0, 0, 0, 1);
}
</style>
<template>
  <Transition name="pop">
    <div v-if="props.visible" class="success-overlay" @click="close">
      <div class="content">
        <div class="icon-circle">
          ✨
        </div>
        <h1 class="title">Thank You!</h1>
        <div class="message">
          <p>写真は送信されました！</p>
            <p>この後スクリーンに表示されます</p>
        </div>
        <p class="tap-hint">(タップして閉じる)</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean
}>();

const emit = defineEmits(['close']);

const close = () => {
  emit('close');
};
</script>

<style scoped>
/* 全画面を覆うオーバーレイ */
.success-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  /* 結婚式の雰囲気に合わせたグラデーション（ピンク〜オレンジ） */
  background: linear-gradient(135deg, rgba(255, 126, 95, 0.95), rgba(254, 180, 123, 0.95));
  z-index: 99999; /* 最前面 */
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  backdrop-filter: blur(5px);
}

.content {
  color: white;
  padding: 20px;
}

/* アイコン（キラキラ） */
.icon-circle {
  font-size: 60px;
  background: white;
  width: 100px;
  height: 100px;
  line-height: 100px;
  border-radius: 50%;
  margin: 0 auto 20px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  animation: bounce 1s infinite;
}

.title {
  font-family: 'Futura', sans-serif; /* ポップで太いフォント */
  font-size: 42px;
  font-weight: 900;
  margin-bottom: 16px;
  text-shadow: 2px 2px 0px rgba(0,0,0,0.1);
  letter-spacing: 2px;
}

.message {
  font-size: 16px;
  font-weight: bold;
  line-height: 1.8;
  margin-bottom: 20px;
}

.tap-hint {
  font-size: 12px;
  opacity: 0.8;
  animation: blink 2s infinite;
}

/* アニメーション定義 */
@keyframes bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

@keyframes blink {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

/* VueのTransition設定 (ポップアップで現れる動き) */
.pop-enter-active,
.pop-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
<script setup>
/**
 * ============================================================================
 * 全屏粉蹄专注幻境 —— components/FocusVeil.vue（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 覆盖全屏的沉浸式专注层：粉蹄海星随呼吸动画缩放，中央大字倒计时。
 * 未开始 → 选时长；计时中 → 只显示倒计时与退出；结束 → 结算画面。
 * 全部逻辑在 core/focus，本组件只做展示。
 * ============================================================================
 */
import { computed } from 'vue'
import { useFocusState, enterFocus, exitFocus, FOCUS_PRESETS, fmtRemain } from '@/core/focus'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'finished'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const focus = useFocusState()

/** 开始计时 */
function start(minutes) {
  enterFocus(minutes)
}

/** 退出：结算（完成发奖/中途只记账），并上报结果给父层弹提示 */
function quit() {
  const result = exitFocus()
  visible.value = false
  emit('finished', result)
  const text = result.full
    ? `🧘 专注 ${result.minutes} 分钟完成！粉蹄奖励 2 枚金币～`
    : `🧘 本次专注 ${result.minutes} 分钟，已记入学习时长，下次坚持到最后有金币哦～`
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}
</script>

<template>
  <!-- 全屏幻境：盖过一切内容（z-index 最高档），ESC 感由"退出"按钮承担 -->
  <teleport to="body">
    <div v-if="visible" class="veil" role="dialog" aria-label="专注幻境">
      <!-- 呼吸中的粉蹄海星：纯 transform 动画（GPU 友好，不卡顿） -->
      <div class="veil__star" aria-hidden="true">🌊</div>
      <div class="veil__breathe" aria-hidden="true">⭐</div>

      <!-- 选时长 -->
      <div v-if="!focus.active" class="veil__setup">
        <h2>🧘 粉蹄专注幻境</h2>
        <p>进入幻境后只剩你和粉蹄，计时结束温柔唤你回来</p>
        <div class="veil__presets">
          <button v-for="p in FOCUS_PRESETS" :key="p.minutes" class="veil__preset" @click="start(p.minutes)">
            {{ p.label }}
          </button>
        </div>
        <button class="veil__quit veil__quit--ghost" @click="visible = false">暂不进入</button>
      </div>

      <!-- 计时中 -->
      <div v-else class="veil__running">
        <p class="veil__time">{{ fmtRemain(focus.remainSeconds) }}</p>
        <div class="veil__bar"><div class="veil__bar-fill" :style="{ width: focus.percent + '%' }"></div></div>
        <p class="veil__hint">已专注 {{ focus.percent }}% · 粉蹄陪你屏住呼吸</p>
        <button class="veil__quit" @click="quit">退出幻境</button>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
/* 幻境底色：品牌主色的深夜渐变，纯净不刺眼 */
.veil {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  background: linear-gradient(160deg, #dcefff 0%, #ffe6f2 100%);
  color: var(--color-text-primary);
}

/* 呼吸海星：4 秒一呼一吸，只有 transform 变化（不触发重排） */
.veil__star {
  font-size: 96px;
  animation: breathe 4s ease-in-out infinite;
}
.veil__breathe {
  position: absolute;
  font-size: 24px;
  opacity: 0.5;
  animation: breathe 4s ease-in-out infinite reverse;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}

.veil__setup { text-align: center; }
.veil__setup h2 { font-size: var(--font-size-lg); margin-bottom: var(--space-sm); }
.veil__setup p { color: var(--color-text-secondary); margin-bottom: var(--space-lg); }
.veil__presets { display: flex; gap: var(--space-md); justify-content: center; flex-wrap: wrap; }
.veil__preset {
  border: 2px solid var(--color-accent);
  background: #fff;
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}
.veil__preset:hover { background: var(--color-accent); color: #fff; transform: translateY(-2px); }

.veil__running { text-align: center; }
.veil__time { font-size: 72px; font-weight: bold; font-variant-numeric: tabular-nums; }
.veil__bar {
  width: 240px;
  height: 10px;
  margin: var(--space-md) auto;
  background: rgba(255, 255, 255, 0.7);
  border-radius: var(--radius-round);
  overflow: hidden;
}
.veil__bar-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 1s linear;
}
.veil__hint { color: var(--color-text-secondary); margin-bottom: var(--space-lg); }

.veil__quit {
  border: 2px solid var(--color-border);
  background: rgba(255, 255, 255, 0.8);
  border-radius: var(--radius-round);
  padding: var(--space-sm) var(--space-lg);
  cursor: pointer;
}
.veil__quit:hover { border-color: var(--color-accent); }
.veil__quit--ghost { margin-top: var(--space-lg); opacity: 0.8; }
</style>

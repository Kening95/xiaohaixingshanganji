<script setup>
/**
 * ============================================================================
 * 常识电台面板 —— components/RadioPanel.vue（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 悬浮插槽「🎧 常识电台」点开的小面板：
 *   · 三种模式：每日推送 / 薄弱定向 / 全板块循环（切换模式立即重排节目单）
 *   · 播放 / 暂停 / 下一条；收起面板后朗读继续（后台播放）
 *   · 收听计时：每满 10 分钟自动发 1 金币（每天封顶 3 枚），进度实时可见
 *
 * 面板收起后若还在播放，右下角会留一个迷你指示条，随时点回来。
 * 所有播放逻辑都在 core/radio/index.js，本组件只做展示和按钮。
 * ============================================================================
 */
import { computed, ref } from 'vue'
import { useRadioState, playRadio, pauseRadio, nextEpisode, stopRadio, RADIO_MODES } from '@/core/radio'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const radio = useRadioState()

/** 播放按钮：没在播 → 播；在播 → 暂停 */
function togglePlay() {
  if (radio.value.playing) pauseRadio()
  else playRadio(radio.value.mode)
}

/** 切换模式：立即用新模式重建队列播放 */
function switchMode(mode) {
  if (radio.value.playing) playRadio(mode)
  else {
    // 没播也切换模式，下次播放生效；这里直接起播体验更顺滑
    playRadio(mode)
  }
}

/** 秒 → 分:秒 */
function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <!-- 独立小面板：右下角浮层，不挡页面操作 -->
  <transition name="panel">
    <aside v-if="visible" class="radio-panel" role="dialog" aria-label="常识电台">
      <header class="radio-panel__head">
        <span class="radio-panel__title">🎧 粉蹄常识电台</span>
        <button class="radio-panel__close" title="收起（播放会继续）" @click="visible = false">—</button>
      </header>

      <!-- 语音引擎不支持时的友好兜底 -->
      <div v-if="!radio.supported" class="radio-panel__unsupported">
        <p>😢 当前浏览器不支持语音朗读（Web Speech API）</p>
        <p class="radio-panel__hint">换 Chrome / Edge 浏览器就能听啦</p>
      </div>

      <template v-else>
        <!-- 三种播放模式 -->
        <div class="radio-panel__modes">
          <button
            v-for="m in RADIO_MODES"
            :key="m.id"
            class="mode-btn"
            :class="{ active: radio.mode === m.id }"
            :title="m.desc"
            @click="switchMode(m.id)"
          >
            {{ m.name }}
          </button>
        </div>
        <p class="radio-panel__mode-desc">{{ RADIO_MODES.find((m) => m.id === radio.mode)?.desc }}</p>

        <!-- 当前节目 -->
        <div class="radio-panel__now" :class="{ playing: radio.playing }">
          <div class="radio-panel__disc">{{ radio.playing ? '🎵' : '🎧' }}</div>
          <div class="radio-panel__ep">
            <b>{{ radio.current?.title || '点下方按钮开始收听' }}</b>
            <p v-if="radio.current">{{ radio.current.text }}</p>
          </div>
        </div>

        <!-- 控制按钮 -->
        <div class="radio-panel__controls">
          <button class="ctrl-btn ctrl-btn--main" @click="togglePlay">
            {{ radio.playing ? '⏸ 暂停' : '▶ 播放' }}
          </button>
          <button class="ctrl-btn" :disabled="!radio.queue.length" @click="nextEpisode">⏭ 下一条</button>
          <button class="ctrl-btn" :disabled="!radio.playing" @click="stopRadio">⏹ 停止</button>
        </div>

        <!-- 收听计时与金币进度 -->
        <div class="radio-panel__progress">
          <div class="radio-panel__time">
            <span>累计收听 {{ fmtTime(radio.listenSeconds) }}</span>
            <span v-if="radio.playing">距下 1 金币 {{ fmtTime(radio.secondsToNextBlock) }}</span>
          </div>
          <div class="radio-panel__award-bar">
            <div
              class="radio-panel__award-fill"
              :style="{ width: (100 - radio.secondsToNextBlock / 600 * 100) + '%' }"
            ></div>
          </div>
          <p class="radio-panel__hint">
            每听满 10 分钟 +1 金币，今天还能领 {{ radio.awardLeft }} 枚
            <template v-if="!radio.awardLeft">（明天继续～）</template>
          </p>
        </div>
      </template>
    </aside>
  </transition>

  <!-- 面板收起但还在播：右下角迷你指示条，点一下 reopen -->
  <button
    v-if="!visible && radio.playing"
    class="radio-mini"
    title="电台播放中，点击打开面板"
    @click="visible = true"
  >
    🎵 电台播放中 · {{ radio.current?.title || '…' }}
  </button>
</template>

<style scoped>
/* ---------- 面板主体：右下角浮层卡片 ---------- */
.radio-panel {
  position: fixed;
  right: 16px;
  bottom: 96px; /* 让出右下角常驻粉蹄海星的位置 */
  width: 320px;
  background: var(--color-bg-card);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-float);
  padding: var(--space-md);
  z-index: 110;
}
.radio-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}
.radio-panel__title { font-weight: bold; }
.radio-panel__close {
  border: none;
  background: var(--color-primary);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  line-height: 1;
}
.radio-panel__close:hover { background: var(--color-primary-deep); }

/* 模式切换 */
.radio-panel__modes { display: flex; gap: var(--space-xs); }
.mode-btn {
  flex: 1;
  border: 2px solid var(--color-border);
  background: #fff;
  border-radius: var(--radius-round);
  padding: var(--space-xs) 0;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}
.mode-btn.active {
  border-color: var(--color-accent);
  background: #fff0e0;
  color: var(--color-accent-deep);
  font-weight: bold;
}
.radio-panel__mode-desc { font-size: 12px; color: var(--color-text-secondary); margin: 6px 0 var(--space-sm); }

/* 当前节目 */
.radio-panel__now {
  display: flex;
  gap: var(--space-sm);
  background: var(--color-bg-bubble);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  min-height: 88px;
}
.radio-panel__disc { font-size: 28px; }
/* 播放中：唱片轻轻旋转 */
.radio-panel__now.playing .radio-panel__disc {
  display: inline-block;
  animation: spin 3s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.radio-panel__ep b { font-size: var(--font-size-sm); }
.radio-panel__ep p {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 控制按钮 */
.radio-panel__controls { display: flex; gap: var(--space-sm); margin: var(--space-sm) 0; }
.ctrl-btn {
  flex: 1;
  border: 2px solid var(--color-border);
  background: #fff;
  border-radius: var(--radius-round);
  padding: var(--space-xs) 0;
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}
.ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ctrl-btn--main {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
  font-weight: bold;
}
.ctrl-btn--main:hover { background: var(--color-accent-deep); }

/* 计时与金币进度 */
.radio-panel__time {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.radio-panel__award-bar {
  height: 8px;
  background: var(--color-primary);
  border-radius: var(--radius-round);
  overflow: hidden;
  margin: 6px 0;
}
.radio-panel__award-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-deep));
  transition: width 1s linear; /* 与 1 秒计时心跳同步增长 */
}
.radio-panel__hint { font-size: 12px; color: var(--color-text-secondary); }
.radio-panel__unsupported { text-align: center; padding: var(--space-md) 0; }

/* 迷你指示条 */
.radio-mini {
  position: fixed;
  right: 16px;
  bottom: 96px;
  z-index: 110;
  border: 2px solid var(--color-accent);
  background: #fff7ec;
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  box-shadow: var(--shadow-float);
  cursor: pointer;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: bob 2s ease-in-out infinite; /* 轻轻跳动吸引注意 */
}
@keyframes bob { 50% { transform: translateY(-4px); } }

/* 面板出现/收起动画 */
.panel-enter-active, .panel-leave-active { transition: all var(--duration-base) var(--easing-soft); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateY(16px); }
</style>

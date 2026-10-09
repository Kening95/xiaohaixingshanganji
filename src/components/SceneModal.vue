<script setup>
/**
 * ============================================================================
 * 自定义背景弹窗 —— components/SceneModal.vue
 * ----------------------------------------------------------------------------
 * 让用户按自己的喜好改造主地图的背景：
 *   1. 渐变风景模式：6 个颜色选择器（天空×2 / 大海×2 / 沙滩×2）+ 太阳开关
 *   2. 图片模式：上传一张自己的图片铺满地图（自动压缩，不影响加载速度）
 *   所有修改即时生效并自动保存，下次打开自动恢复。
 *
 * 数据全部来自 core/scene 模块，本组件只负责"画设置界面"（分层解耦）。
 * 入口：左下角悬浮功能栏的「自定义背景」按钮（注册在 builtinSlots.js）。
 * ============================================================================
 */
import { computed, ref } from 'vue'
import { ElDialog, ElSwitch, ElButton } from 'element-plus'
import {
  useScene,
  setSceneColor,
  setSceneMode,
  setSceneImage,
  clearSceneImage,
  resetScene
} from '@/core/scene'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const scene = useScene()

function toast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/** 颜色条目清单：键名对应 core/scene 里 colors 的字段 */
const COLOR_ITEMS = [
  { key: 'skyLight', label: '天空 · 顶部' },
  { key: 'sky', label: '天空 · 渐深' },
  { key: 'seaLight', label: '大海 · 浅' },
  { key: 'sea', label: '大海 · 深' },
  { key: 'sand', label: '沙滩 · 上' },
  { key: 'sandDeep', label: '沙滩 · 下' }
]

/** 文件选择框（模板里用 ref 引用） */
const fileInput = ref(null)
/** 上传处理中（防止用户连点） */
const uploading = ref(false)

async function onPickFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 清空选择，允许重复选同一张图
  if (!file) return
  uploading.value = true
  try {
    await setSceneImage(file)
    toast('背景换好啦，看看效果～')
  } catch (error) {
    toast(error.message || '图片设置失败，请换一张试试')
  } finally {
    uploading.value = false
  }
}

function onRemoveImage() {
  clearSceneImage()
  toast('已换回渐变风景背景')
}

function onReset() {
  resetScene()
  toast('已恢复默认的蓝天白云大海沙滩')
}
</script>

<template>
  <el-dialog v-model="visible" width="520px">
    <template #header>
      <span class="scene__title">🎨 自定义背景 · 打造专属上岸风景</span>
    </template>

    <!-- 模式切换：渐变风景 / 我的图片 -->
    <div class="scene__modes" role="radiogroup" aria-label="背景模式">
      <button
        class="scene__mode"
        :class="{ 'scene__mode--active': scene.state.mode === 'gradient' }"
        @click="setSceneMode('gradient')"
      >
        🏖️ 渐变风景
      </button>
      <button
        class="scene__mode"
        :class="{ 'scene__mode--active': scene.state.mode === 'image' }"
        @click="setSceneMode('image')"
      >
        🖼️ 我的图片
      </button>
    </div>

    <!-- 渐变风景设置：6 个颜色选择器 + 太阳开关 -->
    <div v-if="scene.state.mode === 'gradient'" class="scene__section">
      <p class="scene__hint">点下面的色块调色，背景会立刻变化并自动保存：</p>
      <div class="scene__colors">
        <label v-for="item in COLOR_ITEMS" :key="item.key" class="scene__color-item">
          <input
            type="color"
            :value="scene.state.colors[item.key]"
            @input="setSceneColor(item.key, $event.target.value)"
          >
          <span>{{ item.label }}</span>
        </label>
      </div>
      <div class="scene__sun">
        <span>左上角太阳</span>
        <el-switch
          :model-value="scene.state.colors.sun"
          @change="setSceneColor('sun', $event)"
        />
      </div>
    </div>

    <!-- 图片背景设置：上传 / 预览 / 移除 -->
    <div v-else class="scene__section">
      <input ref="fileInput" type="file" accept="image/*" class="scene__file" @change="onPickFile">
      <div v-if="scene.state.image" class="scene__preview">
        <img :src="scene.state.image" alt="自定义背景预览">
      </div>
      <p class="scene__hint">
        {{ scene.state.image
          ? '当前使用的背景图（会自动压缩到 1600px 以内，只存在你自己的浏览器里）'
          : '选一张喜欢的图：风景照、爱豆、座右铭截图都可以～' }}
      </p>
      <div class="scene__actions">
        <el-button type="primary" :loading="uploading" @click="fileInput.click()">
          {{ scene.state.image ? '换一张图' : '选择图片' }}
        </el-button>
        <el-button v-if="scene.state.image" @click="onRemoveImage">移除图片</el-button>
      </div>
    </div>

    <!-- 底部：恢复默认 -->
    <div class="scene__footer">
      <el-button text type="warning" @click="onReset">↩️ 恢复默认风景</el-button>
    </div>
  </el-dialog>
</template>

<style scoped>
.scene__title {
  font-weight: bold;
  font-size: var(--font-size-lg);
}

/* 模式切换：两张大卡片，选中态高亮 */
.scene__modes {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.scene__mode {
  flex: 1;
  padding: var(--space-md);
  border: 2px solid var(--color-primary-darker);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  font-size: var(--font-size-lg);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}

.scene__mode:hover {
  transform: translateY(-2px);
}

/* 点击瞬间按压缩小（与全站点击动效一致） */
.scene__mode:active {
  transform: scale(0.96);
}

.scene__mode--active {
  border-color: var(--color-accent);
  background: #fff0e0;
  box-shadow: var(--shadow-card);
}

.scene__section {
  margin-bottom: var(--space-md);
}

.scene__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-md);
}

/* 颜色选择器网格：每格 = 圆形色块 + 文字 */
.scene__colors {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
}

.scene__color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.scene__color-item input[type='color'] {
  width: 44px;
  height: 44px;
  border: 2px solid var(--color-primary-darker);
  border-radius: var(--radius-round);
  padding: 2px;
  background: var(--color-bg-card);
  cursor: pointer;
  transition: transform var(--duration-base) var(--easing-soft);
}

.scene__color-item input[type='color']:hover {
  transform: scale(1.1);
}

/* 太阳开关行 */
.scene__sun {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-lg);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-primary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
}

/* 隐藏的原生文件框（用按钮触发） */
.scene__file {
  display: none;
}

/* 图片预览 */
.scene__preview {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid var(--color-primary-darker);
  margin-bottom: var(--space-md);
  max-height: 180px;
}

.scene__preview img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.scene__actions {
  display: flex;
  gap: var(--space-sm);
}

.scene__footer {
  text-align: center;
  border-top: 1px dashed var(--color-primary-darker);
  padding-top: var(--space-sm);
}
</style>

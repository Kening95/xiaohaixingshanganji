/**
 * ============================================================================
 * 自定义背景 —— core/scene/index.js
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   主地图页那幅"蓝天白云 + 大海沙滩"的风景背景，默认是写死在 CSS 里的
 *   渐变配色。这个模块让用户可以按自己的喜好改造它：
 *
 *     1. 渐变模式：自由调整天空 / 大海 / 沙滩的 6 个颜色 + 太阳开关
 *     2. 图片模式：上传一张自己的图片（如喜欢的风景照）铺满地图背景，
 *        上传的图片会自动压缩（最长边 1600px），不会拖慢页面
 *
 * 工作原理（小白版）：
 *   背景颜色在 CSS 里是一组变量（--scene-sky 等）。这个模块做的事就是：
 *   用户改了颜色 → 把新颜色写回这些变量 → 背景立刻变化；
 *   同时存进 localStorage，下次打开自动恢复。
 *
 * 与其他模块的关系：
 *   · MapView.vue 只负责"用变量画背景"，不关心变量值从哪来（分层解耦）
 *   · 隐私清空会删掉 'fenti-scene-v1'，背景一并恢复默认（属于个人数据）
 * ============================================================================
 */
import { computed, reactive, readonly } from 'vue'

/** localStorage 存档键 */
const STORAGE_KEY = 'fenti-scene-v1'

/** 图片最长边：超过就等比缩小，防止大图把 localStorage 撑爆 */
const IMAGE_MAX_EDGE = 1600

/** 风景背景默认值（与 tokens.css / MapView.vue 里的初始配色保持一致） */
const DEFAULT_COLORS = {
  skyLight: '#e6f4ff', // 天空（顶部，最浅）
  sky: '#a9dcff',      // 天空（往下渐深）
  seaLight: '#bfe6f7', // 海面（靠天空一侧，浅）
  sea: '#5fb4dd',      // 大海（中间横带，最深）
  sand: '#ffe9c2',     // 沙滩（上部）
  sandDeep: '#ffd9a0', // 沙滩（底部，渐深）
  sun: true            // 是否显示左上角的太阳
}

/** 背景设置（响应式仓库）：mode = gradient 渐变风景 / image 自定义图片 */
const state = reactive({
  mode: 'gradient',
  colors: { ...DEFAULT_COLORS },
  image: null // 压缩后的图片 dataURL，null = 没设过图片
})

/* ---------------- 存档读写 ---------------- */

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: state.mode,
      colors: state.colors,
      image: state.image
    }))
  } catch (error) {
    // 图片太大存不下时给用户明确提示，而不是静默失败
    console.error('[scene] 背景设置存档失败：', error)
    window.dispatchEvent(new CustomEvent('fenti:toast', {
      detail: { text: '背景图片太大了，存不进浏览器，请换一张小一点的图～' }
    }))
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.mode === 'gradient' || data.mode === 'image') state.mode = data.mode
    if (data.colors) state.colors = { ...DEFAULT_COLORS, ...data.colors }
    if (typeof data.image === 'string') state.image = data.image
  } catch (error) {
    console.error('[scene] 读取背景存档失败，使用默认风景：', error)
  }
}

/* ---------------- 应用与导出 ---------------- */

/** 把当前设置写到 CSS 变量上，背景立即生效 */
function apply() {
  const root = document.documentElement
  root.style.setProperty('--scene-sky-light', state.colors.skyLight)
  root.style.setProperty('--scene-sky', state.colors.sky)
  root.style.setProperty('--scene-sea-light', state.colors.seaLight)
  root.style.setProperty('--scene-sea', state.colors.sea)
  root.style.setProperty('--scene-sand', state.colors.sand)
  root.style.setProperty('--scene-sand-deep', state.colors.sandDeep)
  // 太阳用一层径向渐变画，关掉时把颜色设成全透明即可，不用改结构
  root.style.setProperty('--scene-sun', state.colors.sun ? 'rgba(255, 246, 205, 0.95)' : 'rgba(255, 246, 205, 0)')
}

/**
 * 地图画布要用的内联样式（图片模式时返回背景图样式，渐变模式返回 null）。
 * MapView.vue 直接绑定这个值，自己不用判断模式。
 */
const canvasStyle = computed(() => {
  if (state.mode !== 'image' || !state.image) return null
  return {
    backgroundImage: `url(${state.image})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})

/** 是否图片模式（MapView 用它切换 class，关掉海面细波装饰） */
const isImageMode = computed(() => state.mode === 'image' && !!state.image)

/** 供组件使用的只读状态 */
export function useScene() {
  return {
    state: readonly(state),
    canvasStyle,
    isImageMode
  }
}

/** 修改某一个风景颜色（key 为 DEFAULT_COLORS 的键名） */
export function setSceneColor(key, value) {
  if (!(key in DEFAULT_COLORS)) return
  state.colors[key] = value
  apply()
  save()
}

/** 切换背景模式：'gradient' 渐变风景 / 'image' 自定义图片 */
export function setSceneMode(mode) {
  state.mode = mode
  save()
}

/** 移除自定义图片（回到渐变风景模式） */
export function clearSceneImage() {
  state.image = null
  state.mode = 'gradient'
  save()
}

/**
 * 上传图片并设为背景。
 * 会自动压缩：最长边超过 1600px 就等比缩小，转 JPEG，兼顾清晰度与存储空间。
 * @param {File} file 用户选择的图片文件
 * @returns {Promise<void>}
 */
export function setSceneImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        // 计算压缩后的尺寸（等比，只缩不放）
        const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        state.image = canvas.toDataURL('image/jpeg', 0.85)
        state.mode = 'image'
        save()
        resolve()
      }
      img.onerror = () => reject(new Error('图片读取失败，请换一张试试'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('图片读取失败，请换一张试试'))
    reader.readAsDataURL(file)
  })
}

/** 恢复默认风景背景 */
export function resetScene() {
  state.mode = 'gradient'
  state.colors = { ...DEFAULT_COLORS }
  state.image = null
  apply()
  save()
}

/* ---------------- 启动即恢复 ----------------
 * 模块被引入时立刻读取存档并应用：刷新页面后用户自定义的背景不丢失。
 */
load()
apply()

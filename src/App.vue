<script setup>
/**
 * 根组件 —— App.vue
 * ----------------
 * 所有页面都挂在 <router-view /> 里。
 * 相当于一个相框：相框本身不变，里面装哪张"画"（页面）由路由决定。
 *
 * 这里还放了全站通用的三个骨架元素：
 *   1. 悬浮功能插槽入口（FloatingDock）——任何页面都能用，全时间段开放
 *   2. 全局轻提示（toast）——悬浮入口等全局组件点击后通过
 *      `fenti:toast` 事件把文案发到这里统一弹出，任何页面都有反馈
 *   3. 粉蹄扫题弹窗（ScanModal）——悬浮按钮广播 `fenti:open-scan` 时唤起，
 *      挂在 App 层是为了任何页面都能打开它
 *   4. 常识电台面板（RadioPanel）——悬浮耳机广播 `fenti:open-radio` 时唤起，
 *      收起面板后朗读继续（后台播放，第 5 阶段）
 *   4. 粉蹄海星组件（FtAvatar）常驻右下角，作为陪学 IP 的雏形
 *      （主地图页有自己的大海星 + 互动逻辑，为避免重复，该页隐藏全局这只）
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import FloatingDock from '@/core/floatingSlot/FloatingDock.vue'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'
import ScanModal from '@/components/ScanModal.vue'
import RadioPanel from '@/components/RadioPanel.vue'
import TeamRoomModal from '@/components/TeamRoomModal.vue'
import FocusVeil from '@/components/FocusVeil.vue'
import ShopModal from '@/components/ShopModal.vue'
import WallpaperModal from '@/components/WallpaperModal.vue'
import SceneModal from '@/components/SceneModal.vue'
import LoginModal from '@/components/LoginModal.vue'
import { useGamification } from '@/core/gamification'

const route = useRoute()
// 主地图页自己渲染陪学海星，全局这只就让位，避免一屏两只海星
const showGlobalStar = computed(() => route.path !== '/map')

/**
 * 体重视觉联动：粉蹄越瘦，常驻海星越苗条。
 * （与地图页同一条公式：200 斤 → 1.0 倍，100 斤 → 0.85 倍）
 */
const game = useGamification()
const starScale = computed(() => 1 - Math.min(0.15, Math.max(0, (200 - game.weight) / 100 * 0.15)))

/* ---------------- 粉蹄扫题弹窗（全局唤起） ----------------
 * 任何页面点悬浮"粉蹄扫题"都会广播 'fenti:open-scan'，这里统一打开弹窗。
 */
const scanOpen = ref(false)
/** 常识电台面板：同样全局唤起（任何页面点悬浮耳机都能打开） */
const radioOpen = ref(false)
/** 第 6 阶段：结伴房 / 专注幻境 / 商店 / 壁纸，全部全局唤起 */
const teamOpen = ref(false)
const focusOpen = ref(false)
const shopOpen = ref(false)
const wallpaperOpen = ref(false)
const sceneOpen = ref(false)
/** 第 7 阶段：登录浮层，全局唤起（个人中心 / 任何页面广播 fenti:open-login） */
const loginOpen = ref(false)

function onOpenScan() {
  scanOpen.value = true
}
function onOpenRadio() {
  radioOpen.value = true
}
function onOpenTeam() { teamOpen.value = true }
function onOpenFocus() { focusOpen.value = true }
function onOpenShop() { shopOpen.value = true }
function onOpenWallpaper() { wallpaperOpen.value = true }
function onOpenScene() { sceneOpen.value = true }
function onOpenLogin() { loginOpen.value = true }

onMounted(() => {
  window.addEventListener('fenti:toast', onGlobalToast)
  window.addEventListener('fenti:open-scan', onOpenScan)
  window.addEventListener('fenti:open-radio', onOpenRadio)
  window.addEventListener('fenti:open-team', onOpenTeam)
  window.addEventListener('fenti:open-focus', onOpenFocus)
  window.addEventListener('fenti:open-shop', onOpenShop)
  window.addEventListener('fenti:open-wallpaper', onOpenWallpaper)
  window.addEventListener('fenti:open-scene', onOpenScene)
  window.addEventListener('fenti:open-login', onOpenLogin)
})
onUnmounted(() => {
  window.removeEventListener('fenti:toast', onGlobalToast)
  window.removeEventListener('fenti:open-scan', onOpenScan)
  window.removeEventListener('fenti:open-radio', onOpenRadio)
  window.removeEventListener('fenti:open-team', onOpenTeam)
  window.removeEventListener('fenti:open-focus', onOpenFocus)
  window.removeEventListener('fenti:open-shop', onOpenShop)
  window.removeEventListener('fenti:open-wallpaper', onOpenWallpaper)
  window.removeEventListener('fenti:open-scene', onOpenScene)
  window.removeEventListener('fenti:open-login', onOpenLogin)
  clearTimeout(toastTimer)
})

/* ---------------- 全局轻提示 toast ----------------
 * 全站任何角落都可以通过下面的代码弹提示，页面自己不用写弹窗逻辑：
 *   window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text: '提示内容' } }))
 * 目前使用方：core/floatingSlot/builtinSlots.js 里的扫题 / 电台占位入口。
 */
const toast = ref({ show: false, text: '' })
let toastTimer = null

function onGlobalToast(event) {
  toast.value = { show: true, text: event.detail?.text ?? '' }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value.show = false }, 2500)
}
</script>

<template>
  <!-- 页面内容：由路由决定显示哪个页面 -->
  <router-view />

  <!-- 全站悬浮功能插槽：新功能直接 registerFloatingSlot() 注册即可挂载到这里 -->
  <FloatingDock />

  <!-- 全局轻提示：固定顶部居中，2.5 秒后自动消失 -->
  <transition name="toast">
    <div v-if="toast.show" class="app-toast" role="status">{{ toast.text }}</div>
  </transition>

  <!-- 粉蹄扫题弹窗：全局唤起（悬浮按钮 / 错题本入口共用） -->
  <ScanModal v-model="scanOpen" />

  <!-- 常识电台面板：全局唤起（第 5 阶段），收起后播放继续 -->
  <RadioPanel v-model="radioOpen" />

  <!-- 第 6 阶段：结伴房 / 专注幻境 / 金币商店 / 幸运壁纸，全部全局唤起 -->
  <TeamRoomModal v-model="teamOpen" />
  <FocusVeil v-model="focusOpen" />
  <ShopModal v-model="shopOpen" />
  <WallpaperModal v-model="wallpaperOpen" />

  <!-- 自定义背景设置：全局唤起（悬浮栏 🎨 按钮） -->
  <SceneModal v-model="sceneOpen" />

  <!-- 登录浮层（第 7 阶段）：全局唤起 -->
  <LoginModal v-model="loginOpen" />

  <!-- 常驻粉蹄海星：日常陪伴状态，后续阶段会接入交互逻辑 -->
  <FtAvatar v-if="showGlobalStar" state="idle" :size="Math.round(72 * starScale)" class="app-ft" />
</template>

<style scoped>
/* 常驻海星固定在右下角，不遮挡主要内容 */
.app-ft {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90; /* 浮在普通内容之上，但低于弹窗 */
}

/* 全局轻提示：顶部居中浮层 */
.app-toast {
  position: fixed;
  top: 76px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 80vw;
  background: var(--color-bg-bubble);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  box-shadow: var(--shadow-float);
  z-index: 120; /* 浮在所有页面内容之上 */
}

/* 提示出现/消失的淡入淡出 */
.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--duration-base) var(--easing-soft);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}
</style>

/**
 * ============================================================================
 * 内置悬浮入口 —— core/floatingSlot/builtinSlots.js
 * ----------------------------------------------------------------------------
 * 这里注册"全时间段开放"的两个内置悬浮功能：
 *
 *   📷 粉蹄扫题   —— 拍照识别题目（第 4 阶段接入真实面板）
 *   🎧 常识电台   —— 常识语音电台（第 5 阶段接入真实面板）
 *
 * 为什么放在单独的文件里，而不是某个页面？
 *   需求要求这两个功能"全时间段开放"——用户在引导页、地图页、关卡页、
 *   以及后续所有新页面里，随时随地都能点到它们。
 *   而注册在单个页面（如 MapView）里的插槽，离开那个页面就会被注销。
 *   所以这里在模块被引入的那一刻注册一次，整个 App 生命周期内都有效，
 *   与当前在哪个页面完全无关。
 *
 * 点击反馈怎么传给页面？
 *   通过全局自定义事件广播（App.vue 统一监听）：
 *     · 📷 粉蹄扫题 → 'fenti:open-scan'：唤起扫题弹窗（第 4 阶段已实现）
 *     · 🎧 常识电台 → 'fenti:open-radio'：唤起电台面板（第 5 阶段已实现）
 *   任何页面点击都有反馈，且页面代码零改动。
 *
 * 使用方式（main.js 里已引入，无需手动调用）：
 *   import '@/core/floatingSlot/builtinSlots'
 * ============================================================================
 */
import { registerFloatingSlot } from './index'

/**
 * 唤起粉蹄扫题弹窗。
 * 弹窗本体（ScanModal）挂在 App.vue 层监听本事件，
 * 所以悬浮按钮在任何页面点都能唤起，不需要页面各自处理。
 */
function openScanModal() {
  window.dispatchEvent(new CustomEvent('fenti:open-scan'))
}

registerFloatingSlot({
  id: 'scan',
  title: '粉蹄扫题',
  icon: '📷',
  order: 10,
  onClick: openScanModal
})

registerFloatingSlot({
  id: 'radio',
  title: '常识电台',
  icon: '🎧',
  order: 20,
  onClick: () => window.dispatchEvent(new CustomEvent('fenti:open-radio')) // 第 5 阶段已接入真实面板
})

/* ---------------- 第 6 阶段：趣味附加功能（全部全时段开放） ---------------- */

registerFloatingSlot({
  id: 'team',
  title: '猪队友',
  icon: '🐷',
  order: 30,
  onClick: () => window.dispatchEvent(new CustomEvent('fenti:open-team'))
})

registerFloatingSlot({
  id: 'focus',
  title: '专注幻境',
  icon: '🧘',
  order: 40,
  onClick: () => window.dispatchEvent(new CustomEvent('fenti:open-focus'))
})

registerFloatingSlot({
  id: 'wallpaper',
  title: '幸运壁纸',
  icon: '🖼️',
  order: 50,
  onClick: () => window.dispatchEvent(new CustomEvent('fenti:open-wallpaper'))
})

registerFloatingSlot({
  id: 'scene',
  title: '自定义背景',
  icon: '🎨',
  order: 60,
  onClick: () => window.dispatchEvent(new CustomEvent('fenti:open-scene'))
})

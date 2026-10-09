/**
 * ============================================================================
 * 预留扩展接口 ①：悬浮功能插槽接口 —— core/floatingSlot/index.js
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   主页面右下角的"悬浮按钮停靠栏"。需求清单里规划了粉蹄扫题、语音电台、
 *   结伴闯关房等多个悬浮入口，如果每个功能都手动往页面里塞按钮，
 *   页面代码会越改越乱。
 *
 *   这个接口把停靠栏做成一个"注册表"：
 *   以后每做一个新功能，只需要调用一次 registerFloatingSlot() 注册自己，
 *   按钮会自动出现在悬浮栏里，【完全不需要改动主页面代码】。
 *
 * 新功能接入示例（照抄改改就能用）：
 *   import { registerFloatingSlot } from '@/core/floatingSlot'
 *
 *   registerFloatingSlot({
 *     id: 'scan',                    // 唯一标识，不能和别人重复
 *     title: '粉蹄扫题',              // 鼠标悬停显示的提示文字
 *     icon: '📷',                    // 按钮图标（Emoji 或图片地址都行）
 *     order: 10,                     // 排序，数字越小越靠上
 *     onClick: () => { 打开扫题面板() }  // 点击后要做什么
 *   })
 * ============================================================================
 */
import { reactive, readonly } from 'vue'

/**
 * 已注册的悬浮插槽列表（响应式）。
 * 用 reactive 包裹：注册新插槽后，悬浮栏会自动重新渲染，无需手动刷新。
 */
const state = reactive({
  slots: []
})

/**
 * 注册一个悬浮功能入口。
 * @param {Object} slot 插槽配置，字段说明见上方注释
 * @returns {Function} 返回一个"注销函数"，调用它可移除该入口（功能下线时用）
 */
export function registerFloatingSlot(slot) {
  // ---- 参数校验：宁可启动时报错，也不要让错误埋到用户点击时才爆炸 ----
  if (!slot.id || typeof slot.id !== 'string') {
    throw new Error('[floatingSlot] 注册失败：必须提供字符串类型的 id')
  }
  if (state.slots.some((item) => item.id === slot.id)) {
    console.warn(`[floatingSlot] id 为 "${slot.id}" 的插槽已存在，本次注册被忽略`)
    return () => {}
  }
  if (typeof slot.onClick !== 'function') {
    throw new Error(`[floatingSlot] 插槽 "${slot.id}" 缺少 onClick 回调函数`)
  }

  // 补全默认值后存入列表
  state.slots.push({
    title: '',
    icon: '✨',
    order: 100,
    ...slot
  })
  // 每次注册后按 order 排序，保证显示顺序稳定
  state.slots.sort((a, b) => a.order - b.order)

  console.log(`[floatingSlot] ✅ 悬浮入口"${slot.title}"注册成功`)

  // 返回注销函数，方便功能下线时清理
  return function unregister() {
    const index = state.slots.findIndex((item) => item.id === slot.id)
    if (index > -1) state.slots.splice(index, 1)
  }
}

/**
 * 供组件读取的只读快照（防止外部代码直接乱改注册表）。
 * FloatingDock.vue 会用它渲染按钮列表。
 */
export function useFloatingSlots() {
  return readonly(state)
}

/* ================= 内置演示插槽 =================
 * 第一阶段骨架工程自带的演示入口，验证插槽机制可用。
 * 后续正式功能开发时，删掉这段或替换为真实功能即可。
 */
registerFloatingSlot({
  id: 'demo-tips',
  title: '备考小贴士（演示插槽）',
  icon: '💡',
  order: 10,
  onClick: () => {
    // 演示：点击后用一个简单的事件通知页面弹出提示
    window.dispatchEvent(new CustomEvent('fenti:floating-demo', {
      detail: { message: '悬浮插槽接口工作正常！后续功能直接注册即可挂载到这里。' }
    }))
  }
})

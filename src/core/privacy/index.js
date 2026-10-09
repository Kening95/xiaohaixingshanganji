/**
 * ============================================================================
 * 隐私中心 —— core/privacy/index.js（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 一键清空用户的所有个人数据：
 *   计划、游戏数值（金币/体重/成就/图鉴）、错题本、学习日志、周报存档、
 *   电台进度、结伴房、商店购买记录……全部删除，回到"刚打开应用"的状态。
 *
 * 实现要点：
 *   · 只删除本应用写入的 key（一律以 'fenti-' 开头），不碰其他网站的存储
 *   · 删除后整页刷新：所有 core 模块的内存仓库在加载时读不到数据，
 *     自然回到初始状态——比手动重置几十个响应式字段更可靠
 *   · 刷新后路由守卫自动把用户送回新手引导页
 * ============================================================================
 */

/** 本应用拥有的全部 localStorage 键前缀 */
const APP_PREFIX = 'fenti-'

/** 列出当前存了哪些本应用数据（清空前的确认清单展示用） */
export function listUserDataKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(APP_PREFIX)) keys.push(key)
  }
  return keys.sort()
}

/**
 * 清空所有个人数据。
 * @returns {number} 删除的键数量
 */
export function wipeAllUserData() {
  const keys = listUserDataKeys()
  for (const key of keys) localStorage.removeItem(key)
  // 第 7 阶段：同步引擎的本地残留（待传队列 / 每键时间戳元信息）也一并清掉——
  // 否则清空的瞬间同步引擎会把元信息键再写回来，"清空"就不彻底。
  // 这两个键不参与 listUserDataKeys 的统计，但属于本应用的本地数据。
  localStorage.removeItem('fenti-sync-queue')
  localStorage.removeItem('fenti-sync-meta')
  console.log(`[privacy] 🧹 已清空 ${keys.length} 项个人数据：${keys.join(', ') || '（无）'}`)
  return keys.length
}

/**
 * 执行"清空并重置"：清数据 → 整页刷新（内存仓库随之重置）→
 * 路由守卫会因为"没有计划"自动跳回新手引导页。
 */
export function wipeAndReset() {
  wipeAllUserData()
  location.href = '/onboarding' // 整页跳转 = 整页刷新，所有内存状态归零
}

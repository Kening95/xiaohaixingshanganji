/**
 * ============================================================================
 * 预留扩展接口 ②：游戏化数值统一接口 —— core/gamification/index.js
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   全站游戏化数值的"中央账户"。金币、粉蹄体重、成就徽章、小海星图鉴，
 *   这些数据分散在商店、反馈、扫题、电台等各个功能里。
 *   如果没有统一接口，每个功能各改各的，很容易出现"商店扣了金币但
 *   主页面没刷新"这类不同步 bug。
 *
 *   这个模块用 Vue 3 的响应式能力做了一本"总账"：
 *   任何地方调用 addCoins() 改了金币，所有显示金币的界面自动同步更新，
 *   不需要手动通知。
 *
 * 新功能接入示例（照抄改改就能用）：
 *   import { addCoins, changeWeight, unlockAchievement } from '@/core/gamification'
 *
 *   听完10分钟电台  → addCoins(1, '电台收听满10分钟')
 *   当日全勤        → changeWeight(-0.5, '今日任务全部完成')
 *   击败真题BOSS    → unlockAchievement('boss-slayer', { title: 'BOSS克星' })
 *
 * 数值规则（来自需求清单 · 核心IP规范）：
 *   粉蹄初始体重 200 斤；当日全勤 -0.5 斤；未完成任务 +1 斤；
 *   减到 100 斤时解锁"帅气上岸海星"形象。
 * ============================================================================
 */
import { reactive, readonly } from 'vue'

/**
 * 游戏化总账（响应式数据仓库）。
 * 这是全站唯一允许修改游戏数值的地方，对外只暴露下面的函数方法。
 */
const ledger = reactive({
  /** 学习金币数量（粉蹄商店的"货币"） */
  coins: 0,
  /** 粉蹄当前体重（斤），初始 200，上岸目标 100 */
  weight: 200,
  /** 已解锁成就徽章：key 为成就 id，值为成就信息 */
  achievements: {},
  /** 考点小海星图鉴：key 为知识点 id，值为收集信息 */
  starlets: {},
  /** 数值变动流水（最近 50 条），方便周报、大盘页统计和调试 */
  history: []
})

/** 流水最多保留条数，防止长时间使用后占内存 */
const HISTORY_LIMIT = 50

/* ---------------- 本地持久化 ----------------
 * 金币 / 体重 / 成就 / 图鉴刷新页面不能丢（第 3 阶段需求：体重联动要持续累积），
 * 所以每次变动都把总账存进 localStorage，启动时再读回来。
 * key 带版本号，以后结构升级不冲突。
 */
const GAME_STORAGE_KEY = 'fenti-game-v1'

function saveGame() {
  localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({
    coins: ledger.coins,
    weight: ledger.weight,
    achievements: ledger.achievements,
    starlets: ledger.starlets
  }))
}

function loadGame() {
  try {
    const raw = localStorage.getItem(GAME_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (typeof data.coins === 'number') ledger.coins = data.coins
    if (typeof data.weight === 'number') ledger.weight = data.weight
    if (data.achievements) ledger.achievements = data.achievements
    if (data.starlets) ledger.starlets = data.starlets
  } catch (error) {
    console.error('[gamification] 读取本地数值失败，按初始值处理：', error)
  }
}

// 模块加载时就恢复上次的数值（应用启动顺序：main.js import 本模块 → 读档）
loadGame()

/**
 * 内部工具：记一笔流水。带时间戳和原因，出问题可以随时追查。
 */
function record(type, amount, reason) {
  ledger.history.unshift({ type, amount, reason, time: new Date().toISOString() })
  if (ledger.history.length > HISTORY_LIMIT) {
    ledger.history.length = HISTORY_LIMIT
  }
}

/* ============================ 对外统一 API ============================ */

/**
 * 增加/扣减金币。
 * @param {number} amount 正数加金币（如 1），负数扣金币（如 -1）
 * @param {string} reason 变动原因，写清楚是哪个功能发的/扣的（方便排查）
 * @returns {number} 变动后的金币总数
 */
export function addCoins(amount, reason = '未注明原因') {
  if (typeof amount !== 'number' || amount === 0) return ledger.coins
  ledger.coins += amount
  record('coins', amount, reason)
  saveGame()
  console.log(`[gamification] 🪙 金币 ${amount > 0 ? '+' : ''}${amount}（${reason}）→ 当前 ${ledger.coins}`)
  return ledger.coins
}

/**
 * 改变粉蹄体重。
 * @param {number} delta 体重变化量，负数为减重（全勤 -0.5），正数为增重（未完成 +1）
 * @param {string} reason 变化原因
 * @returns {number} 变动后的体重
 */
export function changeWeight(delta, reason = '未注明原因') {
  if (typeof delta !== 'number' || delta === 0) return ledger.weight
  ledger.weight = Math.round((ledger.weight + delta) * 10) / 10 // 保留 1 位小数，防浮点误差
  record('weight', delta, reason)
  saveGame()
  console.log(`[gamification] ⭐ 体重 ${delta > 0 ? '+' : ''}${delta} 斤（${reason}）→ 当前 ${ledger.weight} 斤`)

  // 体重到达 100 斤：自动解锁"上岸海星"终极成就（需求清单规则）
  if (ledger.weight <= 100 && !ledger.achievements['shang-an']) {
    unlockAchievement('shang-an', { title: '帅气上岸海星', description: '粉蹄减重 100 斤，成功上岸！' })
  }
  return ledger.weight
}

/**
 * 解锁一枚成就徽章。重复解锁同一枚会自动忽略（幂等，不会弹两次）。
 * @param {string} id 成就唯一标识，如 'first-full-attendance'
 * @param {Object} info 成就信息：{ title: 名称, description: 描述, icon: 图标 }
 */
export function unlockAchievement(id, info = {}) {
  if (!id || typeof id !== 'string') {
    throw new Error('[gamification] unlockAchievement 需要字符串类型的成就 id')
  }
  if (ledger.achievements[id]) return // 已解锁过，直接返回

  ledger.achievements[id] = {
    title: info.title || id,
    description: info.description || '',
    icon: info.icon || '🏅',
    unlockedAt: new Date().toISOString()
  }
  record('achievement', 1, `解锁成就「${ledger.achievements[id].title}」`)
  saveGame()
  console.log(`[gamification] 🏅 成就解锁：${ledger.achievements[id].title}`)
}

/**
 * 收集一只考点小海星（可视化大盘 · 图鉴功能的数据来源）。
 * @param {string} knowledgeId 知识点唯一标识
 * @param {Object} info 小海星信息：{ name: 名称, subject: 所属科目 }
 */
export function collectStarlet(knowledgeId, info = {}) {
  if (!knowledgeId || typeof knowledgeId !== 'string') {
    throw new Error('[gamification] collectStarlet 需要字符串类型的知识点 id')
  }
  if (ledger.starlets[knowledgeId]) return // 已收集过

  ledger.starlets[knowledgeId] = {
    name: info.name || knowledgeId,
    subject: info.subject || '常识',
    collectedAt: new Date().toISOString()
  }
  record('starlet', 1, `收集小海星「${ledger.starlets[knowledgeId].name}」`)
  saveGame()
  console.log(`[gamification] 🌟 收集小海星：${ledger.starlets[knowledgeId].name}`)
}

/**
 * 读取游戏化总账（只读）。
 * 页面组件用它显示金币/体重等数值；因为是响应式的，数值一变界面自动刷新。
 * 只读是为了防止组件绕过 API 直接乱改数据——所有变动必须走上面的函数。
 */
export function useGamification() {
  return readonly(ledger)
}

/* ================= Vue 插件安装函数 =================
 * main.js 里 app.use(installGamification) 会执行它。
 * 作用：把常用 API 挂到全局（this.$coins 之类），
 * 同时让"游戏化模块已就绪"这件事可以被其他模块感知。
 */
export function installGamification(app) {
  // 暴露到全局属性，模板里可以直接写 $game.coins 显示金币
  app.config.globalProperties.$game = {
    addCoins,
    changeWeight,
    unlockAchievement,
    collectStarlet,
    ledger: useGamification()
  }
  console.log('[gamification] ✅ 游戏化数值统一接口已就绪')
}

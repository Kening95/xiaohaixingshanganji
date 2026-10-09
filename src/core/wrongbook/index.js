/**
 * ============================================================================
 * 电子错题本 —— core/wrongbook/index.js
 * ----------------------------------------------------------------------------
 * 需求：所有错题自动按科目、刷题日期打标签存入电子错题本；
 * 每收录一道错题自动生成 1 只"错题小怪兽"；
 * 二次标记做对该题后自动消除小怪兽并发放 1 枚金币。
 *
 * 数据结构（存 localStorage，key = 'fenti-wrongbook-v1'）：
 *   entries: [{
 *     id: 'wq-xxx',
 *     subject: '数量关系',        // 科目标签（OCR 猜测或手动选择）
 *     date: '2026-10-08',        // 刷题日期标签（收录当天）
 *     image: 'data:image/jpeg;…',// 题图缩略图（≤800px，jpeg 0.7，控制体积）
 *     status: 'wrong' | 'defeated', // wrong=小怪兽存活；defeated=已攻克
 *     createdAt / defeatedAt
 *   }]
 *
 * 小怪兽不单独建表：status === 'wrong' 的条目就是存活的小怪兽，
 * 攻克（markCorrect）即消除并 +1 金币（走游戏化统一接口②）。
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { addCoins } from '@/core/gamification'

const STORAGE_KEY = 'fenti-wrongbook-v1'

/** 错题本仓库（响应式） */
const store = reactive({
  entries: []
})

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: store.entries }))
  } catch (error) {
    // 图片型数据体积大，QuotaExceeded 时要给用户可感知的提示
    console.error('[wrongbook] 本地存档失败（可能空间不足）：', error)
    throw new Error('错题本存满啦，请先打印归档或删掉一些旧题～')
  }
}

/** 从 localStorage 恢复错题本（应用启动时调用） */
export function loadWrongbook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      store.entries = Array.isArray(data.entries) ? data.entries : []
    }
  } catch (error) {
    console.error('[wrongbook] 读取本地错题本失败，当作空白本处理：', error)
    store.entries = []
  }
  return store.entries
}

// 模块加载即恢复（和 plan/gamification 同一套模式）
loadWrongbook()

/**
 * 收录一道错题。
 * @param {Object} entry { subject, image(dataUrl), date? }
 *   date 默认今天（YYYY-MM-DD 本地时区）
 * @returns {Object} 新建的错题条目（= 新出生的小怪兽）
 */
export function addWrongEntry({ subject, image, date }) {
  const entry = {
    id: `wq-${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`,
    subject: subject || '未分科目',
    date: date || new Date().toLocaleDateString('sv-SE'), // 'sv-SE' 输出 YYYY-MM-DD
    image,
    status: 'wrong',
    createdAt: new Date().toISOString()
  }
  store.entries.unshift(entry) // 最新的在最上面
  save()
  console.log(`[wrongbook] 📕 收录错题：${entry.subject}（${entry.date}）· 小怪兽 +1`)
  return entry
}

/**
 * 二次标记做对该题：消除小怪兽 + 发 1 枚金币。
 * 幂等：已经攻克的题再次调用不会重复发金币。
 *
 * @param {string} id 错题条目 id
 * @returns {{ changed: boolean, coinsGiven: number }}
 */
export function markCorrect(id) {
  const entry = store.entries.find((e) => e.id === id)
  if (!entry) return { changed: false, coinsGiven: 0 }
  if (entry.status === 'defeated') return { changed: false, coinsGiven: 0 } // 已攻克，防重复发币

  entry.status = 'defeated'
  entry.defeatedAt = new Date().toISOString()
  addCoins(1, '错题重做攻克，消除小怪兽') // 游戏化统一接口②
  save()
  console.log(`[wrongbook] ⚔️ 攻克错题：${entry.subject} · 小怪兽 -1，金币 +1`)
  return { changed: true, coinsGiven: 1 }
}

/**
 * 删除一条错题记录（彻底移除，不发金币）。
 * 供"打印归档后清理"场景使用。
 */
export function removeEntry(id) {
  const index = store.entries.findIndex((e) => e.id === id)
  if (index === -1) return false
  store.entries.splice(index, 1)
  save()
  return true
}

/* ---------------- 查询（页面展示用，全部响应式） ---------------- */

/** 全部错题（只读响应式） */
export function useWrongbook() {
  return computed(() => store.entries)
}

/** 存活的小怪兽列表 = 还没攻克的错题 */
export function useActiveMonsters() {
  return computed(() => store.entries.filter((e) => e.status === 'wrong'))
}

/** 小怪兽数量（地图页顶栏展示用） */
export function useMonsterCount() {
  return computed(() => store.entries.filter((e) => e.status === 'wrong').length)
}

/** 按科目分组的错题（错题本页筛选用） */
export function useSubjects() {
  return computed(() => [...new Set(store.entries.map((e) => e.subject))])
}

/* ---------------- 按日期查询（每日小测"当日扫题回顾"用） ---------------- */

/**
 * 取"某一天"收录的错题条目（按 date 标签精确匹配，格式 YYYY-MM-DD）。
 * 每日小测出题时用它找到"当天扫题上传了哪些题"，从而优先考这些科目的题。
 *
 * @param {string} date 'YYYY-MM-DD'（本地时区）
 * @returns {Object[]} 该天的错题条目（只读引用，不要直接改）
 */
export function getEntriesByDate(date) {
  return store.entries.filter((e) => e.date === date)
}

/**
 * 今天的错题条目（响应式 computed）。
 * 小测弹窗顶部"今日扫题回顾"条直接绑定它：用户白天扫题收录错题后，
 * 打开小测就能立刻看到今天的题图，无需刷新。
 *
 * @returns {ComputedRef<Object[]>} 今天的错题条目数组
 */
export function useTodayEntries() {
  // 'sv-SE' 时区输出 YYYY-MM-DD，和 addWrongEntry 打标签时用的格式一致
  const today = new Date().toLocaleDateString('sv-SE')
  return computed(() => store.entries.filter((e) => e.date === today))
}

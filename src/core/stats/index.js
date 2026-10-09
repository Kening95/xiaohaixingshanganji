/**
 * ============================================================================
 * 每日学习日志 —— core/stats/index.js（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   一本"日记账"：用户每天学了多少分钟、小测正确率、心情打分、
 *   收录了几道错题、电台听了几分钟……按"日期"一行一行记下来。
 *
 * 为什么需要它？
 *   大盘页的学习时长热力图、每周一的自动周报，都要用到"过去 N 天的
 *   历史数据"。而计划(plan)里只记任务完成状态，没有按日历日期累计的
 *   统计口径，所以需要这个独立的日志模块把每天的数据沉淀下来。
 *
 * 数据从哪来（谁负责"记账"）？
 *   · 每日反馈弹窗提交时  → recordDay() 记下当天的任务完成数/正确率/心情
 *   · 扫题收录错题时      → addWrongCount() 记一笔
 *   · 电台播放累计时长    → addRadioMinutes() 记一笔
 *   这些都是"组件层"调用，核心模块（plan/gamification）一行没改，
 *   完全符合"新功能只对接预留接口、不动底层"的要求。
 *
 * 数据存哪？
 *   localStorage（key = 'fenti-dailylog-v1'），刷新、重开浏览器都不丢。
 *   将来上云只需要替换 load/save 两个函数，页面代码不用动。
 *
 * 数据长什么样？
 *   {
 *     days: {
 *       '2026-10-08': {          // key = 日期（本地时区 YYYY-MM-DD）
 *         minutes: 240,           // 当日学习分钟数（完成任务数 × 60）
 *         tasksDone: 4,           // 当日完成任务数
 *         quizAccuracy: 0.8,      // 当日小测正确率（0~1，没测为 null）
 *         moodScore: 4,           // 当日心情打分（1~5，没评为 null）
 *         wrongAdded: 2,          // 当日新收录错题数
 *         radioMinutes: 15        // 当日电台累计收听分钟
 *       }
 *     }
 *   }
 * ============================================================================
 */
import { reactive, computed } from 'vue'

const STORAGE_KEY = 'fenti-dailylog-v1'

/** 日志仓库（响应式）：任何一笔新记录，依赖它的页面会自动刷新 */
const store = reactive({ days: {} })

/** 返回本地时区的 'YYYY-MM-DD' 日期键（所有记账函数的统一日期格式） */
export function dateKeyOf(date = new Date()) {
  return date.toLocaleDateString('sv-SE') // 'sv-SE' 输出 YYYY-MM-DD，与计划/错题本一致
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: store.days }))
  } catch (error) {
    console.error('[stats] 学习日志存盘失败：', error)
  }
}

/** 应用启动时从 localStorage 恢复日志 */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      store.days = (data && typeof data.days === 'object') ? data.days : {}
    }
  } catch (error) {
    console.error('[stats] 读取学习日志失败，当作空白账本处理：', error)
    store.days = {}
  }
}

load() // 模块加载即恢复（与 plan/gamification/wrongbook 同一套模式）

/**
 * 读取某一天的日志（没有记录则返回一份全 0 的空记录，调用方不用判空）。
 * @param {string} key 日期键 'YYYY-MM-DD'，默认今天
 */
export function getDay(key = dateKeyOf()) {
  return store.days[key] || {
    minutes: 0, tasksDone: 0, quizAccuracy: null,
    moodScore: null, wrongAdded: 0, radioMinutes: 0
  }
}

/**
 * 记一笔当日日志（合并式：只覆盖传入的字段，没传的保持原样）。
 * 同一个字段一天内重复记录时，后者覆盖前者（例如反馈弹窗重复提交）。
 *
 * @param {Object} patch 要记录的字段，如 { minutes: 240, moodScore: 4 }
 * @param {string} [key] 日期键，默认今天
 */
export function recordDay(patch, key = dateKeyOf()) {
  const prev = getDay(key)
  store.days[key] = { ...prev, ...patch }
  save()
  return store.days[key]
}

/**
 * 学习分钟数累计（电台收听场景用：在原有基础上累加而不是覆盖）。
 * @param {number} minutes 新增分钟数
 * @param {string} [key] 日期键，默认今天
 * @returns {number} 当日累计总分钟数
 */
export function addMinutes(minutes, key = dateKeyOf()) {
  const day = getDay(key)
  return recordDay({ minutes: day.minutes + minutes }, key).minutes
}

/**
 * 电台收听分钟累计（与学习分钟分开记，方便周报分别统计）。
 * @returns {number} 当日电台累计总分钟数
 */
export function addRadioMinutes(minutes, key = dateKeyOf()) {
  const day = getDay(key)
  return recordDay({ radioMinutes: day.radioMinutes + minutes }, key).radioMinutes
}

/**
 * 当日新收录错题数累计。
 * @param {number} count 新增错题数（通常一次扫题收录 N 道）
 */
export function addWrongCount(count = 1, key = dateKeyOf()) {
  const day = getDay(key)
  return recordDay({ wrongAdded: day.wrongAdded + count }, key).wrongAdded
}

/**
 * 取最近 N 天的完整日志序列（含没有记录的日期，补全为 0），
 * 日历热力图和周报都从这里取数——顺序从最早到最新。
 *
 * @param {number} n 天数
 * @returns {Array<{ date: string, weekday: number, minutes: number, ... }>}
 */
export function getLastNDays(n = 7) {
  const list = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = dateKeyOf(d)
    list.push({ date: key, weekday: d.getDay(), ...getDay(key) })
  }
  return list
}

/* ---------------- 响应式查询（页面展示用） ---------------- */

/** 全部日志（只读响应式），大盘/周报组件直接遍历 */
export function useDailyLog() {
  return computed(() => store.days)
}

/** 最近 7 天日志（响应式），周报模块用 */
export function useLast7Days() {
  return computed(() => getLastNDays(7))
}

/** 最近 14 周（98 天）日志（响应式），日历热力图用 */
export function useHeatmapDays() {
  return computed(() => getLastNDays(98))
}

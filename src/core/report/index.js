/**
 * ============================================================================
 * 粉蹄自动备考周报 —— core/report/index.js（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   每周一自动汇总"过去 7 天"的学习数据，生成一份可视化周报：
 *   学了多久、小测正确率走势、收录/攻克了多少错题、电台听了多久，
 *   自动统计出"薄弱模块"，并基于规则生成"下周优化建议"。
 *
 * 数据从哪来？（全部读取既有模块，不自己存原始数据）
 *   · 学习时长/正确率/心情  ← core/stats 每日学习日志
 *   · 错题收录/攻克         ← core/wrongbook（按 createdAt/defeatedAt 落在 7 天窗口内统计）
 *   · 科目任务完成度         ← core/plan（统计每科 done/total）
 *   · 金币/成就/图鉴         ← core/gamification 总账
 *
 * "每周一自动"怎么实现？
 *   纯前端没有服务器定时任务，采用的等价方案：应用启动/进入大盘页时
 *   检查"本周是否已生成过周报"，没生成过且今天是周一（或本周首次打开）
 *   就自动生成一份并存档。详见 maybeAutoWeeklyReport()。
 *
 * 周报存档：localStorage（key = 'fenti-reports-v1'），最多保留最近 8 份，
 * 大盘页可以翻阅历史周报；一键导出长图由组件层用 html2canvas 实现。
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { getLastNDays, getDay } from '@/core/stats'
import { useWrongbook } from '@/core/wrongbook'
import { usePlan } from '@/core/plan'
import { useGamification, unlockAchievement } from '@/core/gamification'

const STORAGE_KEY = 'fenti-reports-v1'
const MAX_REPORTS = 8

/** 周报存档仓库（响应式） */
const store = reactive({ reports: [] })

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ reports: store.reports }))
  } catch (error) {
    console.error('[report] 周报存档失败：', error)
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      store.reports = Array.isArray(data.reports) ? data.reports : []
    }
  } catch (error) {
    console.error('[report] 读取周报存档失败：', error)
    store.reports = []
  }
}

load()

/** 今天所在周的"周一日期键"，用作"本周是否已生成"的判断依据 */
function mondayKeyOf(date = new Date()) {
  const d = new Date(date)
  const offset = (d.getDay() + 6) % 7 // 周日=0 → 偏移 6，周一=1 → 偏移 0
  d.setDate(d.getDate() - offset)
  return d.toLocaleDateString('sv-SE')
}

/**
 * 生成一份周报（核心函数）。
 * @param {Date} [endDate] 统计窗口的最后一天，默认今天（窗口 = 往前数 7 天）
 * @returns {Object} 周报数据对象（结构见下）
 */
export function generateWeeklyReport(endDate = new Date()) {
  /* ---------- 1. 过去 7 天每日日志（含补零） ---------- */
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('sv-SE')
    days.push({ date: key, weekday: d.getDay(), ...getDay(key) })
  }

  /* ---------- 2. 汇总总量 ---------- */
  const totals = {
    studyMinutes: days.reduce((n, d) => n + d.minutes, 0),       // 学习总分钟
    radioMinutes: days.reduce((n, d) => n + d.radioMinutes, 0), // 电台总分钟
    wrongAdded: days.reduce((n, d) => n + d.wrongAdded, 0),     // 新收录错题
    quizCount: days.filter((d) => d.quizAccuracy != null).length, // 参加小测天数
    avgAccuracy: 0,   // 平均小测正确率（0~1）
    avgMood: 0,       // 平均心情分（1~5）
    fullAttendance: days.filter((d) => d.tasksDone > 0).length // 有学习行为的天数
  }
  const accuracyList = days.filter((d) => d.quizAccuracy != null).map((d) => d.quizAccuracy)
  totals.avgAccuracy = accuracyList.length
    ? Math.round(accuracyList.reduce((a, b) => a + b, 0) / accuracyList.length * 100) / 100
    : null
  const moodList = days.filter((d) => d.moodScore != null).map((d) => d.moodScore)
  totals.avgMood = moodList.length
    ? Math.round(moodList.reduce((a, b) => a + b, 0) / moodList.length * 10) / 10
    : null

  /* ---------- 3. 错题窗口统计（近 30 天，用于薄弱模块判定） ---------- */
  const entries = useWrongbook().value
  const now = endDate.getTime()
  const inDays = (iso, n) => iso && (now - new Date(iso).getTime()) <= n * 86400000
  const wrongRecent = entries.filter((e) => inDays(e.createdAt, 30))        // 近 30 天收录
  const defeatedRecent = entries.filter((e) => e.defeatedAt && inDays(e.defeatedAt, 30)) // 近 30 天攻克

  // 按科目统计"未攻克错题数"——存活小怪兽越多，说明该模块越薄弱
  const subjectWrong = {}
  for (const e of entries.filter((e) => e.status === 'wrong')) {
    subjectWrong[e.subject] = (subjectWrong[e.subject] || 0) + 1
  }

  /* ---------- 4. 科目任务完成度（从计划推导） ---------- */
  const plan = usePlan().value
  const perSubject = {}
  for (const stage of plan?.stages ?? []) {
    for (const t of stage.tasks) {
      perSubject[t.subject] ||= { done: 0, total: 0 }
      perSubject[t.subject].total++
      if (t.done) perSubject[t.subject].done++
    }
  }

  /* ---------- 5. 薄弱模块判定 ----------
   * 口径：未攻克错题数降序取前 2 名；一道错题都没有时，
   * 退而看"计划里标记的薄弱科目"中完成度最低的一科。
   */
  const ranked = Object.entries(subjectWrong).sort((a, b) => b[1] - a[1])
  let weakSubjects = ranked.filter(([, n]) => n > 0).slice(0, 2).map(([s]) => s)
  if (weakSubjects.length === 0 && plan?.weakSubjects?.length) {
    const weakest = [...plan.weakSubjects].sort(
      (a, b) => (perSubject[a]?.done / Math.max(1, perSubject[a]?.total)) - (perSubject[b]?.done / Math.max(1, perSubject[b]?.total))
    )[0]
    if (weakest) weakSubjects = [weakest]
  }

  /* ---------- 6. 下周建议（规则文本生成） ---------- */
  const suggestions = []
  if (totals.avgAccuracy != null && totals.avgAccuracy < 0.6) {
    suggestions.push(`本周小测平均正确率 ${Math.round(totals.avgAccuracy * 100)}%，低于 60% 及格线：建议把错题对应的基础课重看一遍，再开新任务。`)
  }
  for (const s of weakSubjects) {
    const n = subjectWrong[s] || 0
    suggestions.push(n > 0
      ? `「${s}」还有 ${n} 只错题小怪兽没消灭：下周每天优先重做 2 道，并用电台"薄弱定向"模式磨耳朵。`
      : `「${s}」是当前计划标记的薄弱科目：保持每天 1 个该科目任务不断档。`)
  }
  if (totals.studyMinutes < 300 && totals.fullAttendance > 0) {
    suggestions.push(`本周学习 ${Math.round(totals.studyMinutes / 60)} 小时，低于 5 小时：建议每天加 30 分钟"副本刷题"，节奏比突击更重要。`)
  }
  if (totals.wrongAdded > 0 && defeatedRecent.length === 0) {
    suggestions.push(`本周新收录 ${totals.wrongAdded} 道错题但还没攻克任何一道：错题不过夜，攻克还能领金币哦。`)
  }
  if (totals.avgMood != null && totals.avgMood <= 2.5) {
    suggestions.push('本周状态打分偏低：安排半天彻底休息，粉蹄陪你散步充充电，状态好效率才高。')
  }
  if (suggestions.length === 0) {
    suggestions.push('本周表现很稳！保持当前节奏，可以把每日学习时长上调 30 分钟冲击进阶。')
  }

  /* ---------- 7. 亮点（正向反馈，周报不只挑毛病） ---------- */
  const highlights = []
  if (totals.fullAttendance >= 5) highlights.push(`连续 ${totals.fullAttendance} 天坚持学习 📈`)
  if (defeatedRecent.length > 0) highlights.push(`消灭 ${defeatedRecent.length} 只错题小怪兽 ⚔️`)
  if (totals.radioMinutes >= 30) highlights.push(`电台磨耳朵 ${totals.radioMinutes} 分钟 🎧`)
  const game = useGamification()
  if (Object.keys(game.achievements).length > 0) highlights.push(`已点亮 ${Object.keys(game.achievements).length} 枚成就徽章 🏅`)

  return {
    id: `wr-${Date.now().toString(36)}`,
    weekKey: mondayKeyOf(endDate),      // 本周一的日期键（判重/归档用）
    weekLabel: `${days[0].date.slice(5)} ~ ${days[6].date.slice(5)}`,
    generatedAt: new Date().toISOString(),
    days, totals, perSubject, weakSubjects, suggestions, highlights
  }
}

/** 生成周报并存档（同周只保留最新一份：重复生成会覆盖本周旧报） */
export function generateAndStoreWeeklyReport(endDate = new Date()) {
  const report = generateWeeklyReport(endDate)
  const index = store.reports.findIndex((r) => r.weekKey === report.weekKey)
  if (index > -1) store.reports.splice(index, 1)
  store.reports.unshift(report) // 最新在最前
  if (store.reports.length > MAX_REPORTS) store.reports.length = MAX_REPORTS
  save()
  // 徽章：本周学习满 5 天解锁「周周坚持」（游戏化统一接口②，幂等）
  if (report.totals.fullAttendance >= 5) {
    unlockAchievement('week-warrior', { title: '周周坚持', description: '一份周报周期内学习满 5 天', icon: '📰' })
  }
  console.log(`[report] 📰 周报已生成：${report.weekLabel}，建议 ${report.suggestions.length} 条`)
  return report
}

/**
 * "每周一自动生成"的等价实现：
 * 进入大盘/周报面板时调用。本周还没存档，且今天是周一，就自动生成；
 * 也容忍"周一没打开应用"的情况——周二~周日首次打开时补生成本周周报。
 */
export function maybeAutoWeeklyReport() {
  const thisWeek = mondayKeyOf()
  if (!store.reports.some((r) => r.weekKey === thisWeek)) {
    return generateAndStoreWeeklyReport()
  }
  return store.reports.find((r) => r.weekKey === thisWeek)
}

/* ---------------- 查询（响应式） ---------------- */

/** 全部周报存档（最新在前） */
export function useReports() {
  return computed(() => store.reports)
}

/** 本周周报（没有则 null） */
export function useThisWeekReport() {
  return computed(() => store.reports.find((r) => r.weekKey === mondayKeyOf()) || null)
}

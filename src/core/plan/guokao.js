/**
 * ============================================================================
 * 2027 国考 60 天冲刺计划 —— core/plan/guokao.js（v5：行测/申论双轨提醒版）
 * ----------------------------------------------------------------------------
 * 用户需求（第 9 轮重构）：
 *   · 考公学习 = 行测（言语理解/判断推理/资料分析/数量关系/政治理论/常识）
 *     + 申论（方法学习 / 半月谈时政素材积累 / 大小作文写作实操）
 *   · 地图的目的是"学习任务提醒"——不写具体学习内容，任务全部概括化
 *
 * 五关结构（天数 14 + 3 + 21 + 7 + 15 = 60）：
 *   1. 听课筑基关：每天 上午行测3h + 下午申论3h + 课后练习2h + 素材积累1h
 *   2. 知识梳理关：行测梳理 + 申论梳理（双轨），各传一张做题思路思维导图
 *   3. 专项练习关：行测专项练习 + 申论专项练习（双轨）
 *   4. 刷题巩固关：每天 刷题任务 + 错题重做 + 题目分析 三项
 *   5. 套卷模拟关：每 3 天一轮 ×5 轮：模考 → 错题分析 → 补漏训练
 *
 * 另有贯穿全周期的"常识碎片·每日积累"（20min/天，来自上一轮需求，
 * 常识不计入听课安排），按"哪天就属于哪一关"摊进对应关卡。
 *
 * 兼容说明：
 *   · 精力池面板（100 大时段 + 300 碎片 = 230h 的旧配比口径）随 v5 任务结构
 *     退役：energyPoolStats() 对 v5 计划返回 null，地图顶栏自动隐藏入口。
 *   · weakSubjects 参数保留（引导页仍可选薄弱科目并存档），v5 计划为固定
 *     行测/申论双轨节奏，不再按薄弱科目重排；参数保留是为了接口不破坏。
 * ============================================================================
 */

/* 国考计划常量（v5） */
export const GUOKAO = {
  planType: 'guokao2027',
  totalDays: 60,

  dailyCapMin: 600,   // 智能防过载：单日任务上限 10 小时
  fragmentMin: 20,    // 小任务粒度（常识碎片 / 思维导图上传）

  /* 引导页"薄弱科目"选择池（保留：存档 + 小测抽题倾向用，不再影响排课顺序） */
  PRACTICE_SUBJECTS: ['资料分析', '言语理解', '判断推理', '图形推理', '逻辑推理', '常识判断', '政治理论'],

  /* 五关（只有天数区间和展示信息——v5 不再按"整块/碎片"配额配平） */
  STAGES: [
    { id: 'foundation', name: '听课筑基关', icon: '🎧', prefix: '筑基', dayStart: 1, dayEnd: 14 },
    { id: 'sorting', name: '知识梳理关', icon: '🧭', prefix: '梳理', dayStart: 15, dayEnd: 17 },
    { id: 'practice', name: '专项练习关', icon: '⚔️', prefix: '专项', dayStart: 18, dayEnd: 38 },
    { id: 'drill', name: '刷题巩固关', icon: '🔥', prefix: '巩固', dayStart: 39, dayEnd: 45 },
    { id: 'sprint', name: '套卷模拟关', icon: '🏁', prefix: '冲刺', dayStart: 46, dayEnd: 60 }
  ]
}

/** 任务工厂：统一字段，少写重复代码 */
function mk(id, title, type, subject, duration, day, extra = {}) {
  return { id, title, type, subject, duration, done: false, day, videoUrl: null, ...extra }
}

/* ---------------- 第 1 关：听课筑基（第 1~14 天，每天上午行测、下午申论） ---------------- */

function buildFoundationStage() {
  const conf = GUOKAO.STAGES[0]
  const tasks = []
  for (let day = conf.dayStart; day <= conf.dayEnd; day++) {
    tasks.push(mk(`gk-fd-xt-${day}`, '☀️ 上午 · 行测学习（3小时）', '行测学习', '行测', 180, day))
    tasks.push(mk(`gk-fd-sf-${day}`, '🌤 下午 · 申论学习（3小时）', '申论学习', '申论', 180, day))
    tasks.push(mk(`gk-fd-lx-${day}`, '课后练习（2小时）', '课后练习', '行测', 120, day))
    tasks.push(mk(`gk-fd-sc-${day}`, '📰 素材积累（半月谈时政 · 1小时）', '素材积累', '申论', 60, day))
  }
  return {
    ...conf,
    tip: '💡 每天上午行测、下午申论：行测学习 3h + 申论学习 3h + 课后练习 2h + 素材积累 1h。地图只做学习提醒，具体学哪块内容按自己的节奏安排。',
    tasks
  }
}

/* ---------------- 第 2 关：知识梳理（第 15~17 天，行测/申论双轨梳理） ---------------- */

function buildSortingStage() {
  const conf = GUOKAO.STAGES[1]
  const tasks = []
  for (let day = conf.dayStart; day <= conf.dayEnd; day++) {
    tasks.push(mk(`gk-sd-xt-${day}`, '行测知识梳理（3小时）', '知识梳理', '行测', 180, day))
    tasks.push(mk(`gk-sd-sf-${day}`, '申论知识梳理（3小时）', '知识梳理', '申论', 180, day))
  }
  // 每轨梳理完后各传一张"做题思路思维导图"，供专项练习阶段对照使用（拍照上传）
  tasks.push(mk('gk-sd-map-xt', '📷 行测 · 做题思路思维导图（梳理完拍照上传）', '思维导图', '行测', 20, 16, { upload: 'mindmap' }))
  tasks.push(mk('gk-sd-map-sf', '📷 申论 · 做题思路思维导图（梳理完拍照上传）', '思维导图', '申论', 20, 17, { upload: 'mindmap' }))
  return {
    ...conf,
    tip: '💡 行测、申论分开梳理；每轨梳理完记得拍照上传"做题思路思维导图"，后面专项练习时对照着用。',
    tasks
  }
}

/* ---------------- 第 3 关：专项练习（第 18~38 天，行测/申论双轨练习） ---------------- */

function buildPracticeStage() {
  const conf = GUOKAO.STAGES[2]
  const tasks = []
  for (let day = conf.dayStart; day <= conf.dayEnd; day++) {
    tasks.push(mk(`gk-pc-xt-${day}`, '行测专项练习（3小时）', '行测练习', '行测', 180, day))
    tasks.push(mk(`gk-pc-sf-${day}`, '申论专项练习（3小时 · 大小作文实操）', '申论练习', '申论', 180, day))
  }
  return {
    ...conf,
    tip: '💡 行测、申论双轨推进；申论侧重大小作文写作实操，练完对照梳理阶段上传的思维导图查漏。',
    tasks
  }
}

/* ---------------- 第 4 关：刷题巩固（第 39~45 天，每天三项任务） ---------------- */

function buildDrillStage() {
  const conf = GUOKAO.STAGES[3]
  const tasks = []
  for (let day = conf.dayStart; day <= conf.dayEnd; day++) {
    tasks.push(mk(`gk-dr-do-${day}`, '📝 刷题任务（3小时）', '刷题任务', '行测', 180, day))
    tasks.push(mk(`gk-dr-redo-${day}`, '🔁 错题重做（1小时）', '错题重做', '行测', 60, day))
    tasks.push(mk(`gk-dr-an-${day}`, '🔍 题目分析（1小时）', '题目分析', '行测', 60, day))
  }
  return {
    ...conf,
    tip: '💡 每天三件事：刷题 → 错题重做 → 题目分析。错题为根，分析为果。',
    tasks
  }
}

/* ---------------- 第 5 关：套卷模拟（第 46~60 天，每 3 天一轮 ×5 轮） ---------------- */

function buildSprintStage() {
  const conf = GUOKAO.STAGES[4]
  const tasks = []
  const rounds = 5 // 15 天 ÷ 每轮 3 天 = 5 轮
  for (let r = 1; r <= rounds; r++) {
    const base = conf.dayStart + (r - 1) * 3
    tasks.push(mk(`gk-sp-mock-${r}`, `🏁 第 ${r} 轮 · 全真模考（行测+申论 · 4小时）`, '模考', '行测', 240, base, { round: r }))
    tasks.push(mk(`gk-sp-fix-${r}`, `第 ${r} 轮 · 错题分析（2小时）`, '错题分析', '行测', 120, base + 1, { round: r }))
    tasks.push(mk(`gk-sp-patch-${r}`, `第 ${r} 轮 · 补漏训练（2小时）`, '补漏训练', '行测', 120, base + 2, { round: r }))
  }
  return {
    ...conf,
    tip: '💡 每 3 天一轮：模考 → 错题分析 → 补漏训练，共 5 轮。一轮一轮啃，上考场就不慌。',
    tasks
  }
}

/**
 * 生成 2027 国考 60 天计划（纯函数：不碰仓库状态，测试友好）。
 * @param {Object} input
 *   @param {string[]} input.weakSubjects 预设薄弱科目（v5 仅存档，不影响排课）
 * @returns {Object} 与旧版 generatePlan() 同构的计划对象
 */
export function generateGuokaoPlan({ weakSubjects = [] } = {}) {
  const stages = [
    buildFoundationStage(),
    buildSortingStage(),
    buildPracticeStage(),
    buildDrillStage(),
    buildSprintStage()
  ]

  /* 常识碎片化学习：全 60 天每天 1 个 20min 碎片（常识不计入听课安排），
   * 按"哪天就属于哪一关"摊进对应关卡，和当天其他任务同组展示。 */
  for (let day = 1; day <= GUOKAO.totalDays; day++) {
    const owner = stages.find((s) => day >= s.dayStart && day <= s.dayEnd)
    owner.tasks.push(mk(`gk-cs-${day}`, `⭐ 常识碎片·每日积累（第 ${day} 天）`, '常识积累', '常识判断', GUOKAO.fragmentMin, day))
  }

  /* 防过载自检：任何一天的任务量都不超过 10 小时上限 */
  const dayMinutes = {}
  for (const stage of stages) {
    for (const task of stage.tasks) {
      if (typeof task.day === 'number') {
        dayMinutes[task.day] = (dayMinutes[task.day] || 0) + task.duration
      }
    }
  }
  for (const [day, minutes] of Object.entries(dayMinutes)) {
    if (minutes > GUOKAO.dailyCapMin) {
      throw new Error(`[guokao] 防过载自检失败：第 ${day} 天任务量 ${minutes / 60}h 超过 ${GUOKAO.dailyCapMin / 60}h 上限`)
    }
  }

  const totalMin = stages.flatMap((s) => s.tasks).reduce((n, t) => n + t.duration, 0)
  return {
    version: 5, // v5：行测/申论双轨 + 概括性提醒任务（v1~v4 由 migrate 升级）
    planType: GUOKAO.planType,
    createdAt: new Date().toISOString(),
    examDays: GUOKAO.totalDays,
    hoursPerDay: totalMin / 60 / GUOKAO.totalDays, // 平均每日任务量（小时）
    weakSubjects: [...weakSubjects],
    stages,
    quizzes: {},    // 每日小测成绩：{ [天]: { correct, total, accuracy, passed } }
    feedbacks: {}   // 每日反馈记录：{ [天]: { moodScore, accuracy, submittedAt } }
  }
}

/**
 * 精力池统计（地图"精力池"面板用）。
 * ⚠️ v5 起返回 null：旧的"100 个 2h 时段 + 300 个 20min 碎片 = 230h"配比口径
 * 随任务结构重构退役，地图顶栏入口自动隐藏（MapView 有 v-if="pool" 保护）。
 * 函数保留是为了不让旧引用报错。
 */
export function energyPoolStats(plan) {
  if (!plan || (plan.version || 1) >= 5) return null
  return null // v1~v4 的计划加载时已被 migrate 重建为 v5，走不到这里
}

/**
 * 模块刷题进度汇总（旧四步流程面板用）。
 * v5 计划不再生成 drillFlow，本函数恒返回 []；保留导出以兼容旧引用。
 */
export function summarizeDrill(stage) {
  if (!stage?.drillFlow) return []
  return []
}

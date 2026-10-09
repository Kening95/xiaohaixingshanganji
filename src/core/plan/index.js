/**
 * ============================================================================
 * 学习计划核心模块 —— core/plan/index.js
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   全站学习计划的"数据仓库 + 生成器"。
 *   新手引导页采集"考试剩余天数、每日学习时长、薄弱科目"后，
 *   调用 createPlan() 生成一份"概括性提醒任务"的闯关计划（v5 起与国考计划
 *   同款风格：行测/申论双轨提醒，不写具体学习内容，30 分钟为最小单位），
 *   主地图页、关卡详情页都从这里读数据，保证全站看到同一份计划。
 *
 * 数据存哪？
 *   目前存在浏览器 localStorage（key = 'fenti-plan-v1'），刷新不丢。
 *   第 7 阶段部署到 Vercel 后，把 load/save 两个函数换成云端数据库读写即可，
 *   页面代码一行不用改（这就是分层解耦的好处）。
 *
 * 核心概念：
 *   计划 plan = { 引导输入信息 + 5 个阶段(stage)，每个阶段里有一串任务(task) }
 *   阶段（关卡）= 统一五关结构（第 8 阶段起，自定义计划与国考计划同一张地图）：
 *     听课筑基关(约14天) → 知识梳理关(约3天) → 专项练习关(约21天)
 *     → 刷题巩固关(约7天) → 套卷模拟关(约15天，含弹性缓冲)
 *     自定义计划按五段比例(14:3:21:7:15)缩放用户自选的天数；
 *     各关时长按"国考强度曲线"分配：筑基≈2.9h/天、梳理≈3.3h/天、
 *     专项≈5h/天、巩固≈5h/天、套卷≈2.7h/天，整体平均值 = 用户每日时长
 *   任务      = 概括性学习提醒（v5 起）：行测/申论双轨 + 时长标注，30 分钟为最小单位
 *   天(day)   = 任务按天分配：每天约 hoursPerDay 小时（各关强度略有高低，自动配平）
 *   解锁规则  = 两层：① 上一关 100% 完成才解锁下一关；② 当天小测正确率 ≥60%
 *               通过，才解锁第 2 天起的每日任务
 *   补练任务  = 反馈提交后由"计划规则池"自动插入的补救任务（day 为空，放在关底）
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { addCoins } from '@/core/gamification'
import { generateGuokaoPlan } from './guokao'

/* ============================ 1. 基础数据定义 ============================ */

/** 考公六科目（需求清单 · 可视化大盘页要求 6 科目进度条） */
export const SUBJECTS = ['常识判断', '言语理解', '数量关系', '判断推理', '资料分析', '申论']

/**
 * 统一五关定义（第 8 阶段）：自定义计划与国考计划共用同一张五关地图。
 *   dayWeights  = 五段节奏的天数比例（14:3:21:7:15，对应"听课2周→梳理3天→
 *                 专项3周→巩固1周→套卷1周+弹性"的 60 天官方节奏）
 *   intensity   = 该关每天的学习强度（小时/天），取自国考 230h 配比的实际曲线，
 *                 用于把"总时长"切成各关时长（平均值自动对齐用户每日时长）
 *   prefix      = 任务标题前缀
 */
export const STAGES = [
  { id: 'foundation', name: '听课筑基关', icon: '🎧', dayWeights: 14, intensity: 40 / 14, prefix: '筑基', tip: '💡 听课技巧：边听边标记解题步骤，先建立完整知识框架，不必苛求一次学精学透。' },
  { id: 'sorting',   name: '知识梳理关', icon: '🧭', dayWeights: 3,  intensity: 10 / 3,  prefix: '梳理', tip: '💡 梳理有两类：本关的系统大梳理 + 之后做题过程中随时进行的动态梳理。' },
  { id: 'practice',  name: '专项练习关', icon: '⚔️', dayWeights: 21, intensity: 105 / 21, prefix: '专项' },
  { id: 'drill',     name: '刷题巩固关', icon: '🔥', dayWeights: 7,  intensity: 35 / 7,  prefix: '巩固' },
  { id: 'sprint',    name: '套卷模拟关', icon: '🏁', dayWeights: 15, intensity: 40 / 15, prefix: '冲刺' }
]

/** localStorage 存计划的键名（带版本号，以后数据结构升级不冲突） */
const STORAGE_KEY = 'fenti-plan-v1'

/* ============================ 2. 响应式计划仓库 ============================ */

/**
 * 计划仓库（响应式）。
 * 初始为 null（还没做引导）；createPlan() 后有了数据，所有页面自动刷新。
 */
const planState = reactive({
  plan: null
})

/**
 * 按比例把 total 切成 parts 份整数（最大余数法：先分整数部分，余数按小数部分大小依次 +1）。
 * 例：splitByRatio(60, [14,3,21,7,15]) → 恰好 [14,3,21,7,15]
 */
function splitByRatio(total, weights) {
  const wSum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (total * w) / wSum)
  const base = exact.map((e) => Math.floor(e))
  let leftover = total - base.reduce((a, b) => a + b, 0)
  // 余数按小数部分从大到小，一天一天地补
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
    base[order[k][1]]++
    leftover--
  }
  return base
}

/**
 * 生成学习计划（新手引导最后一步调用，第 8 阶段起为统一五关结构）。
 *
 * 生成思路（小白版）：
 *   1. 总学习分钟 = 考试剩余天数 × 每日学习时长 × 60
 *   2. 天数按五段节奏比例(14:3:21:7:15)切成 5 份 → 每关占几天
 *      （天数太少放不下 5 关时，后面的关自动并入套卷模拟关，保证每天都有归属）
 *   3. 各关时长按"国考强度曲线"分配：每关天数 × 该关强度权重，再整体缩放，
 *      使全计划平均值恰好 = 用户每日时长；任何一天都不超过 10 小时上限
 *   4. 每天按"概括性配方"切块（v5 起）：听课筑基 = 行测学习+申论学习+课后练习+素材积累
 *      （3:3:2:1）、梳理/专项 = 行测+申论双轨、刷题巩固 = 刷题+错题重做+题目分析、
 *      套卷模拟 = 每 3 天一轮（模考:错题分析:补漏训练 = 4:2:2）；
 *      任务标题只作学习提醒，不写具体科目内容（30 分钟为最小单位）
 *   5. 套卷模拟关凑不满一轮的剩余天数是"弹性缓冲日"（自由补漏，不计时长）；
 *      另有常识碎片·每日积累（20min）摊进每一天所属关卡（常识不计入听课安排）
 *
 * @param {Object} input 引导页采集的信息
 *   @param {number} input.examDays      考试剩余天数（3~365）
 *   @param {number} input.hoursPerDay   每日纯学习时长（1~10 小时）
 *   @param {string[]} input.weakSubjects 预设薄弱科目（SUBJECTS 的子集）
 * @returns {Object} 生成好的计划对象
 */
export function generatePlan({ examDays, hoursPerDay, weakSubjects }) {
  const totalMinutes = examDays * hoursPerDay * 60

  // ---- 第 1 步：天数按五段比例切分（放不下 5 关时后面的关并入最后一关） ----
  let dayCounts = splitByRatio(examDays, STAGES.map((s) => s.dayWeights))
  if (examDays < STAGES.length) {
    // 极端短期计划（3~4 天）：每关至少 1 天，放不下的关并进套卷模拟关
    dayCounts = STAGES.map((_, i) => (i < examDays ? 1 : 0))
  }

  // ---- 第 2 步：各关任务数 = 天数 × 强度权重，缩放使总数恰好 = 用户总时长 ----
  const totalTasks = Math.round(totalMinutes / 60) // 每小时 1 个任务
  // 上限：每天 ≤10 小时（防过载），所以每关最多 天数×10 个任务
  const capTasks = dayCounts.map((d) => d * 10)
  const weights = STAGES.map((s, i) => s.intensity * dayCounts[i])
  const wSum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (wSum > 0 ? (totalTasks * w) / wSum : 0))
  // 先取整数部分，余数按小数大小一天一天补（和 splitByRatio 同思路）
  const taskCounts = exact.map((e) => Math.floor(e))
  let leftover = totalTasks - taskCounts.reduce((a, b) => a + b, 0)
  const fracOrder = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; leftover > 0; k = (k + 1) % fracOrder.length) {
    taskCounts[fracOrder[k][1]]++
    leftover--
  }
  // 超限截断（超出 10h/天的部分），截出来的任务转给还有空余的关
  let overflow = 0
  for (let i = 0; i < taskCounts.length; i++) {
    if (taskCounts[i] > capTasks[i]) { overflow += taskCounts[i] - capTasks[i]; taskCounts[i] = capTasks[i] }
  }
  while (overflow > 0) {
    let best = -1
    for (let i = 0; i < taskCounts.length; i++) {
      if (taskCounts[i] + 1 <= capTasks[i] &&
          (best === -1 || capTasks[i] - taskCounts[i] > capTasks[best] - taskCounts[best])) best = i
    }
    if (best === -1) break
    taskCounts[best]++
    overflow--
  }
  const stageMinutes = taskCounts.map((c) => c * 60)

  // ---- 第 3 步：逐关生成"概括性提醒任务"（与国考计划同款风格，30 分钟为最小单位） ----
  // 用户要求（第 9 轮重构）：地图的目的是"学习任务提醒"，不写具体学习内容——
  // 自定义计划同样升级为 行测/申论双轨的概括性任务，时长按用户每日时长等比缩放。
  // 每天的时长按本关配方切块（行测:申论:练习:素材 ≈ 3:3:2:1 等），切完正好是当天分钟数。
  const HALF_HOUR = 30

  /** 一天的"任务配方"：[标题, 类型, 科目标签, 配比单位]（配比用于把当天时长切块） */
  const RECIPES = {
    foundation: [
      ['行测学习', '行测学习', '行测', 3],
      ['申论学习', '申论学习', '申论', 3],
      ['课后练习', '课后练习', '行测', 2],
      ['素材积累（半月谈时政）', '素材积累', '申论', 1]
    ],
    sorting: [
      ['行测知识梳理', '知识梳理', '行测', 1],
      ['申论知识梳理', '知识梳理', '申论', 1]
    ],
    practice: [
      ['行测专项练习', '行测练习', '行测', 1],
      ['申论专项练习（大小作文实操）', '申论练习', '申论', 1]
    ],
    drill: [
      ['刷题任务', '刷题任务', '行测', 3],
      ['错题重做', '错题重做', '行测', 1],
      ['题目分析', '题目分析', '行测', 1]
    ]
  }

  /** 时长文案：180 → "3小时"，90 → "1小时30分钟"，30 → "30分钟" */
  function fmtDur(minutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h && m) return `${h}小时${m}分钟`
    return h ? `${h}小时` : `${m}分钟`
  }

  /** 按配方把"一天的分钟数"切成 30 分钟整块的概括性任务 */
  function buildDayTasks(stageId, localDay, minutes) {
    const recipe = RECIPES[stageId]
    if (!recipe || minutes <= 0) return []
    const units = Math.max(1, Math.round(minutes / HALF_HOUR))
    const shares = splitByRatio(units, recipe.map((r) => r[3]))
    const tasks = []
    recipe.forEach(([title, type, subject], i) => {
      const dur = shares[i] * HALF_HOUR
      if (dur <= 0) return // 当天太短的任务直接跳过（时长让给其他项）
      tasks.push({
        id: `${stageId}-d${localDay}-${i}`,
        title: `${title}（${fmtDur(dur)}）`,
        subject,
        type,
        duration: dur,
        done: false,
        day: 1, // 先占位，第 5 步统一排到全局天数
        videoUrl: null
      })
    })
    return tasks
  }

  // ---- 第 4 步：逐关逐日生成任务（顺序即学习顺序） ----
  const stages = STAGES.map((stage, stageIndex) => {
    const days = dayCounts[stageIndex]
    const minutes = stageMinutes[stageIndex]
    const tasks = []
    // 把本关总分钟平均切到每一天（最大余数法，天数 ≥1 时至少每天 30 分钟）
    const perDayMinutes = days > 0 ? splitByRatio(minutes, Array.from({ length: days }, () => 1)) : []

    if (stage.id === 'sprint') {
      // 套卷模拟关：每 3 天一轮（模考 : 错题分析 : 补漏训练 = 4 : 2 : 2），
      // 凑不满一轮的剩余天数 = 弹性缓冲日（自由补漏，不计入计划时长）
      const rounds = Math.floor(days / 3)
      for (let r = 1; r <= rounds; r++) {
        const dayMin = perDayMinutes[(r - 1) * 3] + perDayMinutes[(r - 1) * 3 + 1] + perDayMinutes[(r - 1) * 3 + 2]
        const units = Math.max(1, Math.round(dayMin / HALF_HOUR))
        const shares = splitByRatio(units, [4, 2, 2])
        const roundTasks = [
          [`🏁 第 ${r} 轮 · 全真模考（行测+申论）`, '模考', '行测'],
          [`第 ${r} 轮 · 错题分析`, '错题分析', '行测'],
          [`第 ${r} 轮 · 补漏训练`, '补漏训练', '行测']
        ]
        roundTasks.forEach(([title, type, subject], i) => {
          if (shares[i] <= 0) return
          tasks.push({
            id: `${stage.id}-r${r}-${i}`,
            title: `${title}（${fmtDur(shares[i] * HALF_HOUR)}）`,
            subject, type,
            duration: shares[i] * HALF_HOUR,
            done: false,
            day: 1,
            videoUrl: null,
            round: r
          })
        })
      }
      for (let d = rounds * 3 + 1; d <= days; d++) {
        tasks.push({
          id: `${stage.id}-elastic-${d}`,
          title: '🌊 弹性缓冲日 · 自由补漏 / 错题回炉（不计入计划时长）',
          subject: '自由安排',
          type: '弹性缓冲',
          duration: 0,
          done: false,
          day: 1,
          videoUrl: null
        })
      }
    } else {
      for (let d = 1; d <= days; d++) {
        tasks.push(...buildDayTasks(stage.id, d, perDayMinutes[d - 1]))
      }
      // 知识梳理关：行测 / 申论各传一张"做题思路思维导图"（拍照上传，供专项练习对照）
      if (stage.id === 'sorting' && days >= 1) {
        tasks.push({
          id: `${stage.id}-map-xt`,
          title: '📷 行测 · 做题思路思维导图（梳理完拍照上传）',
          subject: '行测',
          type: '思维导图',
          duration: 20,
          done: false,
          day: 1,
          videoUrl: null,
          upload: 'mindmap'
        })
        tasks.push({
          id: `${stage.id}-map-sf`,
          title: '📷 申论 · 做题思路思维导图（梳理完拍照上传）',
          subject: '申论',
          type: '思维导图',
          duration: 20,
          done: false,
          day: 1,
          videoUrl: null,
          upload: 'mindmap'
        })
      }
    }
    const out = { ...stage, tasks }
    delete out.dayWeights // 内部字段，不存进计划数据
    delete out.intensity
    return out
  })

  // ---- 第 5 步：把所有任务顺序排到全局时间轴（贪心装箱：每天装 hoursPerDay 小时） ----
  // 任务总分钟 = examDays × hoursPerDay × 60，因此恰好铺满 examDays 天、每天不超载；
  // 弹性缓冲日（0 分钟）挂到装箱时的当天，不占额度。
  let globalDay = 1
  let usedToday = 0
  for (const stage of stages) {
    for (const t of stage.tasks) {
      if (t.duration === 0) { t.day = globalDay; continue }
      if (usedToday + t.duration > hoursPerDay * 60) { globalDay++; usedToday = 0 }
      t.day = globalDay
      usedToday += t.duration
    }
  }

  // ---- 第 6 步：常识碎片·每日积累（20min/天）摊进对应关卡 ----
  // 常识不计入听课安排（与国考计划一致），按"哪天就属于哪一关"归属。
  const dayOwner = {}
  for (const s of stages) {
    const ds = s.tasks.map((t) => t.day).filter((n) => typeof n === 'number')
    if (!ds.length) continue
    for (let d = Math.min(...ds); d <= Math.max(...ds); d++) if (!dayOwner[d]) dayOwner[d] = s
  }
  for (let day = 1; day <= examDays; day++) {
    const owner = dayOwner[day] || stages[stages.length - 1]
    owner.tasks.push({
      id: `cs-${day}`,
      title: `⭐ 常识碎片·每日积累（第 ${day} 天）`,
      subject: '常识判断',
      type: '常识积累',
      duration: 20,
      done: false,
      day,
      videoUrl: null
    })
  }

  return {
    version: 5, // v5：概括性提醒任务（行测/申论双轨，与国考计划同款风格；v1~v4 由 migrate 升级）
    planType: 'standard',
    createdAt: new Date().toISOString(),
    examDays,
    hoursPerDay,
    weakSubjects: [...weakSubjects],
    stages,
    quizzes: {},    // 每日小测成绩：{ [天]: { correct, total, accuracy, passed } }
    feedbacks: {}   // 每日反馈记录：{ [天]: { moodScore, accuracy, submittedAt } }
  }
}

/** 把计划存进 localStorage（刷新、重开浏览器都不丢） */
function save(plan) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
}

/**
 * 旧版本计划数据自动升级（migration）。
 * 第 2 阶段存的计划没有 day / videoUrl / quizzes / feedbacks 字段，
 * 这里读出来自动补齐，老用户刷新页面数据不丢、功能照常可用。
 */
function migrate(plan) {
  if (!plan) return plan
  // ===== 国考计划自动升级：v1 三关 / v2 五关 / v3 连续排课 / v4 六科+常识+导图 → v5 行测申论双轨 =====
  // 原因：地图关卡数量与任务结构由已存计划决定，旧数据不重建就停留在旧结构。
  // 处理方式：用保存的薄弱科目重新生成 v5 计划；任务标题完全相同的直接继承完成状态，
  // 进度能迁多少迁多少；自定义计划走下面自己的分支。
  if (plan.planType === 'guokao2027' && (plan.version || 1) < 5) {
    console.log('[plan] 检测到旧版国考计划（v1~v4），自动升级为 v5 行测/申论双轨结构（薄弱科目保留存档）')
    const upgraded = generateGuokaoPlan({ weakSubjects: plan.weakSubjects || [] })
    const oldDoneTitles = new Set(
      plan.stages.flatMap((s) => s.tasks).filter((t) => t.done).map((t) => t.title)
    )
    for (const t of upgraded.stages.flatMap((s) => s.tasks)) {
      if (oldDoneTitles.has(t.title)) t.done = true
    }
    save(upgraded) // 立即落盘，避免每次刷新都重复重建
    return upgraded
  }
  // ===== 自定义计划自动升级：v1 四关 / v4 科目任务 → v5 概括性提醒任务 =====
  // 用户要求（第 9 轮重构）：地图只做学习提醒，自定义计划同样换成 行测/申论双轨的
  // 概括性任务。重建保留天数/每日时长/薄弱科目；进度按"同关同天的完成比例"继承。
  if (plan.planType !== 'guokao2027' && ((plan.version || 1) < 5 || plan.stages.length !== 5)) {
    console.log('[plan] 检测到旧版自定义计划（v1~v4），自动升级为 v5 概括性提醒结构（天数/时长/薄弱科目保留）')
    const upgraded = generatePlan({
      examDays: plan.examDays || 60,
      hoursPerDay: plan.hoursPerDay || 6,
      weakSubjects: plan.weakSubjects || []
    })
    // 进度继承：标题对不上（任务全换了），改按"同一关卡、同一天"的完成比例迁移——
    // 旧某天任务全做完 → 新当天任务全继承；全没做 → 不继承；部分完成按比例取整。
    const oldDoneByDay = {}
    for (const s of plan.stages) {
      for (const t of s.tasks) {
        if (typeof t.day !== 'number') continue
        const key = `${s.id}#${t.day}`
        oldDoneByDay[key] ||= { done: 0, total: 0 }
        oldDoneByDay[key].total++
        if (t.done) oldDoneByDay[key].done++
      }
    }
    for (const s of upgraded.stages) {
      const byDay = {}
      for (const t of s.tasks) {
        if (typeof t.day !== 'number') continue
        ;(byDay[t.day] ||= []).push(t)
      }
      for (const [dayStr, tasks] of Object.entries(byDay)) {
        const old = oldDoneByDay[`${s.id}#${dayStr}`]
        if (!old) continue
        const inherit = Math.round((old.done / old.total) * tasks.length)
        tasks.slice(0, inherit).forEach((t) => { t.done = true })
      }
    }
    upgraded.quizzes = plan.quizzes || {}     // 每日小测成绩按天保留
    upgraded.feedbacks = plan.feedbacks || {} // 每日反馈记录按天保留
    save(upgraded)
    return upgraded
  }
  plan.quizzes ||= {}
  plan.feedbacks ||= {}
  let globalIndex = 0
  for (const stage of plan.stages) {
    for (const task of stage.tasks) {
      // 第 7 阶段起任务带时长（国考计划有 120/20 分钟两种），旧数据统一补 60 分钟
      if (typeof task.duration !== 'number') task.duration = 60
      // 只有"旧版压根没有 day 字段"的任务才需要补算；
      // day 为 null 的补练/关卡自由任务是刻意的（不参与按天解锁），不能动
      if (!('day' in task)) {
        task.day = Math.floor(globalIndex / plan.hoursPerDay) + 1
      }
      if (!('videoUrl' in task)) {
        task.videoUrl = null // v5 起视频入口默认留空，用户在任务条上自行填入
      }
      globalIndex++
    }
  }
  return plan
}

/**
 * 引导页完成时调用：生成计划 + 存本地 + 发新手金币礼包。
 *
 * input.planType === 'guokao2027' 时走国考专属生成器（60 天 230 小时三阶段），
 * 否则走原有自定义生成器——旧调用方一行代码都不用改（零破坏）。
 *
 * @returns {Object} 刚生成的计划
 */
export function createPlan(input) {
  const plan = input?.planType === 'guokao2027'
    ? generateGuokaoPlan(input)
    : generatePlan(input)
  planState.plan = plan
  save(plan)
  addCoins(50, '新手礼包：完成三步引导') // 游戏化数值统一接口：金币全站自动同步
  console.log(`[plan] ✅ 计划已生成（${plan.planType || 'standard'}）：共 ${plan.examDays} 天，${plan.stages.reduce((n, s) => n + s.tasks.length, 0)} 个任务`)
  return plan
}

/** 从 localStorage 恢复计划（应用启动时调用一次），自动做版本迁移 */
export function loadPlan() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) planState.plan = migrate(JSON.parse(raw))
  } catch (error) {
    console.error('[plan] 读取本地计划失败，当作没有计划处理：', error)
    planState.plan = null
  }
  return planState.plan
}

/** 本机是否已有计划（路由守卫用它判断能不能进主页面） */
export function hasPlan() {
  return !!planState.plan
}

/* ---------------- 云端同步回写（第 7 阶段新增） ----------------
 * 同步引擎把"云端较新的计划"回写到 localStorage 后会广播 fenti:sync-applied，
 * 这里监听后把新计划读进内存仓库，页面无需刷新即可看到另一台设备上的进度。
 */
window.addEventListener('fenti:sync-applied', () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    planState.plan = raw ? migrate(JSON.parse(raw)) : null
  } catch (error) {
    console.error('[plan] 同步回写后读取计划失败：', error)
  }
})

/* ============================ 3. 解锁判断（两层） ============================ */

/** 第 ① 层：关卡解锁 —— 第一关永远解锁，其余要上一关 100% 完成 */
export function isStageUnlocked(plan, stageIndex) {
  if (!plan) return false
  if (stageIndex <= 0) return true
  return plan.stages[stageIndex - 1].tasks.every((t) => t.done)
}

/** 第 ② 层：按天解锁 —— 第 1 天永远解锁；第 N 天要"第 N-1 天小测通过" */
export function isDayUnlocked(plan, day) {
  if (!plan || day <= 1) return true
  return !!plan.quizzes?.[day - 1]?.passed
}

/** 某个任务当前能不能勾选：所在关卡已解锁 && 所在天已解锁 */
export function isTaskUnlocked(plan, stageId, taskId) {
  if (!plan) return false
  const stageIndex = plan.stages.findIndex((s) => s.id === stageId)
  if (stageIndex === -1 || !isStageUnlocked(plan, stageIndex)) return false
  const task = plan.stages[stageIndex].tasks.find((t) => t.id === taskId)
  if (!task) return false
  // 补练任务（规则池插入的，day 为空）不受按天解锁限制，所在关解锁就能做
  if (typeof task.day !== 'number') return true
  return isDayUnlocked(plan, task.day)
}

/* ============================ 4. 修改类操作（页面只能调这里） ============================ */

/**
 * 切换任务完成状态（关卡详情页勾选调用）。改完自动存盘。
 * 返回结果对象而不是抛错，页面拿到 { ok:false } 时弹软萌提示即可。
 *
 * @returns {{ ok: boolean, done?: boolean, reason?: string }}
 */
export function toggleTask(stageId, taskId) {
  const plan = planState.plan
  const task = plan?.stages.find((s) => s.id === stageId)?.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, reason: '没有找到这个任务' }
  if (!isTaskUnlocked(plan, stageId, taskId)) {
    return { ok: false, reason: '这一天还没解锁哦，先通过前一天的小测吧～' }
  }
  task.done = !task.done
  save(plan)
  return { ok: true, done: task.done }
}

/**
 * 填入/替换某个任务的视频链接（需求：跳转入口可直接填入）。
 * @param {string} url 视频地址，必须是 http 开头
 */
export function setTaskVideoUrl(stageId, taskId, url) {
  const plan = planState.plan
  const task = plan?.stages.find((s) => s.id === stageId)?.tasks.find((t) => t.id === taskId)
  if (!task || typeof url !== 'string' || !/^https?:\/\//.test(url)) return false
  task.videoUrl = url.trim()
  save(plan)
  console.log(`[plan] 🔗 任务「${task.title}」视频链接已更新`)
  return true
}

/**
 * 按任务 id 全局切换完成状态（每日反馈弹窗用——它列出的"今日任务"
 * 可能散落在不同关卡，调用方不方便提供 stageId）。
 * @returns {{ ok: boolean, done?: boolean, reason?: string }}
 */
export function toggleTaskById(taskId) {
  const plan = planState.plan
  for (const stage of plan?.stages ?? []) {
    if (stage.tasks.some((t) => t.id === taskId)) {
      return toggleTask(stage.id, taskId)
    }
  }
  return { ok: false, reason: '没有找到这个任务' }
}

/**
 * 记录某一天的小测成绩（QuizModal 提交时调用）。
 * 判分规则：正确率 ≥ 60%（5 道题至少对 3 道）判定通过，自动解锁次日任务。
 *
 * @param {number} day 第几天
 * @param {Object[]} questions 本次出的 5 道题（含 answer 字段）
 * @param {number[]} answers 用户选择的选项下标数组
 * @returns {{ correct: number, total: number, accuracy: number, passed: boolean }}
 */
export function recordQuiz(day, questions, answers) {
  const plan = planState.plan
  if (!plan) return null
  let correct = 0
  questions.forEach((q, i) => {
    if (answers[i] === q.answer) correct++
  })
  const total = questions.length
  const accuracy = total ? correct / total : 0
  const passed = accuracy >= 0.6 // 需求清单：正确率 ≥60% 才能解锁次日任务
  plan.quizzes[day] = { correct, total, accuracy, passed, finishedAt: new Date().toISOString() }
  save(plan)
  console.log(`[plan] 📝 第 ${day} 天小测：${correct}/${total}（${Math.round(accuracy * 100)}%）${passed ? '✅ 通过' : '❌ 未通过'}`)
  return plan.quizzes[day]
}

/**
 * 保存某一天的每日反馈（FeedbackModal 提交时调用）。
 * @param {number} day 第几天
 * @param {Object} data { moodScore: 1~5, accuracy: 0~1, allDone: boolean }
 */
export function saveFeedback(day, data) {
  const plan = planState.plan
  if (!plan) return
  plan.feedbacks[day] = { ...data, submittedAt: new Date().toISOString() }
  save(plan)
  console.log(`[plan] 💌 第 ${day} 天反馈已保存：状态 ${data.moodScore} 星，正确率 ${Math.round(data.accuracy * 100)}%`)
}

/** 把"规则池调整过的计划"落盘（evaluatePlanRules 之后调用一次） */
export function savePlanNow() {
  if (planState.plan) save(planState.plan)
}

/* ============================ 5. 查询类（页面读取用） ============================ */

/**
 * 供页面读取的计划数据。
 * 返回 computed：页面里用 plan.value 取值（模板中会自动解包，直接写 plan.xxx），
 * 没有计划时为 null。只读语义靠"不提供修改函数"保证——
 * 所有修改必须走上面的 createPlan / toggleTask / recordQuiz / saveFeedback。
 */
export function usePlan() {
  return computed(() => planState.plan)
}

/**
 * 全站统计信息（响应式）：进度条、海星位置、hover 提示都从这里取数。
 * 在任何页面修改任务完成状态，这里的数字会自动跟着变。
 */
export function usePlanStats() {
  return computed(() => {
    const plan = planState.plan
    if (!plan) {
      return { totalTasks: 0, doneTasks: 0, progress: 0, learnedHours: 0, remainingTasks: 0, stageStats: [] }
    }
    let doneTasks = 0
    let doneMinutes = 0
    const totalTasks = plan.stages.reduce((n, s) => n + s.tasks.length, 0)
    const stageStats = plan.stages.map((s, index) => {
      const done = s.tasks.filter((t) => t.done).length
      const doneMin = s.tasks.filter((t) => t.done).reduce((n, t) => n + (t.duration || 60), 0)
      const totalMin = s.tasks.reduce((n, t) => n + (t.duration || 60), 0)
      doneTasks += done
      doneMinutes += doneMin
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        total: s.tasks.length,
        done,
        doneMin,
        totalMin,
        unlocked: isStageUnlocked(plan, index),
        finished: s.tasks.length > 0 && s.tasks.every((t) => t.done)
      }
    })
    return {
      totalTasks,
      doneTasks,
      progress: totalTasks ? doneTasks / totalTasks : 0, // 0~1，全局进度条用它
      learnedHours: Math.round((doneMinutes / 60) * 10) / 10, // 按任务实际时长累计（旧版任务均为 60 分钟，数值不变）
      remainingTasks: totalTasks - doneTasks,
      stageStats
    }
  })
}

/**
 * "今天"的信息（响应式）——每日小测 / 每日反馈都围绕它工作。
 * 今天的定义：从第 1 天开始往后找，第一个"任务没全做完 或 小测没通过"的天。
 * 前面所有天都收尾了，那今天就是"全部完成后的下一天"。
 *
 * @returns {null | {
 *   day: number,            // 今天是第几天
 *   tasks: Object[],        // 今天的任务
 *   allDone: boolean,       // 今天任务是否全部完成
 *   quiz: Object|null,      // 今天的小测成绩（没测过为 null）
 *   unlocked: boolean,      // 今天是否已解锁（理论上今天永远已解锁）
 *   stageId: string         // 今天的任务主要落在哪个关卡（小测入口页用）
 * }}
 */
export function useTodayInfo() {
  return computed(() => {
    const plan = planState.plan
    if (!plan) return null
    const allTasks = plan.stages.flatMap((s) => s.tasks.filter((t) => typeof t.day === 'number'))
    const maxDay = Math.max(0, ...allTasks.map((t) => t.day))
    for (let d = 1; d <= maxDay; d++) {
      const dayTasks = allTasks.filter((t) => t.day === d)
      const quiz = plan.quizzes?.[d] || null
      const allDone = dayTasks.length > 0 && dayTasks.every((t) => t.done)
      if (!allDone || !quiz?.passed) {
        return {
          day: d,
          tasks: dayTasks,
          allDone,
          quiz,
          unlocked: isDayUnlocked(plan, d),
          stageId: plan.stages.find((s) => s.tasks.some((t) => t.day === d))?.id || plan.stages[0].id
        }
      }
    }
    // 全部天数都收尾完成 → 返回最后一天（全部完成的标志）
    const lastTasks = allTasks.filter((t) => t.day === maxDay)
    return {
      day: maxDay,
      tasks: lastTasks,
      allDone: true,
      quiz: plan.quizzes?.[maxDay] || null,
      unlocked: true,
      stageId: plan.stages.find((s) => s.tasks.some((t) => t.day === maxDay))?.id || plan.stages[0].id
    }
  })
}

/**
 * 某一天的学习统计（关卡页按天分组展示用）。
 * @returns {{ total: number, done: number, unlocked: boolean, quiz: Object|null, allDone: boolean }}
 */
export function getDayInfo(plan, day) {
  const dayTasks = plan.stages.flatMap((s) => s.tasks).filter((t) => t.day === day)
  const quiz = plan.quizzes?.[day] || null
  return {
    total: dayTasks.length,
    done: dayTasks.filter((t) => t.done).length,
    unlocked: isDayUnlocked(plan, day),
    quiz,
    allDone: dayTasks.length > 0 && dayTasks.every((t) => t.done)
  }
}

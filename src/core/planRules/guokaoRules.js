/**
 * ============================================================================
 * 国考计划 · 智能防过载规则 —— core/planRules/guokaoRules.js
 * ----------------------------------------------------------------------------
 * 需求：① 单日任务上限不超过 10 小时；② 连续两天完成率低于 60%，
 *       自动下调后续 20% 任务量。
 *
 * 实现方式（零破坏）：不改动规则池核心代码，也不改动反馈页——
 * 这里用预留扩展接口③的 registerPlanRule() 注册两条新规则，
 * 每日反馈提交后自动生效。只有 planType === 'guokao2027' 的计划会被调整，
 * 旧版自定义计划一条规则都不会命中，行为与之前完全一致。
 *
 * 引入方式：main.js 里 import '@/core/planRules/guokaoRules'（见增量替换说明）。
 * ============================================================================
 */
import { registerPlanRule } from './index'
import { GUOKAO } from '@/core/plan/guokao'

/** 判断计划是否为国考计划（规则触发的前置条件） */
const isGuokao = (plan) => plan?.planType === GUOKAO.planType

/** 统计某一天的计划分钟数（day 为 null 的关卡自由任务不计入单日负荷） */
function dayMinutes(plan, day) {
  return plan.stages
    .flatMap((s) => s.tasks)
    .filter((t) => t.day === day)
    .reduce((n, t) => n + (t.duration || 60), 0)
}

/* ---------------- 规则一：单日 10 小时上限（超出部分转为关卡自由任务） ---------------- */

registerPlanRule({
  id: 'guokao-daily-cap',
  name: '国考单日上限 10 小时规则',
  priority: 15, // 在"未完成任务顺延"（10）之后、"薄弱补弱"（20）之前执行
  when: (context, plan) => isGuokao(plan),
  adjust: (plan, context) => {
    const cap = GUOKAO.dailyCapMin // 600 分钟 = 10 小时
    let moved = 0
    // 找出从今天起所有超上限的天，把当天末尾的未完成任务移出单日排期
    const allDays = [...new Set(plan.stages.flatMap((s) => s.tasks.filter((t) => typeof t.day === 'number').map((t) => t.day)))]
      .sort((a, b) => a - b)
    for (const day of allDays) {
      if (day < context.day) continue // 过去的天不追溯
      let overflow = dayMinutes(plan, day) - cap
      if (overflow <= 0) continue
      // 从当天的任务末尾往前找未完成任务，移出排期（day = null → 关卡自由任务，想做随时能做）
      const dayTasks = plan.stages
        .flatMap((s) => s.tasks)
        .filter((t) => t.day === day && !t.done)
        .reverse()
      for (const task of dayTasks) {
        if (overflow <= 0) break
        task.day = null
        task.eased = 'daily-cap' // 标记减免来源（数据可溯源）
        overflow -= task.duration || 60
        moved++
      }
    }
    return moved > 0
      ? { message: `粉蹄发现后面有几天排得太满了（超过 10 小时会累坏的！），已把 ${moved} 个任务挪成"自由任务"，轻松上岸不爆肝～` }
      : {}
  }
})

/* ---------------- 规则二：连续两天完成率 < 60% → 后续任务量下调 20% ---------------- */

registerPlanRule({
  id: 'guokao-ease-off',
  name: '国考连续低效减负 20% 规则',
  priority: 25,
  // 触发条件：今天和昨天的正确率都低于 60%（完成率低 = 正确率低 + 任务没做完的综合信号）
  when: (context, plan) => {
    if (!isGuokao(plan)) return false
    const today = plan.quizzes?.[context.day]
    const yesterday = plan.quizzes?.[context.day - 1]
    return !!today && !!yesterday && today.accuracy < 0.6 && yesterday.accuracy < 0.6
  },
  adjust: (plan, context) => {
    // 找出所有"今天之后"的未完成碎片任务（20 分钟的那种），每 5 个免掉 1 个 = 下调 20%
    const futureFrags = plan.stages
      .flatMap((s) => s.tasks)
      .filter((t) => typeof t.day === 'number' && t.day > context.day && !t.done && !t.eased && (t.duration || 60) <= GUOKAO.fragmentMin * 2)
    const removed = []
    for (let i = 0; i < futureFrags.length; i++) {
      if ((i + 1) % 5 === 0) removed.push(futureFrags[i])
    }
    // 从计划里移除这些碎片（它们是生成的刷题颗粒，减免不影响任何已完成数据）
    for (const task of removed) {
      for (const stage of plan.stages) {
        const index = stage.tasks.indexOf(task)
        if (index > -1) stage.tasks.splice(index, 1)
      }
    }
    return removed.length > 0
      ? { message: `粉蹄注意到你这两天有点吃力😢 已自动把后续刷题量下调 20%（免掉 ${removed.length} 个碎片任务），节奏放缓，咱们稳稳地上岸！` }
      : {}
  }
})

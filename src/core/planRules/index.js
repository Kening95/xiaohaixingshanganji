/**
 * ============================================================================
 * 预留扩展接口 ③：计划调整规则扩展池 —— core/planRules/index.js
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   每日反馈后系统要自动调整学习计划（需求清单 · 每日反馈模块），规则有：
 *     · 某模块连续 2 天正确率不达标 → 延后任务 + 插入 2 节补弱课程
 *     · 连续 3 天超额完成          → 解锁进阶干货福利
 *     · 未完成任务                 → 自动顺延到次日空闲时段
 *   这些规则会随着运营经验不断增加。如果每条规则都写死在计划模块里，
 *   每加一条规则都要大改核心代码，极易改出 bug。
 *
 *   这个扩展池把"规则"抽象成统一格式：每条规则是一个对象，
 *   新增规则 = 往池子里丢一个新对象，核心逻辑一行不用改。
 *
 * 新规则接入示例（照抄改改就能用）：
 *   import { registerPlanRule } from '@/core/planRules'
 *
 *   registerPlanRule({
 *     id: 'weekend-boost',            // 规则唯一标识
 *     name: '周末加餐规则',            // 人类可读的名字（后台展示用）
 *     priority: 20,                   // 执行优先级：数字小的先执行
 *     when: (context) => {            // 触发条件：返回 true 才执行本规则
 *       return context.isWeekend && context.dailyAccuracy >= 0.9
 *     },
 *     adjust: (plan, context) => {    // 调整动作：直接修改传入的 plan 对象
 *       plan.push({ type: 'bonus', title: '周末加餐：高分快练' })
 *       return { message: '周末表现优秀，粉蹄给你加了道快练小题～' }
 *     }
 *   })
 *
 * 执行入口（每日反馈提交后调用一次即可）：
 *   import { evaluatePlanRules } from '@/core/planRules'
 *   const result = evaluatePlanRules({ dailyAccuracy: 0.65, unfinishedTasks: [ ... ] })
 *   // result.messages 里就是粉蹄要转达给用户的所有提示语
 * ============================================================================
 */

/**
 * 规则池：所有已注册规则都存在这里。
 * 普通数组即可——规则在应用启动时注册一次，之后只读遍历，不需要响应式。
 */
const rulePool = []

/**
 * 注册一条计划调整规则。
 * @param {Object} rule 规则对象，字段说明见文件头部注释
 * @returns {Function} 注销函数，调用后该规则不再生效（规则下线时用）
 */
export function registerPlanRule(rule) {
  // ---- 参数校验：格式不对直接启动时报错，把问题暴露在开发阶段 ----
  if (!rule.id || typeof rule.id !== 'string') {
    throw new Error('[planRules] 注册失败：规则必须提供字符串类型的 id')
  }
  if (rulePool.some((item) => item.id === rule.id)) {
    console.warn(`[planRules] id 为 "${rule.id}" 的规则已存在，本次注册被忽略`)
    return () => {}
  }
  if (typeof rule.when !== 'function' || typeof rule.adjust !== 'function') {
    throw new Error(`[planRules] 规则 "${rule.id}" 必须提供 when 和 adjust 两个函数`)
  }

  // 补全默认值后入池，并按优先级排序（数字小的先执行）
  rulePool.push({ name: rule.id, priority: 100, ...rule })
  rulePool.sort((a, b) => a.priority - b.priority)

  console.log(`[planRules] ✅ 计划规则「${rule.name}」注册成功（优先级 ${rule.priority}）`)

  // 返回注销函数
  return function unregister() {
    const index = rulePool.findIndex((item) => item.id === rule.id)
    if (index > -1) rulePool.splice(index, 1)
  }
}

/**
 * 查看当前已注册的所有规则（只读拷贝，防止外部篡改规则池）。
 * 调试用，或在管理界面展示"当前生效的规则列表"。
 */
export function listPlanRules() {
  return rulePool.map(({ id, name, priority }) => ({ id, name, priority }))
}

/**
 * 执行规则池：依次检查每条规则的触发条件，命中则执行调整动作。
 *
 * @param {Object} context 当日学习上下文，由调用方（每日反馈模块）收集，例如：
 *   {
 *     date: '2026-10-08',        // 当天日期
 *     dailyAccuracy: 0.65,       // 当日小测正确率（0~1）
 *     unfinishedTasks: [...],    // 未完成任务列表
 *     weakSubjects: ['数量关系'], // 连续不达标的薄弱模块
 *     isWeekend: false,          // 是否周末
 *     history: {...}             // 近 N 天学习记录（规则判断"连续几天"时用）
 *   }
 * @param {Array} plan 当前学习计划（任务数组）。规则会直接修改它。
 * @returns {{ plan: Array, messages: string[], applied: string[] }}
 *   plan     → 调整后的计划
 *   messages → 所有命中规则产生的"粉蹄提示语"（UI 直接逐条展示）
 *   applied  → 本次实际生效的规则 id 列表（写日志/调试用）
 */
export function evaluatePlanRules(context, plan = []) {
  const messages = []
  const applied = []

  for (const rule of rulePool) {
    let hit = false
    try {
      // 第一步：检查触发条件。条件不成立就跳过这条规则。
      // 第二个参数传入 plan：规则可以按"计划类型"等计划本身的信息决定是否触发
      // （新增的参数，旧规则只用一个参数，完全不受影响）。
      hit = rule.when(context, plan)
    } catch (error) {
      // 单条规则报错不能拖垮整个反馈流程，记录后继续执行其他规则
      console.error(`[planRules] 规则「${rule.name}」条件判断出错：`, error)
      continue
    }

    if (!hit) continue

    try {
      // 第二步：执行调整动作。adjust 可以修改 plan，也可以返回提示语。
      const result = rule.adjust(plan, context) || {}
      applied.push(rule.id)
      if (result.message) messages.push(result.message)
      console.log(`[planRules] 🔧 规则「${rule.name}」已生效`)
    } catch (error) {
      console.error(`[planRules] 规则「${rule.name}」执行出错：`, error)
    }
  }

  return { plan, messages, applied }
}

/* ================= 内置规则（第 3 阶段已接入真实调整逻辑） =================
 * 下面两条是需求清单明确要求的规则，每日反馈提交后由 evaluatePlanRules
 * 自动执行。新增规则照抄这个格式调用 registerPlanRule() 即可，核心代码零改动。
 *
 * context 字段约定（每日反馈模块组装，规则从这里取数据）：
 *   stageId         当天任务所在的关卡 id（规则往这个关卡插补练任务）
 *   dailyAccuracy   当日小测正确率（0~1）
 *   unfinishedTasks 用户在反馈弹窗里反勾选的未完成任务
 *   weakSubjects    需要补弱的科目列表（反馈模块只在正确率不达标时传入）
 */

// 规则一：未完成任务自动顺延（需求清单明确要求的规则）
registerPlanRule({
  id: 'postpone-unfinished',
  name: '未完成任务顺延规则',
  priority: 10, // 最优先处理：先把没做完的任务安排掉
  when: (context) => Array.isArray(context.unfinishedTasks) && context.unfinishedTasks.length > 0,
  adjust: (plan, context) => {
    // 把每个未完成任务复制一份，放进当前关卡的"补练任务"区（day 为空 = 不受按天解锁限制），
    // 原任务保留原样（它已经发生的历史记录不清除）
    const stage = plan.stages.find((s) => s.id === context.stageId)
    if (stage) {
      context.unfinishedTasks.forEach((task) => {
        stage.tasks.push({
          ...task,
          id: `${task.id}-m${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`,
          title: `补·${task.title}`,
          day: null,   // 补练任务不参与"按天解锁"，所在关卡解锁即可勾选
          makeup: true // 标记：这是规则池插入的补救任务
        })
      })
    }
    return {
      message: `今天有 ${context.unfinishedTasks.length} 个任务没做完，粉蹄已经帮你排进"补练任务"啦，不会丢～`
    }
  }
})

// 规则二：薄弱模块补弱提醒（需求清单：正确率不达标自动追加补弱课程）
registerPlanRule({
  id: 'weak-subject-boost',
  name: '薄弱科目补弱规则',
  priority: 20,
  // 反馈模块把"正确率 < 80%"视为踩线通过，此时把 weakSubjects 放进 context 触发补弱
  when: (context) => Array.isArray(context.weakSubjects) && context.weakSubjects.length > 0,
  adjust: (plan, context) => {
    // 往当前关卡插 2 节补弱专项课（取前两个薄弱科目，各一节）
    const stage = plan.stages.find((s) => s.id === context.stageId)
    if (stage) {
      context.weakSubjects.slice(0, 2).forEach((subject, i) => {
        stage.tasks.push({
          id: `boost-${Date.now().toString(36)}-${i}`,
          title: `补弱加餐·${subject}专项回顾`,
          subject,
          type: '讲义精读',
          duration: 60,
          done: false,
          day: null,
          makeup: true
        })
      })
    }
    return {
      message: `${context.weakSubjects.slice(0, 2).join('、')}这部分还没吃透哦，粉蹄给你加了 2 节补弱小课！`
    }
  }
})

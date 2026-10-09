<script setup>
/**
 * ============================================================================
 * 第三阶段自动化自测页 —— views/SelfTestView.vue（仅开发环境可见）
 * ----------------------------------------------------------------------------
 * 用途：一打开本页就自动执行第 3 阶段全部核心逻辑的测试用例，
 * 绿勾 = 通过，红叉 = 失败（附原因）。开发联调时肉眼验收，
 * 不需要手动点几十步。生产构建中本页整页不存在（路由都不注册）。
 *
 * 覆盖范围（对照需求清单）：
 *   ① 任务按天拆分（1 小时颗粒度、每天 N 个任务）
 *   ② 每日小测判分（≥60% 通过，解锁次日）
 *   ③ 按天解锁与任务勾选拦截
 *   ④ 计划规则池：未完成任务顺延 / 薄弱科目补弱
 *   ⑤ 视频链接填入校验
 *   ⑥ 体重/金币联动与 localStorage 持久化
 *   ⑦ 红笔四态判定（第 4 阶段）
 *   ⑧ 图像预处理（裁剪/增强，第 4 阶段）
 *   ⑨ OCR 科目猜词（第 4 阶段）
 *   ⑩ 错题本收录/攻克/幂等（第 4 阶段）
 *   ⑪ 学习日志合并记账 + 补零序列（第 5 阶段）
 *   ⑫ 周报汇总/薄弱模块/建议生成（第 5 阶段）
 *   ⑬ 电台三模式选曲 + 每日推送确定性（第 5 阶段）
 *   ⑭ 模拟卷 30 天窗口/去重/比例分区（第 5 阶段）
 *   ⑮ 图鉴收集/成就解锁幂等（第 5 阶段）
 *   ⑯ 模拟卷 PDF A4 排版生成（第 5 阶段，异步用例）
 *   ⑰ 结伴房建房/时间推进/奖励每日一次（第 6 阶段）
 *   ⑱ 专注幻境完成发奖与中途记账（第 6 阶段）
 *   ⑲ 商店扣款/余额拦截/投喂减重（第 6 阶段）
 *   ⑳ 幸运壁纸 1080×1920 + buff 池解锁扩容（第 6 阶段，异步）
 *   ㉑ 隐私清空只删本应用数据（第 6 阶段）
 *   ㉒ 全路径路由冒烟：直达与守卫弹回（第 6 阶段，异步）
 *   ㉓ 悬浮插槽 5 入口注册完整性（第 6 阶段）
 *
 * 测试前后会快照并恢复 localStorage，不影响你正在调试的计划数据。
 * ============================================================================
 */
import { ref, onMounted } from 'vue'
import {
  generatePlan, createPlan, loadPlan,
  isDayUnlocked, toggleTask, setTaskVideoUrl, recordQuiz
} from '@/core/plan'
import { evaluatePlanRules, listPlanRules, registerPlanRule } from '@/core/planRules'
import { generateGuokaoPlan, GUOKAO } from '@/core/plan/guokao'
import { mergeRecords } from '@/core/sync'
import { loginWithSms, logout, LOGIN_TTL, useAccount } from '@/core/account'
import { useGamification, addCoins, changeWeight, collectStarlet, unlockAchievement } from '@/core/gamification'
import { recordDay, getDay, getLastNDays, dateKeyOf } from '@/core/stats'
import { generateWeeklyReport } from '@/core/report'
import { buildQueue } from '@/core/radio'
import { pickDailyEpisodes, EPISODES } from '@/core/radio/episodes'
import { collectRecentWrongs, assembleMockExam, buildExamDoc } from '@/core/mockexam'
import { createTeamRoom, tickMates, claimTeamReward, useTeamRoom } from '@/core/team'
import { enterFocus, exitFocus } from '@/core/focus'
import { purchase, owns } from '@/core/shop'
import { generateWallpaper, availableBuffs, availableThemes } from '@/core/wallpaper'
import { wipeAllUserData, listUserDataKeys } from '@/core/privacy'
import { useFloatingSlots } from '@/core/floatingSlot'
import router from '@/router'
import { pickQuestions, QUESTION_BANK } from '@/core/data/questions'
import { detectRedMark } from '@/core/vision/redDetect'
import { cropEdges, enhanceRed } from '@/core/vision/preprocess'
import { detectSubject } from '@/core/ocr'
import { addWrongEntry, markCorrect, removeEntry, getEntriesByDate, useTodayEntries, useActiveMonsters } from '@/core/wrongbook'
import QuizModal from '@/components/QuizModal.vue'
import FeedbackModal from '@/components/FeedbackModal.vue'
import { results, runGuard } from './selftestState'

const game = useGamification()

/* 第 6 阶段用例的小工具：直接取模块最新状态 */
const roomState = () => useTeamRoom().value
const slotsApi = () => useFloatingSlots()

/* ---------------- 弹窗视觉走查（开发自测用，默认关闭） ----------------
 * 自测页底部有两个开关，打开即可看到小测弹窗 / 反馈弹窗的真实渲染效果，
 * 配合截图做视觉验收，不影响任何业务数据。
 */
const demoQuizOpen = ref(false)
const demoFeedbackOpen = ref(false)
// 截图走查小技巧：/selftest?demo=quiz / ?demo=feedback / ?demo=scan / ?demo=all 打开页面即自动弹出对应弹窗
// 注意：要在 onMounted 里"现读"地址栏参数——路由冒烟用例结束时 push 的 /selftest 会抹掉 query，
// 模块级读一次的话，热更新重挂载后就会丢失 demo 参数。
function currentDemoParam() {
  return new URLSearchParams(location.search).get('demo')
}
/** 按地址栏 demo 参数唤起对应走查弹窗（挂载后调用；㉒ 路由冒烟返回后也会再调一次） */
function applyDemoParam() {
  const demo = currentDemoParam()
  if (demo === 'quiz' || demo === 'all') demoQuizOpen.value = true
  if (demo === 'feedback' || demo === 'all') demoFeedbackOpen.value = true
  if (demo === 'scan' || demo === 'all') window.dispatchEvent(new CustomEvent('fenti:open-scan'))
  if (demo === 'radio' || demo === 'all') window.dispatchEvent(new CustomEvent('fenti:open-radio'))
  if (demo === 'team' || demo === 'all') window.dispatchEvent(new CustomEvent('fenti:open-team'))
  if (demo === 'shop' || demo === 'all') window.dispatchEvent(new CustomEvent('fenti:open-shop'))
  if (demo === 'wallpaper' || demo === 'all') window.dispatchEvent(new CustomEvent('fenti:open-wallpaper'))
  if (demo === 'focus' || demo === 'all') window.dispatchEvent(new CustomEvent('fenti:open-focus'))
}
// 每个走查都在挂载后"现读"地址栏参数再唤起（延迟 300ms 等 App.vue 里的弹窗挂好监听器）
onMounted(() => setTimeout(applyDemoParam, 300))
const demoQuestions = QUESTION_BANK.slice(0, 5)
const demoQuizResult = ref(null)
/** 今日扫题条目（响应式）——小测走查弹窗的"今日扫题回顾"条数据源 */
const todayUploads = useTodayEntries()
const demoTasks = ref(QUESTION_BANK.slice(0, 4).map((q, i) => ({
  id: `demo-${i}`, title: `演示任务·${q.knowledge}`, subject: q.subject, type: '视频课', duration: 60, done: i < 3
})))

/** 记录一条测试结果 */
function report(name, pass, detail = '') {
  results.value.push({ name, pass, detail })
  console[pass ? 'log' : 'error'](`[selftest] ${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

/** 断言工具：不通过就抛错，由 runTest 统一捕获 */
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/** 包装单条用例：捕获异常转为"失败"结果（支持异步用例：fn 返回 Promise 即可） */
const pendingAsyncTests = []
function runTest(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      pendingAsyncTests.push(
        result.then((detail) => report(name, true, detail || ''))
          .catch((error) => report(name, false, error.message))
      )
    } else {
      report(name, true, result || '')
    }
  } catch (error) {
    report(name, false, error.message)
  }
}

onMounted(async () => {
  // 防重入：Vite 热更新会重挂载本组件，若旧的一轮异步用例还在跑，
  // 两轮断言会互相污染（各自"before 基准"交叉错乱）。
  // runGuard 是模块级共享标记（见 selftestState.js），重挂载也有效，全程只跑一次。
  if (runGuard.started) {
    console.warn('[selftest] 检测到重复挂载，跳过本轮（上一轮仍在运行）')
    return
  }
  runGuard.started = true

  /* ---------------- 测试前：快照 localStorage，测试后恢复 ---------------- */
  const snapshot = { ...localStorage }
  const restore = () => {
    localStorage.clear()
    for (const [k, v] of Object.entries(snapshot)) localStorage.setItem(k, v)
    loadPlan()
  }

  try {
    /* ========== ① 任务按天拆分 ========== */
    runTest('① 计划按天拆分：概括性任务铺满每天时长', () => {
      const plan = generatePlan({ examDays: 4, hoursPerDay: 2, weakSubjects: ['数量关系'] })
      const all = plan.stages.flatMap((s) => s.tasks)
      // 任务总量（分钟）：正课分钟应 ≈ 总时长（±30 分钟/天以内的取整误差），弹性缓冲日不计
      const planned = all.filter((t) => t.duration > 0).reduce((n, t) => n + t.duration, 0)
      const expect = 4 * 2 * 60
      assert(Math.abs(planned - expect) <= 4 * 30, `正课分钟应 ≈ ${expect}，实际 ${planned}`)
      // 每天都应有任务且不超过 10 小时
      const dayMin = {}
      for (const t of all) if (typeof t.day === 'number') dayMin[t.day] = (dayMin[t.day] || 0) + t.duration
      for (let d = 1; d <= 4; d++) {
        assert(dayMin[d] > 0, `第 ${d} 天应有任务`)
        assert(dayMin[d] <= 10 * 60, `第 ${d} 天不应超过 10 小时`)
      }
      // 每个任务都是 30 分钟整块的概括性提醒
      for (const t of all) {
        assert(t.duration === 0 || t.duration % 30 === 0 || t.duration === 20, `任务时长应为 30 的倍数（或 20min 碎片），实际 ${t.duration}`)
      }
      return `${all.length} 个任务铺满 4 天，单日均 ≤10h ✓`
    })

    runTest('① 自定义计划也是概括性提醒：行测/申论双轨、不含具体科目内容', () => {
      const plan = generatePlan({ examDays: 30, hoursPerDay: 4, weakSubjects: [] })
      const all = plan.stages.flatMap((s) => s.tasks)
      const titles = all.map((t) => t.title).join('|')
      assert(titles.includes('行测学习'), '应有行测学习提醒任务')
      assert(titles.includes('申论学习'), '应有申论学习提醒任务')
      assert(titles.includes('课后练习'), '应有课后练习提醒任务')
      assert(titles.includes('素材积累'), '应有素材积累提醒任务')
      assert(titles.includes('错题重做'), '刷题巩固关应有错题重做任务')
      assert(titles.includes('全真模考'), '套卷模拟关应有模考任务')
      // 概括性提醒：不应出现旧版的具体科目课程名
      for (const bad of ['行程问题', '逻辑填空', '增长率专项', '图形推理规律', '归纳概括入门']) {
        assert(!titles.includes(bad), `不应再出现具体学习内容「${bad}」`)
      }
      // 常识碎片每天 20min 全周期覆盖
      const cs = all.filter((t) => t.type === '常识积累')
      assert(cs.length === 30 && cs.every((t) => t.duration === 20 && t.subject === '常识判断'), '常识碎片应 30 天每天 20min')
      return '行测/申论双轨提醒 ✓ / 无具体科目内容 ✓ / 常识碎片 30 天 ✓'
    })

    /* ========== 以下用例需要一份"已入库"的计划 ========== */
    const plan = createPlan({ examDays: 3, hoursPerDay: 2, weakSubjects: ['数量关系', '资料分析'] })
    // 3天×2小时=6 任务；各关任务数 [1,2,2,1]（余数补最后一关）

    runTest('② 小测判分：全对通过', () => {
      const dayTasks = plan.stages.flatMap((s) => s.tasks).filter((t) => t.day === 1)
      const questions = pickQuestions(dayTasks)
      assert(questions.length === 5, `应出 5 道题，实际 ${questions.length}`)
      const answers = questions.map((q) => q.answer)
      const result = recordQuiz(1, questions, answers)
      assert(result.correct === 5 && result.passed, '全对应 5/5 且通过')
      return `5/5（100%）通过 ✓`
    })

    runTest('② 小测判分：错 3 道不通过（<60%）', () => {
      const dayTasks = plan.stages.flatMap((s) => s.tasks).filter((t) => t.day === 1)
      const questions = pickQuestions(dayTasks)
      const answers = questions.map((q, i) => (q.answer + 1 + i % 2) % 4) // 全部答错
      const result = recordQuiz(99, questions, answers) // 写第 99 天，不污染第 1 天成绩
      assert(result.correct === 0 && !result.passed, '全错应不通过')
      assert(plan.quizzes[1].passed === true, '第 1 天的通过记录不应被第 99 天覆盖')
      return `0/5（0%）不通过 ✓`
    })

    runTest('③ 按天解锁：小测通过后才解锁次日', () => {
      assert(isDayUnlocked(plan, 1) === true, '第 1 天应永远解锁')
      // 第 1 天小测已通过（用例②），所以第 2 天应已解锁
      assert(isDayUnlocked(plan, 2) === true, '第 1 天小测通过后，第 2 天应解锁')
      // 第 2 天没测，第 3 天应锁定
      assert(isDayUnlocked(plan, 3) === false, '第 2 天小测未通过，第 3 天应锁定')
      return '第 1 天解锁 ✓ / 第 2 天解锁 ✓ / 第 3 天锁定 ✓'
    })

    runTest('③ 任务勾选：锁定天的任务会被软萌拦截', () => {
      // 找一个第 3 天的任务（此时第 3 天锁定）
      const lockedTask = plan.stages.flatMap((s) => s.tasks).find((t) => t.day === 3)
      const stage = plan.stages.find((s) => s.tasks.some((t) => t.id === lockedTask.id))
      const r2 = toggleTask(stage.id, lockedTask.id)
      assert(r2.ok === false, '锁定天的任务不应允许勾选')
      assert(typeof r2.reason === 'string' && r2.reason.length > 0, '拦截时必须给软萌原因文案')
      return `拦截成功，原因："${r2.reason}" ✓`
    })

    runTest('④ 规则池：未完成任务自动顺延（插入补练任务）', () => {
      const before = plan.stages.reduce((n, s) => n + s.tasks.length, 0)
      const unfinished = [{ id: 'x-1', title: '测试未完成任务', subject: '常识判断', type: '视频课', duration: 60, done: false }]
      const { messages, applied } = evaluatePlanRules(
        { stageId: 'foundation', unfinishedTasks: unfinished }, plan
      )
      const after = plan.stages.reduce((n, s) => n + s.tasks.length, 0)
      assert(after === before + 1, `应插入 1 个补练任务（${before}→${after}）`)
      assert(applied.includes('postpone-unfinished'), '顺延规则应命中')
      assert(messages.length > 0, '应产生粉蹄提示语')
      const makeup = plan.stages.find((s) => s.id === 'foundation').tasks.at(-1)
      assert(makeup.title.startsWith('补·') && makeup.day === null, '补练任务应有"补·"前缀且 day 为空')
      return `"${messages[0]}" ✓`
    })

    runTest('④ 规则池：薄弱科目自动补弱（插入 2 节加餐课）', () => {
      const before = plan.stages.reduce((n, s) => n + s.tasks.length, 0)
      const { messages, applied } = evaluatePlanRules(
        { stageId: 'foundation', dailyAccuracy: 0.6, weakSubjects: plan.weakSubjects }, plan
      )
      const after = plan.stages.reduce((n, s) => n + s.tasks.length, 0)
      assert(after === before + 2, `应插入 2 节补弱课（${before}→${after}）`)
      assert(applied.includes('weak-subject-boost'), '补弱规则应命中')
      return `"${messages[0]}" ✓`
    })

    runTest('④ 规则池扩展性：新规则注册即生效（零改动扩展）', () => {
      // 动态注册一条临时规则，验证"丢进池子就生效"的扩展机制
      const unregister = registerPlanRule({
        id: 'selftest-temp', name: '自测临时规则', priority: 99,
        when: () => true,
        adjust: () => ({ message: '自测规则生效' })
      })
      const { messages, applied } = evaluatePlanRules({}, plan)
      unregister() // 测完注销，保持规则池干净
      assert(applied.includes('selftest-temp'), '临时规则应被执行')
      assert(messages.includes('自测规则生效'), '临时规则的提示语应出现')
      assert(!listPlanRules().some((r) => r.id === 'selftest-temp'), '注销后规则应离开规则池')
      return '注册→生效→注销，全流程 ✓'
    })

    runTest('⑤ 视频链接填入：校验 http 开头', () => {
      const task = plan.stages[0].tasks[0]
      assert(setTaskVideoUrl(plan.stages[0].id, task.id, 'not-a-url') === false, '非法链接应被拒绝')
      assert(setTaskVideoUrl(plan.stages[0].id, task.id, 'https://example.com/course') === true, '合法链接应保存')
      assert(task.videoUrl === 'https://example.com/course', '链接应写入任务')
      return '非法拒绝 ✓ / 合法保存 ✓'
    })

    runTest('⑥ 体重/金币联动：全勤 -0.5 斤并持久化', () => {
      const wBefore = game.weight
      changeWeight(-0.5, '自测：全勤')
      assert(game.weight === Math.round((wBefore - 0.5) * 10) / 10, '体重应 -0.5')
      const saved = JSON.parse(localStorage.getItem('fenti-game-v1'))
      assert(saved.weight === game.weight, 'localStorage 应同步保存体重')
      changeWeight(1, '自测：未完成')
      assert(game.weight === Math.round((wBefore + 0.5) * 10) / 10, '增重 1 斤后应为起点 +0.5')
      changeWeight(-0.5, '自测：还原') // 数值还原，不影响后续
      return `${wBefore}→${wBefore - 0.5}→${wBefore + 0.5}→${game.weight} ✓，存档体重 ${saved.weight} 斤 ✓`
    })

    runTest('⑥ 金币联动：加减即时生效并持久化', () => {
      const cBefore = game.coins
      addCoins(10, '自测：全勤奖励')
      assert(game.coins === cBefore + 10, '金币应 +10')
      const saved = JSON.parse(localStorage.getItem('fenti-game-v1'))
      assert(saved.coins === game.coins, 'localStorage 应同步保存金币')
      addCoins(-10, '自测：回滚')
      assert(game.coins === cBefore, '金币应可精确回滚')
      return `金币 ${cBefore}→${cBefore + 10}→${cBefore} ✓`
    })

    /* ================= 第 4 阶段：扫题 + 错题本 =================
     * 用合成画布模拟拍照：红叉 / 红勾 / 红笔涂改 / 空白四种卷面
     */

    /** 画一张"卷子"：白底 + 一些黑字痕迹 + 可叠加红笔标记 */
    function makePaper(drawRed) {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 240
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 320, 240)
      // 黑色印刷题干痕迹（横线模拟文字行）
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = 3
      for (let y = 40; y <= 160; y += 24) {
        ctx.beginPath()
        ctx.moveTo(30, y)
        ctx.lineTo(290, y)
        ctx.stroke()
      }
      // 黑色作答笔迹
      ctx.strokeStyle = '#222222'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(60, 190)
      ctx.lineTo(260, 196)
      ctx.stroke()
      // 红笔标记由用例自己画
      drawRed?.(ctx)
      return canvas
    }

    const redPen = (ctx) => { ctx.strokeStyle = '#e23c3c'; ctx.lineWidth = 6; ctx.lineCap = 'round' }

    runTest('⑦ 红笔判定：红笔叉号 → 错题', () => {
      const paper = makePaper((ctx) => {
        redPen(ctx)
        ctx.beginPath(); ctx.moveTo(120, 60); ctx.lineTo(200, 140); ctx.stroke()  // ↘
        ctx.beginPath(); ctx.moveTo(200, 60); ctx.lineTo(120, 140); ctx.stroke()  // ↙
      })
      const r = detectRedMark(paper)
      assert(r.verdict === 'wrong', `叉号应判错题，实际 ${r.verdict}（${r.hint}）`)
      return `${r.hint} ✓`
    })

    runTest('⑦ 红笔判定：红笔对勾 → 答对', () => {
      const paper = makePaper((ctx) => {
        redPen(ctx)
        ctx.beginPath(); ctx.moveTo(120, 110); ctx.lineTo(150, 140); ctx.stroke()  // 短撇
        ctx.beginPath(); ctx.moveTo(150, 140); ctx.lineTo(210, 70); ctx.stroke()   // 长提
      })
      const r = detectRedMark(paper)
      assert(r.verdict === 'right', `对勾应判答对，实际 ${r.verdict}（${r.hint}）`)
      return `${r.hint} ✓`
    })

    runTest('⑦ 红笔判定：红笔长涂改 → 错题', () => {
      const paper = makePaper((ctx) => {
        redPen(ctx)
        // 一道又长又重的斜线划掉整行作答
        ctx.beginPath(); ctx.moveTo(40, 180); ctx.lineTo(300, 130); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(40, 190); ctx.lineTo(300, 145); ctx.stroke()
      })
      const r = detectRedMark(paper)
      assert(r.verdict === 'wrong', `涂改应判错题，实际 ${r.verdict}（${r.hint}）`)
      return `${r.hint} ✓`
    })

    runTest('⑦ 红笔判定：空白卷面 → 未做题', () => {
      const paper = makePaper(null) // 只有黑字，没有任何红笔
      const r = detectRedMark(paper)
      assert(r.verdict === 'blank', `无红笔应判未做，实际 ${r.verdict}`)
      return `${r.hint} ✓`
    })

    runTest('⑧ 预处理：裁剪边缘能去掉四周空白', () => {
      // 大白底中间一块"内容区"
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 400, 300)
      ctx.fillStyle = '#dddddd' // 模拟内容：灰色方块
      ctx.fillRect(100, 80, 200, 140)
      const cropped = cropEdges(canvas)
      assert(cropped.width < 400 && cropped.height < 300, `裁剪后应变小（${cropped.width}×${cropped.height}）`)
      assert(cropped.width >= 200 * 0.9, '内容主体不能被裁掉')
      return `400×300 → ${cropped.width}×${cropped.height} ✓`
    })

    runTest('⑧ 预处理：红色增强提升红笔对比度', () => {
      const paper = makePaper((ctx) => {
        redPen(ctx)
        ctx.beginPath(); ctx.moveTo(120, 60); ctx.lineTo(200, 140); ctx.stroke()
      })
      const before = detectRedMark(paper).redRatio
      const enhanced = enhanceRed(paper)
      const after = detectRedMark(enhanced).redRatio
      assert(after >= before, `增强后红像素占比不应下降（${before.toFixed(5)}→${after.toFixed(5)}）`)
      return `红像素占比 ${before.toFixed(5)}→${after.toFixed(5)} ✓`
    })

    runTest('⑨ OCR 科目猜词：关键词命中科目', () => {
      assert(detectSubject('资料分析：2025年GDP增长率为25%，比上年提高5个百分点') === '资料分析', '资料分析关键词应命中')
      assert(detectSubject('下列成语使用恰当的一项是，空穴来风') === '言语理解', '言语关键词应命中')
      assert(detectSubject('根据给定资料概括基层治理的对策') === '申论', '申论关键词应命中')
      assert(detectSubject('xyzabc 乱码') === '', '无关键词应返回空（退回手选）')
      return '资料分析 / 言语理解 / 申论命中 ✓，乱码返回空 ✓'
    })

    runTest('⑩ 错题本：收录打标签 + 攻克消怪发币（幂等）', () => {
      const tiny = document.createElement('canvas')
      tiny.width = 40; tiny.height = 40
      tiny.getContext('2d').fillStyle = '#fff'
      tiny.getContext('2d').fillRect(0, 0, 40, 40)
      const img = tiny.toDataURL('image/jpeg')

      const entry = addWrongEntry({ subject: '数量关系', image: img, date: '2026-10-08' })
      assert(entry.subject === '数量关系' && entry.date === '2026-10-08', '科目 / 日期标签应写入')
      assert(entry.status === 'wrong', '新错题应是小怪兽存活状态')

      const cBefore = game.coins
      const r1 = markCorrect(entry.id)
      assert(r1.changed && r1.coinsGiven === 1, '首次攻克应消除小怪兽并给 1 金币')
      assert(game.coins === cBefore + 1, '金币应 +1')
      assert(entry.status === 'defeated', '状态应变为已攻克')

      const r2 = markCorrect(entry.id)
      assert(!r2.changed && r2.coinsGiven === 0, '重复攻克不得重复发币（幂等）')
      assert(game.coins === cBefore + 1, '金币不应再变')

      removeEntry(entry.id) // 清理测试数据
      return '收录→标签 ✓ / 攻克→+1 金币 ✓ / 重复攻克不发币 ✓'
    })

    /* ========== 第 5 阶段：大盘 / 周报 / 电台 / 模拟卷 ========== */

    runTest('⑪ 学习日志：合并记账 + 最近 N 天补零序列', () => {
      const today = dateKeyOf()
      recordDay({ minutes: 120, moodScore: 4 })
      recordDay({ quizAccuracy: 0.8 }) // 第二次只传一个字段，其他字段应保留
      const day = getDay(today)
      assert(day.minutes === 120 && day.moodScore === 4 && day.quizAccuracy === 0.8, '合并记账应保留未覆盖字段')

      const last7 = getLastNDays(7)
      assert(last7.length === 7, '应返回 7 天')
      assert(last7[6].date === today, '最后一天应为今天')
      assert(last7.every((d) => typeof d.minutes === 'number'), '无记录的天应补零')
      return '合并记账 ✓ / 7 天补零序列 ✓'
    })

    runTest('⑫ 周报：7 天汇总 + 薄弱模块判定 + 建议生成', () => {
      // 造数据：今天正确率 50%（拉低平均）+ 2 道"判断推理"存活错题（判定薄弱）
      recordDay({ minutes: 240, quizAccuracy: 0.5, moodScore: 3 })
      const w1 = addWrongEntry({ subject: '判断推理', image: 'data:image/jpeg;base64,x1' })
      const w2 = addWrongEntry({ subject: '判断推理', image: 'data:image/jpeg;base64,x2' })

      const report = generateWeeklyReport()
      assert(report.days.length === 7, '周报应覆盖 7 天')
      assert(report.totals.studyMinutes >= 240, '学习分钟应被汇总')
      assert(report.totals.avgAccuracy != null && report.totals.avgAccuracy <= 0.5, '平均正确率应被计算')
      assert(report.weakSubjects.includes('判断推理'), '存活错题最多的科目应判为薄弱模块')
      assert(report.suggestions.length > 0, '至少应产生 1 条下周建议')
      assert(report.suggestions.some((s) => s.includes('判断推理')), '建议应点名薄弱模块')

      removeEntry(w1.id); removeEntry(w2.id) // 清理测试数据
      return `薄弱模块：${report.weakSubjects.join('、')}；建议 ${report.suggestions.length} 条 ✓`
    })

    runTest('⑬ 电台：三种模式选曲 + 每日推送确定性', () => {
      const daily = buildQueue('daily')
      assert(daily.length === 3, `每日推送应出 3 条，实际 ${daily.length}`)
      const again = pickDailyEpisodes()
      assert(JSON.stringify(daily.map((e) => e.id)) === JSON.stringify(again.map((e) => e.id)), '同一天两次抽取应一致（种子确定）')
      const loop = buildQueue('loop')
      assert(loop.length === EPISODES.length, '全板块循环应包含全部节目')
      // 薄弱定向：有错题为"存活错题最多的科目"（并列第一算一组），没错题才兜底常识判断。
      // 注意：走查时若用 ?seed=wrongbook 预灌了错题，这里会命中真实薄弱科目而非兜底——两种都算对。
      const weak = buildQueue('weak')
      assert(weak.length > 0, '薄弱定向应至少出 1 条')
      const active = useActiveMonsters().value
      if (active.length > 0) {
        const counts = active.reduce((m, e) => m.set(e.subject, (m.get(e.subject) || 0) + 1), new Map())
        const max = Math.max(...counts.values())
        const tied = [...counts.entries()].filter(([, n]) => n === max).map(([s]) => s)
        assert(weak.every((e) => tied.includes(e.subject)), `有存活错题时应定向到并列最多的科目组「${tied.join('、')}」`)
      } else {
        assert(weak.every((e) => e.subject === '常识判断'), '没错题时薄弱定向应兜底常识判断')
      }
      return `daily ${daily.length} 条 ✓ / loop ${loop.length} 条 ✓ / weak ${active.length > 0 ? '定向薄弱' : '兜底常识'} ✓`
    })

    runTest('⑭ 模拟卷：30 天窗口筛选 + 同图去重 + 科目比例分区', () => {
      const old = addWrongEntry({ subject: '资料分析', image: 'data:image/jpeg;base64,old' })
      old.createdAt = new Date(Date.now() - 35 * 86400000).toISOString() // 改成 35 天前
      const recent = addWrongEntry({ subject: '资料分析', image: 'data:image/jpeg;base64,recent' })
      const dup1 = addWrongEntry({ subject: '言语理解', image: 'data:image/jpeg;base64,same' })
      const dup2 = addWrongEntry({ subject: '言语理解', image: 'data:image/jpeg;base64,same' }) // 同图重复导入

      const wrongs = collectRecentWrongs(30)
      assert(!wrongs.some((w) => w.id === old.id), '35 天前的错题应被 30 天窗口过滤')
      assert(wrongs.filter((w) => w.image === 'data:image/jpeg;base64,same').length === 1, '同一张图重复导入应去重为 1 道')

      const exam = assembleMockExam(wrongs)
      assert(exam.sections.length >= 2, `应分出至少 2 个科目区块，实际 ${exam.sections.length}`)
      assert(exam.total === wrongs.length, '卷子总题数应等于可用去重错题数')
      assert(exam.sections.every((s) => s.ratio > 0 && s.ratio <= 1), '每个区块的比例应在 (0,1]')

      removeEntry(old.id); removeEntry(recent.id); removeEntry(dup1.id); removeEntry(dup2.id) // 清理测试数据
      return `窗口筛选 ✓ / 去重 ✓ / ${exam.sections.length} 个科目分区 ✓`
    })

    runTest('⑯ 模拟卷 PDF：真实题图嵌入 + A4 版式生成（异步）', async () => {
      // 造 1 道带真实题图的错题，走完整组卷 → PDF 排版链路（不触发下载）
      const ep = addWrongEntry({ subject: '常识判断', image: makePaper(null).toDataURL('image/jpeg') })
      const exam = assembleMockExam(collectRecentWrongs(30).filter((w) => w.id === ep.id))
      const doc = await buildExamDoc(exam)
      assert(doc.getNumberOfPages() >= 1, 'PDF 至少应有 1 页')
      const pageSize = doc.internal.pageSize
      assert(Math.abs(pageSize.width - 210) < 1 && Math.abs(pageSize.height - 297) < 1, '页面尺寸必须是 A4（210×297mm）')
      removeEntry(ep.id) // 清理测试数据
      return `共 ${doc.getNumberOfPages()} 页，尺寸 ${pageSize.width}×${pageSize.height}mm ✓`
    })

    /* ========== 第 6 阶段：结伴房 / 幻境 / 商店 / 壁纸 / 隐私 / 全路径 ========== */

    runTest('⑰ 猪队友：建房 2 人 + 随时间推进 + 结伴奖励每日一次', () => {
      createTeamRoom()
      assert(roomState().mates.length === 2, '房间应有 2 位队友')

      // 模拟过了 2 个回合的时间：把 lastStepAt 拨回 2×节奏分钟之前
      const mate = roomState().mates[0]
      mate.lastStepAt = Date.now() - mate.minutesPerStep * 2 * 60000
      tickMates()
      assert(mate.doneTasks === 4, `队友应推进 2 回合 = 4 任务，实际 ${mate.doneTasks}`)

      const coinsBefore = game.coins
      const r1 = claimTeamReward(true) // 模拟今日全勤
      assert(r1.ok && r1.coins === 4, `全勤应领 2 队友×2=4 金币，实际 ${r1.coins}`)
      assert(game.coins === coinsBefore + 4, '金币应 +4')
      const r2 = claimTeamReward(true)
      assert(!r2.ok && r2.reason === 'already-claimed', '同一天重复领取应被拒绝')
      const r3 = claimTeamReward(false) // 未全勤
      assert(!r3.ok && r3.reason === 'not-all-done', '未全勤不应发奖')
      return '建房 ✓ / 时间推进 ✓ / 奖励每日一次 ✓'
    })

    runTest('⑱ 专注幻境：完成发奖 + 中途退出只记账', () => {
      const minutesBefore = getDay().minutes
      // 模拟专注 25 分钟完整完成（注入结束时间戳，不用真等）
      enterFocus(25)
      const fullResult = exitFocus(Date.now() + 25 * 60000)
      assert(fullResult.full && fullResult.coins === 2, '完整完成应发 2 金币')
      assert(fullResult.minutes === 25, '应计入 25 分钟')
      assert(getDay().minutes === minutesBefore + 25, '学习日志应 +25 分钟')

      // 中途退出：无金币但分钟照记
      const coinsNow = game.coins
      enterFocus(25)
      const halfResult = exitFocus(Date.now() + 10 * 60000)
      assert(!halfResult.full && halfResult.coins === 0, '中途退出不应发金币')
      assert(halfResult.minutes === 10, '中途退出应记入 10 分钟')
      assert(game.coins === coinsNow, '中途退出金币不变')
      return '完成 +2 金币并记账 ✓ / 中途只记账 ✓'
    })

    runTest('⑲ 金币商店：扣款购买 / 余额不足拦截 / 投喂减重', () => {
      addCoins(100, '测试注资')
      const coinsBefore = game.coins
      const weightBefore = game.weight

      const buy = purchase('feed-star') // 海星投喂 12 币
      assert(buy.ok, `投喂购买应成功：${buy.message}`)
      assert(game.coins === coinsBefore - 12, '应扣 12 金币')
      assert(game.weight === weightBefore - 1, '投喂应立刻减重 1 斤')
      assert(owns('feed-star'), '购买记录应入库')

      const poor = purchase('shield-card') // 免增重卡 5 币，成功购买（供后续反馈结算测试护盾逻辑）
      assert(poor.ok, `护盾卡购买应成功：${poor.message}`)
      // 强行花光余额再测拦截
      addCoins(-game.coins, '测试清零')
      const denied = purchase('shield-card')
      assert(!denied.ok && denied.reason === 'no-coins', '余额不足应被拦截且不发商品')

      const ghost = purchase('not-exist')
      assert(!ghost.ok && ghost.reason === 'not-found', '不存在商品应返回 not-found')
      return '扣款 ✓ / 投喂减重 ✓ / 余额拦截 ✓ / 幽灵商品拦截 ✓'
    })

    runTest('⑳ 幸运壁纸：1080×1920 PNG + buff 池随商店解锁扩容（异步）', async () => {
      addCoins(100, '测试注资') // ⑲ 末尾把余额清零了，这里重新注资
      // 用相对断言：历史存档可能已解锁过商品，"购买后应比购买前多"永远成立
      const baseBuffs = availableBuffs().length
      const baseThemes = availableThemes().length

      purchase('lucky-buff') // 解锁隐藏 buff（已拥有时再购一次也不影响断言）
      assert(availableBuffs().length === baseBuffs + 6, '解锁后 buff 池应比购买前多 6 条')
      purchase('theme-starry')
      assert(availableThemes().length === baseThemes + 1, '解锁后主题应比购买前多 1 个')

      const dataUrl = generateWallpaper({ buff: '测试幸运 buff', themeId: 'starry' })
      assert(dataUrl.startsWith('data:image/png'), '应输出 PNG dataURL')
      const size = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ w: img.width, h: img.height })
        img.onerror = reject
        img.src = dataUrl
      })
      assert(size.w === 1080 && size.h === 1920, `壁纸应 1080×1920，实际 ${size.w}×${size.h}`)
      return `PNG ✓ / 1080×1920 ✓ / buff 池 ${baseBuffs}→${baseBuffs + 6} ✓ / 主题 ${baseThemes}→${baseThemes + 1} ✓`
    })

    runTest('㉑ 隐私：一键清空只删本应用数据', () => {
      assert(listUserDataKeys().length > 0, '测试环境中应已有本应用数据')
      localStorage.setItem('other-site-data', '1') // 放一个"别人的"数据验证不误删
      const removed = wipeAllUserData()
      assert(removed > 0, '应删除至少 1 项本应用数据')
      assert(listUserDataKeys().length === 0, '清空后本应用键应为 0')
      assert(localStorage.getItem('other-site-data') === '1', '非本应用的数据不应被误删')
      localStorage.removeItem('other-site-data')
      return `删除 ${removed} 项，非本应用数据完好 ✓`
    })

    runTest('㉒ 全路径路由冒烟：遍历所有页面无死路（异步）', async () => {
      // 先打通第一关（任务勾选是解锁下一关的前置），再遍历全部正式路由：
      // 已解锁页面必须直达，未解锁关卡必须被守卫弹回地图——两种结果都算"路径正确"。
      const planNow = loadPlan()
      for (const t of planNow.stages[0].tasks) {
        if (!t.done) toggleTask('foundation', t.id)
      }
      const backQuery = location.search // 进冒烟前的 query（如 ?demo=quiz），返回时要原样带回
      const cases = [
        ['/onboarding', '/onboarding'], // 引导页永远可进
        ['/map', '/map'],
        ['/dashboard', '/dashboard'],
        ['/wrongbook', '/wrongbook'],
        ['/level/foundation', '/level/foundation'],
        ['/level/sorting', '/level/sorting'],   // 第一关已打通 → 第二关应可达
        ['/level/practice', '/map'],            // 第二关没打通 → 应被弹回地图
        ['/level/practice?preview=1', '/level/practice'], // 带 preview=1 → 绕过守卫可只读预览
        ['/level/sprint', '/map'],
        ['/level/not-exist', '/map'],     // 乱写的关卡 id → 回地图
        ['/definitely-not-a-page', '/map'] // 兜底路由 → 回首页分流到地图
      ]
      for (const [input, expected] of cases) {
        await router.push(input)
        assert(router.currentRoute.value.path === expected, `访问 ${input} 应到 ${expected}，实际 ${router.currentRoute.value.path}`)
      }
      // 冒烟结束回到自测页本身（不然用户会被留在地图上）；
      // 带回进冒烟前的 query——走查参数（如 ?demo=quiz）不能被中途路由抹掉
      await router.push('/selftest' + backQuery)
      assert(router.currentRoute.value.path === '/selftest', '应能回到自测页')
      // 地址栏参数回来了，但组件已被重新挂载、走查定时器早已错过——补唤一次
      setTimeout(applyDemoParam, 300)
      return `${cases.length} 条路径全部符合预期 ✓`
    })

    runTest('㉓ 悬浮插槽：5 个全时段入口全部注册', () => {
      const ids = slotsApi().slots.map((s) => s.id)
      for (const id of ['scan', 'radio', 'team', 'focus', 'wallpaper']) {
        assert(ids.includes(id), `悬浮入口 "${id}" 未注册`)
      }
      return `已注册：${ids.join(' / ')} ✓`
    })

    /* ================= 第 7 阶段新增：国考计划 + 账号/同步（v5：行测/申论双轨提醒版） ================= */

    runTest('㉔ 国考计划：五阶段天数 + 听课筑基关每日任务结构', () => {
      const plan = generateGuokaoPlan({ weakSubjects: ['言语理解'] })
      const all = plan.stages.flatMap((s) => s.tasks)
      assert(plan.planType === 'guokao2027', 'planType 应为 guokao2027')
      assert(plan.version === 5, `计划版本应为 5，实际 ${plan.version}`)
      assert(plan.stages.length === 5, `应为 5 个阶段，实际 ${plan.stages.length}`)
      // 五段天数 14+3+21+7+15=60
      const days = plan.stages.map((s) => s.dayEnd - s.dayStart + 1)
      assert(days.join(',') === '14,3,21,7,15', `五段天数应为 14,3,21,7,15，实际 ${days.join(',')}`)
      // 听课筑基关：每天 = 上午行测3h + 下午申论3h + 课后练习2h + 素材积累1h（+常识20min）
      const foundation = plan.stages[0]
      for (let d = 1; d <= 14; d++) {
        const dt = foundation.tasks.filter((t) => t.day === d)
        const byType = (ty) => dt.filter((t) => t.type === ty).reduce((n, t) => n + t.duration, 0)
        assert(byType('行测学习') === 180, `第 ${d} 天行测学习应 3h`)
        assert(byType('申论学习') === 180, `第 ${d} 天申论学习应 3h`)
        assert(byType('课后练习') === 120, `第 ${d} 天课后练习应 2h`)
        assert(byType('素材积累') === 60, `第 ${d} 天素材积累应 1h`)
      }
      // 常识碎片化学习模块：全 60 天每天 1 个 20min 碎片，且归在对应关卡里
      const csTasks = all.filter((t) => t.type === '常识积累')
      assert(csTasks.length === 60, `常识碎片应 60 个，实际 ${csTasks.length}`)
      assert(csTasks.every((t) => t.duration === 20 && t.subject === '常识判断'), '常识碎片应为常识判断科 20min')
      for (let d = 1; d <= 60; d++) {
        assert(csTasks.filter((t) => t.day === d).length === 1, `第 ${d} 天应恰有 1 个常识碎片`)
      }
      // 单日防过载：任何一天不超过 10 小时
      const dayMin = {}
      for (const t of all) if (typeof t.day === 'number') dayMin[t.day] = (dayMin[t.day] || 0) + t.duration
      const worst = Math.max(...Object.values(dayMin))
      assert(worst <= GUOKAO.dailyCapMin, `单日最高 ${worst / 60}h 超过 10h 上限`)
      return `五段 ${days.join('/')} 天 ✓ 听课关每天 行测3h+申论3h+练习2h+素材1h ✓ 常识碎片 60 天 ✓ 最忙一天 ${worst / 60}h ✓`
    })

    runTest('㉕ 梳理+专项双轨：行测/申论双线 + 思维导图上传', () => {
      const plan = generateGuokaoPlan({ weakSubjects: [] })
      const sorting = plan.stages.find((s) => s.id === 'sorting')
      const practice = plan.stages.find((s) => s.id === 'practice')
      // 梳理关：每天行测梳理 3h + 申论梳理 3h（思维导图上传任务单独校验，不计入梳理时长）
      for (let d = 15; d <= 17; d++) {
        const dt = sorting.tasks.filter((t) => t.day === d)
        const bySubject = (su) => dt.filter((t) => t.subject === su && t.type === '知识梳理').reduce((n, t) => n + t.duration, 0)
        assert(bySubject('行测') === 180, `第 ${d} 天行测梳理应 3h`)
        assert(bySubject('申论') === 180, `第 ${d} 天申论梳理应 3h`)
      }
      // 思维导图上传任务：行测/申论各 1 个
      const mapTasks = sorting.tasks.filter((t) => t.type === '思维导图')
      assert(mapTasks.length === 2, `思维导图上传任务应 2 个（行测/申论各 1），实际 ${mapTasks.length}`)
      assert(mapTasks.every((t) => t.upload === 'mindmap' && t.duration === 20), '思维导图任务应可上传且占 20min')
      assert([...new Set(mapTasks.map((t) => t.subject))].sort().join(',') === '申论,行测', '思维导图应覆盖行测+申论两轨')
      // 专项关：每天行测练习 3h + 申论练习 3h
      for (let d = 18; d <= 38; d++) {
        const dt = practice.tasks.filter((t) => t.day === d)
        const byType = (ty) => dt.filter((t) => t.type === ty).reduce((n, t) => n + t.duration, 0)
        assert(byType('行测练习') === 180, `第 ${d} 天行测专项练习应 3h`)
        assert(byType('申论练习') === 180, `第 ${d} 天申论专项练习应 3h`)
      }
      return `梳理关 3 天 × 行测/申论各 3h ✓ 思维导图上传 2 张 ✓ 专项关 21 天双轨练习 ✓`
    })

    runTest('㉖ 刷题巩固三项任务 + 套卷模拟三轮循环', () => {
      const plan = generateGuokaoPlan({ weakSubjects: [] })
      const drill = plan.stages.find((s) => s.id === 'drill')
      const sprint = plan.stages.find((s) => s.id === 'sprint')
      // 刷题巩固关：每天 = 刷题任务 3h + 错题重做 1h + 题目分析 1h
      for (let d = 39; d <= 45; d++) {
        const dt = drill.tasks.filter((t) => t.day === d)
        const byType = (ty) => dt.filter((t) => t.type === ty).reduce((n, t) => n + t.duration, 0)
        assert(byType('刷题任务') === 180, `第 ${d} 天刷题任务应 3h`)
        assert(byType('错题重做') === 60, `第 ${d} 天错题重做应 1h`)
        assert(byType('题目分析') === 60, `第 ${d} 天题目分析应 1h`)
      }
      // 套卷模拟关：每 3 天一轮 ×5 轮（模考 4h → 错题分析 2h → 补漏训练 2h）
      for (let r = 1; r <= 5; r++) {
        const base = 46 + (r - 1) * 3
        const mock = sprint.tasks.filter((t) => t.round === r && t.type === '模考')
        const fix = sprint.tasks.filter((t) => t.round === r && t.type === '错题分析')
        const patch = sprint.tasks.filter((t) => t.round === r && t.type === '补漏训练')
        assert(mock.length === 1 && mock[0].duration === 240 && mock[0].day === base, `第 ${r} 轮模考应 4h、在第 ${base} 天`)
        assert(fix.length === 1 && fix[0].duration === 120 && fix[0].day === base + 1, `第 ${r} 轮错题分析应 2h、在第 ${base + 1} 天`)
        assert(patch.length === 1 && patch[0].duration === 120 && patch[0].day === base + 2, `第 ${r} 轮补漏训练应 2h、在第 ${base + 2} 天`)
      }
      return `巩固关 7 天 × 刷题/错题重做/题目分析 ✓ 套卷关 5 轮 ×（模考4h→错题分析2h→补漏训练2h）✓`
    })

    runTest('㉗ 防过载规则：连续两天 <60% 后续任务量下调 20%', () => {
      const plan = generateGuokaoPlan({ weakSubjects: [] })
      plan.quizzes[21] = { accuracy: 0.4, passed: false }
      plan.quizzes[22] = { accuracy: 0.5, passed: false }
      const before = plan.stages.flatMap((s) => s.tasks)
        .filter((t) => typeof t.day === 'number' && t.day > 22 && t.duration === 20).length
      const result = evaluatePlanRules({ day: 22, unfinishedTasks: [], weakSubjects: [] }, plan)
      const after = plan.stages.flatMap((s) => s.tasks)
        .filter((t) => typeof t.day === 'number' && t.day > 22 && t.duration === 20).length
      const removed = before - after
      assert(removed === Math.floor(before / 5), `应免掉 floor(${before}/5)=${Math.floor(before / 5)} 个碎片，实际 ${removed}`)
      assert(result.applied.includes('guokao-ease-off'), '减负规则应命中')
      return `${before} → ${after} 个碎片（-20%）✓`
    })

    runTest('㉘ 同步冲突合并：自动保留最新时间版本', () => {
      const local = [{ key: 'fenti-plan-v1', value: 'A', updatedAt: 100 }]
      const remote = [
        { key: 'fenti-plan-v1', value: 'B', updatedAt: 200 }, // 云端更新 → 采纳
        { key: 'fenti-other', value: 'C', updatedAt: 150 }     // 本地没有 → 采纳
      ]
      const { merged, appliedRemote } = mergeRecords(local, remote)
      assert(appliedRemote.length === 2, '两条云端记录都应被采纳')
      assert(merged.find((r) => r.key === 'fenti-plan-v1').value === 'B', '同键应保留较新的 B')
      // 反向：本地较新时不采纳云端
      const r2 = mergeRecords([{ key: 'k', value: 'new', updatedAt: 300 }], [{ key: 'k', value: 'old', updatedAt: 200 }])
      assert(r2.appliedRemote.length === 0 && r2.merged[0].value === 'new', '本地较新时应保留本地')
      return '云端新→采纳 / 本地新→保留 ✓'
    })

    runTest('㉙ 账号体系：手机号登录 + 7 天免登 + 退出', () => {
      const saved = localStorage.getItem('fenti-account-v1') // 测完还原，不影响开发者登录态
      try {
        const bad = loginWithSms('13800001234', '000000')
        assert(!bad.ok, '错误验证码不应登录成功')
        const badPhone = loginWithSms('123', '888888')
        assert(!badPhone.ok, '非法手机号不应登录成功')
        const ok = loginWithSms('13800001234', '888888')
        assert(ok.ok, '演示验证码应登录成功')
        const acc = useAccount()
        assert(acc.isLoggedIn.value, '登录后应为已登录状态')
        assert(acc.state.user.maskedPhone === '138****1234', '手机号应脱敏显示')
        assert(acc.state.user.expiresAt - acc.state.user.loggedAt === LOGIN_TTL, '免登时长应为 7 天')
        logout()
        assert(!acc.isLoggedIn.value, '退出后应为未登录状态')
        return '登录/拦截/脱敏/7天免登/退出 ✓'
      } finally {
        if (saved) localStorage.setItem('fenti-account-v1', saved)
        else localStorage.removeItem('fenti-account-v1')
      }
    })

    runTest('㉚ 小测出题：优先根据当日扫题上传的错题科目出题', () => {
      // 模拟今天扫题收录了两道"资料分析"错题（date 默认今天）
      const e1 = addWrongEntry({ subject: '资料分析', image: 'data:image/jpeg;base64,t1' })
      const e2 = addWrongEntry({ subject: '资料分析', image: 'data:image/jpeg;base64,t2' })
      try {
        const today = new Date().toLocaleDateString('sv-SE')
        const todays = getEntriesByDate(today)
        assert(todays.length >= 2 && todays.every((e) => e.date === today), 'getEntriesByDate 应返回今天的条目')
        assert(todays.some((e) => e.id === e1.id) && todays.some((e) => e.id === e2.id), '今天新收录的两道应在查询结果里')

        // 当天任务只有"申论"科目，但今天上传了资料分析错题 → 出题应全部优先资料分析
        const dayTasks = [{ subject: '申论', title: '演示任务' }]
        let uploadedHits = 0
        for (let i = 0; i < 20; i++) {
          const qs = pickQuestions(dayTasks, 5, [e1, e2]) // 只传今天这两道，断言更精确
          assert(qs.length === 5, '应出满 5 道题')
          uploadedHits += qs.filter((q) => q.subject === '资料分析').length
        }
        assert(uploadedHits === 100, '上传科目有 5 道题管够，20 轮应全部命中资料分析（实际 ' + uploadedHits + ' 道）')

        // 不传第三参：保持旧行为，只按当天任务科目出题（申论题库 5 道管够）
        const legacy = pickQuestions(dayTasks)
        assert(legacy.length === 5 && legacy.every((q) => q.subject === '申论'), '不传当日上传时应退回当天任务科目')
        return '当日上传科目优先 ✓ / 旧调用兼容 ✓'
      } finally {
        removeEntry(e1.id)
        removeEntry(e2.id)
      }
    })

    runTest('⑮ 图鉴与成就：收集/解锁幂等', () => {
      // 用唯一 id 防止历史存档里已收集过同名考点导致计数误差
      const uniqueKey = `test-star-${Date.now()}`
      const before = Object.keys(game.starlets).length
      collectStarlet(uniqueKey, { name: '测试考点', subject: '常识判断' })
      collectStarlet(uniqueKey, { name: '测试考点', subject: '常识判断' }) // 重复收集
      assert(Object.keys(game.starlets).length === before + 1, '重复收集同一只小猪崽不应增加数量')

      unlockAchievement('test-badge', { title: '测试徽章' })
      const t1 = game.achievements['test-badge'].unlockedAt
      unlockAchievement('test-badge', { title: '测试徽章' })
      assert(game.achievements['test-badge'].unlockedAt === t1, '重复解锁不应刷新时间戳')
      return '小猪崽收集幂等 ✓ / 成就解锁幂等 ✓'
    })
  } finally {
    // 等所有异步用例（PDF 生成 / 壁纸绘制 / 路由冒烟）全部落地，
    // 再恢复 localStorage 快照——否则异步用例的副作用会逃出快照窗口造成存档污染
    await Promise.allSettled(pendingAsyncTests)
    restore()
  }
})
</script>

<template>
  <div class="selftest">
    <h1>🧪 全阶段核心逻辑自测（仅开发环境）</h1>
    <p class="selftest__tip">
      打开本页自动执行全部用例；测试数据已自动还原，不影响你的调试计划。
    </p>
    <ul class="selftest__list">
      <li v-for="(r, i) in results" :key="i" class="selftest__item" :class="{ fail: !r.pass }">
        <span class="selftest__mark">{{ r.pass ? '✅' : '❌' }}</span>
        <div>
          <p class="selftest__name">{{ r.name }}</p>
          <p v-if="r.detail" class="selftest__detail">{{ r.detail }}</p>
        </div>
      </li>
    </ul>
    <p class="selftest__summary">
      通过 {{ results.filter((r) => r.pass).length }} / {{ results.length }} 条
    </p>

    <!-- 弹窗视觉走查开关 -->
    <div class="selftest__demos">
      <el-button @click="demoQuizOpen = true">走查：小测弹窗</el-button>
      <el-button @click="demoFeedbackOpen = true">走查：反馈弹窗</el-button>
    </div>

    <!-- 小测弹窗（答题态 / 结果态切换：结果态看通过效果） -->
    <!-- reviews 绑今日扫题条目：先用 ?seed=wrongbook 灌演示错题，再打开走查即可看到"今日扫题回顾"条 -->
    <QuizModal
      v-model="demoQuizOpen"
      :day="1"
      :questions="demoQuizResult ? null : demoQuestions"
      :reviews="todayUploads"
      :result="demoQuizResult"
      top="6vh"
      @submit="(answers) => {
        const correct = demoQuestions.filter((q, i) => answers[i] === q.answer).length
        demoQuizResult = { correct, total: 5, accuracy: correct / 5, passed: correct / 5 >= 0.6 }
      }"
      @retry="demoQuizResult = null"
    />

    <!-- 反馈弹窗（表单态 / 结果态切换） -->
    <FeedbackModal
      v-model="demoFeedbackOpen"
      :day="1"
      :tasks="demoTasks"
      :quiz="{ correct: 4, total: 5, accuracy: 0.8, passed: true }"
      :outcome="null"
      top="52vh"
    />
  </div>
</template>

<style scoped>
.selftest {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-xxl) var(--space-xl);
  font-family: var(--font-family-base);
}

.selftest h1 {
  font-size: var(--font-size-title);
  color: var(--color-text-primary);
}

.selftest__tip {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
}

.selftest__list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.selftest__item {
  display: flex;
  gap: var(--space-md);
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  box-shadow: var(--shadow-card);
}

.selftest__item.fail {
  border: 2px solid var(--color-warning);
}

.selftest__name {
  margin: 0;
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.selftest__detail {
  margin: var(--space-xs) 0 0;
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.selftest__summary {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-accent-darker);
}
</style>

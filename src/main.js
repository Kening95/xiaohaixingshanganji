/**
 * ============================================================================
 * 应用入口 —— main.js
 * ----------------------------------------------------------------------------
 * 网页启动的顺序：
 *   index.html → main.js（本文件）→ 创建 Vue 应用 → 挂载到 #app → 显示页面
 *
 * 本文件做的事：
 *   1. 创建 Vue 应用实例
 *   2. 注册全局插件：Element Plus（UI 组件库）、Vue Router（页面路由）
 *   3. 引入全局样式
 *   4. 把应用挂载到 index.html 里的 <div id="app">
 * ============================================================================
 */

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installGamification } from './core/gamification'

// Element Plus：现成的按钮、弹窗、进度条等 UI 组件库（已定制成暖橙主题）
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// 全局样式（配色令牌 + 基础样式 + 粉蹄动画）
import '@/assets/styles/index.css'

// 内置悬浮入口（粉蹄扫题 / 常识电台）：全时间段开放，任何页面都能点到。
// 只做"注册"这一件事，界面的渲染交给 App.vue 里的 <FloatingDock />
import '@/core/floatingSlot/builtinSlots'

// 自定义背景：模块引入时立即读取存档并应用（把用户调过的风景配色/背景图
// 写回 CSS 变量），刷新页面后背景不丢失。主地图页负责消费这些变量。
import '@/core/scene'

// 国考计划防过载规则（单日 10h 上限 + 连续低效减负 20%）：
// 只往规则池注册两条新规则，只在 planType === 'guokao2027' 时生效。
import '@/core/planRules/guokaoRules'

// 云端同步引擎（第 7 阶段）：监听本机学习数据变化，登录后自动静默同步。
// 未配置 VITE_SYNC_ENDPOINT 时走"本地模拟云"（跨标签页互通），配置后自动切真实云函数。
import '@/core/sync'

// 1. 创建 Vue 应用，根组件是 App.vue
const app = createApp(App)

/**
 * 抹掉 URL 里的 seed 参数、保留其他参数（如 ?demo=quiz），保持地址栏干净。
 * 之前是整体清空查询串，导致 "?seed=wrongbook&demo=quiz" 组合时 demo 参数被误删。
 */
function stripSeedParam() {
  const params = new URLSearchParams(location.search)
  params.delete('seed')
  const query = params.toString()
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''))
}

// 开发调试小工具：访问 /任意?seed=demo 可一键生成一份演示计划（仅开发环境有效，
// 正式部署的生产环境自动失效），方便跳过引导直接调试主地图等后续页面。
// 已有计划时不重复生成（避免反复刷新重复发新手礼包金币）。
if (import.meta.env.DEV && new URLSearchParams(location.search).get('seed') === 'demo') {
  const { createPlan, hasPlan } = await import('./core/plan')
  if (!hasPlan()) {
    createPlan({ examDays: 30, hoursPerDay: 4, weakSubjects: ['数量关系', '资料分析'] })
  }
  stripSeedParam() // 抹掉 seed 参数，保持 URL 干净
}

// 开发调试小工具：?seed=wrongbook 给错题本塞 2 道演示错题（含合成题图），方便走查页面。
// 顺带生成演示计划，避免被"未完成引导"守卫弹回。
if (import.meta.env.DEV && new URLSearchParams(location.search).get('seed') === 'wrongbook') {
  const { addWrongEntry, useWrongbook } = await import('./core/wrongbook')
  const { createPlan, hasPlan } = await import('./core/plan')
  if (!hasPlan()) {
    createPlan({ examDays: 30, hoursPerDay: 4, weakSubjects: ['数量关系', '资料分析'] })
  }
  if (useWrongbook().value.length === 0) {
    const demoImage = (label) => {
      const canvas = document.createElement('canvas')
      canvas.width = 480; canvas.height = 320
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 320)
      ctx.fillStyle = '#333'; ctx.font = 'bold 20px sans-serif'
      ctx.fillText(label, 24, 48)
      ctx.strokeStyle = '#999'
      for (let y = 90; y < 280; y += 32) {
        ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(456, y); ctx.stroke()
      }
      ctx.strokeStyle = '#e23c3c'; ctx.lineWidth = 6; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(120, 120); ctx.lineTo(200, 200); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(200, 120); ctx.lineTo(120, 200); ctx.stroke()
      return canvas.toDataURL('image/jpeg', 0.7)
    }
    addWrongEntry({ subject: '数量关系', image: demoImage('演示错题 1：工程问题') })
    addWrongEntry({ subject: '资料分析', image: demoImage('演示错题 2：增长率计算') })
  }
  stripSeedParam()
}

// 开发调试小工具：?seed=phase5 给第 5 阶段功能灌演示数据：
if (import.meta.env.DEV && new URLSearchParams(location.search).get('seed') === 'phase5') {
  const { createPlan, hasPlan } = await import('./core/plan')
  const { recordDay, getDay } = await import('./core/stats')
  const { loadWrongbook } = await import('./core/wrongbook')
  const { unlockAchievement } = await import('./core/gamification')
  if (!hasPlan()) {
    createPlan({ examDays: 30, hoursPerDay: 4, weakSubjects: ['数量关系', '资料分析'] })
  }
  // 学习日志：只在空账本时灌，且跳过今天（今天的实时数据由真实使用产生）
  if (Object.keys(getDay()).every((k) => !getDay()[k])) {
    const pattern = [
      { minutes: 240, quizAccuracy: 0.8, moodScore: 4 },
      { minutes: 180, quizAccuracy: 0.6, moodScore: 3 },
      { minutes: 300, quizAccuracy: 1.0, moodScore: 5 },
      { minutes: 0 },
      { minutes: 120, moodScore: 2, wrongAdded: 2 },
      { minutes: 240, quizAccuracy: 0.6, moodScore: 4, radioMinutes: 12 },
      { minutes: 360, quizAccuracy: 0.8, moodScore: 5, radioMinutes: 25 }
    ]
    for (let i = 13; i >= 1; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      recordDay(pattern[(13 - i) % pattern.length], d.toLocaleDateString('sv-SE'))
    }
  }
  // 错题：5 道不同科目；1 道 35 天前（超出模拟卷 30 天窗口，验证筛选）
  if (loadWrongbook().length === 0) {
    const mkImage = (label) => {
      const canvas = document.createElement('canvas')
      canvas.width = 480; canvas.height = 300
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 300)
      ctx.fillStyle = '#333'; ctx.font = 'bold 20px sans-serif'
      ctx.fillText(label, 24, 48)
      ctx.strokeStyle = '#999'
      for (let y = 90; y < 260; y += 32) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(456, y); ctx.stroke() }
      ctx.strokeStyle = '#e23c3c'; ctx.lineWidth = 6; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(120, 120); ctx.lineTo(200, 200); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(200, 120); ctx.lineTo(120, 200); ctx.stroke()
      return canvas.toDataURL('image/jpeg', 0.7)
    }
    const daysAgo = (n) => new Date(Date.now() - n * 86400000)
    const mkEntry = (subject, label, n, status = 'wrong') => ({
      id: `wq-seed-${label}`,
      subject,
      date: daysAgo(n).toLocaleDateString('sv-SE'),
      image: mkImage(label),
      status,
      createdAt: daysAgo(n).toISOString(),
      defeatedAt: status === 'defeated' ? daysAgo(Math.max(0, n - 1)).toISOString() : undefined
    })
    localStorage.setItem('fenti-wrongbook-v1', JSON.stringify({
      entries: [
        mkEntry('数量关系', '演示错题·工程问题', 2),
        mkEntry('数量关系', '演示错题·行程问题', 18),
        mkEntry('言语理解', '演示错题·病句辨析', 4),
        mkEntry('资料分析', '演示错题·增长率', 9),
        mkEntry('判断推理', '演示错题·图形推理', 35), // 超出 30 天窗口
        mkEntry('常识判断', '演示错题·宪法年份', 6, 'defeated')
      ]
    }))
    loadWrongbook()
  }
  unlockAchievement('demo-first-coin', { title: '第一桶金', description: '获得第一枚学习金币', icon: '🪙' })
  unlockAchievement('quiz-ace', { title: '百发百中', description: '小测拿到一次满分', icon: '🎯' })
  stripSeedParam()
}

// 开发调试小工具：?seed=guokao 一键生成 2027 国考 60 天冲刺计划（仅开发环境），
// 方便直接验收五关地图 / 精力池面板 / 四步刷题面板 / 真题 10h 周期（第 7、8 阶段）。
// 空数据 → 直接生成；已有自定义计划 → 自动切换成国考计划（不适用于生产环境）。
if (import.meta.env.DEV && new URLSearchParams(location.search).get('seed') === 'guokao') {
  const { createPlan, loadPlan } = await import('./core/plan')
  const existing = loadPlan()
  if (!existing || existing.planType !== 'guokao2027') {
    createPlan({ planType: 'guokao2027', weakSubjects: ['判断推理', '言语理解'] })
  }
  stripSeedParam()
}

// 2. 安装插件
app.use(router)            // 路由：负责"跳到哪个页面"
app.use(ElementPlus)       // UI 组件库
app.use(installGamification) // 游戏化数值统一接口：注入全局实例方法

// 3. 挂载到页面，自此网页开始渲染
app.mount('#app')

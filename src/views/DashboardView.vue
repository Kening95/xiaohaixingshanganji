<script setup>
/**
 * ============================================================================
 * 可视化进度大盘 —— views/DashboardView.vue（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 四个模块一览（对照需求清单 · 可视化大盘页）：
 *   A. 六科目彩色进度条   —— 每科"已完成任务 / 总任务"，颜色各不相同
 *   B. 学习时长日历热力图 —— 最近 14 周，颜色越深学得越久（GitHub 风格）
 *   C. 考点小猪崽收集图鉴 —— 小测答对收集的考点，没收集到的是灰色剪影
 *   D. 成就徽章墙         —— 全站成就徽章，已点亮发光、未点亮置灰
 *
 * 数据完全同步的秘密：
 *   本页所有数字都直接读 core 层的响应式仓库（plan / stats / gamification），
 *   没有任何一份本地拷贝——用户在关卡页勾一个任务，这里立刻变化。
 *
 * 入口：主地图页顶部进度条点击，或 /dashboard 直达。
 * ============================================================================
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { SUBJECTS, usePlan, useTodayInfo } from '@/core/plan'
import { useHeatmapDays, getDay, dateKeyOf } from '@/core/stats'
import { useGamification, unlockAchievement } from '@/core/gamification'
import { QUESTION_BANK } from '@/core/data/questions'
import { maybeAutoWeeklyReport, useThisWeekReport } from '@/core/report'
import { listUserDataKeys, wipeAndReset } from '@/core/privacy'
import WeeklyReportModal from '@/components/WeeklyReportModal.vue'

const router = useRouter()

/* ================= A. 六科目进度条 ================= */
const plan = usePlan()
const game = useGamification()

/** 六科目各自的代表色（进度条/图鉴标签统一用这套配色） */
const SUBJECT_COLORS = {
  常识判断: '#FFB86C',
  言语理解: '#7BC8C8',
  数量关系: '#A5B8F3',
  判断推理: '#C9A5F3',
  资料分析: '#F3A5C0',
  申论: '#B8D98A'
}
const colorOf = (s) => SUBJECT_COLORS[s] || '#FFB86C'

/**
 * 每科进度：从计划里现算 done/total。
 * 注意 plan 可能为 null（未做引导），此时全部按 0 处理。
 * v5 计划的任务科目标签是"行测 / 申论"双轨——行测任务平均摊进四个行测科目
 * （言语理解/数量关系/判断推理/资料分析），保证六个科目条都有进度可见；
 * "自由安排"等杂项标签不参与科目统计。
 */
const XINGCE_SUBJECTS = ['言语理解', '数量关系', '判断推理', '资料分析']
const subjectProgress = computed(() => {
  const stats = {}
  for (const s of SUBJECTS) stats[s] = { done: 0, total: 0 }
  for (const stage of plan.value?.stages ?? []) {
    for (const t of stage.tasks) {
      if (t.subject === '行测') {
        // 一个行测任务 = 四个行测科目各 +1（保持六科进度条同进退）
        for (const s of XINGCE_SUBJECTS) { stats[s].total++; if (t.done) stats[s].done++ }
      } else if (stats[t.subject]) {
        stats[t.subject].total++
        if (t.done) stats[t.subject].done++
      }
    }
  }
  return SUBJECTS.map((s) => ({
    subject: s,
    color: colorOf(s),
    ...stats[s],
    percent: stats[s].total ? Math.round(stats[s].done / stats[s].total * 100) : 0
  }))
})

/* ================= B. 学习时长热力图 ================= */
const heatmapDays = useHeatmapDays()
const todayInfo = useTodayInfo()

/**
 * 最近 14 周（98 天）每天的学习分钟数。
 * 今天没有日志记录时，用"关卡页已勾选任务数 × 60"实时补数——
 * 这样用户白天学习、还没提交每日反馈，热力图也能实时变深。
 */
const heatCells = computed(() => {
  const today = dateKeyOf()
  const liveMinutes = (todayInfo.value?.tasks.filter((t) => t.done).length ?? 0) * 60
  return heatmapDays.value.map((d) => {
    const logged = d.minutes || 0
    const minutes = d.date === today ? Math.max(logged, liveMinutes) : logged
    let level = 0 // 0=没学 1=≤1h 2=≤3h 3=≤5h 4=>5h
    if (minutes > 0) level = 1
    if (minutes > 60) level = 2
    if (minutes > 180) level = 3
    if (minutes > 300) level = 4
    return { date: d.date, minutes, level }
  })
})

/** 把 98 天按"周一~周日"切成 14 列（每列一周），热力图按周排布 */
const heatWeeks = computed(() => {
  const cells = [...heatCells.value]
  // 找到第一天是星期几，往前补齐空格让每列都从周一开始
  const firstWeekday = (new Date(cells[0].date).getDay() + 6) % 7
  for (let i = 0; i < firstWeekday; i++) cells.unshift(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
})

const totalRecentMinutes = computed(() => heatCells.value.reduce((n, c) => n + c.minutes, 0))

/* ================= C. 考点小猪崽图鉴 =================
 * 图鉴目录 = 题库全部考点；已收集的来自 gamification 总账里的 starlets，
 * 键的规则（q-题id）与关卡页答题收集时一致。
 */
const piglets = computed(() =>
  QUESTION_BANK.map((q) => ({
    id: `q-${q.id}`,
    name: q.knowledge,
    subject: q.subject,
    collected: !!game.starlets[`q-${q.id}`]
  }))
)
const pigletCount = computed(() => piglets.value.filter((p) => p.collected).length)

/* ================= D. 成就徽章墙 =================
 * 徽章目录写在这里（展示层定义，符合分层）；
 * id 与全站解锁点的 id 对齐（如体重 100 斤的 'shang-an' 由
 * gamification 自动解锁，勋章状态会实时点亮）。
 */
const BADGE_CATALOG = [
  { id: 'demo-first-coin', icon: '🪙', title: '第一桶金', desc: '获得第一枚学习金币' },
  { id: 'quiz-ace', icon: '🎯', title: '百发百中', desc: '小测拿到一次满分' },
  { id: 'first-full-attendance', icon: '📅', title: '初次全勤', desc: '单日任务全完成且小测通过' },
  { id: 'book-builder', icon: '📕', title: '错题本开张', desc: '收录第一道错题' },
  { id: 'monster-hunter', icon: '⚔️', title: '小怪兽猎手', desc: '累计攻克 10 道错题' },
  { id: 'radio-rookie', icon: '🎧', title: '电台首秀', desc: '电台收听满 10 分钟' },
  { id: 'week-warrior', icon: '📰', title: '周周坚持', desc: '生成一份周报且本周学习满 5 天' },
  { id: 'coin-100', icon: '💰', title: '百金大户', desc: '金币累计达到 100 枚' },
  { id: 'shang-an', icon: '🌊', title: '帅气上岸海星', desc: '粉蹄减重 100 斤，成功上岸！' }
]
const badges = computed(() =>
  BADGE_CATALOG.map((b) => ({ ...b, unlocked: !!game.achievements[b.id] }))
)
const badgeCount = computed(() => badges.value.filter((b) => b.unlocked).length)

/* ================= 周报入口（周一自动生成 + 手动查看） ================= */
const reportOpen = ref(false)
const thisWeekReport = useThisWeekReport()

onMounted(() => {
  // 本周首次打开大盘：自动生成/补齐本周周报（每周一自动拉取的等价实现）
  const report = maybeAutoWeeklyReport()
  // 徽章：金币余额达到 100 解锁「百金大户」（进入大盘时检查一次，幂等）
  if (game.coins >= 100) {
    unlockAchievement('coin-100', { title: '百金大户', description: '金币累计达到 100 枚', icon: '💰' })
  }
  // 老用户初次进入：展示自动生成的周报（?noreport 可跳过，开发截图走查用）
  if (report && !localStorage.getItem('fenti-dashboard-visited')
      && !new URLSearchParams(location.search).has('noreport')) {
    reportOpen.value = true
  }
  localStorage.setItem('fenti-dashboard-visited', '1')
})

function openReport() { reportOpen.value = true }
/** 幸运壁纸：广播全局事件（弹窗挂在 App 层，任何页面可复用同一入口） */
function openWallpaper() {
  window.dispatchEvent(new CustomEvent('fenti:open-wallpaper'))
}

/* ---------------- 隐私：一键清空所有个人数据 ---------------- */
async function onWipeClick() {
  const keys = listUserDataKeys()
  try {
    await ElMessageBox.confirm(
      `将永久删除以下 ${keys.length} 项本机数据（计划/金币/错题/日志/周报等），且无法恢复：\n${keys.join('\n')}`,
      '⚠️ 确认清空所有数据？',
      { confirmButtonText: '永久删除', cancelButtonText: '再想想', type: 'warning' }
    )
    await ElMessageBox.confirm('最后一次确认：删除后回到新手引导页，真的要继续吗？', '真的确定吗？', {
      confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'error'
    })
  } catch {
    return // 用户任一环节点了取消
  }
  wipeAndReset() // 清数据 + 整页刷新，内存仓库随加载归零，守卫送回引导页
}
</script>

<template>
  <div class="dashboard">
    <!-- ═════════ 页头：返回 + 总览数字 + 周报入口 ═════════ -->
    <header class="dashboard__header">
      <button class="dashboard__back" @click="router.push('/map')">← 返回地图</button>
      <h1>📊 可视化进度大盘</h1>
      <div class="dashboard__summary">
        <span class="chip">🐷 小猪崽 {{ pigletCount }}/{{ piglets.length }}</span>
        <span class="chip">🏅 徽章 {{ badgeCount }}/{{ badges.length }}</span>
        <span class="chip">⏱️ 14 周共 {{ Math.round(totalRecentMinutes / 60) }} 小时</span>
        <button class="chip chip--btn" @click="openReport">📰 本周周报</button>
        <button class="chip chip--btn" @click="openWallpaper">🖼️ 幸运壁纸</button>
      </div>
    </header>

    <div class="dashboard__grid">
      <!-- ═════════ A. 六科目彩色进度条 ═════════ -->
      <section class="panel">
        <h2 class="panel__title">📚 六科目进度</h2>
        <div v-for="s in subjectProgress" :key="s.subject" class="subject-row">
          <div class="subject-row__head">
            <span class="subject-row__name">{{ s.subject }}</span>
            <span class="subject-row__num">{{ s.done }}/{{ s.total }} · {{ s.percent }}%</span>
          </div>
          <div class="subject-row__track">
            <div
              class="subject-row__fill"
              :style="{ width: s.percent + '%', background: s.color }"
            ></div>
          </div>
        </div>
        <p class="panel__tip">进度 = 该科目已完成任务 ÷ 计划总任务（随关卡页勾选实时更新）</p>
      </section>

      <!-- ═════════ B. 学习时长日历热力图 ═════════ -->
      <section class="panel">
        <h2 class="panel__title">🗓️ 学习时长热力图（近 14 周）</h2>
        <div class="heatmap" role="img" aria-label="近14周学习时长热力图">
          <div v-for="(week, wi) in heatWeeks" :key="wi" class="heatmap__col">
            <div
              v-for="(cell, di) in week"
              :key="di"
              class="heatmap__cell"
              :class="cell ? `lv${cell.level}` : 'empty'"
              :title="cell ? `${cell.date}：学习 ${Math.round(cell.minutes / 60 * 10) / 10} 小时` : ''"
            ></div>
          </div>
        </div>
        <div class="heatmap__legend">
          <span>少</span>
          <i class="heatmap__cell lv0"></i>
          <i class="heatmap__cell lv1"></i>
          <i class="heatmap__cell lv2"></i>
          <i class="heatmap__cell lv3"></i>
          <i class="heatmap__cell lv4"></i>
          <span>多</span>
        </div>
        <p class="panel__tip">每天学完记得提交「每日反馈」，颜色会更准哦</p>
      </section>

      <!-- ═════════ C. 考点小猪崽收集图鉴 ═════════ -->
      <section class="panel">
        <h2 class="panel__title">🐷 考点小猪崽图鉴 {{ pigletCount }}/{{ piglets.length }}</h2>
        <div class="piglet-grid">
          <div
            v-for="p in piglets"
            :key="p.id"
            class="piglet"
            :class="{ collected: p.collected }"
            :title="p.collected ? `已收集：${p.name}` : `未收集：通过每日小测答对「${p.name}」相关的题`"
          >
            <span class="piglet__icon">{{ p.collected ? '🐷' : '❔' }}</span>
            <span class="piglet__name">{{ p.collected ? p.name : '？？？' }}</span>
            <span class="piglet__subject" :style="{ background: colorOf(p.subject) + '33' }">{{ p.subject }}</span>
          </div>
        </div>
        <p class="panel__tip">每日小测答对题目即可收集对应考点的小猪崽</p>
      </section>

      <!-- ═════════ D. 成就徽章墙 ═════════ -->
      <section class="panel">
        <h2 class="panel__title">🏅 成就徽章墙 {{ badgeCount }}/{{ badges.length }}</h2>
        <div class="badge-grid">
          <div
            v-for="b in badges"
            :key="b.id"
            class="badge"
            :class="{ unlocked: b.unlocked }"
            :title="`${b.title}：${b.desc}`"
          >
            <span class="badge__icon">{{ b.icon }}</span>
            <span class="badge__title">{{ b.title }}</span>
            <span class="badge__desc">{{ b.desc }}</span>
          </div>
        </div>
        <p class="panel__tip">徽章达成后自动点亮，全站数据同步</p>
      </section>
    </div>

    <!-- 周报弹窗（生成 + 长图导出都在组件内部） -->
    <WeeklyReportModal v-model="reportOpen" :report="thisWeekReport" />

    <!-- 隐私区：一键清空所有个人数据（需求：隐私安全） -->
    <footer class="dashboard__privacy">
      <span>🔒 你的数据只存在本机浏览器，从不上传服务器</span>
      <button class="dashboard__wipe" @click="onWipeClick">🧹 清空所有个人数据</button>
    </footer>
  </div>
</template>

<style scoped>
/* 页面底色沿用品牌主色，四张白色面板卡片排两列 */
.dashboard {
  min-height: 100vh;
  padding: var(--space-lg);
  background: var(--color-primary);
}

/* ---------- 页头 ---------- */
.dashboard__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.dashboard__header h1 {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  flex: 1;
}
.dashboard__back {
  border: 2px solid var(--color-border);
  background: #fff;
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}
.dashboard__back:hover { border-color: var(--color-accent); color: var(--color-accent-deep); }
.dashboard__summary { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
.chip {
  background: var(--color-bg-bubble);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-sm);
}
.chip--btn { cursor: pointer; transition: all var(--duration-base) var(--easing-soft); }
.chip--btn:hover { background: #fff0e0; border-color: var(--color-accent); }

/* ---------- 面板网格：宽屏两列，窄屏一列 ---------- */
.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--space-lg);
}
.panel {
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
}
.panel__title { font-size: var(--font-size-md); margin-bottom: var(--space-md); }
.panel__tip { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-md); }

/* ---------- A. 科目进度条 ---------- */
.subject-row { margin-bottom: var(--space-md); }
.subject-row__head {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  margin-bottom: 4px;
}
.subject-row__track {
  height: 14px;
  background: var(--color-primary);
  border-radius: var(--radius-round);
  overflow: hidden;
}
.subject-row__fill {
  height: 100%;
  border-radius: var(--radius-round);
  transition: width var(--duration-base) var(--easing-soft); /* 完成度变化时平滑增长 */
}

/* ---------- B. 热力图 ---------- */
.heatmap { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.heatmap__col { display: flex; flex-direction: column; gap: 4px; }
.heatmap__cell {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: #eef4fa; /* 0 级：几乎没颜色 */
}
.heatmap__cell.empty { background: transparent; }
.heatmap__cell.lv1 { background: #cde6ff; }
.heatmap__cell.lv2 { background: #8fc8ff; }
.heatmap__cell.lv3 { background: #5aa9f5; }
.heatmap__cell.lv4 { background: #2f86e8; }
.heatmap__legend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-sm);
}
.heatmap__legend .heatmap__cell { width: 12px; height: 12px; }

/* ---------- C. 小猪崽图鉴 ---------- */
.piglet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-sm);
}
.piglet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-sm);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: #fafcff;
  filter: grayscale(1); /* 未收集：整体置灰剪影感 */
  opacity: 0.65;
}
.piglet.collected {
  filter: none;
  opacity: 1;
  border-style: solid;
  border-color: var(--color-highlight-deep);
  background: var(--color-bg-bubble);
}
.piglet__icon { font-size: 28px; }
.piglet__name { font-size: var(--font-size-sm); text-align: center; }
.piglet__subject {
  font-size: 12px;
  border-radius: var(--radius-round);
  padding: 1px 8px;
}

/* ---------- D. 徽章墙 ---------- */
.badge-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-sm);
}
.badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  padding: var(--space-md) var(--space-sm);
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  background: #fafcff;
  filter: grayscale(1);
  opacity: 0.6;
}
.badge.unlocked {
  filter: none;
  opacity: 1;
  border-color: var(--color-accent);
  background: #fff7ec;
  box-shadow: 0 0 12px rgba(255, 184, 108, 0.45); /* 点亮发光 */
}
.badge__icon { font-size: 30px; }
.badge__title { font-size: var(--font-size-sm); font-weight: bold; }
.badge__desc { font-size: 12px; color: var(--color-text-secondary); }

/* 隐私区：页脚一行，清空按钮弱化呈现但可发现 */
.dashboard__privacy {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: var(--color-bg-card);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.dashboard__wipe {
  border: 2px solid #f0b4b4;
  background: #fff5f5;
  color: #c25b5b;
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}
.dashboard__wipe:hover { background: #ffe8e8; border-color: #d97b7b; }
</style>

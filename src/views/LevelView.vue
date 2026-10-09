<script setup>
/**
 * ============================================================================
 * 关卡任务详情页 —— LevelView.vue（第 3 阶段大改版）
 * ----------------------------------------------------------------------------
 * 对应需求清单「关卡任务详情页（共4个）」+「每日小测」+「每日反馈动态调整」：
 *
 *   1. 任务按"天"分组展示：每天 hoursPerDay 个 1 小时颗粒度任务，
 *      每天末尾是 5 道知识点小测的入口。
 *   2. 按天解锁：第 N 天的任务要"第 N-1 天小测通过（正确率≥60%）"才解锁；
 *      关卡解锁（上一层）仍由路由守卫把关。
 *   3. 今天的任务全部勾选完成 → 自动弹出小测弹窗；
 *      小测通过 → 自动弹出每日反馈弹窗；
 *      反馈提交 → 走预留扩展接口③（planRules 规则池）动态调整计划，
 *                  同时体重/金币联动（接口②），全部弹软萌提示，无系统生硬报错。
 *   4. 每个任务都带视频跳转入口：视频课默认已填好搜索链接可直接跳转，
 *      其他任务点击"填入"即可补链接（预留扩展位，运营后续直接填）。
 *
 * 数据流向：本页只做"展示 + 用户动作转发"，所有数据修改都在 core/ 模块里完成。
 * ============================================================================
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  usePlan, usePlanStats, useTodayInfo,
  toggleTask, toggleTaskById, setTaskVideoUrl,
  recordQuiz, saveFeedback, savePlanNow,
  isDayUnlocked, getDayInfo
} from '@/core/plan'
import { evaluatePlanRules } from '@/core/planRules'
import { getMindmap, saveMindmap, deleteMindmap } from '@/core/mindmap'
import { useGamification, addCoins, changeWeight, collectStarlet, unlockAchievement } from '@/core/gamification'
import { recordDay } from '@/core/stats'
import { hasShieldToday, consumeShield } from '@/core/shop'
import { pickQuestions } from '@/core/data/questions'
import { useTodayEntries } from '@/core/wrongbook'
import QuizModal from '@/components/QuizModal.vue'
import FeedbackModal from '@/components/FeedbackModal.vue'

const route = useRoute()
const router = useRouter()

/** 预览模式：?preview=1 只读浏览任意关卡（不影响解锁与进度，守卫已放行） */
const isPreview = computed(() => route.query.preview === '1')

const plan = usePlan()          // computed：脚本里用 plan.value 取值
const stats = usePlanStats()    // 关卡统计（进度条、解锁状态）
const today = useTodayInfo()    // "今天"的信息：小测/反馈都围绕它
const game = useGamification()  // 游戏化总账（只读）：体重、金币

/** 当前关卡（从路由参数 id 找），找不到说明 URL 乱改，退回主地图 */
const stage = computed(() => plan.value?.stages.find((s) => s.id === route.params.id))
const stageStat = computed(() => stats.value.stageStats.find((s) => s.id === route.params.id))

/* ---------------- 按天分组 ---------------- */

/**
 * 本关卡的任务按天分组（补练任务 day 为空，单独一组排在最后）。
 * 结构：[{ day, tasks, info }, ...]，info 是这一天的完成度/解锁/小测状态。
 */
const dayGroups = computed(() => {
  if (!stage.value || !plan.value) return []
  const groups = new Map()
  for (const task of stage.value.tasks) {
    if (typeof task.day !== 'number') continue
    if (!groups.has(task.day)) groups.set(task.day, [])
    groups.get(task.day).push(task)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, tasks]) => ({ day, tasks, info: getDayInfo(plan.value, day) }))
})

/** 规则池插入的补练任务（day 为空，所在关卡解锁即可勾选） */
const makeupTasks = computed(() => stage.value?.tasks.filter((t) => typeof t.day !== 'number') ?? [])

/** 分钟数 → 小时显示：整小时显示整数（旧版观感不变），非整显示一位小数 */
function fmtHours(minutes) {
  const hours = (minutes || 0) / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}


/** 某一天的状态徽章文案（表头展示用） */
function dayBadge(info) {
  if (!info.unlocked) return '🔒 完成前一天小测解锁'
  if (info.quiz?.passed) return '✅ 已解锁次日'
  if (info.allDone) return '⚡ 任务完成，待小测'
  if (info.done > 0) return '🔥 进行中'
  return '🌱 未开始'
}

/* ---------------- 软萌提示（全走全局 toast，粉蹄文案，不生硬） ---------------- */

function softToast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/* ---------------- 任务交互 ---------------- */

/** 勾选/取消任务。失败（如天未解锁）时弹软萌提示说明原因 */
function onToggle(task) {
  const result = toggleTaskById(task.id)
  if (!result.ok) {
    softToast(result.reason)
  } else if (result.done) {
    softToast(`「${task.title}」完成！粉蹄在小路上又向前挪了一步～`)
  }
}

/**
 * 视频跳转入口：
 * 已有链接 → <a> 标签直接新窗口跳转；
 * 没有链接 → 点击弹输入框填入（需求：预留可直接填入的入口），保存后立即变成可跳转链接。
 */
async function onVideoFill(task) {
  try {
    const { value } = await ElMessageBox.prompt(
      `给「${task.title}」填入视频课程链接`,
      '填入视频链接',
      {
        confirmButtonText: '保存链接',
        cancelButtonText: '先不填',
        inputPlaceholder: 'https://……',
        inputPattern: /^https?:\/\/.+/,
        inputErrorMessage: '要填 http 或 https 开头的链接哦～'
      }
    )
    if (setTaskVideoUrl(route.params.id, task.id, value)) {
      softToast('视频链接填好咯，点 chip 就能跳转～')
    }
  } catch {
    /* 用户点"先不填"取消，不打扰 */
  }
}

/* ---------------- 思维导图拍照上传（知识梳理关专用，供专项练习分专题） ---------------- */

/** 本关各任务已上传的思维导图缓存：{ [taskId]: dataURL | null }（null = 查过、没有） */
const mindmaps = reactive({})
let pendingTaskId = null
const mindmapInput = ref(null)

/** 读某任务的思维导图（带缓存；首次访问时从本地存储取出来） */
function mindmapOf(task) {
  if (!(task.id in mindmaps)) mindmaps[task.id] = getMindmap(task.id)
  return mindmaps[task.id]
}

/** 点击上传按钮 → 唤起文件选择（手机端会弹出"拍照 / 相册"选项） */
function onMindmapClick(task) {
  pendingTaskId = task.id
  mindmapInput.value?.click()
}

/** 选好图片：压缩 → 存本地 → 刷新缩略图 */
async function onMindmapFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 清空，允许连续选同一张图
  if (!file || !pendingTaskId) return
  try {
    mindmaps[pendingTaskId] = await saveMindmap(pendingTaskId, file)
    softToast('思维导图传好咯～专项练习会按它分专题！')
  } catch {
    softToast('图片没传成功，换一张试试？')
  }
}

/** 移除已上传的图（拍糊了/传错了时点） */
function onMindmapRemove(task) {
  deleteMindmap(task.id)
  mindmaps[task.id] = null
  softToast('已移除思维导图，可以重新上传～')
}

/* ---------------- 每日小测（QuizModal） ---------------- */

const quizOpen = ref(false)
const quizDay = ref(1)
const quizQuestions = ref(null)
const quizResult = ref(null)

/**
 * 今天扫题收录的错题（响应式）——小测出题优先考这些科目的题，
 * 弹窗顶部的"今日扫题回顾"条也用它展示今天拍的题图。
 */
const todayUploads = useTodayEntries()

/** 打开某一天的小测（出题：优先当日扫题科目 → 当天任务科目 → 全库兜底） */
function startQuiz(day) {
  const dayTasks = plan.value.stages.flatMap((s) => s.tasks).filter((t) => t.day === day)
  quizDay.value = day
  quizQuestions.value = pickQuestions(dayTasks, 5, todayUploads.value)
  quizResult.value = null
  quizOpen.value = true
}

/** 交卷：判分存档 + 答对的题收集考点小海星 + 通过发金币 */
function onQuizSubmit(answers) {
  const result = recordQuiz(quizDay.value, quizQuestions.value, answers)
  quizResult.value = result
  quizQuestions.value.forEach((q, i) => {
    if (answers[i] === q.answer) {
      collectStarlet(`q-${q.id}`, { name: q.knowledge, subject: q.subject })
    }
  })
  if (result.passed) {
    addCoins(5, `第 ${quizDay.value} 天小测通过`)
  }
}

/** 未通过 → 换一批题再测（仍然优先当日扫题科目） */
function onQuizRetry() {
  const dayTasks = plan.value.stages.flatMap((s) => s.tasks).filter((t) => t.day === quizDay.value)
  quizQuestions.value = pickQuestions(dayTasks, 5, todayUploads.value)
  quizResult.value = null
}

/** 通过 → 关闭小测，打开每日反馈 */
function onQuizFinish() {
  feedbackOutcome.value = null
  feedbackOpen.value = true
}

/**
 * 自动弹出小测：今天的任务全部完成、小测还没通过、且今天还没提交过反馈时，
 * 打开本页的瞬间自动弹出小测弹窗（需求：当日完成任务后自动弹出）。
 */
let autoQuizFired = false
watch(
  () => today.value && !today.value.quiz?.passed && !plan.value?.feedbacks?.[today.value.day],
  (shouldFire) => {
    if (!shouldFire || autoQuizFired || isPreview.value || !today.value) return
    if (today.value.stageId !== route.params.id) return // 只在本关卡页自动弹，避免打扰别的页面
    if (!today.value.allDone) return
    autoQuizFired = true
    startQuiz(today.value.day)
  },
  { immediate: true }
)

/* ---------------- 每日反馈（FeedbackModal） ---------------- */

const feedbackOpen = ref(false)
const feedbackOutcome = ref(null)

/** 反馈弹窗里反勾选任务：与列表同一套解锁校验 */
function onFeedbackToggle(task) {
  const result = toggleTaskById(task.id)
  if (!result.ok) softToast(result.reason)
}

/**
 * 提交反馈：这是本阶段的"总枢纽"，一条链路全打通——
 *   ① 存反馈记录（core/plan）
 *   ② 走预留扩展接口③：planRules 规则池按当日表现动态调整计划
 *   ③ 走预留扩展接口②：体重联动（全勤 -0.5 斤 / 未完成 +1 斤）+ 金币奖励
 *   ④ 把调整结果交给弹窗展示（粉蹄播报，软萌文案）
 */
function onFeedbackSubmit({ moodScore }) {
  const day = today.value.day
  const dayTasks = today.value.tasks
  const quiz = plan.value.quizzes[day]
  const allDone = dayTasks.every((t) => t.done)
  const unfinishedTasks = dayTasks.filter((t) => !t.done)

  // ① 存反馈
  saveFeedback(day, { moodScore, accuracy: quiz.accuracy, allDone })

  // ①.5 记学习日志（第 5 阶段新增）：每日反馈是大热图/周报的"记账点"——
  // 把今天的学习分钟数、正确率、心情一笔写进 core/stats 日记账
  recordDay({
    minutes: dayTasks.filter((t) => t.done).reduce((n, t) => n + (t.duration ?? 60), 0),
    tasksDone: dayTasks.filter((t) => t.done).length,
    quizAccuracy: quiz.accuracy,
    moodScore
  })
  // 徽章：初次全勤 + 小测满分（游戏化统一接口②，幂等自动去重）
  if (allDone && quiz.passed) unlockAchievement('first-full-attendance', { title: '初次全勤', description: '单日任务全完成且小测通过', icon: '📅' })
  if (quiz.accuracy === 1) unlockAchievement('quiz-ace', { title: '百发百中', description: '小测拿到一次满分', icon: '🎯' })

  // ② 规则池：组装当日上下文 → 逐条评估命中规则 → 直接调整计划对象
  const context = {
    date: new Date().toISOString().slice(0, 10),
    day,
    stageId: today.value.stageId,
    dailyAccuracy: quiz.accuracy,
    allDone,
    unfinishedTasks,
    // 正确率 60%~80% 视为"踩线通过"，触发薄弱科目补弱规则
    weakSubjects: quiz.accuracy < 0.8 ? plan.value.weakSubjects : []
  }
  const ruleResult = evaluatePlanRules(context, plan.value)
  savePlanNow() // 规则可能往计划里插了补练任务，落盘

  // ③ 体重 & 金币联动（数值规则来自需求清单 · 核心IP规范）
  const weightBefore = game.weight
  let coinsDelta = 0
  if (allDone) {
    changeWeight(-0.5, `第 ${day} 天全勤`)
    addCoins(10, `第 ${day} 天全勤奖励`)
    coinsDelta += 10
  } else if (hasShieldToday()) {
    // 商店「免增重卡」生效：抵消本次 +1 斤（一次性消费）
    consumeShield()
    changeWeight(0, `第 ${day} 天有任务没完成，免增重卡生效`)
  } else {
    changeWeight(1, `第 ${day} 天有任务没完成`)
  }
  const weightDelta = Math.round((game.weight - weightBefore) * 10) / 10

  // ④ 结果交给弹窗播报（全局进度条/金币栏已随响应式数据自动同步）
  feedbackOutcome.value = {
    allDone, moodScore, weightDelta, weightNow: game.weight,
    coinsDelta, messages: ruleResult.messages
  }
}

function goBack() {
  router.push('/map')
}
</script>

<template>
  <!-- 正常情况：找到关卡 -->
  <div v-if="stage" class="level-page" :class="{ 'level-page--preview': isPreview }">
    <header class="level-header">
      <el-button @click="goBack">← 返回地图</el-button>
      <div class="level-header__title">
        <span class="level-header__icon">{{ stage.icon }}</span>
        <h1>{{ stage.name }}</h1>
        <!-- 时长按任务实际分钟数折算（旧版任务均 60 分钟，显示不变） -->
        <el-tag type="warning">本关 {{ fmtHours(stageStat.doneMin) }}/{{ fmtHours(stageStat.totalMin) }} 小时</el-tag>
      </div>
    </header>

    <!-- 预览模式横幅：只读浏览，正式使用时完成前置关卡解锁 -->
    <p v-if="isPreview" class="preview-banner">
      🔭 预览模式 · 内容只读：正式使用时，做完前面关卡的任务即可解锁本关
    </p>

    <!-- 第 8 阶段：学习技巧横幅（听课关/梳理关自带 tip，其他关不显示） -->
    <p v-if="stage.tip" class="stage-tip">{{ stage.tip }}</p>

    <!-- 关卡内进度条（与全局进度同源，实时同步） -->
    <el-progress
      :percentage="stageStat.total ? Math.round((stageStat.done / stageStat.total) * 100) : 0"
      :stroke-width="12"
      class="level-progress"
    />

    <!-- 按天分组的任务列表 -->
    <main class="day-list">
      <section
        v-for="group in dayGroups"
        :key="group.day"
        class="day-group"
        :class="{
          'day-group--locked': !group.info.unlocked,
          'day-group--today': today?.day === group.day
        }"
      >
        <!-- 天标题：天数 + 进度 + 状态徽章 -->
        <header class="day-head">
          <span class="day-head__label">第 {{ group.day }} 天</span>
          <span class="day-head__progress">{{ group.info.done }}/{{ group.info.total }} 任务</span>
          <span class="day-head__badge">{{ dayBadge(group.info) }}</span>
          <span v-if="today?.day === group.day" class="day-head__today">📍 今天</span>
        </header>

        <!-- 这一天的 1 小时颗粒度任务 -->
        <div class="task-list">
          <div
            v-for="task in group.tasks"
            :key="task.id"
            class="task-card"
            :class="{ 'task-card--done': task.done }"
            @click="onToggle(task)"
          >
            <span class="task-card__check">{{ task.done ? '✅' : '⬜' }}</span>
            <div class="task-card__body">
              <span class="task-card__title">{{ task.title }}</span>
              <div class="task-card__meta">
                <span class="meta-chip meta-chip--subject">{{ task.subject }}</span>
                <span class="meta-chip meta-chip--type">{{ task.type }}</span>
                <!-- 思维导图任务：拍照/相册上传入口（梳理完一科就传一科，专项练习按它分专题） -->
                <template v-if="task.upload === 'mindmap'">
                  <img
                    v-if="mindmapOf(task)"
                    :src="mindmapOf(task)"
                    class="meta-chip meta-chip--mapthumb"
                    title="已上传，点击可重新上传"
                    alt="思维导图缩略图"
                    @click.stop="onMindmapClick(task)"
                  />
                  <button
                    v-else
                    class="meta-chip meta-chip--video meta-chip--fill"
                    @click.stop="onMindmapClick(task)"
                  >📷 拍照上传思维导图</button>
                  <button
                    v-if="mindmapOf(task)"
                    class="meta-chip meta-chip--mapdel"
                    title="移除重新拍"
                    @click.stop="onMindmapRemove(task)"
                  >✕</button>
                </template>
                <!-- 视频跳转入口：已填链接 = 可点的跳转 chip；未填 = 点击填入 -->
                <template v-else>
                  <a
                    v-if="task.videoUrl"
                    :href="task.videoUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="meta-chip meta-chip--video"
                    @click.stop
                  >▶ 视频</a>
                  <button
                    v-else
                    class="meta-chip meta-chip--video meta-chip--fill"
                    @click.stop="onVideoFill(task)"
                  >视频链接 · 点击填入</button>
                </template>
              </div>
            </div>
            <span class="task-card__duration">{{ task.duration ? task.duration + ' 分钟' : '🌊 自由安排' }}</span>
          </div>
        </div>

        <!-- 每日任务末尾：小测入口（需求：每天最后 5 道知识点小测）；预览模式下隐藏 -->
        <div v-if="!isPreview && group.info.allDone && !group.info.quiz?.passed" class="day-quiz">
          <p class="day-quiz__tip">
            {{ group.info.quiz ? `上次小测 ${Math.round(group.info.quiz.accuracy * 100)}% 未达标` : '今天的任务都完成啦，来验收成果吧！' }}
          </p>
          <el-button type="primary" @click="startQuiz(group.day)">
            {{ group.day === today?.day ? '开始今日小测（5 题）' : `补测第 ${group.day} 天小测` }}
          </el-button>
        </div>
        <div v-else-if="group.info.quiz?.passed" class="day-pass">
          ✅ 小测 {{ group.info.quiz.correct }}/{{ group.info.quiz.total }} 通过，第 {{ group.day + 1 }} 天已解锁
        </div>
      </section>

      <!-- 规则池插入的补练任务 + 国考四步任务（day 为空，所在关解锁即可做） -->
      <section v-if="makeupTasks.length" class="day-group day-group--makeup">
        <header class="day-head">
          <span class="day-head__label">📌 关卡自由任务</span>
          <span class="day-head__badge">不受按天解锁限制</span>
        </header>
        <div class="task-list">
          <div
            v-for="task in makeupTasks"
            :key="task.id"
            class="task-card"
            :class="{ 'task-card--done': task.done }"
            @click="onToggle(task)"
          >
            <span class="task-card__check">{{ task.done ? '✅' : '⬜' }}</span>
            <div class="task-card__body">
              <span class="task-card__title">{{ task.title }}</span>
              <div class="task-card__meta">
                <span class="meta-chip meta-chip--subject">{{ task.subject }}</span>
                <span class="meta-chip meta-chip--type">{{ task.type }}</span>
              </div>
            </div>
            <span class="task-card__duration">{{ task.duration ? task.duration + ' 分钟' : '🌊 自由安排' }}</span>
          </div>
        </div>
      </section>
    </main>

    <!-- 每日小测弹窗 -->
    <QuizModal
      v-model="quizOpen"
      :day="quizDay"
      :questions="quizQuestions"
      :reviews="todayUploads"
      :result="quizResult"
      @submit="onQuizSubmit"
      @retry="onQuizRetry"
      @finish="onQuizFinish"
    />

    <!-- 每日反馈弹窗 -->
    <FeedbackModal
      v-model="feedbackOpen"
      :day="today?.day ?? 1"
      :tasks="today?.tasks ?? []"
      :quiz="today?.quiz ?? null"
      :outcome="feedbackOutcome"
      @toggle-task="onFeedbackToggle"
      @submit="onFeedbackSubmit"
    />

    <!-- 思维导图上传用的隐藏文件选择框（手机端会弹出"拍照/相册"） -->
    <input
      ref="mindmapInput"
      type="file"
      accept="image/*"
      class="mindmap-input"
      aria-label="上传思维导图图片"
      @change="onMindmapFile"
    />
  </div>

  <!-- 兜底：URL 里的关卡 id 不存在（理论上路由守卫已拦住） -->
  <div v-else class="level-page level-page--empty">
    <p>没有找到这个关卡哦</p>
    <el-button type="primary" @click="goBack">回到地图</el-button>
  </div>
</template>

<style scoped>
.level-page {
  min-height: 100vh;
  background: var(--color-bg-page);
  padding: var(--space-lg) var(--space-xl);
  max-width: 860px;
  margin: 0 auto;
}

.level-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.level-header__title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
}

.level-header__title h1 {
  margin: 0;
  font-size: var(--font-size-title);
  color: var(--color-text-primary);
}

.level-header__icon {
  font-size: 32px;
}

.level-progress {
  margin-bottom: var(--space-lg);
}

/* ═══════ 按天分组的任务列表 ═══════ */
.day-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.day-group {
  background: var(--color-bg-card);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  transition: border-color var(--duration-base) var(--easing-soft);
}

/* 今天所在的天：暖橙描边高亮 */
.day-group--today {
  border-color: var(--color-accent);
}

/* 未解锁的天：整体淡化 */
.day-group--locked {
  opacity: 0.65;
}

.day-group--makeup {
  border-style: dashed;
  border-color: var(--color-highlight-deep);
}

/* 天标题行 */
.day-head {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}

.day-head__label {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-text-primary);
}

.day-head__progress {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.day-head__badge {
  font-size: var(--font-size-base);
  color: var(--color-accent-darker);
  background: var(--color-highlight);
  border-radius: var(--radius-round);
  padding: 2px var(--space-md);
}

.day-head__today {
  font-size: var(--font-size-base);
  color: var(--color-accent-darker);
  font-weight: 700;
}

/* ═══════ 任务卡片 ═══════ */
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.task-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  background: var(--color-bg-card);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--easing-soft);
}

.task-card:hover {
  border-color: var(--color-accent);
}

/* 已完成的任务：淡化 + 划线 */
.task-card--done {
  opacity: 0.65;
}

.task-card--done .task-card__title {
  text-decoration: line-through;
}

.task-card__check {
  font-size: 22px;
}

.task-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.task-card__title {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.task-card__meta {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

/* 任务信息小标签：手写 chip（不用 el-tag，避免主题色过淡看不清） */
.meta-chip {
  display: inline-block;
  font-size: var(--font-size-base);
  line-height: 1.6;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1.5px solid transparent;
  white-space: nowrap;
  text-decoration: none;
}

/* 科目：主色底 */
.meta-chip--subject {
  color: var(--color-primary-darker);
  background: var(--color-primary);
  border-color: var(--color-primary-darker);
}

/* 任务类型：强调粉底 */
.meta-chip--type {
  color: var(--color-accent-darker);
  background: var(--color-highlight);
  border-color: var(--color-highlight-deep);
}

/* 视频入口：辅助橙 */
.meta-chip--video {
  color: var(--color-accent-darker);
  background: var(--color-accent);
  border-color: var(--color-accent-darker);
  font-weight: 600;
}

.meta-chip--video:hover {
  background: var(--color-accent-deep);
}

/* 待填入状态：虚线框提示可点击 */
.meta-chip--fill {
  background: transparent;
  border-style: dashed;
  cursor: pointer;
  font-weight: 400;
}

/* 思维导图缩略图：已上传时显示小图，点击可重新上传 */
.meta-chip--mapthumb {
  width: 44px;
  height: 32px;
  object-fit: cover;
  border-radius: 6px;
  border: 1.5px solid var(--color-highlight-deep);
  cursor: pointer;
  padding: 0;
}

/* 思维导图"移除"小按钮 */
.meta-chip--mapdel {
  cursor: pointer;
  color: #b0526f;
  background: var(--color-accent);
  border-color: #d48aa5;
  padding: 1px 6px;
}

/* 隐藏的文件选择框（由"拍照上传"按钮代为触发） */
.mindmap-input {
  display: none;
}

.task-card__duration {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* ═══════ 天末尾的小测入口 ═══════ */
.day-quiz {
  margin-top: var(--space-md);
  padding: var(--space-md);
  background: var(--color-highlight);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.day-quiz__tip {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.day-pass {
  margin-top: var(--space-md);
  font-size: var(--font-size-base);
  color: var(--color-success);
  text-align: center;
}

.level-page--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
}

/* ── 模块刷题四步流程面板（国考专项刷题关） ── */
/* 第 8 阶段：学习技巧横幅（听课关/梳理关的 stage.tip，浅粉底软提示） */
.stage-tip {
  margin: var(--space-md) 0 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-accent, #ffe6f2);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.7;
  color: #8a4a63;
}

/* ==================== 预览模式（?preview=1） ==================== */
/* 预览横幅：浅蓝底，告诉用户这是"只读看看"模式 */
.preview-banner {
  margin: var(--space-md) 0 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-primary, #e6f4ff); /* 全局主色：天蓝 */
  border: 1px dashed #6fb3e8;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.7;
  color: #2f6ea5;
}

/*
 * 预览模式只读：把卡片/小测/反馈入口的点击全部禁用并轻微降透明度，
 * 看起来像"玻璃柜里的展示品"——看得见、点不动，不影响正式进度数据。
 */
.level-page--preview .task-card,
.level-page--preview .day-quiz,
.level-page--preview .meta-chip--fill {
  pointer-events: none;
  opacity: 0.75;
}

.drill-panel {
  margin: var(--space-md) 0;
  padding: var(--space-md);
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.drill-panel__title {
  margin: 0 0 var(--space-md);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.drill-panel__title small {
  font-weight: normal;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.drill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-md);
}

.drill-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}

.drill-card__subject {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

/* 四步圆标：未完成 = 灰底，完成 = 暖橙底 */
.drill-card__steps {
  display: flex;
  gap: var(--space-sm);
}

.drill-step {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-round);
  background: var(--color-bg-card);
  border: 1.5px solid var(--color-primary-darker);
  font-size: 14px;
  color: var(--color-text-secondary);
  transition: all var(--duration-base) var(--easing-soft);
}

.drill-step--done {
  background: var(--color-accent);
  border-color: var(--color-accent-deep);
  color: #fff;
}

/* 轮次圆点追踪 */
.drill-card__rounds {
  display: flex;
  align-items: center;
  gap: 6px;
}

.drill-round {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-round);
  background: var(--color-bg-card);
  border: 1.5px solid var(--color-primary-darker);
  transition: all var(--duration-base) var(--easing-soft);
}

.drill-round--done {
  background: var(--color-highlight-deep);
  border-color: var(--color-highlight-deep);
}

.drill-card__rounds small {
  margin-left: var(--space-xs);
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>

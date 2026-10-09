<script setup>
/**
 * ============================================================================
 * 三步新手引导页 —— OnboardingView.vue
 * ----------------------------------------------------------------------------
 * 对应需求清单「首次启动引导页」：
 *   采集 ①考试剩余天数 ②每日纯学习时长 ③预设薄弱科目，
 *   生成初始适配学习计划 → 自动跳转主闯关地图页。
 *
 * 交互细节（对照需求清单 · 交互规则）：
 *   · 每一步由粉蹄海星弹出气泡提示（ comfort 歪头状态）
 *   · 输入不合法时，海星切成 remind 鼓脸状态，弹出软萌提示文字，
 *     绝不出现"输入无效"这类冰冷报错
 *   · 生成计划过程播放 10 秒"粉蹄展开闯关地图"解压动画
 *
 * 页面结构（小白版）：
 *   左侧 = 步骤条 + 当前这一步的表单
 *   右侧 = 粉蹄海星 + 对话框气泡（提示语都从这里说）
 *   全屏遮罩 = 10 秒生成动画（生成中才显示）
 * ============================================================================
 */
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'
import { SUBJECTS, createPlan } from '@/core/plan'
import { GUOKAO } from '@/core/plan/guokao'

const router = useRouter()

/* ---------------- 计划类型：自定义计划 / 2027国考60天冲刺计划 ----------------
 * 新增（第 7 阶段）：引导页第一步先选"走哪条上岸路线"。
 * standard = 原有自定义计划（下面三步流程原样保留，一行没动）；
 * guokao2027 = 国考专属计划（60 天五段节奏，行测/申论双轨学习提醒，只需再选薄弱科目即可生成）。
 */
const planType = ref('standard')

/** 国考计划的卖点清单（选中国考卡片时展示，v5 按"行测/申论双轨提醒版"改写） */
const GUOKAO_POINTS = [
  '⏱️ 60 天五段节奏：听课2周 → 梳理3天 → 专项练习3周 → 刷题巩固1周 → 套卷模拟1周',
  '📚 行测 + 申论双轨学习：每天上午行测、下午申论，任务全部是概括性提醒（不规定具体学习内容）',
  '🎧 听课筑基：行测学习 3h + 申论学习 3h + 课后练习 2h + 半月谈素材积累 1h',
  '📷 梳理关拍照上传"做题思路思维导图"，专项练习对照使用',
  '🏁 套卷模拟每 3 天一轮：全真模考 → 错题分析 → 补漏训练，共 5 轮',
  '🛡️ 智能防过载：单日任务不超 10 小时，连续低效自动减负 20%'
]

const STEP_TITLES = ['考试倒计时', '每日学习时长', '薄弱科目预设']

// 表单三要素：考试剩余天数、每日纯学习时长、预设薄弱科目
const form = reactive({
  examDays: 60,      // 默认 60 天，减少用户输入成本
  hoursPerDay: 6,    // 默认每天 6 小时（脱产备考的常见强度）
  weakSubjects: []   // 薄弱科目多选
})

const step = ref(0)           // 当前第几步（0/1/2）
const tip = ref('')           // 海星气泡里要说话的文案
const tipKey = ref(0)         // 气泡刷新动画的钥匙：每次改文案 +1，重新播放弹出动画
const pigMood = ref('comfort') // 海星状态：comfort 温柔提示 / remind 着急提醒

/** 每步的默认引导语（进入该步时自动说） */
const STEP_TIPS = [
  '距离考试还有多久呀？告诉我天数，粉蹄好帮你把学习任务铺满每一天～',
  '你每天能拿出多少小时纯学习？就是真正坐在桌前、手机放远的那种哦！',
  '哪些模块最让你头疼呀？选中的科目粉蹄会多安排任务，帮你重点补弱！'
]

/** 软萌报错文案：把冰冷的"输入无效"翻译成粉蹄的关心 */
const SOFT_ERRORS = {
  daysTooSmall: '考试还不到 3 天呀？粉蹄陪你冲刺也来得及，但天数填多一点计划会更从容哦（3~365 天）',
  daysTooBig: '一年以上的备考太折磨啦！先定个一年内的小目标吧（3~365 天）',
  hoursTooSmall: '每天至少要有 1 小时纯学习，粉蹄才能帮你铺任务哦',
  hoursTooBig: '一天学习超过 10 小时会累坏的！循序渐进，粉蹄建议你填 1~10 小时',
  noSubject: '至少选一个最不拿手的科目嘛～粉蹄好给你安排补弱小课！'
}

/** 海星说话：换文案 + 重播气泡弹出动画 */
function say(text, mood = 'comfort') {
  tip.value = text
  pigMood.value = mood
  tipKey.value++
}

function showStepTip() {
  say(STEP_TIPS[step.value])
}

/* ---------------- 步骤校验（软萌版） ---------------- */

/** 校验第 0 步：考试天数 */
function validStep0() {
  if (form.examDays < 3) return SOFT_ERRORS.daysTooSmall
  if (form.examDays > 365) return SOFT_ERRORS.daysTooBig
  return ''
}

/** 校验第 1 步：每日时长 */
function validStep1() {
  if (form.hoursPerDay < 1) return SOFT_ERRORS.hoursTooSmall
  if (form.hoursPerDay > 10) return SOFT_ERRORS.hoursTooBig
  return ''
}

/** 校验第 2 步：薄弱科目 */
function validStep2() {
  if (form.weakSubjects.length === 0) return SOFT_ERRORS.noSubject
  return ''
}

const stepValidators = [validStep0, validStep1, validStep2]

/* ---------------- 下一步 / 上一步 ---------------- */

function next() {
  const error = stepValidators[step.value]()
  if (error) {
    say(error, 'remind') // 输入不合法：海星鼓脸着急 + 软萌提示
    return
  }
  step.value++
  showStepTip()
}

function prev() {
  step.value--
  showStepTip()
}

/** 切换薄弱科目选中状态（chip 点选） */
function toggleSubject(name) {
  const i = form.weakSubjects.indexOf(name)
  if (i > -1) form.weakSubjects.splice(i, 1)
  else form.weakSubjects.push(name)
}

/* ---------------- 10 秒生成计划解压动画 ---------------- */

const generating = ref(false)  // 是否正在播放生成动画
const genPercent = ref(0)      // 动画进度 0~100
let genTimer = null            // 计时器句柄（离开页面要清理）

/** 生成动画各阶段的文案（最后一阶段按所选计划类型区分三关/四关） */
const GEN_TIPS = [
  { until: 25, text: '粉蹄正在翻阅考公大纲…' },
  { until: 55, text: '正在计算每天的学习任务量…' },
  { until: 85, text: '正在铺设通往岸边的闯关地图…' },
  { until: 101, text: '即将上岸，准备出发！' }
]
const genTip = computed(() => {
  const tip = GEN_TIPS.find((t) => genPercent.value < t.until)?.text || ''
  // 85% 阶段的"几关地图"按实际计划类型措辞（第 8 阶段起两种计划都是五关地图）
  return tip.replace('闯关地图', planType.value === 'guokao2027' ? '五关地图（筑基→梳理→专项→巩固→套卷）' : '五关地图（节奏按你的天数等比缩放）')
})

/** 点击「生成我的闯关计划」：播放 10 秒动画 → 生成计划 → 跳主地图 */
function startGenerate() {
  // 国考计划只需要薄弱科目（天数/时长由官方配注定死）；自定义计划走原校验
  const error = planType.value === 'guokao2027' ? validStep2() : validStep2()
  if (error) {
    say(error, 'remind')
    return
  }
  generating.value = true
  genPercent.value = 0
  // 每 100ms 前进 1%，正好 10 秒播完
  genTimer = setInterval(() => {
    genPercent.value += 1
    if (genPercent.value >= 100) {
      clearInterval(genTimer)
      // 数据层：生成计划 + 存本地 + 发金币（planType 决定走哪个生成器）
      createPlan({ ...form, planType: planType.value })
      router.replace('/map')           // 需求：完成引导后直接跳转主闯关地图页
    }
  }, 100)
}

// 页面初始化：海星先开口说话
showStepTip()

// 离开页面时清理计时器（防止内存泄漏）
onUnmounted(() => clearInterval(genTimer))
</script>

<template>
  <div class="onboarding">
    <!-- 左侧：步骤表单区 -->
    <main class="onboarding__panel">
      <h1 class="onboarding__title">小海星上岸记</h1>
      <p class="onboarding__subtitle">三步生成你的专属上岸计划 ✨</p>

      <!-- 第 0 步之前：选择上岸路线（自定义计划 / 2027国考60天冲刺计划） -->
      <div class="plan-types" role="radiogroup" aria-label="计划类型">
        <button
          class="plan-type-card"
          :class="{ 'plan-type-card--active': planType === 'standard' }"
          @click="planType = 'standard'"
        >
          <span class="plan-type-card__icon">🧭</span>
          <b>自定义闯关计划</b>
          <small>自己定天数 / 每日时长 / 薄弱科目，五关地图循序闯关</small>
        </button>
        <button
          class="plan-type-card"
          :class="{ 'plan-type-card--active': planType === 'guokao2027' }"
          @click="planType = 'guokao2027'"
        >
          <span class="plan-type-card__icon">🏛️</span>
          <b>2027国考60天冲刺计划</b>
          <small>行测/申论双轨学习提醒 · 五段节奏 · 防过载保护</small>
        </button>
      </div>

      <!-- ============ 路线 A：原有自定义计划（三步流程，原样保留） ============ -->
      <template v-if="planType === 'standard'">
      <!-- 步骤条：直观显示"第几步 / 共几步" -->
      <el-steps :active="step" finish-status="success" class="onboarding__steps" align-center>
        <el-step v-for="t in STEP_TITLES" :key="t" :title="t" />
      </el-steps>

      <!-- 第 1 步：考试剩余天数 -->
      <section v-if="step === 0" class="step-body">
        <label class="step-label">距离考试还有几天？</label>
        <div class="step-input-row">
          <el-input-number v-model="form.examDays" :min="1" :max="999" size="large" />
          <span class="step-unit">天</span>
        </div>
        <p class="step-hint">填 3~365 之间的数字都可以，粉蹄会按天铺任务</p>
      </section>

      <!-- 第 2 步：每日纯学习时长 -->
      <section v-else-if="step === 1" class="step-body">
        <label class="step-label">每天纯学习几小时？</label>
        <div class="step-slider-row">
          <el-slider v-model="form.hoursPerDay" :min="1" :max="10" show-input />
        </div>
        <p class="step-hint">拖动滑块选择，每个小时会被粉蹄切成一个闯关任务</p>
      </section>

      <!-- 第 3 步：预设薄弱科目 -->
      <section v-else class="step-body">
        <label class="step-label">最不拿手的科目有哪些？</label>
        <div class="subject-chips">
          <button
            v-for="name in SUBJECTS"
            :key="name"
            class="subject-chip"
            :class="{ 'subject-chip--active': form.weakSubjects.includes(name) }"
            @click="toggleSubject(name)"
          >
            {{ name }}
          </button>
        </div>
        <p class="step-hint">选中的科目会分到约 2/3 的学习任务（补弱优先）</p>
      </section>

      <!-- 底部操作按钮（自定义计划） -->
      <div class="step-actions">
        <el-button v-if="step > 0" size="large" @click="prev">上一步</el-button>
        <el-button v-if="step < 2" type="primary" size="large" @click="next">下一步</el-button>
        <el-button v-else type="primary" size="large" @click="startGenerate">
          🌊 生成我的闯关计划
        </el-button>
      </div>
      </template>

      <!-- ============ 路线 B：2027国考60天冲刺计划 ============
           天数/时长由官方配注定死，只需选薄弱科目即可一键生成 -->
      <section v-else class="guokao-body">
        <ul class="guokao-points">
          <li v-for="point in GUOKAO_POINTS" :key="point">{{ point }}</li>
        </ul>
        <label class="step-label">最不拿手的科目有哪些？（决定听课排序和刷题模块排序）</label>
        <div class="subject-chips">
          <button
            v-for="name in GUOKAO.PRACTICE_SUBJECTS"
            :key="name"
            class="subject-chip"
            :class="{ 'subject-chip--active': form.weakSubjects.includes(name) }"
            @click="toggleSubject(name)"
          >
            {{ name }}
          </button>
        </div>
        <div class="step-actions">
          <el-button type="primary" size="large" @click="startGenerate">
            🏛️ 生成 2027 国考 60 天冲刺计划
          </el-button>
        </div>
      </section>
    </main>

    <!-- 右侧：粉蹄海星 + 对话框气泡 -->
    <aside class="onboarding__companion">
      <div class="speech-bubble" :key="tipKey">
        {{ tip }}
      </div>
      <FtAvatar :state="pigMood" :size="180" class="onboarding__pig" />
    </aside>

    <!-- 10 秒生成计划解压动画（全屏遮罩） -->
    <transition name="fade">
      <div v-if="generating" class="gen-overlay">
        <FtAvatar state="cheer" :size="150" class="gen-overlay__pig" />

        <!-- 地图路径描绘动画：一条线 10 秒内从头画到尾 -->
        <svg viewBox="0 0 400 120" class="gen-overlay__map">
          <path
            d="M20 90 C 80 90, 90 30, 140 30 S 220 100, 270 70 S 360 20, 385 35"
            fill="none" stroke="var(--color-accent)" stroke-width="6" stroke-linecap="round"
            class="gen-overlay__path"
          />
          <text x="382" y="20" text-anchor="middle" font-size="16">🚪上岸大门</text>
        </svg>

        <p class="gen-overlay__tip">{{ genTip }}</p>
        <el-progress :percentage="genPercent" :show-text="false" class="gen-overlay__progress" />
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* 页面布局：左右分栏，窄屏自动上下堆叠（H5 适配） */
.onboarding {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xxl);
  padding: var(--space-xl);
  background: var(--color-bg-page);
}

/* 左侧表单面板：白底圆角卡片 */
.onboarding__panel {
  width: 520px;
  max-width: 100%;
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--space-xl);
}

.onboarding__title {
  margin: 0;
  font-size: var(--font-size-title);
  color: var(--color-text-primary);
}

.onboarding__subtitle {
  margin: var(--space-xs) 0 var(--space-lg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-lg);
}

/* 计划类型双卡片：选上岸路线 */
.plan-types {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.plan-type-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  transition: all var(--duration-base) var(--easing-soft);
}

.plan-type-card:hover {
  transform: translateY(-2px);
}

/* 点击瞬间按压缩小（与全站点击动效一致） */
.plan-type-card:active {
  transform: scale(0.97);
}

.plan-type-card--active {
  border-color: var(--color-accent);
  background: #fff0e0;
  box-shadow: var(--shadow-card);
}

.plan-type-card__icon {
  font-size: 28px;
}

.plan-type-card b {
  font-size: var(--font-size-lg);
}

.plan-type-card small {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-base);
}

/* 国考计划专属面板 */
.guokao-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.guokao-points {
  margin: 0;
  padding: var(--space-md) var(--space-md) var(--space-md) var(--space-xl);
  background: var(--color-primary);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

/* 手机 H5：计划类型卡片上下堆叠 */
@media (max-width: 640px) {
  .plan-types {
    flex-direction: column;
  }
}

.onboarding__steps {
  margin-bottom: var(--space-xl);
}

/* 每步的内容区：统一留白 >= 16px */
.step-body {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.step-label {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.step-input-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.step-unit {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
}

.step-slider-row {
  padding-right: var(--space-lg); /* 给滑块输入框留位置 */
}

.step-hint {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

/* 薄弱科目 chips：点选切换 */
.subject-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.subject-chip {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-round);
  border: 2px solid var(--color-border);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  cursor: pointer;
  /* 过渡 0.3s（动效规范） */
  transition: all var(--duration-base) var(--easing-soft);
}

.subject-chip--active {
  border-color: var(--color-accent);
  background: #fff0e0; /* 暖橙浅底 = 选中态 */
  font-weight: 600;
}

.step-actions {
  margin-top: var(--space-xl);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

/* 右侧海星陪伴区 */
.onboarding__companion {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  max-width: 300px;
}

/* 对话框气泡：粉底圆角 + 下面的小三角 */
.speech-bubble {
  position: relative;
  background: var(--color-bg-bubble);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-base);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-card);
  animation: bubble-pop var(--duration-base) var(--easing-soft);
}

/* 气泡下面指向海星的小三角 */
.speech-bubble::after {
  content: '';
  position: absolute;
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--color-highlight-deep);
}

/* 气泡弹出动画（0.3s，动效规范） */
@keyframes bubble-pop {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 10 秒生成动画遮罩 */
.gen-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--color-bg-page);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  padding: var(--space-xl);
}

.gen-overlay__map {
  width: min(480px, 90vw);
}

/* 路径描绘动画：10 秒把虚线空隙走完（与 JS 进度条同速） */
.gen-overlay__path {
  stroke-dasharray: 600;
  stroke-dashoffset: 600;
  animation: draw-path 10s linear forwards;
}

@keyframes draw-path {
  to { stroke-dashoffset: 0; }
}

.gen-overlay__tip {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.gen-overlay__progress {
  width: min(420px, 80vw);
}

/* 遮罩淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-base) var(--easing-soft);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 手机 H5：左右分栏改为上下堆叠 */
@media (max-width: 768px) {
  .onboarding {
    flex-direction: column-reverse;
    gap: var(--space-lg);
  }
  .onboarding__companion {
    flex-direction: row;
    max-width: 100%;
  }
  .speech-bubble::after {
    bottom: auto;
    left: -12px;
    top: 50%;
    transform: translateY(-50%);
    border: 6px solid transparent;
    border-right-color: var(--color-highlight-deep);
  }
}
</style>

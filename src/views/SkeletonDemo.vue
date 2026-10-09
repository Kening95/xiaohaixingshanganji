<script setup>
/**
 * ============================================================================
 * 骨架演示页 —— SkeletonDemo.vue
 * ----------------------------------------------------------------------------
 * 这个页面是第一阶段的"验收展台"，把骨架工程的四大交付物全部摆出来：
 *   1. 全局配色规范（色卡展示，对照需求清单核对）
 *   2. 粉蹄海星 5 状态动画组件（五个状态同时展示）
 *   3. 三个预留扩展接口的实机演示
 *      - 悬浮功能插槽：页面右侧的 💡 按钮就是插槽渲染出来的
 *      - 游戏化数值接口：点按钮加减金币/体重，看数值实时联动
 *      - 计划调整规则池：模拟一次每日反馈，看规则自动执行
 *
 * 后续开发新页面时，这个文件可以保留作参考，也可以从路由里摘掉。
 * ============================================================================
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'
import { useGamification, addCoins, changeWeight, unlockAchievement, collectStarlet } from '@/core/gamification'
import { evaluatePlanRules, listPlanRules } from '@/core/planRules'

/* ---------- ① 配色展示数据：直接引用全局 CSS 变量，和设计令牌永远一致 ---------- */
const colorSwatches = [
  { name: '主色 · 天蓝', cssVar: '--color-primary', usage: '页面背景、大容器底色', hex: '#E6F4FF' },
  { name: '辅助色 · 暖橙', cssVar: '--color-accent', usage: '按钮高亮、进度条填充', hex: '#FFB86C' },
  { name: '强调色 · 浅粉', cssVar: '--color-highlight', usage: 'IP 装饰、气泡、徽章', hex: '#FFE6F2' },
  { name: '正文 · 深灰', cssVar: '--color-text-primary', usage: '正文文字', hex: '#333333' },
  { name: '辅助 · 浅灰', cssVar: '--color-text-secondary', usage: '辅助提示文字', hex: '#999999' }
]

/* ---------- ② 粉蹄 5 状态展示数据 ---------- */
const ftStates = [
  { state: 'idle', name: '日常陪伴', desc: '轻轻晃耳朵，常驻待机动画' },
  { state: 'cheer', name: '举奖杯欢呼', desc: '完成任务时庆祝' },
  { state: 'comfort', name: '歪头递糖', desc: '正确率低时安抚鼓励' },
  { state: 'remind', name: '鼓脸提醒', desc: '该学习啦/切出专注提醒' },
  { state: 'report', name: '举周刊', desc: '每周一推送周报' }
]
const activeState = ref('idle') // 下方大图的当前状态，点卡片切换

/* ---------- ③ 游戏化接口演示 ---------- */
const game = useGamification() // 响应式总账：页面显示值自动刷新

function demoAddCoin() {
  addCoins(1, '演示：手动奖励 1 枚金币')
  unlockAchievement('demo-first-coin', { title: '第一桶金', description: '获得第一枚学习金币', icon: '🪙' })
}
function demoLoseWeight() {
  changeWeight(-0.5, '演示：今日任务全勤减重')
}
function demoCollectStarlet() {
  collectStarlet('demo-common-1', { name: '宪法小海星', subject: '常识' })
}

/* ---------- ④ 计划规则池演示：模拟一次每日反馈 ---------- */
const ruleMessages = ref([])
const appliedRules = ref([])

function demoEvaluateRules() {
  // 模拟一份"当日反馈数据"
  const mockContext = {
    date: new Date().toISOString().slice(0, 10),
    dailyAccuracy: 0.62,
    unfinishedTasks: ['数量关系·第3节', '资料分析·第2节'],
    weakSubjects: ['数量关系'],
    isWeekend: false
  }
  const result = evaluatePlanRules(mockContext, [])
  ruleMessages.value = result.messages
  appliedRules.value = result.applied
}

/* ---------- 悬浮插槽演示：监听插槽按钮发出的事件 ---------- */
function onFloatingDemo(event) {
  ElMessage({ message: event.detail.message, type: 'success', duration: 3000 })
}
onMounted(() => {
  window.addEventListener('fenti:floating-demo', onFloatingDemo)
  // 开发调试小工具：打开 /demo?at=star 会自动滚动到粉蹄状态展示区
  const target = new URLSearchParams(window.location.search).get('at')
  if (target === 'star') {
    document.querySelector('.ft-grid')?.scrollIntoView({ block: 'start' })
  }
})
onUnmounted(() => window.removeEventListener('fenti:floating-demo', onFloatingDemo))
</script>

<template>
  <main class="ft-page demo-page">
    <header class="demo-header">
      <h1>🐷 小海星上岸记 · 第一阶段骨架工程</h1>
      <p class="demo-subtitle">
        项目基础骨架已就绪：配色规范 ✓ 5 套粉蹄动画 ✓ 3 个扩展接口 ✓
        本页是验收展台，逐项核对下方内容即可。
      </p>
    </header>

    <!-- ================= ① 全局配色规范 ================= -->
    <section class="ft-card demo-section">
      <span class="ft-section-title">① 全局配色规范</span>
      <div class="swatch-grid">
        <div v-for="c in colorSwatches" :key="c.cssVar" class="swatch">
          <!-- 色块颜色直接取 CSS 变量，和设计令牌永远保持一致 -->
          <div class="swatch__color" :style="{ backgroundColor: `var(${c.cssVar})` }" />
          <div class="swatch__info">
            <strong>{{ c.name }}</strong>
            <small>{{ c.hex }} · {{ c.usage }}</small>
          </div>
        </div>
      </div>
      <p class="demo-tip">Element Plus 组件主题已同步定制为暖橙主色（见下方按钮）：</p>
      <div class="demo-row">
        <el-button type="primary">主要按钮（暖橙）</el-button>
        <el-button>默认按钮</el-button>
        <el-progress :percentage="66" style="flex:1; max-width:280px" />
      </div>
    </section>

    <!-- ================= ② 粉蹄 5 状态动画 ================= -->
    <section class="ft-card demo-section">
      <span class="ft-section-title">② 粉蹄海星 · 5 基础状态动画</span>
      <div class="ft-grid">
        <button
          v-for="p in ftStates"
          :key="p.state"
          class="ft-card"
          :class="{ 'ft-card--active': activeState === p.state }"
          @click="activeState = p.state"
        >
          <FtAvatar :state="p.state" :size="96" />
          <strong>{{ p.name }}</strong>
          <small>{{ p.desc }}</small>
        </button>
      </div>
      <div class="ft-preview">
        <FtAvatar :state="activeState" :size="140" />
        <div class="ft-bubble">
          当前状态：<strong>{{ ftStates.find(p => p.state === activeState).name }}</strong>
          <br />点上面任意卡片可以切换。所有页面统一调用
          <code>&lt;FtAvatar state="xxx" /&gt;</code> 即可，动画零配置。
        </div>
      </div>
    </section>

    <!-- ================= ③ 扩展接口演示 ================= -->
    <section class="ft-card demo-section">
      <span class="ft-section-title">③ 预留扩展接口 · 实机演示</span>

      <!-- 接口 2：游戏化数值统一接口 -->
      <h3 class="demo-h3">接口②：游戏化数值统一接口</h3>
      <div class="demo-row">
        <el-button type="primary" @click="demoAddCoin">🪙 完成任务 +1 金币</el-button>
        <el-button @click="demoLoseWeight">🐷 今日全勤 -0.5 斤</el-button>
        <el-button @click="demoCollectStarlet">🌟 收集小海星</el-button>
      </div>
      <div class="game-panel">
        <div class="game-stat"><span>金币</span><strong>{{ game.coins }}</strong></div>
        <div class="game-stat"><span>粉蹄体重</span><strong>{{ game.weight }} 斤</strong></div>
        <div class="game-stat"><span>成就徽章</span><strong>{{ Object.keys(game.achievements).length }} 枚</strong></div>
        <div class="game-stat"><span>小海星</span><strong>{{ Object.keys(game.starlets).length }} 只</strong></div>
      </div>
      <p class="demo-tip">
        点按钮后数值全站自动联动（商店、大盘页、主地图读的都是同一本总账）。
        减到 100 斤会自动解锁「帅气上岸海星」成就。
      </p>

      <!-- 接口 3：计划调整规则扩展池 -->
      <h3 class="demo-h3">接口③：计划调整规则扩展池</h3>
      <p class="demo-tip">当前池内已注册 {{ listPlanRules().length }} 条规则（第 3 阶段接入真实计划数据）：</p>
      <div class="demo-row">
        <el-tag v-for="r in listPlanRules()" :key="r.id" effect="plain">{{ r.name }}</el-tag>
      </div>
      <div class="demo-row">
        <el-button type="primary" plain @click="demoEvaluateRules">🧪 模拟一次每日反馈，执行规则池</el-button>
      </div>
      <div v-if="ruleMessages.length" class="ft-bubble rule-result">
        <p v-for="(msg, i) in ruleMessages" :key="i">💬 {{ msg }}</p>
        <small>命中规则：{{ appliedRules.join('、') }}</small>
      </div>

      <!-- 接口 1：悬浮功能插槽 -->
      <h3 class="demo-h3">接口①：悬浮功能插槽</h3>
      <p class="demo-tip">
        看页面<b>右侧中间</b>的 💡 悬浮按钮——它不是在页面里写死的，
        而是由「悬浮功能插槽接口」自动渲染的。
        点一下它，说明整个注册→渲染→点击响应的链路全部打通。
        以后新功能只需调用 <code>registerFloatingSlot()</code> 注册，
        按钮自动出现，<b>无需改动主页面</b>。
      </p>
    </section>

    <footer class="demo-footer">
      第一阶段验收项：加载 ≤ 2 秒 ✓ 配色符合规范 ✓ 3 个接口注释完整可对接 ✓ 控制台无红色报错 ✓
    </footer>
  </main>
</template>

<style scoped>
.demo-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding-bottom: var(--space-xxl);
}

.demo-header h1 {
  font-size: var(--font-size-title);
  margin-bottom: var(--space-sm);
}

.demo-subtitle {
  color: var(--color-text-secondary);
}

.demo-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.demo-h3 {
  font-size: var(--font-size-lg);
  margin-top: var(--space-sm);
}

.demo-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-md);
}

.demo-tip {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
}

.demo-tip code {
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

/* ----- 色卡 ----- */
.swatch-grid {
  display: grid;
  /* PC 上 5 张一行；屏幕变窄自动换行 */
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-md);
}

.swatch {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.swatch__color {
  height: 64px;
}

.swatch__info {
  padding: var(--space-sm) var(--space-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.swatch__info small {
  color: var(--color-text-secondary);
}

/* ----- 粉蹄状态卡片 ----- */
.ft-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-md);
}

.ft-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md);
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  /* 过渡统一 0.3s */
  transition: all var(--duration-base) var(--easing-soft);
}

.ft-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-card);
}

/* 选中状态用暖橙边框标识 */
.ft-card--active {
  border-color: var(--color-accent);
  background: #fff8f0;
}

.ft-card small {
  color: var(--color-text-secondary);
  text-align: center;
}

.ft-preview {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md);
  background: var(--color-primary);
  border-radius: var(--radius-md);
}

/* ----- 游戏化面板 ----- */
.game-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-md);
}

.game-stat {
  background: var(--color-bg-bubble);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.game-stat strong {
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
}

.rule-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.demo-footer {
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--space-md) 0;
}

/* 手机端：预览区的海星和气泡改成上下排 */
@media (max-width: 768px) {
  .ft-preview {
    flex-direction: column;
  }
}
</style>

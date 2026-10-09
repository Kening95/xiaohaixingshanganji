<script setup>
/**
 * ============================================================================
 * 主闯关地图页 —— MapView.vue
 * ----------------------------------------------------------------------------
 * 对应需求清单「常驻核心主页面」，全站的中枢页面：
 *   · 顶部：全局动态进度条（实时随完成任务数更新）、金币栏、当日任务倒计时
 *   · 中部：手绘 4 阶段闯关地图（蜿蜒小路串联 4 个关卡 + 上岸大门）
 *   · 粉蹄海星沿小路移动，越学越靠近"上岸大门"
 *   · 悬浮海星 + 悬浮功能插槽（扫题 / 电台，本阶段先占位提示）
 *
 * 交互细节（对照需求清单 · 主地图交互）：
 *   · hover 关卡节点 → 弹出该关累计学习时长、剩余任务数
 *   · 点击未解锁关卡 → 海星弹出提示"加油做完上一关的任务就能解锁这里啦"
 *   · 顶部进度条 → 可视化大盘页（第5阶段），金币栏 → 粉蹄商店（第6阶段），
 *     本阶段先弹出"敬请期待"占位提示，保证点击有反馈、无 404
 * ============================================================================
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'
import { usePlan, usePlanStats } from '@/core/plan'
import { useGamification } from '@/core/gamification'
import { useMonsterCount } from '@/core/wrongbook'
import { useScene } from '@/core/scene'
import { useSync } from '@/core/sync'
import { energyPoolStats } from '@/core/plan/guokao'

const router = useRouter()

/* ---------------- 计划数据与统计 ---------------- */

const plan = usePlan()          // computed：脚本里用 plan.value 取值
const stats = usePlanStats()       // 响应式统计：进度、任务数、每关解锁状态
const game = useGamification()     // 游戏化总账：金币、体重
const monsterCount = useMonsterCount() // 存活错题小怪兽数量（点击进错题本）
const scene = useScene()           // 自定义背景：模式/配色/图片，本页只负责"用"
const sync = useSync()             // 云端同步状态：顶栏小云朵实时展示

/* ---------------- 第 8 阶段：精力池（方案A①） ----------------
 * 国考计划专属的"精力池"面板：建议筹备 100 个 2h 时段 + 300 个 20min 碎片，
 * 计划实际占用 65 + 300 = 230h，剩余 35 个大时段显示为灰色"弹性缓冲格"。
 * 非国考计划返回 null，顶栏不显示入口（自定义计划行为完全不变）。
 */
const pool = computed(() => energyPoolStats(plan.value))
const poolOpen = ref(false) // 精力池面板展开/收起

/** 大时段 10×10 点阵：前 blocksUsed 格点亮（暖橙=已排入计划），其余灰色=弹性缓冲 */
const poolDots = computed(() => {
  if (!pool.value) return []
  return Array.from({ length: pool.value.blocksTotal }, (_, i) => i < pool.value.blocksUsed)
})

/* ---------------- 顶部：当日任务倒计时（到今晚 24:00） ---------------- */

const countdown = ref('')
let clockTimer = null

function tick() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0) // 今天结束 = 明天 0 点
  const diff = midnight - now
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0')
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
  countdown.value = `${h}:${m}:${s}`
}

/* ---------------- 手绘地图：路径与节点坐标 ---------------- */

/**
 * SVG 画布 1000 x 560。
 * 小路是一条三次贝塞尔曲线，依次穿过 4 个关卡，最后抵达右上角的"上岸大门"。
 * 弯弯曲曲才有"闯关地图"的手绘感。
 */
/**
 * 地图布局表：按"关卡数量"选路径和节点坐标。
 * 4 关布局 = 旧版坐标原样保留（老计划打开，地图一个像素都不变）；
 * 3 关布局 = 2027 国考计划专用（听课筑基 → 专项刷题 → 套卷冲刺）。
 * 以后若要支持 N 关，在这里加一项即可，渲染逻辑不用改。
 */
const MAP_LAYOUTS = {
  4: {
    path: 'M90,450 C160,450 190,270 270,270 C350,270 380,470 470,470 C560,470 590,250 680,250 C760,250 780,440 850,430 C900,423 910,190 925,175',
    nodes: [
      { x: 270, y: 270 },  // 第1关
      { x: 470, y: 470 },  // 第2关
      { x: 680, y: 250 },  // 第3关
      { x: 850, y: 430 }   // 第4关
    ],
    gate: { x: 925, y: 175 }
  },
  3: {
    path: 'M90,450 C160,450 200,270 300,270 C400,270 460,460 560,460 C660,460 700,250 780,250 C850,250 880,190 925,175',
    nodes: [
      { x: 300, y: 270 },  // 听课筑基关
      { x: 560, y: 460 },  // 梳理专项刷题关
      { x: 780, y: 250 }   // 套卷冲刺关
    ],
    gate: { x: 925, y: 175 }
  },
  /* 第 8 阶段：5 关布局 = 2027 国考五段节奏（筑基 → 梳理 → 专项 → 巩固 → 套卷） */
  5: {
    path: 'M90,450 C130,450 160,440 210,440 C290,440 310,250 370,250 C450,250 470,440 540,440 C620,440 640,240 700,240 C770,240 790,390 830,390 C880,390 900,230 925,175',
    nodes: [
      { x: 210, y: 440 },  // 听课筑基关
      { x: 370, y: 250 },  // 知识梳理关
      { x: 540, y: 440 },  // 专项练习关
      { x: 700, y: 240 },  // 刷题巩固关
      { x: 830, y: 390 }   // 套卷模拟关
    ],
    gate: { x: 925, y: 175 }
  }
}

/** 当前计划的地图布局（按关卡数量取；取不到时兜底 5 关——第 8 阶段起所有计划统一五关） */
const layout = computed(() => MAP_LAYOUTS[stats.value.stageStats.length] || MAP_LAYOUTS[5])

const svgEl = ref(null)
const pathEl = ref(null)
const canvasEl = ref(null) // 地图容器（海星以它为参照做绝对定位）

/** 小路总长度（响应式：mounted 后从 SVG 实测，避免猜错长度导致路面显示偏差） */
const pathLength = ref(2400)

/**
 * 海星在页面上的位置（像素坐标，由 SVG 坐标换算而来）。
 * 初始为 null：首次定位完成前不渲染海星（模板里 v-if），
 * 这样海星第一次出现就直接在小路正确的位置上，
 * 不会从左上角 {0,0} 慢慢滑过来。
 */
const starPos = ref(null)

/**
 * 是否已完成首次定位。
 * 首次定位完成后才给海星加上 left/top 过渡动画，
 * 之后勾选任务、进度变化时海星会平滑地沿小路向前挪。
 */
const starPlaced = ref(false)

/**
 * 按全局进度把海星摆到小路对应的位置上。
 * getPointAtLength 取曲线上对应长度的点，getScreenCTM 把 SVG 坐标换算成
 * 屏幕像素坐标——两步都依赖浏览器实测，所以不用担心窗口缩放、SVG 留白问题。
 */
function updateStarPosition() {
  if (!pathEl.value || !canvasEl.value) return
  pathLength.value = pathEl.value.getTotalLength()
  // 进度 0 时海星在小路起点；进度 1 时正好抵达上岸大门
  const point = pathEl.value
    .getPointAtLength(pathLength.value * Math.min(stats.value.progress, 0.995))
    .matrixTransform(pathEl.value.getScreenCTM())
  const rect = canvasEl.value.getBoundingClientRect()
  starPos.value = {
    left: point.x - rect.left,
    top: point.y - rect.top
  }
  // 本次渲染帧结束后，后续位置变化再启用平滑过渡
  requestAnimationFrame(() => { starPlaced.value = true })
}

/* ---------------- 关卡交互 ---------------- */

/** 点击已解锁关卡 → 进入关卡任务详情页 */
function enterStage(stageId) {
  router.push(`/level/${stageId}`)
}

/** 海星提示气泡（未解锁关卡点击时弹出）；lockedStage 记录被点的是哪一关，用于气泡里的"预览"入口 */
const bubble = ref({ show: false, text: '', mood: 'idle', lockedStage: null })
let bubbleTimer = null

/** 点击未解锁关卡：海星鼓脸提醒 + 软萌文案（需求清单原文） */
function tryLockedStage(stageId) {
  bubble.value = {
    show: true,
    text: '加油做完上一关的任务就能解锁这里啦！粉蹄陪你一起冲～',
    mood: 'remind',
    lockedStage: stageId
  }
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => { bubble.value.show = false }, 3500)
}

/** 气泡里的"预览"入口：提前看看这关内容（只读，不影响正式进度） */
function previewStage(stageId) {
  clearTimeout(bubbleTimer)
  router.push(`/level/${stageId}?preview=1`)
}

/** 顶部入口的占位提示（大盘 / 商店后续阶段开放） */
const topToast = ref({ show: false, text: '' })
let toastTimer = null

/** 打开粉蹄金币商店（第 6 阶段：广播全局事件，ShopModal 挂在 App 层） */
function openShop() {
  window.dispatchEvent(new CustomEvent('fenti:open-shop'))
}

function showToast(text) {
  topToast.value = { show: true, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { topToast.value.show = false }, 2500)
}

/* ---------------- 悬浮功能插槽说明 ----------------
 * 📷粉蹄扫题 / 🎧常识电台已改为"全时间段开放"：注册挪到了
 * core/floatingSlot/builtinSlots.js（由 main.js 全局引入），
 * 任何页面都能点到，本页不再重复注册。
 */

onMounted(() => {
  // 倒计时每秒刷新
  tick()
  clockTimer = setInterval(tick, 1000)

  // 首次计算海星位置
  updateStarPosition()
  window.addEventListener('resize', updateStarPosition)
})

onUnmounted(() => {
  clearInterval(clockTimer)
  clearTimeout(bubbleTimer)
  clearTimeout(toastTimer)
  window.removeEventListener('resize', updateStarPosition)
})

// 任务完成数变化 → 进度变化 → 海星自动向前移动
watch(() => stats.value.doneTasks, updateStarPosition)

// 计划类型切换（4 关旧计划 ↔ 3 关国考计划）→ 路径变了，重新定位海星
watch(() => layout.value.path, () => nextTick(updateStarPosition))

/** 进度条百分比（0~100 的整数，给 el-progress 用） */
const progressPercent = computed(() => Math.round(stats.value.progress * 100))

/**
 * 粉蹄体重视觉联动：体重越轻海星越苗条。
 * 200 斤 → 1.0 倍（初始圆润），100 斤 → 0.85 倍（上岸苗条）。
 * 只改 size，不动动画，避免 CSS transform 互相覆盖。
 */
const starScale = computed(() => 1 - Math.min(0.15, Math.max(0, (200 - game.weight) / 100 * 0.15)))
</script>

<template>
  <div class="map-page">
    <!-- ═════════ 顶部栏：进度条 / 倒计时 / 金币 ═════════ -->
    <header class="topbar">
      <h1 class="topbar__logo">🌊 小海星上岸记</h1>

      <!-- 全局动态进度条：点击进可视化大盘（第5阶段已接入），百分比文字自定义，避免重复显示 -->
      <div class="topbar__progress" title="点击查看可视化进度大盘" @click="router.push('/dashboard')">
        <el-progress :percentage="progressPercent" :stroke-width="16" :show-text="false" class="topbar__progress-bar" />
        <span class="topbar__progress-text">总进度 {{ progressPercent }}%</span>
      </div>

      <!-- 精力池入口（第 8 阶段，仅国考计划显示）：点击展开 100 格大时段池面板 -->
      <button
        v-if="pool"
        class="topbar__pool"
        :class="{ 'topbar__pool--open': poolOpen }"
        title="精力池：你筹备的学习时段 vs 计划实际占用"
        @click="poolOpen = !poolOpen"
      >
        ⚡ {{ pool.blocksUsed }}/{{ pool.blocksTotal }}
      </button>

      <!-- 精力池面板：大时段 10×10 点阵 + 碎片进度条 + 说明（点外面或再点按钮收起） -->
      <div v-if="pool && poolOpen" class="pool-panel" @click.self="poolOpen = false">
        <div class="pool-panel__card">
          <h3 class="pool-panel__title">⚡ 精力池 · 我的学习时段储备</h3>
          <p class="pool-panel__desc">
            建议筹备 <strong>{{ pool.blocksTotal }}</strong> 个 2 小时完整时段 +
            <strong>{{ pool.fragsTotal }}</strong> 个 20 分钟碎片；
            本计划实际占用 <strong>{{ pool.blocksUsed }}</strong> 个大时段 +
            <strong>{{ pool.fragsUsed }}</strong> 个碎片 = <strong>{{ pool.usedHours }}</strong> 小时，
            剩 <strong>{{ pool.bufferBlocks }}</strong> 个大时段是留给你的弹性缓冲～
          </p>
          <div class="pool-panel__grid" role="img" :aria-label="`大时段池 ${pool.blocksUsed}/${pool.blocksTotal}`">
            <span
              v-for="(used, i) in poolDots"
              :key="i"
              class="pool-panel__dot"
              :class="{ 'pool-panel__dot--used': used }"
            />
          </div>
          <div class="pool-panel__legend">
            <span><i class="pool-panel__dot pool-panel__dot--used" /> 已排入计划 {{ pool.blocksUsed }} 格</span>
            <span><i class="pool-panel__dot" /> 弹性缓冲 {{ pool.bufferBlocks }} 格</span>
          </div>
          <div class="pool-panel__frags">
            <span class="pool-panel__frags-label">碎片 {{ pool.fragsUsed }}/{{ pool.fragsTotal }}</span>
            <div class="pool-panel__frags-bar">
              <div class="pool-panel__frags-fill" :style="{ width: `${(pool.fragsUsed / pool.fragsTotal) * 100}%` }" />
            </div>
          </div>
          <p class="pool-panel__hint">💡 不必照搬别人的进度：状态好就提前吃缓冲格，累了就把缓冲日留给休息。</p>
        </div>
      </div>

      <!-- 当日任务倒计时 -->
      <div class="topbar__countdown" title="距今日任务截止（今晚 24:00）">
        ⏰ <span class="topbar__countdown-label">今日倒计时</span> <strong>{{ countdown }}</strong>
      </div>

      <!-- 粉蹄体重：当日全勤 -0.5 斤，未完成 +1 斤；减到 100 斤解锁帅气上岸海星 -->
      <div class="topbar__weight" title="粉蹄体重：全勤减重 0.5 斤，未完成增重 1 斤；减到 100 斤解锁「帅气上岸海星」">
        ⭐ {{ game.weight }} 斤
      </div>

      <!-- 错题小怪兽：点击进电子错题本（扫题收录的错题在这里攻克） -->
      <button
        class="topbar__monster"
        title="错题小怪兽：用「粉蹄扫题」收录错题会生成小怪兽，重做攻克可消除并得金币"
        @click="router.push('/wrongbook')"
      >
        👾 {{ monsterCount }}
      </button>

      <!-- 金币栏：点击进粉蹄商店（第6阶段已接入） -->
      <button class="topbar__coins" title="粉蹄金币商店：全勤/攻克错题/电台/结伴都能赚金币" @click="openShop">
        🪙 {{ game.coins }}
      </button>

      <!-- 同步状态：实时展示，点击进个人中心（第 7 阶段） -->
      <button
        class="topbar__sync"
        :class="`topbar__sync--${sync.status}`"
        title="云端同步状态：点击进个人中心查看详情"
        @click="router.push('/profile')"
      >
        {{ { idle: '☁️', syncing: '📤', synced: '✅', offline: '📴' }[sync.status] || '☁️' }}
      </button>

      <!-- 个人中心入口（第 7 阶段）：账号 / 同步 / 备份 / 数据管理 -->
      <button class="topbar__profile" title="个人中心：账号、同步状态、云端备份、数据管理" @click="router.push('/profile')">
        👤
      </button>
    </header>

    <!-- ═════════ 手绘闯关地图 ═════════ -->
    <!-- 背景样式/图片由 core/scene（自定义背景功能）统一提供：渐变模式用 CSS 变量风景，
         图片模式绑定用户上传的图片并关掉海面细波装饰 -->
    <main ref="canvasEl" class="map-canvas" :class="{ 'map-canvas--image': scene.isImageMode.value }" :style="scene.canvasStyle.value">
      <svg ref="svgEl" viewBox="0 0 1000 560" class="map-canvas__svg" role="img" aria-label="闯关地图">
        <!-- 蜿蜒小路：已走过的部分显示暖橙，未走过的显示灰蓝 -->
        <!-- （原来的 ☁️/🌊 装饰小图标已移除，天空大海沙滩由 .map-canvas 的渐变风景背景统一呈现） -->

        <path :d="layout.path" fill="none" stroke="var(--color-primary-darker)" stroke-width="14" stroke-linecap="round" opacity="0.5" />
        <path
          ref="pathEl" :d="layout.path" fill="none"
          stroke="var(--color-accent)" stroke-width="14" stroke-linecap="round"
          :stroke-dasharray="pathLength"
          :stroke-dashoffset="pathLength * (1 - stats.progress)"
          class="map-canvas__road"
        />

        <!-- 上岸大门（终点）：进度 100% 时金光闪闪 -->
        <g :class="{ 'gate--open': stats.progress >= 1 }" class="gate">
          <text :x="layout.gate.x" :y="layout.gate.y - 38" text-anchor="middle" font-size="40">🚪</text>
          <text :x="layout.gate.x" :y="layout.gate.y + 34" text-anchor="middle" font-size="18" fill="#333">上岸大门</text>
        </g>

        <!-- 4 个关卡节点 -->
        <g
          v-for="(stage, i) in stats.stageStats"
          :key="stage.id"
          class="stage-node"
          :class="{ 'stage-node--locked': !stage.unlocked, 'stage-node--finished': stage.finished }"
          @click="stage.unlocked ? enterStage(stage.id) : tryLockedStage(stage.id)"
        >
          <!-- 节点底盘 -->
          <circle :cx="layout.nodes[i].x" :cy="layout.nodes[i].y" r="36" class="stage-node__circle" />
          <text :x="layout.nodes[i].x" :y="layout.nodes[i].y + 10" text-anchor="middle" font-size="30">
            {{ stage.finished ? '✅' : stage.unlocked ? stage.icon : '🔒' }}
          </text>
          <text :x="layout.nodes[i].x" :y="layout.nodes[i].y + 62" text-anchor="middle" font-size="18" fill="#333" class="stage-node__name">
            {{ stage.name }}
          </text>

          <!-- hover 提示框：累计学习时长 + 剩余任务数（需求清单 · 主地图交互） -->
          <g class="stage-node__tooltip">
            <rect :x="layout.nodes[i].x - 90" :y="layout.nodes[i].y - 100" width="180" height="52" rx="10" />
            <text :x="layout.nodes[i].x" :y="layout.nodes[i].y - 78" text-anchor="middle" font-size="15" fill="#fff">
              已完成 {{ stage.done }}/{{ stage.total }} 小时
            </text>
            <text :x="layout.nodes[i].x" :y="layout.nodes[i].y - 58" text-anchor="middle" font-size="15" fill="#fff">
              剩余任务 {{ stage.total - stage.done }} 个
            </text>
          </g>
        </g>
      </svg>

      <!-- 粉蹄海星：沿小路移动（HTML 定位，叠在 SVG 上方）。
           starPos 为 null（首次定位未完成）时不渲染，避免从左上角滑入 -->
      <FtAvatar
        v-if="starPos"
        :state="stats.progress >= 1 ? 'cheer' : bubble.mood"
        :size="72"
        class="map-star"
        :class="{ 'map-star--placed': starPlaced }"
        :style="{ left: starPos.left + 'px', top: starPos.top + 'px' }"
      />

      <!-- 海星提示气泡（点击未解锁关卡时弹出） -->
      <transition name="bubble">
        <div v-if="bubble.show" class="map-bubble">
          {{ bubble.text }}
          <!-- 未解锁关卡也可以"先睹为快"：点开只读预览，不影响正式进度 -->
          <button
            v-if="bubble.lockedStage"
            class="map-bubble__preview"
            @click.stop="previewStage(bubble.lockedStage)"
          >
            🔭 预览这关内容
          </button>
        </div>
      </transition>
    </main>

    <!-- 顶部占位提示 toast -->
    <transition name="bubble">
      <div v-if="topToast.show" class="top-toast">{{ topToast.text }}</div>
    </transition>

    <!-- 右下角悬浮陪学海星（常驻，可点开互动菜单） -->
    <div class="map-companion">
      <FtAvatar state="idle" :size="Math.round(88 * starScale)" />
    </div>
  </div>
</template>

<style scoped>
/* 页面：天蓝背景铺满，上下结构 */
.map-page {
  min-height: 100vh;
  background: var(--color-bg-page);
  display: flex;
  flex-direction: column;
}

/* ═══════ 第 8 阶段：精力池（方案A①） ═══════
   顶栏小药丸按钮：点开弹出池子面板 */
.topbar__pool {
  border: 2px solid var(--color-secondary);
  background: var(--color-bg-card);
  color: var(--color-secondary-dark, #b25e09);
  font-size: 14px;
  font-weight: 700;
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--easing-soft);
  white-space: nowrap;
}
.topbar__pool:hover,
.topbar__pool--open {
  background: var(--color-secondary);
  color: #fff;
  transform: translateY(-1px);
}

/* 面板：绝对定位挂在顶栏下方居中，不遮挡地图主体 */
.pool-panel {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
}
.pool-panel__card {
  width: 340px;
  background: var(--color-bg-card);
  border: 2px solid var(--color-secondary);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
  animation: pool-pop var(--duration-base) var(--easing-soft);
}
@keyframes pool-pop {
  from { opacity: 0; transform: translateY(-8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.pool-panel__title { margin: 0 0 var(--space-sm); font-size: 16px; }
.pool-panel__desc  { margin: 0 0 var(--space-md); font-size: 12px; line-height: 1.7; color: #666; }
/* 大时段 10×10 点阵：暖橙=已排计划，浅灰=弹性缓冲 */
.pool-panel__grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 5px;
  margin-bottom: var(--space-sm);
}
.pool-panel__dot {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  background: #e3eaf2;
  display: inline-block;
}
.pool-panel__dot--used { background: var(--color-secondary); }
.pool-panel__legend {
  display: flex;
  gap: var(--space-lg);
  font-size: 12px;
  color: #666;
  margin-bottom: var(--space-md);
}
.pool-panel__legend .pool-panel__dot { width: 12px; height: 12px; margin-right: 4px; vertical-align: -1px; }
/* 碎片进度条 */
.pool-panel__frags { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.pool-panel__frags-label { font-size: 12px; color: #666; white-space: nowrap; }
.pool-panel__frags-bar {
  flex: 1;
  height: 10px;
  border-radius: 999px;
  background: #e3eaf2;
  overflow: hidden;
}
.pool-panel__frags-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-primary), #7ec2f5);
  transition: width var(--duration-base) var(--easing-soft);
}
.pool-panel__hint { margin: 0; font-size: 12px; color: #999; line-height: 1.6; }


/* ═══════ 顶部栏 ═══════ */
.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md) var(--space-xl);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-card);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar__logo {
  margin: 0;
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  white-space: nowrap;
}

/* 进度条区域：可点击（第5阶段跳转大盘页） */
.topbar__progress {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  transition: transform var(--duration-base) var(--easing-soft);
}

/* 点击瞬间：进度条整体轻微下压（点击动效） */
.topbar__progress:active {
  transform: scale(0.98);
}

.topbar__progress-bar {
  flex: 1;
}

.topbar__progress-text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.topbar__countdown {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.topbar__coins {
  border: 2px solid var(--color-accent);
  background: #fff0e0;
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}

.topbar__coins:hover {
  transform: scale(1.06);
}

/* 点击瞬间：按压缩小，配合 hover 放大形成"弹跳"手感（点击动效） */
.topbar__coins:active {
  transform: scale(0.92);
}

/* 体重栏：粉星胶囊，与金币样式呼应 */
.topbar__weight {
  border: 2px solid var(--color-highlight-deep);
  background: var(--color-highlight);
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}

/* 小怪兽栏：点击进错题本 */
.topbar__monster {
  border: 2px solid var(--color-primary-darker);
  background: var(--color-primary);
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
  white-space: nowrap;
}

.topbar__monster:hover {
  transform: scale(1.06);
}

/* 点击瞬间：按压缩小（点击动效） */
.topbar__monster:active {
  transform: scale(0.92);
}

/* 同步状态云朵 + 个人中心入口：紧凑圆形小按钮（第 7 阶段） */
.topbar__sync,
.topbar__profile {
  border: 2px solid var(--color-border);
  background: var(--color-bg-card);
  border-radius: var(--radius-round);
  width: 36px;
  height: 36px;
  font-size: 16px;
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}

.topbar__sync:hover,
.topbar__profile:hover {
  transform: scale(1.08);
  border-color: var(--color-accent);
}

.topbar__sync:active,
.topbar__profile:active {
  transform: scale(0.92);
}

/* 同步状态着色：离线红色提醒，同步中橙色，已同步绿色 */
.topbar__sync--offline { border-color: #e8a0a0; background: #fff0f0; }
.topbar__sync--syncing { border-color: var(--color-accent); background: #fff0e0; }
.topbar__sync--synced  { border-color: var(--color-success); background: #f0faf0; }

/* ═══════ 地图区 ═══════ */
.map-canvas {
  position: relative; /* 海星用 absolute 定位，以这里为参照 */
  flex: 1;
  padding: var(--space-lg);

  /* ── 风景背景 ────────────────────────────────────────────────────
     配色来自 --scene-* 变量：默认值在 tokens.css 里
     （蓝天白云大海沙滩），用户通过"自定义背景"功能（core/scene）
     修改后，变量会在运行时被覆盖，背景立即变化。
     第 1 层 = 太阳（柔和光斑，--scene-sun 设成全透明即隐藏）
     第 2 层 = 天空→大海→沙滩的纵向主渐变
     纯 CSS 实现、零图片请求，页面加载速度不受影响。 */
  background:
    radial-gradient(circle at 12% 12%, var(--scene-sun) 0 54px, rgba(255, 246, 205, 0) 72px),
    linear-gradient(to bottom,
      var(--scene-sky-light) 0%,
      var(--scene-sky) 30%,
      var(--scene-sea-light) 42%,
      var(--scene-sea) 56%,
      var(--scene-sea-light) 61%,
      var(--scene-sand) 66%,
      var(--scene-sand-deep) 100%);
}

/* 图片背景模式：用户上传了自己的图片，海面细波装饰就不画了，
   图片由内联样式（scene.canvasStyle）以 cover 方式铺满。 */
.map-canvas--image::before {
  display: none;
}

/* 海面细波：只覆盖大海横带（顶部 42% ~ 62% 区域），
   半透明白色横纹给大海一点动感，又不会盖住关卡节点和小路。 */
.map-canvas::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 42%;
  height: 20%;
  pointer-events: none; /* 纯装饰，不挡任何点击 */
  background: repeating-linear-gradient(to bottom,
    rgba(255, 255, 255, 0) 0 24px,
    rgba(255, 255, 255, 0.3) 24px 27px,
    rgba(255, 255, 255, 0) 27px 52px);
}

.map-canvas__svg {
  width: 100%;
  max-height: 72vh;
  display: block;
  position: relative; /* 层级提到装饰细波之上 */
  z-index: 1;
}

/* 已走过的路面：dash 偏移变化时有 0.3s 平滑过渡（动效规范） */
.map-canvas__road {
  transition: stroke-dashoffset var(--duration-base) var(--easing-soft);
}

/* 上岸大门：通关后发光 */
.gate--open {
  filter: drop-shadow(0 0 12px var(--color-accent));
}

/* 关卡节点：可点击，hover 浮起 */
.stage-node {
  cursor: pointer;
}

.stage-node__circle {
  fill: var(--color-bg-card);
  stroke: var(--color-accent);
  stroke-width: 4;
  transition: all var(--duration-base) var(--easing-soft);
}

.stage-node:hover .stage-node__circle {
  fill: #fff0e0;
}

.stage-node__name {
  font-weight: 600;
}

/* 未解锁节点：灰淡化 */
.stage-node--locked .stage-node__circle {
  stroke: var(--color-primary-darker);
  fill: #f2f7fc;
}

.stage-node--locked {
  cursor: not-allowed;
}

/* 已完成节点：绿框 */
.stage-node--finished .stage-node__circle {
  stroke: var(--color-success);
}

/* hover 提示框：默认隐藏，鼠标移入节点才显示 */
.stage-node__tooltip {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-base) var(--easing-soft);
}

.stage-node__tooltip rect {
  fill: rgba(51, 51, 51, 0.85);
}

.stage-node:hover .stage-node__tooltip {
  opacity: 1;
}

/* 海星：absolute 沿小路移动；过渡只在首次定位完成后生效（见 starPlaced） */
.map-star {
  position: absolute;
  transform: translate(-50%, -85%); /* 以海星底部中心对齐路径点 */
  pointer-events: none; /* 不挡路，不拦截地图点击 */
}

.map-star--placed {
  transition: left 0.6s var(--easing-soft), top 0.6s var(--easing-soft);
}

/* 海星提示气泡：地图右下角 */
.map-bubble {
  position: absolute;
  right: var(--space-xl);
  bottom: calc(var(--space-xl) + 110px);
  max-width: 280px;
  background: var(--color-bg-bubble);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  box-shadow: var(--shadow-float);
  z-index: 60;
}

/* 气泡里的"预览这关内容"按钮：小海星主题色描边，点击跳只读预览页 */
.map-bubble__preview {
  display: block;
  margin: var(--space-sm) auto 0;
  padding: 6px var(--space-lg);
  background: var(--color-primary, #e6f4ff);
  color: #2f6ea5;
  border: 1.5px solid #6fb3e8;
  border-radius: var(--radius-round);
  font-size: 13px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.map-bubble__preview:hover {
  background: #d3ecff;
  transform: scale(1.05);
}

/* 顶部 toast */
.top-toast {
  position: fixed;
  top: 76px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(51, 51, 51, 0.85);
  color: #fff;
  border-radius: var(--radius-round);
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-base);
  z-index: 120;
}

/* 右下角悬浮陪学海星 */
.map-companion {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 55;
}

/* 气泡/提示淡入淡出 */
.bubble-enter-active,
.bubble-leave-active {
  transition: opacity var(--duration-base) var(--easing-soft);
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
}

/* 手机 H5：顶部栏两行排布（第一行 logo+数据胶囊，第二行通栏进度条），
   保证金币商店等入口永远可见；停靠栏只剩窄图标，地图右侧留白收窄 */
@media (max-width: 768px) {
  .topbar {
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: 8px 12px;
  }
  .topbar__progress {
    order: 3;
    flex-basis: 100%;
  }
  .map-canvas {
    padding-right: var(--space-lg);
  }
  .map-bubble {
    right: var(--space-md);
    left: var(--space-md);
    max-width: none;
  }
}

/* 小屏手机（微信 H5 常见 375~414px）：顶栏进一步紧凑，
   第一行只保留 logo + 倒计时(纯数字) + 体重/小怪兽/金币三个小胶囊，
   全部单行放下不挤压；悬浮停靠栏停靠在两行顶栏之下（top:108px 预留位）。 */
@media (max-width: 640px) {
  .topbar {
    gap: 6px;
    padding: 8px 10px;
  }
  .topbar__logo {
    font-size: 15px;
  }
  /* 倒计时只留 ⏰ + 数字，"今日倒计时"文字收起省宽度 */
  .topbar__countdown-label {
    display: none;
  }
  .topbar__countdown {
    font-size: 12px;
  }
  /* 三个数据胶囊统一缩小，保证一行排开不被挤出屏幕 */
  .topbar__weight,
  .topbar__monster,
  .topbar__coins {
    font-size: 14px;
    padding: 3px 10px;
    border-width: 1.5px;
  }
}

/* 超窄屏（≤480px，如部分微信内置浏览器可视区）：
   倒计时整块收起——地图页金币商店/体重/小怪兽入口优先保证可见，
   倒计时在关卡页和反馈流程里仍有提示，不属于高频信息。 */
@media (max-width: 480px) {
  .topbar__countdown {
    display: none;
  }
}
</style>

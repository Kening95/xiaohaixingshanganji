/**
 * ============================================================================
 * 常识电台播放器 —— core/radio/index.js（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   电台的"播放内核"：选曲（三种模式）、朗读、计时、发奖。
 *   界面组件（RadioPanel.vue）只负责按钮和展示，所有逻辑都在这里，
 *   两边通过响应式 state 联动——分层解耦，界面随便改，内核不用动。
 *
 * 三种播放模式（需求清单）：
 *   daily 每日推送   —— 按日期种子抽 3 条，每天不重样
 *   weak  薄弱定向   —— 优先播"错题小怪兽最多"的科目（对接错题本数据）
 *   loop  全板块循环 —— 六大科目全部节目循环播
 *
 * 朗读引擎：浏览器内置 Web Speech API（speechSynthesis）。
 *   · 免费、无网络依赖、无需下载语音包
 *   · "粉蹄音色"：优先挑选系统里的中文女声，语速放慢、音调调高，更软萌
 *   · 兼容性：桌面 Chrome/Edge 完整支持；部分手机浏览器锁屏后会暂停，
 *     详见《第五阶段测试用例.md》兼容性说明
 *
 * 金币奖励（对接游戏化统一接口②，核心底层零改动）：
 *   累计收听每满 10 分钟 → addCoins(1, '电台收听满10分钟')
 *   防挂机刷币：每天最多发 3 枚（30 分钟），超出后仍计时但不再发币。
 *   计时进度存 localStorage（key = 'fenti-radio-v1'），刷新页面不丢。
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { addCoins, unlockAchievement } from '@/core/gamification'
import { useWrongbook } from '@/core/wrongbook'
import { addRadioMinutes } from '@/core/stats'
import { pickDailyEpisodes, pickWeakEpisodes, pickLoopEpisodes } from './episodes'

const STORAGE_KEY = 'fenti-radio-v1'
const AWARD_BLOCK_SECONDS = 600   // 每满 600 秒（10 分钟）发 1 枚金币
const AWARD_DAILY_CAP = 3         // 每天最多发 3 枚（防挂机）
const TICK_MS = 1000              // 播放计时心跳间隔

/** 播放器状态（响应式，界面组件直接绑定） */
const state = reactive({
  mode: 'daily',        // 当前模式：daily | weak | loop
  playing: false,       // 是否正在朗读
  queue: [],            // 当前播放队列（节目对象数组）
  index: 0,             // 正在播队列里的第几条
  listenSeconds: 0,     // 累计收听秒数（持久化，跨天不丢）
  awardedBlocks: 0,     // 今天已发币的"10 分钟块数"
  awardDate: '',        // 上次发币所属日期（用于每日封顶重置）
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window
})

/* ---------------- 持久化：收听进度刷新不丢 ---------------- */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      listenSeconds: state.listenSeconds,
      awardedBlocks: state.awardedBlocks,
      awardDate: state.awardDate
    }))
  } catch (error) {
    console.error('[radio] 收听进度存盘失败：', error)
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (typeof data.listenSeconds === 'number') state.listenSeconds = data.listenSeconds
    // 跨天了：发币计数清零重新算（封顶是"每天"的口径）
    const today = new Date().toLocaleDateString('sv-SE')
    if (data.awardDate === today && typeof data.awardedBlocks === 'number') {
      state.awardedBlocks = data.awardedBlocks
    }
    state.awardDate = today
  } catch (error) {
    console.error('[radio] 读取收听进度失败：', error)
  }
}

load()

/* ---------------- 选曲 ---------------- */
export const RADIO_MODES = [
  { id: 'daily', name: '每日推送', desc: '每天 3 条新鲜考点' },
  { id: 'weak', name: '薄弱定向', desc: '专播错题最多的科目' },
  { id: 'loop', name: '全板块循环', desc: '六科节目单循环播' }
]

/** 薄弱定向：取"存活错题小怪兽"最多的科目（最多 3 个），没错题就播常识 */
function detectWeakSubjects() {
  const count = {}
  for (const e of useWrongbook().value.filter((e) => e.status === 'wrong')) {
    count[e.subject] = (count[e.subject] || 0) + 1
  }
  const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([s]) => s)
  return ranked.length ? ranked.slice(0, 3) : ['常识判断']
}

/** 按模式生成播放队列 */
export function buildQueue(mode) {
  if (mode === 'weak') return pickWeakEpisodes(detectWeakSubjects())
  if (mode === 'loop') return pickLoopEpisodes()
  return pickDailyEpisodes()
}

/* ---------------- 朗读内核 ---------------- */
let tickTimer = null   // 计时心跳
let currentUtter = null

/** 挑一个"粉蹄音色"：中文女声优先，找不到就用默认嗓音 */
function pickVoice() {
  if (!state.supported) return null
  const voices = speechSynthesis.getVoices().filter((v) => /zh|中文|Chinese/i.test(v.lang + v.name))
  return (
    voices.find((v) => /female|女|xiaoxiao|huihui|xiaoyi|ting|mei/i.test(v.name)) ||
    voices.find((v) => v.lang.replace('_', '-').startsWith('zh')) ||
    voices[0] || null
  )
}

/** 朗读当前队列条目；读完自动播下一条，播完整个队列自动停止 */
function speakCurrent() {
  if (!state.supported) return
  speechSynthesis.cancel()
  const ep = state.queue[state.index]
  if (!ep) { stopRadio(); return }

  const utter = new SpeechSynthesisUtterance(`${ep.title}。${ep.text}`)
  const voice = pickVoice()
  if (voice) utter.voice = voice
  utter.lang = 'zh-CN'
  utter.rate = 0.95   // 语速稍慢，考点听得更清楚
  utter.pitch = 1.1   // 音调稍高，接近粉蹄的软萌音色
  utter.onend = () => {
    if (!state.playing) return
    state.index++
    if (state.index >= state.queue.length) stopRadio() // 队列播完自动停
    else speakCurrent()
  }
  utter.onerror = (event) => {
    if (event.error !== 'canceled' && event.error !== 'interrupted') {
      console.warn('[radio] 朗读中断：', event.error)
      stopRadio()
    }
  }
  currentUtter = utter
  speechSynthesis.speak(utter)
}

/** 计时心跳：每秒累计收听时长，写学习日志，到点发金币 */
function startTick() {
  stopTick()
  let carryMs = 0 // 上次心跳至今的真实毫秒数（后台标签页定时器会被节流，用时间差修正）
  let last = Date.now()
  tickTimer = setInterval(() => {
    if (!state.playing || (state.supported && !speechSynthesis.speaking && !speechSynthesis.pending)) {
      // 没在出声（比如被系统打断）就暂停计时，防止挂机刷时长
      last = Date.now()
      return
    }
    const now = Date.now()
    carryMs += now - last
    last = now
    const seconds = Math.floor(carryMs / 1000)
    if (seconds <= 0) return
    carryMs -= seconds * 1000
    state.listenSeconds += seconds
    addRadioMinutes(seconds / 60) // 记入每日学习日志（供热力图/周报统计）

    // 发奖判定：每满 10 分钟一块，每天封顶 3 块
    const blocks = Math.floor(state.listenSeconds / AWARD_BLOCK_SECONDS)
    const today = new Date().toLocaleDateString('sv-SE')
    if (state.awardDate !== today) { state.awardDate = today; state.awardedBlocks = 0 }
    while (state.awardedBlocks < blocks) {
      state.awardedBlocks++
      if (state.awardedBlocks <= AWARD_DAILY_CAP) {
        addCoins(1, `电台收听满 ${state.awardedBlocks * 10} 分钟`) // 游戏化统一接口②
        // 第一块金币到账时点亮「电台首秀」徽章（徽章墙自动同步，幂等）
        unlockAchievement('radio-rookie', { title: '电台首秀', description: '电台收听满 10 分钟', icon: '🎧' })
        window.dispatchEvent(new CustomEvent('fenti:toast', {
          detail: { text: `🎧 收听满 ${state.awardedBlocks * 10} 分钟，粉蹄奖励 1 枚金币！` }
        }))
      }
    }
    save()
  }, TICK_MS)
}

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}

/* ---------------- 对外播放控制 API ---------------- */

/** 播放（或切换模式重播）。mode 变化时重建队列从头播。 */
export function playRadio(mode = state.mode) {
  if (!state.supported) return false
  state.mode = mode
  state.queue = buildQueue(mode)
  state.index = 0
  state.playing = true
  speakCurrent()
  startTick()
  console.log(`[radio] ▶️ 开始播放（${mode}），队列 ${state.queue.length} 条`)
  return true
}

/** 暂停：停住计时和朗读，进度保留（再按播放会从当前条重播） */
export function pauseRadio() {
  state.playing = false
  if (state.supported) speechSynthesis.cancel()
  stopTick()
  save()
  console.log('[radio] ⏸️ 已暂停')
}

/** 停止：暂停且队列归位 */
export function stopRadio() {
  pauseRadio()
  state.index = 0
}

/** 下一条 */
export function nextEpisode() {
  if (!state.queue.length) return
  state.index = (state.index + 1) % state.queue.length
  if (state.playing) speakCurrent()
}

/** 当前节目（响应式） */
export function useCurrentEpisode() {
  return computed(() => state.queue[state.index] || null)
}

/** 播放器状态（响应式，界面组件绑定它） */
export function useRadioState() {
  return computed(() => ({
    ...state,
    current: state.queue[state.index] || null,
    /** 距离下一块 10 分钟还差几秒（界面显示倒计时用） */
    secondsToNextBlock: AWARD_BLOCK_SECONDS - (state.listenSeconds % AWARD_BLOCK_SECONDS),
    /** 今日还能领几块金币 */
    awardLeft: Math.max(0, AWARD_DAILY_CAP - state.awardedBlocks)
  }))
}

/** 模块卸载兜底（应用关闭时停掉朗读与计时） */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (state.supported) speechSynthesis.cancel()
    save()
  })
}

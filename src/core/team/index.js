/**
 * ============================================================================
 * 「猪队友」结伴闯关房 —— core/team/index.js（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 这是什么？
 *   一个人备考太孤单，粉蹄给你拉了一个 3 人闯关房：
 *   你 + 2 位"云队友"（程序模拟的备考搭子）同进同退。
 *
 * 队友是真人吗？（诚实说明）
 *   不是。纯前端没有服务器，做不了真联机。队友是本地模拟的：
 *   · 每个队友有自己的名字、头像 emoji、人设和学习节奏
 *   · 他们按"真实经过的时间"推进学习（打开应用后每隔一段时间完成一个任务）
 *   · 你的真实学习数据（今日完成数/连续天数）会同步展示给队友
 *   将来接服务器时，只需要把 teammate 的数据来源换成 WebSocket 推送，
 *   本模块的接口和界面一行不用改。
 *
 * 结伴玩法（复用现有体系，零新数值发明）：
 *   · 房间创建：首次打开自动建房，随机分配 2 位队友
 *   · 队友进度：随时间自动推进 + 参考你的全局进度
 *   · 结伴奖励：当天你全勤 → 全队结算，每人给你发 2 枚鼓励金币（最多 6 枚/天）；
 *     队友"超过你"时会弹出软萌喊话催你学习
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { addCoins, useGamification } from '@/core/gamification'

const STORAGE_KEY = 'fenti-team-v1'

/** 云队友名册：人设 + 学习节奏（minutesPerStep = 每多少真实分钟学一轮） */
const ROSTER = [
  { id: 'mate-aya', name: '阿雅', avatar: '🦊', motto: '稳扎稳打型', minutesPerStep: 45 },
  { id: 'mate-dabai', name: '大白', avatar: '🐻', motto: '早起猛攻型', minutesPerStep: 30 },
  { id: 'mate-taotao', name: '桃桃', avatar: '🐰', motto: '晚间冲刺型', minutesPerStep: 60 },
  { id: 'mate-laoyu', name: '老余', avatar: '🦉', motto: '效率卷王型', minutesPerStep: 25 },
  { id: 'mate-xiaoman', name: '小满', avatar: '🐱', motto: '劳逸结合型', minutesPerStep: 50 }
]

/** 队友学习一个"回合"对应的虚拟任务数（只用于房间内的氛围进度） */
const STEP_TASKS = 2
/** 结伴鼓励金币：全勤后每位队友发 2 枚 */
const CHEER_COINS_EACH = 2

/** 房间状态（响应式） */
const state = reactive({
  roomName: '',
  mates: [],          // [{ ...ROSTER项, doneTasks, lastStepAt }]
  createdAt: null,
  lastRewardDate: ''  // 上次领取结伴奖励的日期（每天一次）
})

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      roomName: state.roomName,
      mates: state.mates,
      createdAt: state.createdAt,
      lastRewardDate: state.lastRewardDate
    }))
  } catch (error) {
    console.error('[team] 房间存档失败：', error)
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    state.roomName = data.roomName || ''
    state.mates = Array.isArray(data.mates) ? data.mates : []
    state.createdAt = data.createdAt || null
    state.lastRewardDate = data.lastRewardDate || ''
    return state.mates.length > 0
  } catch (error) {
    console.error('[team] 读取房间失败：', error)
    return false
  }
}

/** 从名册随机抽 2 位不重复的队友 */
function drawMates() {
  const pool = [...ROSTER]
  const picked = []
  while (picked.length < 2 && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return picked.map((m) => ({ ...m, doneTasks: 0, lastStepAt: Date.now() }))
}

/** 建房（首次打开自动调用） */
export function createTeamRoom() {
  const adjectives = ['上岸', '冲鸭', '锦鲤', '卷王', '必过']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  state.roomName = `${adj}三人行`
  state.mates = drawMates()
  state.createdAt = new Date().toISOString()
  state.lastRewardDate = ''
  save()
  console.log(`[team] 🏠 结伴房已创建：「${state.roomName}」，队友：${state.mates.map((m) => m.name).join('、')}`)
  return state
}

/**
 * 队友推进：按真实经过的时间，每满 minutesPerStep 分钟学一轮。
 * 打开房间时调用一次；界面里也有定时器周期性调用。
 */
export function tickMates() {
  const now = Date.now()
  let advanced = false
  for (const mate of state.mates) {
    while (now - mate.lastStepAt >= mate.minutesPerStep * 60000) {
      mate.lastStepAt += mate.minutesPerStep * 60000
      mate.doneTasks += STEP_TASKS
      advanced = true
    }
  }
  if (advanced) save()
  return advanced
}

/* ---------------- 结伴奖励（每天一次，全勤触发） ---------------- */

/** 尝试结算今日结伴奖励：全勤且今天没领过 → 每位队友发鼓励金币 */
export function claimTeamReward(userAllDone) {
  const today = new Date().toLocaleDateString('sv-SE')
  if (!userAllDone) return { ok: false, reason: 'not-all-done', coins: 0 }
  if (state.lastRewardDate === today) return { ok: false, reason: 'already-claimed', coins: 0 }
  const coins = state.mates.length * CHEER_COINS_EACH
  state.lastRewardDate = today
  save()
  addCoins(coins, '猪队友结伴鼓励：今日全勤，全队打气')
  return { ok: true, reason: 'claimed', coins }
}

/* ---------------- 查询（响应式） ---------------- */

export function useTeamRoom() {
  return computed(() => ({
    roomName: state.roomName,
    mates: state.mates,
    createdAt: state.createdAt,
    /** 今天是否已领结伴奖励 */
    rewardedToday: state.lastRewardDate === new Date().toLocaleDateString('sv-SE')
  }))
}

/**
 * 房间面板数据：队友进度 + 你的进度放一起对比。
 * 你的数据直接读 gamification/plan 的响应式总账，保证"完全复用现有学习数据"。
 */
export function useTeamPanel(todayTasksRef) {
  return computed(() => {
    const game = useGamification()
    // 用户今日已完成任务数（来自计划数据，非房间私有数据）
    const userDone = todayTasksRef.value?.filter((t) => t.done).length ?? 0
    const userTotal = todayTasksRef.value?.length ?? 0
    const rows = [
      { id: 'me', name: '你', avatar: '🌟', motto: '正在努力的你', doneTasks: userDone, totalTasks: userTotal, isMe: true },
      ...state.mates.map((m) => ({ ...m, totalTasks: userTotal || 4, isMe: false }))
    ]
    const leader = rows.reduce((a, b) => (b.doneTasks > a.doneTasks ? b : a))
    return {
      rows,
      leaderId: leader.id,
      /** 队友喊话：进度最高的队友领先你时催你学习 */
      cheer:
        !leader.isMe && leader.doneTasks > userDone
          ? `${leader.avatar} ${leader.name}：我已完成 ${leader.doneTasks} 个任务啦，快跟上别掉队！`
          : ''
    }
  })
}

// 模块加载即尝试恢复房间（无房不自动建，等用户首次打开房间面板再建）
if (load()) tickMates()

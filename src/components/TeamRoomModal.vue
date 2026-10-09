<script setup>
/**
 * ============================================================================
 * 「猪队友」结伴闯关房面板 —— components/TeamRoomModal.vue（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 悬浮插槽「🐷 猪队友」点开：3 人（你 + 2 位云队友）的今日进度对比、
 * 队友喊话催学、全勤后一键领取结伴鼓励金币。
 * 数据全部来自 core/team + 计划/gamification 总账。
 * ============================================================================
 */
import { computed, onUnmounted, ref } from 'vue'
import { ElDialog } from 'element-plus'
import { createTeamRoom, useTeamPanel, claimTeamReward, tickMates, useTeamRoom } from '@/core/team'
import { useTodayInfo } from '@/core/plan'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const todayInfo = useTodayInfo()
const room = useTeamRoom()
const panel = useTeamPanel(computed(() => todayInfo.value?.tasks ?? []))

/* 打开面板：没房就建房；定时让队友随真实时间推进 */
let ticker = null
function onOpen() {
  if (!room.value.mates.length) createTeamRoom()
  tickMates()
  clearInterval(ticker)
  ticker = setInterval(tickMates, 30000) // 每 30 秒结算一次时间差
}
function onClose() {
  clearInterval(ticker)
  ticker = null
}
onUnmounted(() => clearInterval(ticker))

/** 今日是否全勤（任务都做完才算） */
const allDone = computed(() => {
  const tasks = todayInfo.value?.tasks ?? []
  return tasks.length > 0 && tasks.every((t) => t.done)
})

const claiming = ref(false)
function onClaim() {
  claiming.value = true
  const result = claimTeamReward(allDone.value)
  claiming.value = false
  if (result.ok) {
    toast(`🐷 队友们为你鼓掌！结伴鼓励金币 +${result.coins}～`)
  } else if (result.reason === 'already-claimed') {
    toast('今天的结伴奖励领过啦，明天继续全勤～')
  } else {
    toast('今天任务全完成后才能领结伴奖励哦～')
  }
}

function toast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/** 进度条百分比：以房间内最高进度为 100%，最少 1 格防除零 */
const maxDone = computed(() => Math.max(1, ...panel.value.rows.map((r) => r.doneTasks)))
</script>

<template>
  <el-dialog
    v-model="visible"
    width="480px"
    @open="onOpen"
    @close="onClose"
  >
    <template #header>
      <span class="team__title">🐷 猪队友结伴房 · {{ room.roomName || '加载中…' }}</span>
    </template>

    <!-- 队友催学喊话 -->
    <p v-if="panel.cheer" class="team__cheer">{{ panel.cheer }}</p>

    <!-- 三人进度对比 -->
    <div class="team__list">
      <div v-for="row in panel.rows" :key="row.id" class="team__row" :class="{ me: row.isMe, leader: panel.leaderId === row.id }">
        <span class="team__avatar">{{ row.avatar }}</span>
        <div class="team__info">
          <div class="team__head">
            <b>{{ row.name }}</b>
            <span v-if="panel.leaderId === row.id" class="team__crown">👑 领先</span>
            <span class="team__motto">{{ row.motto }}</span>
          </div>
          <div class="team__track">
            <div
              class="team__fill"
              :style="{ width: Math.round(row.doneTasks / maxDone * 100) + '%' }"
            ></div>
          </div>
          <span class="team__num">今日完成 {{ row.doneTasks }}{{ row.isMe ? ` / ${row.totalTasks}` : '' }} 个任务</span>
        </div>
      </div>
    </div>

    <p class="team__tip">
      队友会随真实时间自动学习；你的进度来自今日任务完成情况。<br />
      今日全勤可领全队鼓励金币（每位队友 2 枚），每天一次。
    </p>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="!allDone || room.rewardedToday" @click="onClaim">
        {{ room.rewardedToday ? '今日已领取 ✓' : '🎁 领取结伴鼓励金币' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.team__title { font-weight: bold; }
.team__cheer {
  background: var(--color-bg-bubble);
  border: 2px solid var(--color-highlight-deep);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
}
.team__list { display: flex; flex-direction: column; gap: var(--space-md); }
.team__row { display: flex; gap: var(--space-sm); align-items: center; }
.team__row.me .team__avatar { filter: drop-shadow(0 0 6px var(--color-accent)); }
.team__avatar { font-size: 32px; }
.team__info { flex: 1; }
.team__head { display: flex; align-items: baseline; gap: var(--space-sm); margin-bottom: 4px; }
.team__crown { font-size: 12px; color: var(--color-accent-deep); font-weight: bold; }
.team__motto { font-size: 12px; color: var(--color-text-secondary); }
.team__track {
  height: 12px;
  background: var(--color-primary);
  border-radius: var(--radius-round);
  overflow: hidden;
  margin-bottom: 4px;
}
.team__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-deep));
  border-radius: var(--radius-round);
  transition: width var(--duration-base) var(--easing-soft);
}
.team__num { font-size: 12px; color: var(--color-text-secondary); }
.team__tip { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-md); line-height: 1.7; }
</style>

<script setup>
/**
 * ============================================================================
 * 每日反馈弹窗 —— components/FeedbackModal.vue
 * ----------------------------------------------------------------------------
 * 需求清单：当日完成任务后弹出粉蹄反馈弹窗，包含：
 *   ① 任务完成确认（可以反勾选"其实没做完"的任务，提交后触发顺延规则）
 *   ② 小测正确率确认（必须已通过小测才能提交）
 *   ③ 当日状态打分（1~5 星）
 * 提交后父组件负责：走 planRules 规则池调整计划 + 体重/金币联动，
 * 然后把结果通过 outcome 传回来，本组件切换成"结果界面"展示。
 *
 * 组件只负责"收集与展示"，业务动作全在父组件（分层解耦）。
 * ============================================================================
 */
import { computed, ref, watch } from 'vue'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'

const props = defineProps({
  /** 弹窗显隐（v-model） */
  modelValue: { type: Boolean, default: false },
  /** 第几天 */
  day: { type: Number, default: 1 },
  /** 当天任务列表（含 done 状态，勾选变化通过 toggle-task 事件同步给父组件） */
  tasks: { type: Array, default: () => [] },
  /** 当天小测结果 { correct, total, accuracy, passed }（null = 还没测） */
  quiz: { type: Object, default: null },
  /**
   * 提交后的处理结果（null = 还在填表单）：
   * { allDone, moodScore, weightDelta, weightNow, coinsDelta, messages[] }
   */
  outcome: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'toggle-task', 'submit', 'close'])

/** 当日状态打分（1~5 星） */
const moodScore = ref(0)

// 每次打开新一天的反馈时，清空上次的打分
watch(() => props.modelValue, (open) => {
  if (open && !props.outcome) moodScore.value = 0
})

/** 星级文字说明：打分更有代入感 */
const MOOD_TEXTS = ['今天有点崩 😵', '状态一般般 😕', '还不错啦 🙂', '挺在状态的 😊', '满分状态 🤩']

/** 全部任务完成（实时统计，用户反勾选后会立刻变化） */
const allDone = computed(() => props.tasks.length > 0 && props.tasks.every((t) => t.done))

/** 可以提交的条件：小测已通过 + 打了分 */
const canSubmit = computed(() => !!props.quiz?.passed && moodScore.value > 0)

function onToggle(task) {
  emit('toggle-task', task)
}

function onSubmit() {
  emit('submit', { moodScore: moodScore.value })
}

function onClose() {
  emit('update:modelValue', false)
  emit('close')
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="outcome ? '粉蹄收到你的反馈啦' : `第 ${day} 天 · 每日反馈`"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <!-- ══════ 表单界面 ══════ -->
    <div v-if="!outcome" class="fb">
      <!-- ① 任务完成确认：可反勾选 -->
      <section class="fb__section">
        <h3 class="fb__heading">① 今天的任务都完成了吗？</h3>
        <p class="fb__hint">没做完的取消勾选就好，粉蹄会帮你自动顺延，不责怪你～</p>
        <div class="fb__tasks">
          <label v-for="task in tasks" :key="task.id" class="fb__task" :class="{ 'fb__task--off': !task.done }">
            <input type="checkbox" :checked="task.done" @change="onToggle(task)" />
            <span class="fb__task-title">{{ task.title }}</span>
          </label>
        </div>
        <p class="fb__alldone">{{ allDone ? '🎉 全部完成，太棒了！' : '有任务没完成也没关系，诚实记录最好～' }}</p>
      </section>

      <!-- ② 小测正确率确认（数据来自小测弹窗，这里只做确认展示） -->
      <section class="fb__section">
        <h3 class="fb__heading">② 今日小测正确率</h3>
        <p v-if="quiz?.passed" class="fb__quiz fb__quiz--pass">
          ✅ {{ quiz.correct }}/{{ quiz.total }} 题（{{ Math.round(quiz.accuracy * 100) }}%）· 已解锁次日任务
        </p>
        <p v-else class="fb__quiz fb__quiz--wait">
          ⏳ 还没有通过今天的小测哦～先去关卡页完成 5 道小测再来反馈吧！
        </p>
      </section>

      <!-- ③ 当日状态打分 -->
      <section class="fb__section">
        <h3 class="fb__heading">③ 给今天的学习状态打个分</h3>
        <div class="fb__rate">
          <el-rate v-model="moodScore" :texts="MOOD_TEXTS" show-text />
        </div>
      </section>

      <el-button type="primary" size="large" class="fb__submit" :disabled="!canSubmit" @click="onSubmit">
        提交反馈，让粉蹄调整计划 ✨
      </el-button>
      <p v-if="!canSubmit" class="fb__hint fb__hint--center">
        {{ !quiz?.passed ? '通过今日小测后才能提交反馈哦' : '打个分就能提交啦' }}
      </p>
    </div>

    <!-- ══════ 结果界面：粉蹄播报调整结果 ══════ -->
    <div v-else class="fb-out">
      <FtAvatar :state="outcome.weightDelta < 0 ? 'cheer' : 'comfort'" :size="110" class="fb-out__star" />

      <!-- 体重联动播报（需求：全勤 -0.5 斤，未完成 +1 斤） -->
      <p class="fb-out__weight" :class="{ 'fb-out__weight--down': outcome.weightDelta < 0 }">
        {{ outcome.weightDelta < 0 ? '⬇️ 粉蹄减重' : '⬆️ 粉蹄增重' }}
        {{ Math.abs(outcome.weightDelta) }} 斤
      </p>
      <p class="fb-out__weight-now">当前体重 <strong>{{ outcome.weightNow }}</strong> 斤（上岸目标 100 斤）</p>

      <!-- 金币联动播报 -->
      <p v-if="outcome.coinsDelta > 0" class="fb-out__coins">🪙 金币 +{{ outcome.coinsDelta }}（全站金币栏已同步）</p>

      <!-- 计划规则池的调整消息，逐条展示 -->
      <ul v-if="outcome.messages.length" class="fb-out__messages">
        <li v-for="(msg, i) in outcome.messages" :key="i">{{ msg }}</li>
      </ul>
      <p v-else class="fb-out__messages fb-out__messages--none">今天没有需要调整的计划，一切刚刚好～</p>

      <el-button type="primary" size="large" @click="onClose">收到，继续闯关 🌊</el-button>
    </div>
  </el-dialog>
</template>

<style scoped>
.fb__section {
  margin-bottom: var(--space-lg);
}

.fb__heading {
  margin: 0 0 var(--space-xs);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.fb__hint {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.fb__hint--center {
  text-align: center;
  margin-top: var(--space-sm);
}

/* 任务确认列表 */
.fb__tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-primary);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.fb__task {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  cursor: pointer;
}

.fb__task--off .fb__task-title {
  color: var(--color-text-secondary);
  text-decoration: line-through;
}

.fb__task input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent);
}

.fb__alldone {
  margin: var(--space-sm) 0 0;
  font-size: var(--font-size-base);
  color: var(--color-accent-darker);
}

/* 小测确认 */
.fb__quiz {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
}

.fb__quiz--pass {
  background: var(--color-highlight);
  color: var(--color-accent-darker);
}

.fb__quiz--wait {
  background: var(--color-primary);
  color: var(--color-text-secondary);
}

.fb__rate {
  padding: var(--space-xs) 0;
}

.fb__submit {
  display: block;
  margin: 0 auto;
}

/* 结果界面 */
.fb-out {
  text-align: center;
  padding: var(--space-sm) 0;
}

.fb-out__star {
  margin: 0 auto var(--space-sm);
}

.fb-out__weight {
  font-size: var(--font-size-title);
  font-weight: 700;
  color: var(--color-accent-darker);
  margin: 0 0 var(--space-xs);
}

.fb-out__weight--down {
  color: var(--color-success); /* 减重是成功的事，用柔和绿 */
}

.fb-out__weight-now {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-sm);
}

.fb-out__coins {
  font-size: var(--font-size-base);
  color: var(--color-accent-darker);
  margin: 0 0 var(--space-md);
}

.fb-out__messages {
  list-style: none;
  margin: 0 0 var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-primary);
  border-radius: var(--radius-md);
  text-align: left;
}

.fb-out__messages li {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  line-height: var(--line-height-base);
}

.fb-out__messages--none {
  color: var(--color-text-secondary);
  text-align: center;
}
</style>

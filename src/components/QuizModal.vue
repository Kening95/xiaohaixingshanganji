<script setup>
/**
 * ============================================================================
 * 每日知识点小测弹窗 —— components/QuizModal.vue
 * ----------------------------------------------------------------------------
 * 需求清单：每日任务末尾 5 道知识点小测，正确率 ≥60% 才能解锁次日任务。
 *
 * 两种界面（由父组件通过 props 切换）：
 *   答题界面  questions 有值、result 为 null → 逐题选择 + 提交
 *   结果界面  result 有值 → 通过（cheer）/ 未通过（comfort），可去反馈或再测一次
 *
 * 组件本身不判分、不改数据：答题答案通过 submit 事件交给父组件，
 * 父组件调用 core/plan 的 recordQuiz() 判分存档后，把结果传回来展示。
 * ============================================================================
 */
import { computed, ref, watch } from 'vue'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'

const props = defineProps({
  /** 弹窗显隐（v-model） */
  modelValue: { type: Boolean, default: false },
  /** 第几天的小测（标题展示用） */
  day: { type: Number, default: 1 },
  /** 本次出的 5 道题（null = 不显示） */
  questions: { type: Array, default: null },
  /**
   * 今日扫题收录的错题条目（wrongbook 条目：{ id, image, subject }）。
   * 有值时答题界面顶部展示"今日扫题回顾"条：
   * 把今天拍的题图列出来供回顾，并提示"小测会优先考这些科目的题"。
   * 回顾条只展示、不计分，不影响 60% 通过判定。
   */
  reviews: { type: Array, default: () => [] },
  /** 判分结果 { correct, total, accuracy, passed }（null = 还在答题） */
  result: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'submit', 'retry', 'finish'])

/* ---------------- 答题状态 ---------------- */

/** 每道题选中的选项下标，null = 未作答 */
const answers = ref([])

// 每次换新的一轮题（retry 时 questions 会变），清空上次作答
watch(() => props.questions, (questions) => {
  answers.value = questions ? questions.map(() => null) : []
}, { immediate: true })

/** 5 道全部作答后才能提交 */
const allAnswered = computed(() => answers.value.length > 0 && answers.value.every((a) => a !== null))

/** 选择某个选项：友好高亮由 CSS 类承担，这里只记录答案 */
function choose(index, optionIndex) {
  answers.value[index] = optionIndex
}

function onSubmit() {
  emit('submit', [...answers.value])
}

/** 结果界面：通过后 → 去提交每日反馈 */
function onFinish() {
  emit('update:modelValue', false)
  emit('finish')
}

/** 结果界面：未通过 → 换一批题再测 */
function onRetry() {
  emit('retry')
}

function onClose() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="result ? `第 ${day} 天小测结果` : `第 ${day} 天知识点小测`"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <!-- ══════ 答题界面 ══════ -->
    <div v-if="!result && questions" class="quiz">
      <p class="quiz__tip">
        📝 每天最后 5 道小题，检验今天的学习成果～答对 <strong>3 道及以上</strong>就能解锁明天的任务！
      </p>

      <!-- 今日扫题回顾：今天用粉蹄扫题收录的错题先过一遍，出题也会优先考这些科目 -->
      <div v-if="reviews.length" class="quiz__review">
        <p class="quiz__review-title">
          📷 今天扫题收录了 <strong>{{ reviews.length }}</strong> 道错题，先花 1 分钟回顾一眼～
          下面的小测会<strong>优先考这些科目的题</strong>！
        </p>
        <!-- 横向滑动条：缩略图点击可放大查看原图 -->
        <div class="quiz__review-strip">
          <el-image
            v-for="r in reviews"
            :key="r.id"
            :src="r.image"
            :preview-src-list="reviews.map((x) => x.image)"
            fit="cover"
            class="quiz__review-thumb"
            preview-teleported
          />
        </div>
      </div>

      <div v-for="(q, i) in questions" :key="q.id" class="quiz__item">
        <p class="quiz__question">
          <span class="quiz__num">{{ i + 1 }}.</span>
          <span class="quiz__subject">{{ q.subject }}</span>
          {{ q.question }}
        </p>
        <div class="quiz__options">
          <button
            v-for="(option, oi) in q.options"
            :key="oi"
            class="quiz__option"
            :class="{ 'quiz__option--chosen': answers[i] === oi }"
            @click="choose(i, oi)"
          >
            {{ 'ABCD'[oi] }}. {{ option }}
          </button>
        </div>
      </div>

      <!-- 提交后父组件判分，按钮文案软萌化 -->
      <el-button type="primary" size="large" class="quiz__submit" :disabled="!allAnswered" @click="onSubmit">
        交卷，让粉蹄批改～
      </el-button>
      <p v-if="!allAnswered" class="quiz__hint">还有题目没选哦，全部答完才能交卷～</p>
    </div>

    <!-- ══════ 结果界面：通过 ══════ -->
    <div v-else-if="result && result.passed" class="quiz-result quiz-result--pass">
      <FtAvatar state="cheer" :size="110" class="quiz-result__star" />
      <p class="quiz-result__score">
        答对 <strong>{{ result.correct }}</strong> / {{ result.total }} 题（{{ Math.round(result.accuracy * 100) }}%）
      </p>
      <p class="quiz-result__text">达标啦！明天的任务已经解锁，粉蹄为你举奖杯～🏆</p>
      <el-button type="primary" size="large" @click="onFinish">去提交今日反馈 💌</el-button>
    </div>

    <!-- ══════ 结果界面：未通过 ══════ -->
    <div v-else-if="result && !result.passed" class="quiz-result quiz-result--fail">
      <FtAvatar state="comfort" :size="110" class="quiz-result__star" />
      <p class="quiz-result__score">
        答对 <strong>{{ result.correct }}</strong> / {{ result.total }} 题（{{ Math.round(result.accuracy * 100) }}%）
      </p>
      <p class="quiz-result__text">
        还差一点点～正确率到 60%（对 3 题）才能解锁明天。别灰心，换一批题再来！
      </p>
      <div class="quiz-result__actions">
        <el-button size="large" @click="onClose">先去复习一下</el-button>
        <el-button type="primary" size="large" @click="onRetry">再测一次 💪</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* 答题区 */
.quiz__tip {
  margin: 0 0 var(--space-md);
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
}

.quiz__item {
  margin-bottom: var(--space-lg);
}

.quiz__question {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  line-height: var(--line-height-base);
}

.quiz__num {
  font-weight: 700;
}

/* 知识点标签：淡粉色小胶囊 */
.quiz__subject {
  display: inline-block;
  font-size: var(--font-size-base);
  color: var(--color-highlight-deep);
  background: var(--color-highlight);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-sm);
  margin-right: var(--space-xs);
  vertical-align: middle;
}

.quiz__options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

/* 选项按钮：普通态浅底，选中态暖橙描边 + 浅橙底 */
.quiz__option {
  text-align: left;
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  background: var(--color-primary);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--easing-soft);
}

.quiz__option:hover {
  border-color: var(--color-accent);
}

.quiz__option--chosen {
  border-color: var(--color-accent);
  background: var(--color-highlight);
  font-weight: 600;
}

.quiz__submit {
  display: block;
  margin: var(--space-md) auto 0;
}

.quiz__hint {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  margin: var(--space-sm) 0 0;
}

/* 今日扫题回顾条：浅橙底卡片 + 横向滑动的题图缩略图 */
.quiz__review {
  margin-bottom: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-highlight);
  border-radius: var(--radius-md);
}

.quiz__review-title {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  line-height: var(--line-height-base);
}

.quiz__review-strip {
  display: flex;
  gap: var(--space-sm);
  overflow-x: auto;
  padding-bottom: var(--space-xs);
}

/* 缩略图：圆角 + 暖橙描边，和全局配色呼应 */
.quiz__review-thumb {
  width: 84px;
  height: 84px;
  flex: 0 0 auto;
  border-radius: var(--radius-sm);
  border: 2px solid var(--color-accent);
  background: #fff;
  cursor: zoom-in;
}

/* 结果区 */
.quiz-result {
  text-align: center;
  padding: var(--space-md) 0;
}

.quiz-result__star {
  margin: 0 auto var(--space-md);
}

.quiz-result__score {
  font-size: var(--font-size-title);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm);
}

.quiz-result__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  line-height: var(--line-height-base);
  margin: 0 0 var(--space-lg);
}

.quiz-result__actions {
  display: flex;
  justify-content: center;
  gap: var(--space-md);
}

@media (max-width: 640px) {
  .quiz__options {
    grid-template-columns: 1fr;
  }
}
</style>

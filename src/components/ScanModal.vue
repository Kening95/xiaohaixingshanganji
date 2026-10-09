<script setup>
/**
 * ============================================================================
 * 粉蹄扫题弹窗 —— components/ScanModal.vue
 * ----------------------------------------------------------------------------
 * 需求实现：
 *   ① 摄像头拍摄（getUserMedia，手机/电脑都可用）+ 相册批量导入（最多 20 张）
 *   ② 识别前自动预处理：裁剪边缘 → 校正倾斜 → 增强红笔对比度
 *      （core/vision/preprocess.js），OCR 用开源免费的 tesseract.js 本地引擎
 *   ③ 红笔判定：叉号/涂改 → 错题；对勾 → 答对；空白 → 未做
 *      （core/vision/redDetect.js）；每张图可手动一键改判
 *   ④ 错题自动按科目（OCR 猜词，可兜底手选）+ 日期打标签，一键收录进
 *      电子错题本（core/wrongbook），每道错题生成 1 只小怪兽
 *
 * 组件打开方式：App.vue 里监听全局事件 'fenti:open-scan'（悬浮插槽点
 * 粉蹄扫题时广播）。所有识别在浏览器本地完成，图片不上传任何服务器。
 * ============================================================================
 */
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { preprocess, downscale } from '@/core/vision/preprocess'
import { detectRedMark, VERDICT_TEXT } from '@/core/vision/redDetect'
import { recognizeText, detectSubject } from '@/core/ocr'
import { addWrongEntry, useMonsterCount } from '@/core/wrongbook'
import { addWrongCount } from '@/core/stats'
import { unlockAchievement } from '@/core/gamification'
import { SUBJECTS } from '@/core/plan'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const monsterCount = useMonsterCount()

/** 软萌提示（复用 App.vue 的全局 toast） */
function softToast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/* ================= ① 摄像头 ================= */

const videoEl = ref(null)
const cameraOn = ref(false)
let stream = null

/** 开启摄像头（手机默认后置，电脑默认前置） */
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    })
    cameraOn.value = true
    await nextTick()
    videoEl.value.srcObject = stream
  } catch (error) {
    console.warn('[scan] 摄像头开启失败：', error)
    softToast('摄像头没开起来～请在浏览器地址栏允许摄像头权限后再试')
  }
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  cameraOn.value = false
}

/** 拍照：把当前视频帧画到画布，加入识别队列 */
function capture() {
  const video = videoEl.value
  if (!video) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)
  pushQueue(canvas, '摄像头拍摄')
  softToast('拍好一张！可以继续拍，也可以去相册批量导入～')
}

/* ================= ① 相册批量导入（最多 20 张） ================= */

const MAX_PHOTOS = 20
const fileInput = ref(null)

function openAlbum() {
  fileInput.value?.click()
}

async function onFilesChosen(event) {
  const files = [...(event.target.files || [])]
  event.target.value = '' // 清空，允许下次选同一批文件
  if (!files.length) return

  const room = MAX_PHOTOS - queue.value.length
  if (files.length > room) {
    softToast(`一次最多导入 ${MAX_PHOTOS} 张哦，当前队列还能放 ${room} 张～`)
  }
  for (const file of files.slice(0, Math.max(0, room))) {
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      bitmap.close()
      pushQueue(canvas, file.name)
    } catch (error) {
      console.warn('[scan] 图片读取失败：', file.name, error)
      softToast(`「${file.name}」读不出来，换张图试试吧`)
    }
  }
}

/* ================= 识别队列 ================= */

/**
 * 队列项：
 * { id, canvas(原图), thumb(缩略图 dataUrl), source,
 *   phase: 'pending'|'processing'|'done',
 *   verdict: 'wrong'|'right'|'blank'|'unknown'|null,
 *   manual: 同 verdict 或 null（手动改判，优先于自动判定）,
 *   subjectGuess: OCR 猜的科目, hint: 判定依据文案 }
 */
const queue = ref([])
let seq = 0

function pushQueue(canvas, source) {
  const thumb = downscale(canvas, 480).toDataURL('image/jpeg', 0.7)
  queue.value.push({
    id: `scan-${Date.now().toString(36)}-${seq++}`,
    canvas, thumb, source,
    phase: 'pending', verdict: null, manual: null, subjectGuess: '', hint: ''
  })
}

const pendingCount = computed(() => queue.value.filter((q) => q.phase === 'pending').length)
const wrongCount = computed(() => queue.value.filter((q) => finalVerdict(q) === 'wrong').length)
const canCollect = computed(() => queue.value.some((q) => finalVerdict(q) === 'wrong'))

/** 最终判定：手动改判优先，其次自动判定 */
function finalVerdict(item) {
  return item.manual || item.verdict
}

/** 手动一键改判（需求③） */
function setManual(item, verdict) {
  item.manual = item.manual === verdict ? null : verdict // 再点一次取消手动
}

/* -------- ② 预处理 + ③ 红笔判定 + OCR -------- */

const scanning = ref(false)
const scanProgress = ref('')

async function startScan() {
  const targets = queue.value.filter((q) => q.phase === 'pending')
  if (!targets.length) {
    softToast('识别完啦，确认收录错题吧～')
    return
  }
  scanning.value = true
  for (const [i, item] of targets.entries()) {
    scanProgress.value = `正在识别第 ${i + 1}/${targets.length} 张…`
    item.phase = 'processing'
    try {
      // 第 1 步：预处理（裁剪边缘 → 纠倾 → 增强红笔）
      const processed = preprocess(item.canvas)
      // 第 2 步：红笔判定
      const red = detectRedMark(processed)
      item.verdict = red.verdict
      item.hint = red.hint
      // 第 3 步：OCR 辅助打科目标签（失败不阻塞，退回手选）
      if (!item.subjectGuess) {
        const text = await recognizeText(downscale(processed, 1000))
        item.subjectGuess = detectSubject(text)
      }
    } catch (error) {
      console.warn('[scan] 单张识别失败：', error)
      item.verdict = 'unknown'
      item.hint = '识别出错，请手动判定'
    }
    item.phase = 'done'
  }
  scanning.value = false
  scanProgress.value = ''
  const wrong = wrongCount.value
  softToast(wrong > 0 ? `识别完成！检测到 ${wrong} 道错题，点"收录错题"装进错题本吧` : '识别完成！没有检测到错题，太厉害了～')
}

/* -------- ④ 收录错题进本 -------- */

/** 识别不出科目时的兜底科目（全局手选） */
const fallbackSubject = ref(SUBJECTS[0])

function collect() {
  const wrongs = queue.value.filter((q) => finalVerdict(q) === 'wrong')
  if (!wrongs.length) {
    softToast('这批没有错题要收录～')
    return
  }
  try {
    for (const item of wrongs) {
      // 存档用缩略图（≤640px），控制 localStorage 体积
      const stored = downscale(item.canvas, 640).toDataURL('image/jpeg', 0.65)
      addWrongEntry({ subject: item.subjectGuess || fallbackSubject.value, image: stored })
    }
    softToast(`📕 已收录 ${wrongs.length} 道错题，小怪兽 +${wrongs.length}！去错题本消灭它们吧～`)
    // 记学习日志（第 5 阶段）：今天收录了几道错题，供热力图/周报统计
    addWrongCount(wrongs.length)
    // 徽章：错题本开张（首次收录，幂等）
    unlockAchievement('book-builder', { title: '错题本开张', description: '收录第一道错题', icon: '📕' })
    ElMessageBox.confirm('现在去错题本看看新出生的小怪兽吗？', '收录成功！', {
      confirmButtonText: '去错题本 👾',
      cancelButtonText: '继续扫描'
    }).then(() => {
      onClose()
      router.push('/wrongbook')
    }).catch(() => {})
  } catch (error) {
    softToast(error.message || '收录失败，请重试')
  }
}

function resetQueue() {
  queue.value = []
}

function onClose() {
  stopCamera()
  emit('update:modelValue', false)
}

onUnmounted(stopCamera)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="📷 粉蹄扫题"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <!-- 入口区：摄像头 / 相册 -->
    <div class="scan-entry">
      <div class="scan-camera">
        <video v-show="cameraOn" ref="videoEl" autoplay playsinline class="scan-camera__video" />
        <div v-if="!cameraOn" class="scan-camera__placeholder">
          <p>📸 摄像头拍题（手机推荐后置摄像头）</p>
          <el-button type="primary" @click="startCamera">开启摄像头</el-button>
        </div>
        <div v-if="cameraOn" class="scan-camera__actions">
          <el-button type="primary" size="large" @click="capture">📸 拍一张</el-button>
          <el-button size="large" @click="stopCamera">关闭摄像头</el-button>
        </div>
      </div>

      <div class="scan-album">
        <p>🖼️ 从相册批量导入刷题照片</p>
        <p class="scan-album__tip">一次最多 {{ MAX_PHOTOS }} 张，支持 JPG / PNG</p>
        <el-button @click="openAlbum">选择照片导入</el-button>
        <!-- 隐藏的批量文件选择框 -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="scan-album__input"
          @change="onFilesChosen"
        />
      </div>
    </div>

    <!-- 识别队列 -->
    <div v-if="queue.length" class="scan-queue">
      <div class="scan-queue__head">
        <span>已加入 {{ queue.length }}/{{ MAX_PHOTOS }} 张 · 判定错题 {{ wrongCount }} 张</span>
        <div class="scan-queue__head-actions">
          <el-button size="small" :disabled="scanning" @click="resetQueue">清空</el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="scanning || !pendingCount"
            @click="startScan"
          >
            {{ scanning ? scanProgress : `开始识别（${pendingCount} 张待识别）` }}
          </el-button>
        </div>
      </div>

      <!-- 兜底科目（OCR 没猜出科目时用它打标签） -->
      <div class="scan-queue__fallback">
        <span>识别不出科目时记为：</span>
        <el-select v-model="fallbackSubject" size="small" class="scan-queue__fallback-select">
          <el-option v-for="s in SUBJECTS" :key="s" :label="s" :value="s" />
        </el-select>
      </div>

      <!-- 图片网格：状态徽章 + 手动改判 -->
      <div class="scan-grid">
        <div
          v-for="item in queue"
          :key="item.id"
          class="scan-item"
          :class="[`scan-item--${finalVerdict(item) || 'pending'}`]"
        >
          <img :src="item.thumb" :alt="item.source" class="scan-item__img" />
          <span class="scan-item__badge">{{ item.phase !== 'done' ? '⏳ 待识别' : VERDICT_TEXT[finalVerdict(item)] }}</span>
          <p class="scan-item__hint">{{ item.subjectGuess ? `🏷️ ${item.subjectGuess}` : item.hint || ' ' }}</p>
          <!-- 手动一键改判（需求③）：对错未做，再点取消 -->
          <div class="scan-item__manual">
            <button
              v-for="v in ['wrong', 'right', 'blank']"
              :key="v"
              class="scan-item__btn"
              :class="{ 'scan-item__btn--on': item.manual === v }"
              @click="setManual(item, v)"
            >{{ { wrong: '判错', right: '判对', blank: '未做' }[v] }}</button>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="scan-empty">还没有照片～用摄像头拍一张，或从相册批量导入刷题照片</p>

    <!-- 底部操作 -->
    <template #footer>
      <el-button @click="onClose">关闭</el-button>
      <el-button type="primary" :disabled="!canCollect" @click="collect">
        📕 收录错题入本（{{ wrongCount }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 入口区：左摄像头右相册 */
.scan-entry {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.scan-camera {
  background: var(--color-primary);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
}

.scan-camera__video {
  width: 100%;
  border-radius: var(--radius-sm);
  background: #000;
  display: block;
}

.scan-camera__placeholder {
  text-align: center;
  padding: var(--space-lg) var(--space-sm);
  color: var(--color-text-secondary);
}

.scan-camera__actions {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.scan-album {
  border: 2px dashed var(--color-highlight-deep);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  text-align: center;
  color: var(--color-text-primary);
}

.scan-album__tip {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.scan-album__input {
  display: none; /* 真正的文件框隐藏，用按钮触发 */
}

/* 队列 */
.scan-queue__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  margin-bottom: var(--space-sm);
}

.scan-queue__head-actions {
  display: flex;
  gap: var(--space-sm);
}

.scan-queue__fallback {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
}

.scan-queue__fallback-select {
  width: 140px;
}

.scan-empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--space-lg) 0;
}

/* 图片网格 */
.scan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-md);
  max-height: 320px;
  overflow-y: auto;
}

.scan-item {
  position: relative;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg-card);
}

.scan-item--wrong { border-color: var(--color-accent-darker); }
.scan-item--right { border-color: var(--color-success); }
.scan-item--blank { border-color: var(--color-border); }

.scan-item__img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  display: block;
}

.scan-item__badge {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-weight: 600;
}

.scan-item__hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 4px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 手动改判按钮 */
.scan-item__manual {
  display: flex;
  border-top: 1px solid var(--color-border);
}

.scan-item__btn {
  flex: 1;
  font-size: 12px;
  padding: 5px 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--duration-fast) var(--easing-soft);
}

.scan-item__btn:hover {
  background: var(--color-primary);
  color: var(--color-text-primary);
}

.scan-item__btn--on {
  background: var(--color-accent);
  color: var(--color-text-primary);
  font-weight: 700;
}

@media (max-width: 640px) {
  .scan-entry {
    grid-template-columns: 1fr;
  }
}
</style>

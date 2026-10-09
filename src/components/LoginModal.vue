<script setup>
/**
 * ============================================================================
 * 极简登录浮层 —— components/LoginModal.vue（第 7 阶段新增）
 * ----------------------------------------------------------------------------
 * 只保留两种登录方式（需求）：
 *   1. 手机号 + 验证码（演示环境验证码固定 888888，页面明确提示）
 *   2. 微信扫码（演示环境点击"模拟扫码成功"即可）
 * 登录后 7 天自动免登（core/account 统一处理）。
 *
 * 唤起方式：任何页面广播 'fenti:open-login'（个人中心 / 顶栏入口都在用）。
 * ============================================================================
 */
import { computed, ref } from 'vue'
import { ElDialog, ElButton, ElInput } from 'element-plus'
import { sendSmsCode, loginWithSms, loginWithWechat, DEMO_SMS_CODE } from '@/core/account'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'logged-in'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

/** 当前登录方式：sms 手机号验证码 / wechat 微信扫码 */
const mode = ref('sms')

const phone = ref('')
const code = ref('')
/** 验证码倒计时（秒），0 = 可发送 */
const cooldown = ref(0)
let cooldownTimer = null
const sending = ref(false)

function toast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/** 获取验证码（演示环境直接提示固定验证码） */
function onSendCode() {
  const result = sendSmsCode(phone.value.trim())
  if (!result.ok) {
    toast(result.reason)
    return
  }
  toast(`📨 演示验证码：${result.demoCode}（接入真实短信后自动改为真实下发）`)
  cooldown.value = 60
  clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0) clearInterval(cooldownTimer)
  }, 1000)
}

function onSmsLogin() {
  const result = loginWithSms(phone.value.trim(), code.value.trim())
  if (!result.ok) {
    toast(result.reason)
    return
  }
  toast('登录成功！7 天内免登，数据开始云端同步 ☁️')
  visible.value = false
  emit('logged-in')
}

/** 演示环境：点击即视为扫码成功 */
function onMockWechatScan() {
  loginWithWechat()
  toast('微信扫码成功（演示模拟）！7 天内免登 ☁️')
  visible.value = false
  emit('logged-in')
}
</script>

<template>
  <el-dialog v-model="visible" width="420px" class="login-modal">
    <template #header>
      <span class="login__title">🌊 登录小海星上岸记</span>
    </template>

    <!-- 方式切换 -->
    <div class="login__modes" role="radiogroup" aria-label="登录方式">
      <button
        class="login__mode"
        :class="{ 'login__mode--active': mode === 'sms' }"
        @click="mode = 'sms'"
      >📱 手机号验证码</button>
      <button
        class="login__mode"
        :class="{ 'login__mode--active': mode === 'wechat' }"
        @click="mode = 'wechat'"
      >💬 微信扫码</button>
    </div>

    <!-- 方式一：手机号 + 验证码 -->
    <div v-if="mode === 'sms'" class="login__body">
      <el-input
        v-model="phone"
        placeholder="请输入 11 位手机号"
        maxlength="11"
        size="large"
        class="login__field"
      />
      <div class="login__code-row">
        <el-input
          v-model="code"
          placeholder="6 位验证码"
          maxlength="6"
          size="large"
          class="login__field"
          @keyup.enter="onSmsLogin"
        />
        <el-button size="large" :disabled="cooldown > 0" @click="onSendCode">
          {{ cooldown > 0 ? `${cooldown}s 后重发` : '获取验证码' }}
        </el-button>
      </div>
      <p class="login__demo-tip">演示环境验证码固定为 <b>{{ DEMO_SMS_CODE }}</b>，直接填入即可</p>
      <el-button type="primary" size="large" class="login__submit" @click="onSmsLogin">
        登录
      </el-button>
    </div>

    <!-- 方式二：微信扫码（演示模拟） -->
    <div v-else class="login__body login__body--wechat">
      <div class="login__qr" role="button" @click="onMockWechatScan">
        <span class="login__qr-icon">💬</span>
        <b>点击模拟扫码成功</b>
        <small>演示环境占位；接入微信开放平台后这里展示真实二维码</small>
      </div>
      <p class="login__demo-tip">真实环境：用手机微信扫一扫，确认后自动登录</p>
    </div>

    <p class="login__footer">登录即同意学习数据云端同步，随时可在个人中心一键清空 🛡️</p>
  </el-dialog>
</template>

<style scoped>
.login__title {
  font-weight: bold;
  font-size: var(--font-size-lg);
}

.login__modes {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.login__mode {
  flex: 1;
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--duration-base) var(--easing-soft);
}

.login__mode:hover {
  transform: translateY(-2px);
}

.login__mode:active {
  transform: scale(0.96);
}

.login__mode--active {
  border-color: var(--color-accent);
  background: #fff0e0;
  font-weight: 600;
}

.login__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.login__code-row {
  display: flex;
  gap: var(--space-sm);
}

.login__demo-tip {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-align: center;
}

.login__submit {
  width: 100%;
}

/* 微信扫码占位区 */
.login__body--wechat {
  align-items: center;
}

.login__qr {
  width: 200px;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  text-align: center;
  padding: var(--space-md);
  border: 2px dashed var(--color-primary-darker);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  cursor: pointer;
  color: var(--color-text-primary);
  transition: all var(--duration-base) var(--easing-soft);
}

.login__qr:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
}

.login__qr:active {
  transform: scale(0.97);
}

.login__qr-icon {
  font-size: 48px;
}

.login__qr small {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.login__footer {
  margin: var(--space-lg) 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}
</style>

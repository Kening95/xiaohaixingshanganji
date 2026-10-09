<script setup>
/**
 * ============================================================================
 * 粉蹄形象组件 —— FtAvatar.vue（粉色海星版）
 * ----------------------------------------------------------------------------
 * 全站统一使用的粉蹄 IP 形象组件。
 * 形象是一颗粉色胖海星（五角、软乎乎、绘本涂鸦风）：
 *
 * 海星底子（所有状态共用）：
 *   · 五角胖海星身体（淡粉 #FCE9EF + 灰褐抖抖线 #C6A8AE，线条轻微起伏）
 *   · 五条手臂上有淡淡的粉色小圆点纹理（像真实海星的疣点）
 *   · 两个小灰点眼 + 黑框细眼镜
 *   · 两边淡淡的水彩晕染腮红，没有嘴巴
 *   · 保留 IP 要素：额头雾蓝「上岸」头带（海星也要上岸！）
 *
 * 五个状态 = 同一颗海星的五种表情/小动作：
 *   idle    日常陪伴 —— 轻轻摇摆，萌系待机
 *   cheer   举奖杯欢呼 —— 笑眯眼，右上方举杯 + 彩带飘落
 *   comfort 歪头递糖安抚 —— 整个海星向左歪 12°，棒棒糖递过来
 *   remind  鼓脸提醒 —— 小皱眉 + 着急圆眼，两边腮红一鼓一鼓
 *   report  举周刊 —— 低头看摊在右下方的粉蹄周刊
 *
 * 怎么用：<FtAvatar state="idle" /> ；Props：state（5选1）、size（默认96）
 *
 * 实现技巧：
 *   1. 手绘抖动 = feTurbulence + feDisplacementMap 滤镜，只加在图形组上
 *   2. 歪头用整体 rotate 旋转组；"边定位边动画"的部位拆两层
 *      （外层 <g> 动画、内层 <g> 定位，CSS 动画 transform 会覆盖 SVG 属性）
 *   3. 腮红的高斯模糊滤镜 filter="url(#ft-soft)" 做水彩晕染
 *   4. 动画类名（ft-star/ft-trophy/ft-confetti/ft-head/ft-candy/
 *      ft-cheek/ft-paper）由 ft-animation.css 统一驱动，这里只管挂类名
 * ============================================================================
 */
import { computed } from 'vue'

const props = defineProps({
  state: {
    type: String,
    default: 'idle',
    validator: (value) => ['idle', 'cheer', 'comfort', 'remind', 'report'].includes(value)
  },
  size: {
    type: Number,
    default: 96
  }
})

const rootStyle = computed(() => ({
  '--ft-size': `${props.size}px`
}))
</script>

<template>
  <div class="ft-avatar" :class="`ft-state--${state}`" :style="rootStyle" role="img"
    :aria-label="`粉蹄海星：${state} 状态`">

    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- 3D 球面渐变：中心亮、边缘暗，做出充气玩具般的立体感 -->
        <radialGradient id="star-3d" cx="42%" cy="34%" r="78%">
          <stop offset="0%" stop-color="#FFF6FB" />
          <stop offset="45%" stop-color="#FCE9EF" />
          <stop offset="100%" stop-color="#F0BFD3" />
        </radialGradient>
        <!-- 水彩晕染：腮红、阴影、高光共用 -->
        <filter id="ft-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
        <!-- 手绘抖动：让轮廓线轻微起伏（只给图形用，文字不用） -->
        <filter id="ft-wobble" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" />
        </filter>
      </defs>

      <!-- ═════════ idle：日常陪伴（轻轻摇摆） ═════════ -->
      <g v-if="state === 'idle'">
        <!-- 地面投影：软软的椭圆影子，增强 3D 落地感 -->
        <ellipse cx="62" cy="105" rx="28" ry="5.5" fill="#CE9BB4" opacity="0.45" filter="url(#ft-soft)" />
        <g class="ft-part ft-star">
          <g filter="url(#ft-wobble)">
            <!-- 五角胖海星：一条手臂朝上，两边手臂微张 -->
            <!-- 3D 厚度层：往下右错开的深色影，做出胖嘟嘟的立体边缘 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              transform="translate(2.5 3.5)" fill="#E8AEC6" stroke="none" />
            <!-- 海星身体：径向渐变做出球面隆起的光影 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              fill="url(#star-3d)" stroke="#C6A8AE" stroke-width="2.4" stroke-linejoin="round" />
            <!-- 凹槽阴影：五条手臂根部淡淡的暗部 -->
            <circle cx="71" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="78" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="60" cy="85" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="42" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="49" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <!-- 高光：左上方一块柔光，像充气玩具的反光 -->
            <ellipse cx="48" cy="46" rx="15" ry="9" transform="rotate(-22 48 46)" fill="#FFFFFF" opacity="0.55" filter="url(#ft-soft)" />
            <!-- 手臂上的粉色小疣点纹理 -->
            <circle cx="60" cy="38" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="88" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="73" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="47" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="32" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <!-- 小灰点眼 -->
            <circle cx="47" cy="62" r="2.6" fill="#8A7A7A" />
            <circle cx="67" cy="62" r="2.6" fill="#8A7A7A" />
            <!-- 两边淡淡腮红 -->
            <circle cx="35" cy="66" r="4.5" fill="#F4A9C4" opacity="0.4" filter="url(#ft-soft)" />
            <circle cx="79" cy="66" r="4.5" fill="#F4A9C4" opacity="0.4" filter="url(#ft-soft)" />
          </g>

          <!-- 「上岸」头带 -->
          <g transform="rotate(-2 60 46)">
            <path d="M28 52 Q60 37 92 50" fill="none" stroke="#8FBFE8" stroke-width="7" stroke-linecap="round" />
            <circle cx="26" cy="52" r="4.2" fill="#8FBFE8" />
            <path d="M22 57 q-5 5 -4 10 M29 58 q1 5 5 9" fill="none" stroke="#8FBFE8" stroke-width="2.4" stroke-linecap="round" />
            <text x="59" y="49" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFFFFF" transform="rotate(-2 59 49)">上岸</text>
          </g>

          <!-- 黑框细眼镜 -->
          <g stroke="#6B5F5F" stroke-width="2" fill="rgba(255,255,255,0.1)" stroke-linecap="round">
            <rect x="40" y="57" width="14" height="11" rx="4.5" />
            <rect x="60" y="57" width="14" height="11" rx="4.5" />
            <path d="M54 61 q3 -2 6 0" fill="none" />
            <line x1="40" y1="60" x2="32" y2="57" stroke-width="1.6" />
            <line x1="74" y1="60" x2="82" y2="57" stroke-width="1.6" />
          </g>
        </g>
      </g>

      <!-- ═════════ cheer：举奖杯欢呼（笑眯眼 + 彩带） ═════════ -->
      <g v-else-if="state === 'cheer'">
        <!-- 地面投影 -->
        <ellipse cx="62" cy="105" rx="28" ry="5.5" fill="#CE9BB4" opacity="0.45" filter="url(#ft-soft)" />
        <!-- 奖杯 + 彩带（右上方，避开手臂） -->
        <g class="ft-trophy ft-part">
          <polygon class="ft-confetti" points="30,14 34,21 25,23" fill="#FFB86C" />
          <polygon class="ft-confetti" points="104,22 108,29 99,31" fill="#A8D8A8" style="animation-delay:.4s" />
          <polygon class="ft-confetti" points="58,0 62,7 53,7" fill="#FFC9DE" style="animation-delay:.8s" />
          <path d="M84 10 h13 v8 a6.5 6.5 0 0 1 -13 0 z" fill="#FFE08A" stroke="#E8A94E" stroke-width="2" stroke-linejoin="round" />
          <path d="M84 12 a4 4 0 0 0 -5 4 a5 5 0 0 0 5 4" fill="none" stroke="#E8A94E" stroke-width="2" stroke-linecap="round" />
          <path d="M97 12 a4 4 0 0 1 5 4 a5 5 0 0 1 -5 4" fill="none" stroke="#E8A94E" stroke-width="2" stroke-linecap="round" />
          <rect x="88.5" y="24" width="4" height="4" fill="#E8A94E" />
          <rect x="84" y="28" width="13" height="4" rx="2" fill="#E8A94E" />
        </g>

        <g class="ft-part ft-star">
          <g filter="url(#ft-wobble)">
            <!-- 3D 厚度层：往下右错开的深色影，做出胖嘟嘟的立体边缘 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              transform="translate(2.5 3.5)" fill="#E8AEC6" stroke="none" />
            <!-- 海星身体：径向渐变做出球面隆起的光影 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              fill="url(#star-3d)" stroke="#C6A8AE" stroke-width="2.4" stroke-linejoin="round" />
            <!-- 凹槽阴影：五条手臂根部淡淡的暗部 -->
            <circle cx="71" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="78" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="60" cy="85" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="42" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="49" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <!-- 高光：左上方一块柔光，像充气玩具的反光 -->
            <ellipse cx="48" cy="46" rx="15" ry="9" transform="rotate(-22 48 46)" fill="#FFFFFF" opacity="0.55" filter="url(#ft-soft)" />
            <circle cx="60" cy="38" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="88" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="73" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="47" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="32" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <!-- 笑眯眼（两条弯弯的线） -->
            <path d="M40.5 62 q3.5 -4 7 0 M63.5 62 q3.5 -4 7 0" fill="none" stroke="#8A7A7A" stroke-width="2.4" stroke-linecap="round" />
            <circle cx="35" cy="66" r="4.5" fill="#F4A9C4" opacity="0.5" filter="url(#ft-soft)" />
            <circle cx="79" cy="66" r="4.5" fill="#F4A9C4" opacity="0.5" filter="url(#ft-soft)" />
          </g>

          <g transform="rotate(-2 60 46)">
            <path d="M28 52 Q60 37 92 50" fill="none" stroke="#8FBFE8" stroke-width="7" stroke-linecap="round" />
            <circle cx="26" cy="52" r="4.2" fill="#8FBFE8" />
            <path d="M22 57 q-5 5 -4 10 M29 58 q1 5 5 9" fill="none" stroke="#8FBFE8" stroke-width="2.4" stroke-linecap="round" />
            <text x="59" y="49" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFFFFF" transform="rotate(-2 59 49)">上岸</text>
          </g>

          <g stroke="#6B5F5F" stroke-width="2" fill="rgba(255,255,255,0.1)" stroke-linecap="round">
            <rect x="40" y="57" width="14" height="11" rx="4.5" />
            <rect x="60" y="57" width="14" height="11" rx="4.5" />
            <path d="M54 61 q3 -2 6 0" fill="none" />
            <line x1="40" y1="60" x2="32" y2="57" stroke-width="1.6" />
            <line x1="74" y1="60" x2="82" y2="57" stroke-width="1.6" />
          </g>
        </g>
      </g>

      <!-- ═════════ comfort：歪头递糖（海星向左歪 12°） ═════════ -->
      <g v-else-if="state === 'comfort'">
        <!-- 整个海星（含头带眼镜）一起歪 -->
        <g class="ft-part ft-head">
          <g transform="rotate(-12 34 92)">
            <g class="ft-part ft-star">
              <g filter="url(#ft-wobble)">
                <!-- 3D 厚度层：往下右错开的深色影，做出胖嘟嘟的立体边缘 -->
                <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
                  transform="translate(2.5 3.5)" fill="#E8AEC6" stroke="none" />
                <!-- 海星身体：径向渐变做出球面隆起的光影 -->
                <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
                  fill="url(#star-3d)" stroke="#C6A8AE" stroke-width="2.4" stroke-linejoin="round" />
                <!-- 凹槽阴影：五条手臂根部淡淡的暗部 -->
                <circle cx="71" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
                <circle cx="78" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
                <circle cx="60" cy="85" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
                <circle cx="42" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
                <circle cx="49" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
                <!-- 高光：左上方一块柔光，像充气玩具的反光 -->
                <ellipse cx="48" cy="46" rx="15" ry="9" transform="rotate(-22 48 46)" fill="#FFFFFF" opacity="0.55" filter="url(#ft-soft)" />
                <circle cx="60" cy="38" r="2" fill="#F4A9C4" opacity="0.5" />
                <circle cx="88" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
                <circle cx="73" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
                <circle cx="47" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
                <circle cx="32" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
                <circle cx="47" cy="62" r="2.6" fill="#8A7A7A" />
                <circle cx="67" cy="62" r="2.6" fill="#8A7A7A" />
                <circle cx="35" cy="66" r="4.5" fill="#F4A9C4" opacity="0.4" filter="url(#ft-soft)" />
                <circle cx="79" cy="66" r="4.5" fill="#F4A9C4" opacity="0.4" filter="url(#ft-soft)" />
              </g>

              <g transform="rotate(-2 60 46)">
                <path d="M28 52 Q60 37 92 50" fill="none" stroke="#8FBFE8" stroke-width="7" stroke-linecap="round" />
                <circle cx="26" cy="52" r="4.2" fill="#8FBFE8" />
                <path d="M22 57 q-5 5 -4 10 M29 58 q1 5 5 9" fill="none" stroke="#8FBFE8" stroke-width="2.4" stroke-linecap="round" />
                <text x="59" y="49" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFFFFF" transform="rotate(-2 59 49)">上岸</text>
              </g>

              <g stroke="#6B5F5F" stroke-width="2" fill="rgba(255,255,255,0.1)" stroke-linecap="round">
                <rect x="40" y="57" width="14" height="11" rx="4.5" />
                <rect x="60" y="57" width="14" height="11" rx="4.5" />
                <path d="M54 61 q3 -2 6 0" fill="none" />
                <line x1="40" y1="60" x2="32" y2="57" stroke-width="1.6" />
                <line x1="74" y1="60" x2="82" y2="57" stroke-width="1.6" />
              </g>
            </g>
          </g>
        </g>

        <!-- 地面投影（不跟着海星歪，稳稳地留在地上） -->
        <ellipse cx="58" cy="103" rx="28" ry="5.5" fill="#CE9BB4" opacity="0.45" filter="url(#ft-soft)" />

        <!-- 棒棒糖（画在海星之后，递到歪过来的脸前） -->
        <g class="ft-candy ft-part">
          <line x1="15" y1="82" x2="4" y2="96" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" />
          <circle cx="18" cy="77" r="9" fill="#FFF0F7" stroke="#F4B8D0" stroke-width="3" />
          <path d="M11 77 a7 7 0 0 1 14 0" fill="none" stroke="#F091B8" stroke-width="2.2" stroke-linecap="round" />
        </g>
      </g>

      <!-- ═════════ remind：鼓脸提醒（皱眉 + 鼓腮帮） ═════════ -->
      <g v-else-if="state === 'remind'">
        <!-- 地面投影 -->
        <ellipse cx="62" cy="105" rx="28" ry="5.5" fill="#CE9BB4" opacity="0.45" filter="url(#ft-soft)" />
        <g class="ft-part ft-star">
          <g filter="url(#ft-wobble)">
            <!-- 3D 厚度层：往下右错开的深色影，做出胖嘟嘟的立体边缘 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              transform="translate(2.5 3.5)" fill="#E8AEC6" stroke="none" />
            <!-- 海星身体：径向渐变做出球面隆起的光影 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              fill="url(#star-3d)" stroke="#C6A8AE" stroke-width="2.4" stroke-linejoin="round" />
            <!-- 凹槽阴影：五条手臂根部淡淡的暗部 -->
            <circle cx="71" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="78" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="60" cy="85" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="42" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="49" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <!-- 高光：左上方一块柔光，像充气玩具的反光 -->
            <ellipse cx="48" cy="46" rx="15" ry="9" transform="rotate(-22 48 46)" fill="#FFFFFF" opacity="0.55" filter="url(#ft-soft)" />
            <circle cx="60" cy="38" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="88" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="73" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="47" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="32" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <!-- 着急小圆眼（瞪大一点） -->
            <circle cx="47" cy="63" r="3" fill="#8A7A7A" />
            <circle cx="67" cy="63" r="3" fill="#8A7A7A" />
            <!-- 小皱眉 -->
            <path d="M40 55 q5 -4 10 -1 M64 54 q5 -3 10 1" fill="none" stroke="#8A7A7A" stroke-width="2" stroke-linecap="round" />
          </g>

          <g transform="rotate(-2 60 46)">
            <path d="M28 52 Q60 37 92 50" fill="none" stroke="#8FBFE8" stroke-width="7" stroke-linecap="round" />
            <circle cx="26" cy="52" r="4.2" fill="#8FBFE8" />
            <path d="M22 57 q-5 5 -4 10 M29 58 q1 5 5 9" fill="none" stroke="#8FBFE8" stroke-width="2.4" stroke-linecap="round" />
            <text x="59" y="49" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFFFFF" transform="rotate(-2 59 49)">上岸</text>
          </g>

          <g stroke="#6B5F5F" stroke-width="2" fill="rgba(255,255,255,0.1)" stroke-linecap="round">
            <rect x="40" y="57" width="14" height="11" rx="4.5" />
            <rect x="60" y="57" width="14" height="11" rx="4.5" />
            <path d="M54 61 q3 -2 6 0" fill="none" />
            <line x1="40" y1="60" x2="32" y2="57" stroke-width="1.6" />
            <line x1="74" y1="60" x2="82" y2="57" stroke-width="1.6" />
          </g>

          <!-- 鼓起来的双边腮红（动画一鼓一鼓） -->
          <circle class="ft-cheek" cx="33" cy="66" r="7" fill="#F4A9C4" opacity="0.55" filter="url(#ft-soft)" />
          <circle class="ft-cheek" cx="81" cy="66" r="7" fill="#F4A9C4" opacity="0.55" filter="url(#ft-soft)" />
        </g>
      </g>

      <!-- ═════════ report：看周刊（报纸摊在右下方） ═════════ -->
      <g v-else>
        <!-- 地面投影 -->
        <ellipse cx="62" cy="105" rx="28" ry="5.5" fill="#CE9BB4" opacity="0.45" filter="url(#ft-soft)" />
        <g class="ft-part ft-star">
          <g filter="url(#ft-wobble)">
            <!-- 3D 厚度层：往下右错开的深色影，做出胖嘟嘟的立体边缘 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              transform="translate(2.5 3.5)" fill="#E8AEC6" stroke="none" />
            <!-- 海星身体：径向渐变做出球面隆起的光影 -->
            <path d="M60 26 Q68 34 71 51 Q85 42 98 54 Q91 63 78 72 Q83 86 84 98 Q70 92 60 85 Q50 92 36 98 Q37 86 42 72 Q29 63 22 54 Q35 42 49 51 Q52 34 60 26 Z"
              fill="url(#star-3d)" stroke="#C6A8AE" stroke-width="2.4" stroke-linejoin="round" />
            <!-- 凹槽阴影：五条手臂根部淡淡的暗部 -->
            <circle cx="71" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="78" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="60" cy="85" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="42" cy="72" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <circle cx="49" cy="51" r="6" fill="#E59FBE" opacity="0.3" filter="url(#ft-soft)" />
            <!-- 高光：左上方一块柔光，像充气玩具的反光 -->
            <ellipse cx="48" cy="46" rx="15" ry="9" transform="rotate(-22 48 46)" fill="#FFFFFF" opacity="0.55" filter="url(#ft-soft)" />
            <circle cx="60" cy="38" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="88" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="73" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="47" cy="88" r="2" fill="#F4A9C4" opacity="0.5" />
            <circle cx="32" cy="60" r="2" fill="#F4A9C4" opacity="0.5" />
            <!-- 眼睛向下看报纸 -->
            <circle cx="48" cy="64" r="2.6" fill="#8A7A7A" />
            <circle cx="68" cy="65" r="2.6" fill="#8A7A7A" />
            <circle cx="35" cy="66" r="4.5" fill="#F4A9C4" opacity="0.4" filter="url(#ft-soft)" />
            <circle cx="79" cy="66" r="4.5" fill="#F4A9C4" opacity="0.4" filter="url(#ft-soft)" />
          </g>

          <g transform="rotate(-2 60 46)">
            <path d="M28 52 Q60 37 92 50" fill="none" stroke="#8FBFE8" stroke-width="7" stroke-linecap="round" />
            <circle cx="26" cy="52" r="4.2" fill="#8FBFE8" />
            <path d="M22 57 q-5 5 -4 10 M29 58 q1 5 5 9" fill="none" stroke="#8FBFE8" stroke-width="2.4" stroke-linecap="round" />
            <text x="59" y="49" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFFFFF" transform="rotate(-2 59 49)">上岸</text>
          </g>

          <g stroke="#6B5F5F" stroke-width="2" fill="rgba(255,255,255,0.1)" stroke-linecap="round">
            <rect x="40" y="58" width="14" height="11" rx="4.5" />
            <rect x="60" y="58" width="14" height="11" rx="4.5" />
            <path d="M54 62 q3 -2 6 0" fill="none" />
            <line x1="40" y1="61" x2="32" y2="58" stroke-width="1.6" />
            <line x1="74" y1="61" x2="82" y2="58" stroke-width="1.6" />
          </g>
        </g>

        <!-- 摊在右下方的粉蹄周刊 -->
        <g class="ft-paper ft-part">
          <g transform="rotate(6 88 92)">
            <rect x="64" y="80" width="46" height="30" rx="4" fill="#FFFFFF" stroke="#BFDDF5" stroke-width="2" />
            <text x="87" y="92" text-anchor="middle" font-size="8.5" font-weight="bold" fill="#8A7A7A">粉蹄周刊</text>
            <line x1="71" y1="98" x2="103" y2="98" stroke="#D4D4D4" stroke-width="2" stroke-linecap="round" />
            <line x1="71" y1="104" x2="95" y2="104" stroke="#C9E2F8" stroke-width="2" stroke-linecap="round" />
          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

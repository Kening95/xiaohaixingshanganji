<script setup>
/**
 * ============================================================================
 * 悬浮功能停靠栏组件 —— FloatingDock.vue
 * ----------------------------------------------------------------------------
 * 这个组件负责把 core/floatingSlot/index.js 里注册的入口"画"出来。
 *
 * 注意分工：
 *   index.js      = 管数据（谁注册了、注册了什么）
 *   本组件        = 管显示（把注册列表渲染成按钮）
 * 这就是"分层解耦"：以后改按钮样式只动本文件，改注册逻辑只动 index.js。
 *
 * 本组件已在 App.vue 全局挂载一次：横排停靠在页面左下角，
 * 不遮挡顶部进度条和中央地图；任何页面都能看到悬浮栏，
 * 新功能注册后会自动出现，无需再手动引入本组件。
 * ============================================================================
 */
import { useFloatingSlots } from './index'

// 读取注册表（只读），注册表变化时本组件自动刷新
const slots = useFloatingSlots()
</script>

<template>
  <!-- 停靠栏容器：横排在页面左下角，不遮挡顶部进度条与中央地图 -->
  <div class="floating-dock" role="toolbar" aria-label="悬浮功能入口">
    <button
      v-for="slot in slots.slots"
      :key="slot.id"
      class="floating-dock__btn"
      :title="slot.title"
      @click="slot.onClick"
    >
      <span class="floating-dock__icon" aria-hidden="true">{{ slot.icon }}</span>
      <span class="floating-dock__label">{{ slot.title }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 停靠栏整体：固定在左下角，横排胶囊按钮。
   顶部区域留给顶栏（进度条/金币商店等），地图主体在中上部，互不干扰。 */
.floating-dock {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 90;
  display: flex;
  flex-wrap: wrap; /* 窗口窄时自动换行，不挤压地图 */
  gap: 8px;
  max-width: min(720px, calc(100vw - 32px));
}

/* 单个入口按钮：紧凑胶囊（图标 + 短标签），比旧竖排大按钮更省空间 */
.floating-dock__btn {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1.5px solid var(--color-highlight-deep);
  background-color: var(--color-bg-bubble);
  border-radius: var(--radius-round);
  padding: 5px 12px;
  font-size: 13px;
  box-shadow: var(--shadow-float);
  /* 过渡动画统一 0.3s（动效规范） */
  transition: all var(--duration-base) var(--easing-soft);
}

/* 悬停反馈：略微放大 + 边框变深 */
.floating-dock__btn:hover {
  transform: translateY(-2px);
  border-color: var(--color-accent);
  background-color: #fff0e0;
}

/* 点击瞬间：按压缩小（点击动效，和 hover 上浮形成弹跳手感） */
.floating-dock__btn:active {
  transform: scale(0.9);
}

.floating-dock__icon {
  font-size: 17px;
  line-height: 1;
}

.floating-dock__label {
  font-size: 13px;
  color: var(--color-text-primary);
  white-space: nowrap;
}

/* 手机 H5：屏幕窄，标签文字收起来只留图标，横排一行放下更多入口。
   停靠在左下角（常驻海星在右下角，左右分开互不遮挡）。 */
@media (max-width: 640px) {
  .floating-dock {
    bottom: 12px;
    left: 8px;
    gap: 6px;
  }
  .floating-dock__btn {
    padding: 5px 8px;
  }
  .floating-dock__label {
    display: none;
  }
}
</style>

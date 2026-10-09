import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * Vite 构建配置
 * ------------
 * 什么是 Vite？它是一个开发服务器 + 打包工具：
 *   - 开发时：改代码页面立刻刷新（热更新），启动非常快
 *   - 上线时：把所有代码压缩打包成浏览器能直接运行的静态文件
 *
 * 本配置做了两件事：
 *   1. 启用 Vue 3 插件（让 Vite 认识 .vue 文件）
 *   2. 配置路径别名 @，指向 src 目录。
 *      好处：以后 import 不用写一堆 ../../，直接写 @/core/gamification 即可
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // __dirname 在 ES Module 里不能直接用，所以用 fileURLToPath 转换
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * 手动分包（第 6 阶段性能优化）：
         * 把 Vue / Element Plus / 路由器这些"框架级大依赖"拆成独立 vendor chunk。
         * 好处：
         *   1. 首屏业务代码更小，加载更快（<=2 秒验收的关键手段）
         *   2. 框架代码不变时浏览器可复用缓存，每次发版只下载变化的小文件
         *   3. 并行下载多个小文件比串行下载一个大文件更快（HTTP/2）
         */
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus')) return 'vendor-element'
            if (id.includes('vue') || id.includes('@vue')) return 'vendor-vue'
            return 'vendor-misc' // tesseract / jspdf / html2canvas 等（本就懒加载，再单独成包）
          }
        }
      }
    }
  },
  server: {
    // 开发服务器配置
    host: true,        // 允许局域网内手机访问（方便手机 H5 调试）
    port: 7100,        // 默认端口号，如果被占用 Vite 会自动换一个并在终端提示
    open: false        // 不自动打开浏览器（在 VS Code 里自己点链接更可控）
  }
})

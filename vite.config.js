import { defineConfig } from 'vite';

// 相对路径：部署在 GitHub Pages 子路径（/warriors-graph/）下也能加载资源
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});

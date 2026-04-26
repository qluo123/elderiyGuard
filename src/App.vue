<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
@import './assets/main.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
}

body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f7fa;
  color: #303133;
  min-height: 100vh;
  overflow-x: hidden;
}

html, body, #app {
  height: 100%;
  width: 100%;
}

@media (max-width: 767px) {
  html {
    font-size: 14px;
  }

  body {
    font-size: 14px;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  html {
    font-size: 15px;
  }
}

@media (min-width: 1024px) {
  html {
    font-size: 16px;
  }
}

@media (max-width: 767px) {
  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  ::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  ::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 2px;
  }
}

img {
  max-width: 100%;
  height: auto;
}

@media (max-width: 767px) {
  .el-button {
    padding: 10px 12px;
    font-size: 13px;
  }

  .el-card {
    border-radius: var(--radius-md);
  }
}
</style>

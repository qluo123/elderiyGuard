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
  overflow-x: hidden;
}

body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f7fa;
  color: #303133;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  width: 100%;
}

html, body, #app {
  height: 100%;
  height: 100dvh;
  width: 100%;
}

@media (max-width: 479px) {
  html {
    font-size: 13px;
  }

  body {
    font-size: 13px;
  }
}

@media (min-width: 480px) and (max-width: 767px) {
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

@media (min-width: 1024px) and (max-width: 1439px) {
  html {
    font-size: 16px;
  }
}

@media (min-width: 1440px) and (max-width: 1919px) {
  html {
    font-size: 17px;
  }
}

@media (min-width: 1920px) {
  html {
    font-size: 18px;
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

@media (min-width: 768px) {
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  ::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

@media (max-width: 479px) {
  .el-button {
    padding: 8px 10px;
    font-size: 12px;
  }

  .el-card {
    border-radius: var(--radius-sm);
  }

  .el-card__body {
    padding: 12px;
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .el-button {
    padding: 10px 12px;
    font-size: 13px;
  }

  .el-card {
    border-radius: var(--radius-md);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .el-button {
    padding: 11px 14px;
    font-size: 14px;
  }
}

@media (min-width: 1024px) and (max-width: 1439px) {
  .el-button {
    padding: 12px 16px;
    font-size: 14px;
  }
}

@media (min-width: 1440px) {
  .el-button {
    padding: 13px 18px;
    font-size: 15px;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  html {
    font-size: 14px;
  }

  .el-button {
    padding: 6px 10px;
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@media print {
  body {
    background: white;
    color: black;
  }

  .no-print {
    display: none !important;
  }
}
</style>

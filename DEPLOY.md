# elderiyGuard 部署说明

## 项目概述

- **项目名称**：老年人行动轨迹监护系统
- **仓库地址**：https://github.com/qluo123/elderiyGuard
- **部署地址**：https://qluo123.github.io/elderiyGuard/

---

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 部署到 GitHub Pages

```bash
npm run deploy
```

---

## GitHub Pages 配置（首次部署需要）

1. 打开 GitHub 仓库：https://github.com/qluo123/elderiyGuard
2. 点击 **Settings**（设置）
3. 在左侧菜单中找到 **Pages**
4. 在 **Source** 部分：
   - Branch（分支）选择：`gh-pages`
   - Folder（文件夹）选择：`/ (root)`
5. 点击 **Save** 保存
6. 等待 1-2 分钟即可访问

---

## 后续更新

当代码有更新时，执行以下命令重新部署：

```bash
npm run build
npm run deploy
```

---

## 注意事项

### 路由模式
项目使用 **hash 模式**路由（`createWebHashHistory`），这是因为部署在子路径 `/elderiyGuard/` 下。

**如果你修改了路由文件（`src/router/index.ts`）：**
- 必须使用 `createWebHashHistory`，不要改回 `createWebHistory`
- 否则页面会显示空白

### Vite 配置
`vite.config.ts` 中的 `base` 已设置为 `'./'`，确保资源路径相对正确。

### 网络问题
如果 `npm run deploy` 失败并提示连接 GitHub 失败，可能是网络问题。请稍后重试，或检查网络代理设置。

---

## 常见问题

### Q: 页面显示空白，但标题正确
A: 可能是路由模式问题。检查 `src/router/index.ts` 是否使用 `createWebHashHistory`。

### Q: 部署命令报错 "Failed to connect"
A: 网络连接 GitHub 失败，请检查网络或代理设置，稍后重试。

### Q: 部署成功但页面还是旧的
A: 尝试按 `Ctrl + Shift + R` 强制刷新浏览器缓存。

---

## 文件结构

```
elderiyGuard/
├── src/
│   ├── router/index.ts      # 路由配置（重要：使用 hash 模式）
│   ├── views/               # 页面组件
│   ├── services/            # 数据服务
│   └── main.ts              # 应用入口
├── dist/                    # 构建产物（部署用）
├── vite.config.ts           # Vite 配置
└── package.json             # 包含 deploy 脚本
```

# 晴天鸟鸟冰糖葫芦串串

浏览器小游戏：点「萌物」「草莓」把糖葫芦一颗颗串上竹签，最后铺「奶皮」收尾，成品可拖动 360° 旋转查看。
纯静态页面（Three.js + Blender 导出的 GLB 模型），无需构建，无后端。

## 文件结构

```
index.html        入口页面
main.js           游戏逻辑（Three.js）
style.css         样式（浅蓝→浅绿渐变背景）
vendor/           Three.js 及插件（本地内置，无 CDN 依赖）
assets/model/     Blender 建模导出的糖葫芦 GLB
assets/ui/        按钮图标（透明 webp）
assets/audio/     背景音乐与完成音效
```

## 部署到 GitHub Pages

1. 新建一个仓库（public），例如 `sunny-bird-tanghulu`。
2. 把本压缩包里的**全部文件**上传到仓库根目录（不要套一层文件夹）。
3. 仓库 Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` / `(root)`，Save。
4. 等 1～2 分钟，访问 `https://<你的用户名>.github.io/sunny-bird-tanghulu/` 即可玩。

> 用命令行的话：`git init && git add -A && git commit -m "tanghulu game" && git branch -M main && git remote add origin <你的仓库地址> && git push -u origin main`

全部资源都是相对路径引用，放子目录也能正常运行。

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



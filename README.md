# 途衡 Tripwise

一个以个人偏好比较出行候选路线的实验性工程。用户可以录入从 A 到 B 的不同方案，按时间、费用、步行、换乘、可能延误和驾车停走负担排序。网页与 Android 使用同一份前端代码。

## 当前能力

- 三种偏好预设和五项可微调权重，显示每条路线的“等效分钟”。
- 可添加、编辑、删除候选方案，按综合适合度、用时或费用排序。
- 行程地点、偏好和方案保存在当前设备的 `localStorage`。
- 附带演示方案，**不是实时导航或票价数据**；当前版本不会自动查询全国路线。

计算公式：

```text
等效分钟 = 门到门用时
         + 费用 × 费用权重
         + 步行分钟 × 步行权重
         + 换乘次数 × 换乘权重
         + 可能延误分钟 × 不确定性权重
         + 停走强度 × 停走权重
```

总用时已包含步行、等待和换乘时间。后五项只反映个人额外负担，不代表真实增加的旅行时间。输入数据的准确性决定排序的可信度。

## 开发

需要 Node.js 22+ 和 pnpm 11。

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

## Android APK

项目使用 Capacitor 8，`android/` 是原生 Android 工程。修改前端后执行：

```bash
pnpm android:sync
```

本地生成调试 APK 需要 Android Studio 和 Android SDK：

```bash
cd android
./gradlew assembleDebug
```

APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。GitHub Actions 中的 **Android debug APK** 工作流也可手动运行，构建完成后从 Actions artifact 下载。调试包仅供测试，正式发布需配置自己的签名和发布流程。

## 网站发布

`.github/workflows/pages.yml` 在推送 `main` 后构建并部署 GitHub Pages。首次使用时，在仓库 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。Vite 使用相对资源路径，便于部署到仓库子路径。也可以把 `pnpm build` 生成的 `dist/` 部署到任意静态网站服务。

## 后续数据接入

当前界面把路线来源与排序分开。后续可用合法授权的地图/交通数据服务生成步行、公交、驾车候选方案，并接入火车与航班数据；应在服务端保存密钥并做缓存、数据来源说明和时效标注。跨城市组合路线尤其需要处理时刻表、换乘缓冲、票价变化与库存，不宜把示例分数当作可执行行程。

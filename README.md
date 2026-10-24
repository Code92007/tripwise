# 途衡 Tripwise

按个人偏好比较出行方案的网页、Android 和 iOS 工程。输入起终点后，可通过高德 Web 服务查询中国境内的公交、跨城公共交通、驾车和步行候选路线；同一页面也支持自行补充高铁、航班或组合方案。

## 能做什么

- 按时间、费用、步行、换乘、预计延误和停走负担计算“等效分钟”，提供体验、性价比和速度三种偏好。
- 首次打开的新用户会看到五题偏好问卷，可本次跳过或以后不再提示；确认后才应用参数，也可以继续用滑杆调整。已有本地偏好的用户不会被重新打断。
- 起点和终点均有高德地点补全。起点可点击定位按钮获取当前坐标并反查附近地址，授权只在点击时申请；地址和门牌号需要用户核对，定位精度不作保证。
- 查询高德路线，展示来源、查询时间及部分查询失败的提示。自动路线与手动路线可放在一起比较；重新查询会保留手动路线。
- 高德方案可打开分段行程：公交上下车站和换乘、步行与驾车指引，以及可缩放的路线地图。地图使用 OpenStreetMap 底图并注明来源；高德 GCJ-02 轨迹在浏览器里转换为 WGS-84 后绘制。底图不可用时仍能看文字指引。
- 打车方案使用高德返回的出租车参考费用，备选路线按里程差粗调；缺少该字段时按距离和时间给出通用粗估。它参与偏好排序，但不连接任何叫车平台，也不是实际报价。
- 缺失票价时显示“待核实”，该路线暂不参加综合推荐；高德未返回的延误和停走强度不伪装为零。
- 数据保存在当前浏览器、主屏幕网页应用或原生应用的本地 WebView 中；它们各自的偏好数据不会自动同步。示例方案只是演示，不是实时数据。

高德路径规划是出发时的估计，**不是持续刷新的导航**。驾车用时未包含等车和上下车；打车粗估不含动态加价、夜间附加费及可能的通行费。跨城公交或铁路方案的车次、库存和票价需要复核。当前没有航班实时搜索或自动的“高铁 + 航班”组合优化。页面提供携程、去哪儿官方入口供人工核价。旧版已保存的查询结果需重新查询一次才能看到行程详情。

## 免费路线接口

高德 [路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute) 和 [地理编码](https://lbs.amap.com/api/webservice/guide/api/georegeo/) 需要 **Web 服务类型 Key**。按[高德当前计费说明](https://lbs.amap.com/pages/base_service_price)，个人认证账号的基础 LBS 服务有月度免费配额；未认证账号没有该配额，超额可能产生费用。公开运营或商业使用应先确认授权和计费规则。

Key 只放在服务端的 Cloudflare Worker Secret 或仅 root 可读的服务器 `.env` 中，不能写入 `VITE_` 变量、GitHub 仓库或 APK。路线接口施加每节点 10 秒 2 次、地点提示与反查各 12 次的近似限速，仍应在高德控制台设置调用/计费提醒。一个查询最多调用 2 次地理编码或反查、3 次公交策略、1 次驾车和 1 次步行接口。输入补全会消耗高德输入提示配额，不能视为无限免费。

### 启用步骤

以下为 Cloudflare Worker 部署方式；自有服务器部署方式见文末。

1. 在[高德控制台](https://console.amap.com/dev/key/app)注册并完成个人认证，新建应用，申请 **Web 服务** Key。
2. 注册 Cloudflare 账号。在 macOS 终端进入本仓库，运行 `pnpm exec wrangler login` 和 `pnpm exec wrangler secret put AMAP_WEB_KEY`，按提示输入 Key，再运行 `pnpm exec wrangler deploy`。Worker 配置位于 `wrangler.jsonc`。部署地址通常是 `https://tripwise-routes.<账号子域>.workers.dev`。
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 新增 `API_BASE_URL`，值为上述 Worker 的根地址（不加 `/api/routes`）。重新运行 **Web and Pages** 与 **Android debug APK** 工作流。此地址是公开的，Key 不在其中。iOS 原生构建时同样要设置 `VITE_API_BASE_URL`。
4. 本地调试：在忽略提交的 `.dev.vars` 中设置 `AMAP_WEB_KEY=...`，运行 `pnpm exec wrangler dev`；另开终端运行 `VITE_API_BASE_URL=http://127.0.0.1:8787 pnpm dev`。本地浏览器使用 `http://127.0.0.1:5173`。如果 Vite 选择其他端口，需把其来源加入 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`。

未完成这些步骤前，“查询路线”会说明服务尚未配置，手动比较仍可使用。

## 开发和构建

在 macOS 安装 Node.js 22+、pnpm 11；Android APK 另需 Android Studio 和 Android SDK。本项目没有 Windows 专属构建步骤。

```bash
pnpm install
pnpm test
pnpm build
VITE_API_BASE_URL=https://你的-worker.workers.dev pnpm android:sync
cd android && ./gradlew assembleDebug
```

Android 体验版可从 [v0.2.0-preview.1 Release](https://github.com/Code92007/tripwise/releases/tag/v0.2.0-preview.1) 下载。它是可侧载的调试签名 APK，不是应用商店正式版；以后若构建签名变化，升级可能需要先卸载旧版，卸载会清除 APK 内保存的偏好。正式发布需配置稳定签名并完成商店审核。

### iPhone 使用

现在可在 iPhone 的 Safari 打开 [tuheng.wannafly.cn](https://tuheng.wannafly.cn/)，点分享按钮，再选“添加到主屏幕”。途衡会以独立窗口启动，使用同一套路线查询、问卷和定位功能。首次定位需同意 Safari/主屏幕应用的定位权限；定位要求 HTTPS 和设备开启位置服务。GitHub Pages 地址也可用，但建议用自有域名以便长期保留同一份本地偏好。

仓库的 `ios/` 是 Capacitor 原生 iOS 工程。要把它安装到自己的 iPhone，需在 Mac 安装完整版 [Xcode](https://developer.apple.com/xcode/)（Capacitor 8 要求 Xcode 26+），然后：

```bash
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://tuheng.wannafly.cn pnpm ios:sync
pnpm ios:open
```

在 Xcode 的 **App → Signing & Capabilities** 选择自己的 Team，若 `com.tripwise.app` 与别人的 Bundle ID 冲突，改成自己的唯一 ID。连接 iPhone，选设备并点 Run；首次安装可能需要在手机上启用开发者模式并信任开发者。免费的 Apple 个人团队可在自己的设备测试，签名有效期较短；提交 App Store 则需要 Apple Developer Program。当前仓库没有签名证书，因此不会把未签名的构建称为可安装 IPA。

网站由 `.github/workflows/pages.yml` 发布到 GitHub Pages，首次使用需将仓库 Pages Source 设置为 **GitHub Actions**。Vite 采用相对资源路径，可部署在仓库子路径。

## 航班数据

去哪儿[开放平台说明](https://open.qunar.com/data/detail/open)要求注册并签署电子协议后申请机票 API；不能把网页票价抓取当作免费公开接口。携程、去哪儿的人工核价入口已加到页面。获得正式合作接口及授权后，才能接入实时票价与库存，并规划“高铁到邻近机场 + 航班”等全国组合路线。

## 自有服务器部署

`server/index.ts` 是 Node 22 的生产入口，同时提供 `dist/` 网页和 `/api/routes`。默认只监听 `127.0.0.1:8093`；`deploy/tuheng.caddy` 把 `tuheng.wannafly.cn` 反向代理到该端口，`deploy/tuheng.service` 管理进程。部署目录为 `/root/tripwise`，服务进程使用 `www-data` 用户。

```bash
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://tuheng.wannafly.cn pnpm build
pnpm build:server
```

服务器上的 `/root/tripwise/.env` 可设置 `AMAP_WEB_KEY=...`，文件应为仅 root 可读的 `0600` 权限，重启 `tuheng.service` 后生效。该文件被 `.gitignore` 忽略，不要提交密钥。没有 Key 时，网页仍可比较手动方案，`/health` 会返回 `configured:false`，路线接口返回明确的 503 提示。

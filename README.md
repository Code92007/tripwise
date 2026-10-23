# 途衡 Tripwise

按个人偏好比较出行方案的网页和 Android 工程。输入起终点后，可通过高德 Web 服务查询中国境内的公交、跨城公共交通、驾车和步行候选路线；同一页面也支持自行补充高铁、航班或组合方案。

## 能做什么

- 按时间、费用、步行、换乘、预计延误和停走负担计算“等效分钟”，提供体验、性价比和速度三种偏好。
- 可选的五题偏好问卷会根据具体取舍给出参数；确认后才应用，也可以继续用滑杆调整。
- 查询高德路线，展示来源、查询时间及部分查询失败的提示。自动路线与手动路线可放在一起比较；重新查询会保留手动路线。
- 缺失票价时显示“待核实”，该路线暂不参加综合推荐；高德未返回的延误和停走强度不伪装为零。
- 数据保存在本机浏览器或 APK 的 WebView 中。示例方案只是演示，不是实时数据。

高德路径规划是出发时的估计，**不是持续刷新的导航**。驾车用时未包含取车和停车；总费用缺失时需要手动填写。跨城公交或铁路方案的车次、库存和票价需要复核。当前没有航班实时搜索或自动的“高铁 + 航班”组合优化。页面提供携程、去哪儿官方入口供人工核价。

## 免费路线接口

高德 [路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute) 和 [地理编码](https://lbs.amap.com/api/webservice/guide/api/georegeo/) 需要 **Web 服务类型 Key**。按[高德当前计费说明](https://lbs.amap.com/pages/base_service_price)，个人认证账号的基础 LBS 服务有月度免费配额；未认证账号没有该配额，超额可能产生费用。公开运营或商业使用应先确认授权和计费规则。

Key 只放在服务端的 Cloudflare Worker Secret 或仅 root 可读的服务器 `.env` 中，不能写入 `VITE_` 变量、GitHub 仓库或 APK。路线接口施加每节点 10 秒 2 次的近似限速，仍应在高德控制台设置调用/计费提醒。一个查询最多调用 2 次地理编码、3 次公交策略、1 次驾车和 1 次步行接口。

### 启用步骤

以下为 Cloudflare Worker 部署方式；自有服务器部署方式见文末。

1. 在[高德控制台](https://console.amap.com/dev/key/app)注册并完成个人认证，新建应用，申请 **Web 服务** Key。
2. 注册 Cloudflare 账号。在 macOS 终端进入本仓库，运行 `pnpm exec wrangler login` 和 `pnpm exec wrangler secret put AMAP_WEB_KEY`，按提示输入 Key，再运行 `pnpm exec wrangler deploy`。Worker 配置位于 `wrangler.jsonc`。部署地址通常是 `https://tripwise-routes.<账号子域>.workers.dev`。
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 新增 `API_BASE_URL`，值为上述 Worker 的根地址（不加 `/api/routes`）。重新运行 **Web and Pages** 与 **Android debug APK** 工作流。此地址是公开的，Key 不在其中。
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

调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`，也可从 GitHub Actions 的 **Android debug APK** artifact 下载。正式发布需自行配置签名。

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

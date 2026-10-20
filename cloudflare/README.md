# 将轻循接到 Cloudflare Workers

前端已配置识别地址：`https://qingxun-ai.jeffchen9618.workers.dev/api/recognize`。
网页继续由 `https://jeffzepher.github.io/lose_weight/` 托管，记录继续保存在原浏览器。

## 从原版升级营养识别

重新用本目录最新 `worker.mjs` 完整替换 Cloudflare 编辑器里的代码并 Deploy，原有两个 Secret 保持即可。`/health` 应显示 `version: 2`。旧餐食不会自动生成营养数据，可在网页点击「编辑」，重新识别已有照片或手动补充后保存。

## 在控制台部署

1. 登录 Cloudflare，进入 Workers & Pages，选择现有的 `qingxun-ai`。
2. 点击 Edit code（编辑代码），将默认代码完整替换为本目录 `worker.mjs` 的内容，点击 Deploy（部署）。这是独立文件，无需安装依赖或复制其他代码。
3. 在 Settings → Variables and Secrets 中确认以下两项的类型都是 **Secret**：
   - `DEEPSEEK_API_KEY`：你的 DeepSeek API 密钥。
   - `ACCESS_TOKEN`：自行设置至少 16 位的英文、数字或符号口令，建议随机生成；最长 256 位。它是个人网站的访问口令，不是 DeepSeek 密钥。
4. 点击保存并部署。默认只允许 `https://jeffzepher.github.io` 发起浏览器识别请求。若日后更换网页域名，可增加 Text 类型变量 `ALLOWED_ORIGIN`，值为新网址的协议和域名，不能包含路径或结尾斜杠。
5. 打开 `https://qingxun-ai.jeffchen9618.workers.dev/health`，应显示 `service: "qingxun-ai"` 和 `configured: true`。此检查不调用 DeepSeek，不产生识别费用。
6. 将项目的网页改动同步到 GitHub，等 Pages 部署完成，重新打开页面。在「拍照记一餐」选择照片，填写刚才设置的个人访问口令，点击识别。口令仅在当前页面内存暂存，不写入数据库或公开源码，刷新后需重新输入。手动记录无需口令。

只部署 Hello World 模板不会提供识别接口，必须完成代码替换。
不要将 `.env` 或任何真实密钥上传至 GitHub，也不要把 DeepSeek 密钥填入网页的访问口令栏。
服务端不会记录或存储照片；只有主动点击识别才会把压缩照片转发到 DeepSeek。
跨域限制用于约束浏览器访问，实际访问保护由 Secret 中的个人口令提供。

## 常见问题

- `configured: false`：检查两个 Secret 是否填写，`ACCESS_TOKEN` 是否至少 16 位，修改是否已部署。
- 访问口令不正确：网页中填写的口令必须与 Cloudflare 的 `ACCESS_TOKEN` 完全一致。
- 无法连接识别服务：检查当前网络能否打开 Worker 地址；检查 `ALLOWED_ORIGIN`，不要填成完整的 `/lose_weight/` 页面地址。
- 识别服务尚未就绪 / 返回内容不正确：确认部署的是本目录的完整代码，而不是默认模板或旧代码。
- 网页没有口令输入框：确认 GitHub Pages 已发布新版，关闭旧页面重新打开；不要清除浏览器记录。

## 可选命令行部署

本目录包含 `wrangler.jsonc`。已安装并登录官方 Wrangler 时，可在本目录执行 `wrangler deploy`。
密钥应通过 Cloudflare 控制台或 `wrangler secret put` 配置，不能写入配置文件。

官方说明：[创建 Worker](https://developers.cloudflare.com/workers/get-started/dashboard/)、[配置 Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

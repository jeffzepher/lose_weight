# 独立服务器部署

- 网站：http://193.112.55.186:4186/
- 健康状态：/health（不返回凭据）
- 应用目录：/opt/qingxun/app
- 私有配置：/opt/qingxun/server.env，root:root 0600
- 容器：qingxun-web
- 映射：4186 → 4173，不占用其他项目端口
- 资源限制：256 MiB 内存、0.5 CPU、128 PID；非 root、只读文件系统
- 运行镜像：public.ecr.aws/docker/library/node:22-bookworm-slim

服务端动态返回 config.js，识别请求使用同源 /api/recognize，不经过 Cloudflare。DeepSeek 密钥仅留在服务器私有配置。公开监听必须配置至少 16 位 ACCESS_TOKEN；识别需 Bearer 口令。

本地新口令保存在被 Git 忽略的 .qingxun-access-token.local，服务端配置副本是被忽略的 .env.server。不要上传这两个文件。上传包只包括公开网页资源和 server.cjs，不包括 Cloudflare README 或其他项目。

当前入口为 HTTP：暂不支持可靠的 PWA 安装、Service Worker 或剪贴板按钮读取；健康数据可长按手动粘贴。HTTP 不加密照片和口令，配置可信 HTTPS 后再长期使用。更换域名、端口或协议会产生独立的浏览器数据库，旧 GitHub Pages 数据不会自动迁移。

本次仅迁移网站和 AI 接口，健康/饮食记录仍保存在当前浏览器。GitHub Pages 入口维持原有配置；请通过上面的服务器地址使用独立部署。

更新或停止时只操作 qingxun-web 容器及 /opt/qingxun，不修改、停止或重启其他项目的容器、反向代理或端口规则。云防火墙本项目仅需入站 TCP 4186，其余规则按其他项目实际需要保留。

部署确认：公网 /health 返回 configured=true、protected=true；无口令识别返回 401；带口令的空数据返回 400；服务器访问 DeepSeek /models 返回 200。未执行照片识别收费请求、自动化测试或手机页面测试。

# GitHub 前端与独立识别接口

- 正常入口：https://jeffzepher.github.io/lose_weight/ （v9）
- 接口：https://193.112.55.186:4186/api/recognize
- 健康状态：https://193.112.55.186:4186/health
- 前端继续部署 GitHub Pages，原桌面图标和浏览器记录继续使用。
- 服务器也提供网页，但属于独立来源，不共享 GitHub 的记录。

## 服务隔离

应用目录 /opt/qingxun/app；私有配置 /opt/qingxun/server.env（root:root 0600）。容器 qingxun-web，HTTPS 映射 4186 → 4173，Node 直接终止 TLS。TLS_CERT=/tls/fullchain.pem，TLS_KEY=/tls/privkey.pem；ALLOWED_ORIGINS=https://jeffzepher.github.io，仅该 GitHub 来源可跨域，仍需 Bearer 口令。

256 MiB 内存、0.5 CPU、128 PID；非 root、只读文件系统、无 capabilities。镜像 public.ecr.aws/docker/library/node:22-bookworm-slim。不修改或重启其他项目容器，不占用 443。

DeepSeek 密钥只在服务器。口令本地副本 .qingxun-access-token.local 和 .env.server 被 Git 忽略，不能提交。切换后需首次输入服务器口令；勾选记住并识别成功后保存在当前设备。旧 Cloudflare 口令不能用于此接口。

## IP 证书与续期

Let’s Encrypt 正式 IP 证书有效期约 6 天。Certbot 5.8.0 单独安装在 /opt/qingxun/certbot-venv；配置、工作、日志均在 /opt/qingxun/acme 下。

- 原证书：/opt/qingxun/acme/config/live/193.112.55.186/
- 容器证书副本：/opt/qingxun/tls/，只读挂载；私钥 root:1000 0640。
- 续期钩子：/opt/qingxun/renew-deploy.sh，复制证书并仅重启 qingxun-web。
- 定时器：qingxun-cert-renew.timer，每 6 小时检查，加最多 30 分钟随机延迟，开机补执行。
- 服务：qingxun-cert-renew.service。
- standalone HTTP-01 验证，80 端口只在申请/续期时短暂监听；安全组持续允许 TCP 80、4186，保留 SSH 22。
- 未来如其他项目占用 80，需改为共享 webroot 验证，不能关闭其他项目。

维护命令：

```sh
sudo systemctl list-timers qingxun-cert-renew.timer
sudo journalctl -u qingxun-cert-renew.service
sudo /opt/qingxun/certbot-venv/bin/certbot renew --dry-run --run-deploy-hooks --non-interactive --config-dir /opt/qingxun/acme/config --work-dir /opt/qingxun/acme/work --logs-dir /opt/qingxun/acme/logs
```

回滚备份：停止的 qingxun-web-http-backup 容器与 /opt/qingxun/backups/server-before-tls.cjs。回退 HTTP 后不能从 HTTPS 的 GitHub 页面直接调用，应同步回退前端配置。

部署包仅包含明确列出的公开资源，不能包含私有配置、Cloudflare README 或其他项目。健康和饮食记录仍保存在浏览器，服务端未新增记录数据库。

# Vercel 部署

1. 将 GitHub 仓库 `jeffzepher/lose_weight` 连接到 Vercel 项目，生产分支选择 `main`。
2. Framework Preset 选择 Other，Root Directory 留在仓库根目录。构建命令 `npm run build`，输出目录 `public`，Node.js 22.x（仓库已配置）。
3. 在 Settings → Environment Variables 中设置 `DEEPSEEK_API_KEY` 和 `ACCESS_TOKEN`（至少 16 位），应用到 Production；需要预览识别时也应用到 Preview。不要使用 PUBLIC 前缀，也不要把值提交到 Git。
4. Deploy；如果是部署后才填环境变量，需要重新部署。
5. 使用 Vercel 网站右上角的安装按钮重新添加到手机桌面。照片识别使用同一网站的 `/api/recognize`，不再访问 Cloudflare。

GitHub 仓库连接失败需要检查 GitHub 的 Vercel App 是否有该仓库访问权限；代码修改只解决部署和运行适配，不能代替仓库授权。

注意：Vercel 默认域名的国内可达性仍取决于网络，迁移本身不能保证免 VPN。先用手机直连测试实际部署网址。

数据按网站域名保存在浏览器本机。GitHub Pages 上的旧记录不会自动出现在 Vercel 域名，暂时保留原桌面入口和原站点数据。

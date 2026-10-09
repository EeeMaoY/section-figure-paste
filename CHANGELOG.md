# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-10-08

### 新增

- 按光标所处章节自动命名粘贴的图片：Typst 数 `=`/`==`/`===`，Markdown 数 `#`/`##`/`###`，得到章节号后拼接本节序号，例如 `imgs/5.9.1.png`。
- 接管 Ctrl+V 与拖拽（`DocumentPasteEditProvider` / `DocumentDropEditProvider`），按语言插入对应引用：Typst `#image("imgs/5.9.1.png", width: 80%)`、Markdown `![](imgs/5.9.1.png)`。
- 序号推导同时考虑目标目录已有文件与正文中已引用的文件名，避免与尚未落盘的引用重号。
- 设置项：`targetDir`、`fileNameFormat`（11 个占位符）、`sectionNumbering`、`sectionDepth`、`indexScope`、`unnumberedLabel`、`typstSnippet`、`markdownSnippet`、`imageExtensions`、`handleDrop`、`enabled`。
- 命令 `sectionFigurePaste.showSection`：显示光标处的章节号与下一个文件名，便于粘贴前确认。
- `core.js` 为不依赖 VS Code 的纯函数实现，配套 27 项纯函数测试与 15 项端到端测试（用假的 `vscode` 模块跑通 激活 → 粘贴 → 落盘 → 再粘贴）。

### 上架准备

- 补 `icon`（`images/icon.png`，256×256）与 `galleryBanner`，扩展详情页有图标和主题色。
- 补 README 演示图 `images/demo.png`，首页第一眼就能看懂"粘贴 → `5.9.1.png` → 引用插入"。
- 补 `SUPPORT.md`，说明提问前先跑 `sectionFigurePaste.showSection` 自查。
- 声明 `extensionKind: ["workspace"]`：本扩展要读写本地文件，应始终在文件所在的那一侧运行。
- `.vscodeignore` 排除 `docs/**`、`.scratch/**`、`.acl-recovery/**` 等非运行时内容，`.vsix` 里只有 9 个文件。
- 约定 `.scratch/` 作为本机专用杂项目录：同时被 `.gitignore` 与 `.vscodeignore` 忽略，
  放进去的东西既不会提交、也不会进 `.vsix`（`tools/prepublish-check.ps1` 会校验这两条排除规则）。
- `tools/gen-icon.ps1`、`tools/gen-demo.ps1`：用系统自带 System.Drawing 重新生成图标与演示图，不依赖任何 npm 包。
- `tools/prepublish-check.ps1`：上架前自检，检查 publisher / 素材 / README / 打包内容 / CI 工作流 / 杂项目录排除规则。
- `.github/workflows/publish.yml`：推 `v*` tag 后自动**发布到 Marketplace → 打包 .vsix → 建 GitHub Release**。
  认证走 Entra ID + GitHub OIDC（`vsce publish --azure-credential`）：**无 PAT、无任何 Secret、无长期密钥**；
  tag 与 `package.json` 版本不一致时直接拒绝发布。

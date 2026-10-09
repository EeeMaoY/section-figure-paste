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

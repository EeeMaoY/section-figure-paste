# 支持 / Support

## 遇到问题

请到 GitHub Issues 提问：<https://github.com/EeeMaoY/section-figure-paste/issues>

提问前建议先跑一次命令面板里的
**Section Figure Paste: 显示光标处章节号与下一个文件名**，
它会显示当前光标算出的章节号和下一个将要写入的文件名，多数"编号不对"的问题看一眼就能定位。

顺便附上这些信息会更好定位：

- VS Code 版本、操作系统
- 相关设置（`sectionFigurePaste.*`，尤其是 `targetDir`、`fileNameFormat`、`sectionNumbering`、`sectionDepth`）
- 出问题时文档里光标附近的结构（标题层级长什么样）
- 期望的文件名 vs 实际得到的文件名

## 常见问题

**粘贴后文件名不是按章节编号的？**
本扩展是"粘贴/拖拽编辑提供器"，只有在它接管粘贴时才会生效。请确认：

- 内置/其他扩展的粘贴逻辑已关闭（见 README「必须配合的开关」）：
  `tinymist.copyAndPaste`、`tinymist.dragAndDrop`、
  `markdown.editor.filePaste.enabled`、`markdown.editor.drop.enabled`
- `sectionFigurePaste.enabled` 为 `true`
- `tinymist.*` 两项改完需要重启 VS Code 窗口

**编号从 0 开始 / 章节号是兜底值？**
说明光标前面没有任何标题，此时 `${section}` 取 `sectionFigurePaste.unnumberedLabel`（默认 `0`）。
把光标移到所属标题下方即可。

**序号跳号了？**
序号 = 目标目录里已有文件与正文中已引用的文件名取最大值 +1。
若目录里有 `5.9.7.png` 而文档里只写到 `5.9.3`，下一张就是 `5.9.8.png`。

**剪贴板图片的 `${origName}` 恒为 `image`？**
这是 VS Code 对剪贴板位图的固定命名，不是 bug。

## 反馈与贡献

欢迎提交 Issue 与 Pull Request。核心逻辑在 `core.js`（不依赖 VS Code，可直接用 node 跑测试）：

```bash
node test/core.test.js
node test/extension.test.js
```

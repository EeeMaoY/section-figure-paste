# Section Figure Paste

粘贴图片时**按光标所处章节自动命名**的 VS Code 扩展：在 `=== telnet 命令产生的数据包` 里 Ctrl+V，图片会存成 `imgs/5.9.1.png`（该章节第 1 张图），并在光标处插入 `#image("imgs/5.9.1.png", width: 80%)`；同一章节继续粘贴就是 `5.9.2.png`、`5.9.3.png`…… Markdown 文档同样支持。

## 为什么需要它

- **Tinymist** 的 `tinymist.onPaste` 只能指定**目录**（默认 `$root/assets`），文件名直接用剪贴板的 `image.png`；它拿不到文档内容，也就不知道你在哪一章。
- **VS Code 内置 Markdown** 的 `markdown.copyFiles.destination` 模板里只有 `${fileName}`、`${unixTime}` 这类变量，没有章节号，也没有"本节第几张"的计数器。
- 章节号本身是能从文档里算出来的：Typst 数 `=`/`==`/`===`，Markdown 数 `#`/`##`/`###`，再按"每一级第几个"拼成 `5.9`；序号则扫描目标目录里已有的同名文件取最大值 +1。

## 安装

```bash
node tools/install.js                 # 复制到 ~/.vscode/extensions
node tools/update-user-settings.js --write   # 顺手把下面的开关写进用户 settings.json（先备份、再校验 JSONC）
```

然后在 VS Code 里执行 **Developer: Reload Window**。也可以手动把 `package.json`、`extension.js`、`core.js` 复制到 `~/.vscode/extensions/local.section-figure-paste-0.1.0/`。

### 必须配合的开关

内置的粘贴逻辑要关掉，否则同一个 Ctrl+V 会有两套逻辑同时想接管：

```jsonc
{
  "tinymist.copyAndPaste": "disable",
  "tinymist.dragAndDrop": "disable",
  "markdown.editor.filePaste.enabled": "never",
  "markdown.editor.drop.enabled": "never"
}
```

> 代价：Typst 里"粘贴 URL 自动变链接"这类 Tinymist 自带的粘贴增强也一起失效了；Markdown 里"粘贴 URL 变链接"是另一个开关（`markdown.editor.pasteUrlAsFormattedLink.enabled`），不受影响。

`tinymist.*` 两项需要**重启 VS Code 窗口**才生效。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `sectionFigurePaste.enabled` | `true` | 总开关 |
| `sectionFigurePaste.targetDir` | `imgs` | 图片目录，相对当前文档；以 `/` 开头则相对工作区根目录；可用 `${section}`、`${docName}` |
| `sectionFigurePaste.fileNameFormat` | `${section}.${index}.${ext}` | 文件名模板，见下方占位符 |
| `sectionFigurePaste.sectionNumbering` | `dropFirstLevel` | 章节号算法：去掉最外层标题（Typst `=` / Markdown `#`）后取层级编号；`full` 则保留最外层 |
| `sectionFigurePaste.sectionDepth` | `0` | 章节号最多保留几级，`0` = 跟随光标前最近的标题。设成 `2`：`====` 小节里的图仍归到所属 `===` 章节，同一个 `===` 章节下连续编号 |
| `sectionFigurePaste.indexScope` | `perSection` | `${index}` 的计数范围：`perSection` 每节从 1 开始；`perDocument` 全文档连续 |
| `sectionFigurePaste.unnumberedLabel` | `0` | 光标在任何标题之前时 `${section}` 的取值 |
| `sectionFigurePaste.typstSnippet` | `#image("${path}", width: 80%)` | Typst 插入的文本 |
| `sectionFigurePaste.markdownSnippet` | `![](${path})` | Markdown 插入的文本 |
| `sectionFigurePaste.imageExtensions` | `png jpg jpeg gif webp bmp svg avif tif tiff` | 允许处理的图片扩展名 |
| `sectionFigurePaste.handleDrop` | `true` | 是否同样接管拖拽进编辑器的图片 |

### 文件名占位符

`${section}` 章节号 · `${sectionFull}` 含最外层的章节号 · `${index}` 本节第几张 · `${level}` 标题层级 · `${title}` 标题文字（已清理非法字符）· `${docName}` 文档名 · `${origName}` 原文件名（剪贴板截图是 `image`）· `${ext}` 扩展名 · `${date}` `20260101` · `${time}` `093000` · `${timestamp}` 毫秒时间戳

### 插入文本占位符

`${path}` 相对当前文档的路径（如 `imgs/5.9.1.png`）· `${name}` 文件名 · `${section}` `${index}` `${title}` · `${alt}`（同 `${name}`，方便写 `![${alt}](${path})`）

### 常见的几种写法

```jsonc
// 默认：5.9.1.png、5.9.2.png
"sectionFigurePaste.fileNameFormat": "${section}.${index}.${ext}"

// 加前缀：fig-5.9.1.png
"sectionFigurePaste.fileNameFormat": "fig-${section}.${index}.${ext}"

// 带文档名，避免不同报告的同名图混淆：lab1-5.9.1.png
"sectionFigurePaste.fileNameFormat": "${docName}-${section}.${index}.${ext}"

// 带日期；识别已有文件时日期部分是通配的，不会干扰序号
"sectionFigurePaste.fileNameFormat": "${section}.${index}-${date}.${ext}"

// 图放章节子目录：imgs/5.9/1.png
"sectionFigurePaste.targetDir": "imgs/${section}",
"sectionFigurePaste.fileNameFormat": "${index}.${ext}"

// 每张图都插入图注（Typst）：#figurex(image("imgs/5.9.1.png"), caption: [...])
"sectionFigurePaste.typstSnippet": "#figurex(image(\"${path}\"), caption: [${title}])"
```

## 章节号是怎么算的

以浙大实验报告模板（`theme == "lab"`）的 lab1 报告为例：

| 文档结构 | 章节号 |
| --- | --- |
| `= 实验一`（最外层，不计入） | — |
| `== 实验结果与分析`（第 5 个 `==`） | `5` |
| `=== telnet 命令产生的数据包`（上面那个 `==` 下的第 9 个 `===`） | `5.9` |
| `==== 配置显示过滤器`（`=== 抓包与过滤器的配置` 即 4.2 下的第 2 个 `====`） | `4.2.2` |

代码块（```` ``` ````）和 Markdown 的 YAML front matter 里的"标题"会被忽略。粘贴位置取光标前的**最近一个标题**，所以插在正文任何位置都能算对。

## 常用命令

- **Section Figure Paste: 显示光标处章节号与下一个文件名** —— 不确定会存成什么名字时先跑一下。

## 开发

核心逻辑（标题解析、章节号、模板展开、序号推导）都在 `core.js`，不依赖 VS Code，可以直接跑测试：

```bash
node test/core.test.js        # 纯函数 + 真实报告回归
node test/extension.test.js   # 用假的 vscode 模块把"激活 → 粘贴 → 落盘 → 再粘贴"整条链路跑一遍
```

测试除了固定夹具，还会拿 `../zju-comnet-labs-2026/writeups/lab1`、`lab2` 和 `../os26-fall/docs/lab1` 里的真实报告做回归：校验报告正文里已经写好的 `imgs/5.9.1.png` 这类引用与算出来的章节号、序号是否一致（文件不存在时自动跳过）。

## 已知限制

- 剪贴板里如果是**位图**（截图工具直接复制），名字本来就不存在，VS Code 只能给它 `image.png`；本扩展会按章节重命名，`${origName}` 因此恒为 `image`。
- 粘贴**工作区内**已有的图片文件时，本扩展也会复制一份到 `imgs/` 并重命名（Tinymist 原本是直接引用原位置）。
- 重命名磁盘上的图片不会自动改写文档里的引用——不过 Tinymist 自己支持"文件重命名/移动时更新链接"，在资源管理器里 F2 改名即可。
- 拖拽多条文件、或粘贴非图片文件时，本扩展不接管，交回给编辑器默认行为。

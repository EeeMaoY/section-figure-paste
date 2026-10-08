'use strict';

/**
 * 用假的 vscode 模块把 extension.js 整条链路跑一遍：
 * 激活 → 模拟 Ctrl+V → 检查生成的文件路径与插入文本 → 再粘一次看序号是否递增。
 *
 *   node test/extension.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const pkg = require('../package.json');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failures.push({ name: name, error: error });
    const detail = error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n       ') : error;
    console.log('  FAIL ' + name + '\n       ' + detail);
  }
}

// ---------------------------------------------------------------- 假 vscode

const DEFAULT_SETTINGS = {};
for (const key of Object.keys(pkg.contributes.configuration.properties)) {
  DEFAULT_SETTINGS[key.replace('sectionImagePaste.', '')] = pkg.contributes.configuration.properties[key].default;
}

let settingsOverride = {};

class Uri {
  constructor(fsPath, scheme) {
    this.scheme = scheme || 'file';
    this.fsPath = path.resolve(fsPath);
    this.path = this.fsPath.replace(/\\/g, '/');
  }
  static file(p) { return new Uri(p); }
  static joinPath(base, ...segments) {
    const parts = segments.filter(function (s) { return s !== undefined && s !== null && s !== ''; });
    return new Uri(path.join(base.fsPath, ...parts));
  }
  toString() { return 'file:///' + this.path.replace(/^\//, ''); }
}

class Position {
  constructor(line, character) { this.line = line; this.character = character === undefined ? 0 : character; }
}
class Range {
  constructor(start, end) { this.start = start; this.end = end || start; }
}

class WorkspaceEdit {
  constructor() { this.createFileCalls = []; }
  createFile(uri, options) { this.createFileCalls.push({ uri: uri, options: options }); }
}

class DocumentDropOrPasteEditKind {
  constructor(parts) { this.parts = parts; }
  append(...values) { return new DocumentDropOrPasteEditKind(this.parts.concat(values)); }
  toString() { return this.parts.join('.'); }
}
DocumentDropOrPasteEditKind.Empty = new DocumentDropOrPasteEditKind([]);

class DocumentPasteEdit {
  constructor(insertText, title, kind) {
    this.insertText = insertText;
    this.title = title;
    this.kind = kind;
  }
}
class DocumentDropEdit {
  constructor(insertText) { this.insertText = insertText; }
}

const registered = { paste: [], drop: [], commands: [] };
const messages = [];

const fakeVscode = {
  Uri: Uri,
  Position: Position,
  Range: Range,
  WorkspaceEdit: WorkspaceEdit,
  DocumentDropOrPasteEditKind: DocumentDropOrPasteEditKind,
  DocumentPasteEdit: DocumentPasteEdit,
  DocumentDropEdit: DocumentDropEdit,
  FileType: { File: 1, Directory: 2 },
  languages: {
    registerDocumentPasteEditProvider(selector, provider, metadata) {
      registered.paste.push({ selector: selector, provider: provider, metadata: metadata });
      return { dispose() { } };
    },
    registerDocumentDropEditProvider(selector, provider, metadata) {
      registered.drop.push({ selector: selector, provider: provider, metadata: metadata });
      return { dispose() { } };
    },
  },
  commands: {
    registerCommand(id, handler) {
      registered.commands.push({ id: id, handler: handler });
      return { dispose() { } };
    },
  },
  window: {
    activeTextEditor: undefined,
    showWarningMessage(message) { messages.push({ level: 'warn', message: message }); },
    showInformationMessage(message) { messages.push({ level: 'info', message: message }); },
  },
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder(uri) {
      for (const folder of this.workspaceFolders) {
        if (uri.fsPath.toLowerCase().startsWith(folder.uri.fsPath.toLowerCase())) return folder;
      }
      return undefined;
    },
    getConfiguration(section) {
      assert.strictEqual(section, 'sectionImagePaste');
      return {
        get(key, fallback) {
          if (Object.prototype.hasOwnProperty.call(settingsOverride, key)) return settingsOverride[key];
          if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return DEFAULT_SETTINGS[key];
          return fallback;
        },
      };
    },
    fs: {
      async readDirectory(uri) {
        const entries = fs.readdirSync(uri.fsPath, { withFileTypes: true });
        return entries.map(function (entry) {
          return [entry.name, entry.isDirectory() ? 2 : 1];
        });
      },
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'vscode') return fakeVscode;
  return originalLoad.apply(this, arguments);
};
const extension = require('../extension.js');
Module._load = originalLoad;

// ---------------------------------------------------------------- 工具

function makeDocument(file, languageId) {
  return {
    uri: Uri.file(file),
    fileName: file,
    languageId: languageId,
    getText() { return fs.readFileSync(file, 'utf8'); },
  };
}

function imageTransfer(name) {
  const entries = [['image/png', {
    asFile() {
      return { name: name, data: async function () { return new Uint8Array([137, 80, 78, 71]); } };
    },
  }]];
  return { [Symbol.iterator]() { return entries[Symbol.iterator](); } };
}

const token = { isCancellationRequested: false };

async function paste(document, line) {
  const provider = registered.paste[0].provider;
  const ranges = [new Range(new Position(line, 0), new Position(line, 0))];
  const edits = await provider.provideDocumentPasteEdits(document, ranges, imageTransfer('image.png'), undefined, token);
  return edits && edits[0];
}

/** 模拟 VS Code 真正应用这次编辑：把 createFile 落到磁盘上 */
function applyEdit(edit) {
  for (const call of edit.additionalEdit.createFileCalls) {
    fs.mkdirSync(path.dirname(call.uri.fsPath), { recursive: true });
    fs.writeFileSync(call.uri.fsPath, Buffer.from(call.options.contents));
  }
}

function lineOf(text, needle) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(needle) !== -1) return i + 1;
  throw new Error('找不到行：' + needle);
}

// ---------------------------------------------------------------- 用例

async function main() {
  extension.activate({ subscriptions: [] });

  await test('注册了粘贴与拖拽 provider、以及调试命令', function () {
    assert.strictEqual(registered.paste.length, 1);
    assert.strictEqual(registered.drop.length, 1);
    assert.strictEqual(registered.commands.length, 1);
    assert.strictEqual(registered.commands[0].id, 'sectionImagePaste.showSection');
    assert.strictEqual(registered.paste[0].metadata.providedPasteEditKinds.length, 1);
    assert.ok(registered.paste[0].metadata.pasteMimeTypes.indexOf('image/png') !== -1);
    assert.ok(registered.paste[0].metadata.pasteMimeTypes.indexOf('files') !== -1);
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'section-image-paste-ext-'));
  fakeVscode.workspace.workspaceFolders = [{ uri: Uri.file(root) }];

  try {
    // ---------------- Typst
    const typDir = path.join(root, 'writeups', 'lab1');
    fs.mkdirSync(typDir, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'lab-headings.typ'), path.join(typDir, 'report.typ'));
    const typDoc = makeDocument(path.join(typDir, 'report.typ'), 'typst');
    const typText = typDoc.getText();
    const atTelnet = lineOf(typText, '=== telnet 命令产生的数据包') + 1;
    const atNslookup = lineOf(typText, '=== nslookup 命令产生的数据包') + 1;

    const first = await paste(typDoc, atTelnet);

    await test('Typst：第一次粘贴生成 imgs/5.9.1.png 并插入 #image', function () {
      assert.ok(first, '没有返回粘贴编辑');
      assert.strictEqual(first.title, '按章节命名并插入引用');
      assert.strictEqual(first.insertText, '#image("imgs/5.9.1.png", width: 80%)');
      assert.strictEqual(first.additionalEdit.createFileCalls.length, 1);
      const call = first.additionalEdit.createFileCalls[0];
      assert.strictEqual(call.uri.fsPath, path.join(typDir, 'imgs', '5.9.1.png'));
      assert.strictEqual(call.options.overwrite, false);
      assert.strictEqual(Buffer.from(call.options.contents).length, 4);
    });

    await test('Typst：应用编辑后同一章节再粘 → 5.9.2 → 5.9.3', async function () {
      applyEdit(first);
      const second = await paste(typDoc, atTelnet);
      assert.ok(second);
      assert.strictEqual(second.insertText, '#image("imgs/5.9.2.png", width: 80%)');
      applyEdit(second);
      const third = await paste(typDoc, atTelnet);
      assert.strictEqual(third.insertText, '#image("imgs/5.9.3.png", width: 80%)');
    });

    await test('Typst：换到别的章节（5.8）重新从 1 开始', async function () {
      const other = await paste(typDoc, atNslookup);
      assert.strictEqual(other.insertText, '#image("imgs/5.8.1.png", width: 80%)');
    });

    await test('Typst：sectionDepth=2 时 ==== 小节归到所属 === 章节', async function () {
      settingsOverride = { sectionDepth: 2 };
      const atDeep = lineOf(typText, '==== 配置显示过滤器') + 1;
      const deep = await paste(typDoc, atDeep);
      assert.strictEqual(deep.insertText, '#image("imgs/4.2.1.png", width: 80%)');
      settingsOverride = {};
    });

    await test('Typst：targetDir 以 / 开头时相对工作区根目录，插入相对路径', async function () {
      settingsOverride = { targetDir: '/assets' };
      const rooted = await paste(typDoc, atNslookup);
      assert.strictEqual(rooted.additionalEdit.createFileCalls[0].uri.fsPath, path.join(root, 'assets', '5.8.1.png'));
      assert.strictEqual(rooted.insertText, '#image("../../assets/5.8.1.png", width: 80%)');
      settingsOverride = {};
    });

    await test('Typst：自定义模板 fig-${section}.${index}.${ext}', async function () {
      settingsOverride = { fileNameFormat: 'fig-${section}.${index}.${ext}' };
      const custom = await paste(typDoc, atNslookup);
      assert.strictEqual(custom.insertText, '#image("imgs/fig-5.8.1.png", width: 80%)');
      settingsOverride = {};
    });

    await test('Typst：光标在第一个标题之前时用兜底标签 0', async function () {
      const top = await paste(typDoc, 0);
      assert.strictEqual(top.insertText, '#image("imgs/0.1.png", width: 80%)');
    });

    // ---------------- Markdown
    const mdDir = path.join(root, 'docs');
    fs.mkdirSync(mdDir, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'doc.md'), path.join(mdDir, 'note.md'));
    const mdDoc = makeDocument(path.join(mdDir, 'note.md'), 'markdown');
    const mdText = mdDoc.getText();
    const atSection = lineOf(mdText, '### 抓包结果') + 1;

    await test('Markdown：插入 ![](imgs/2.1.2.png)，避开正文已引用的 2.1.1.png', async function () {
      const mdEdit = await paste(mdDoc, atSection);
      assert.ok(mdEdit);
      assert.strictEqual(mdEdit.insertText, '![](imgs/2.1.2.png)');
      assert.strictEqual(mdEdit.additionalEdit.createFileCalls[0].uri.fsPath, path.join(mdDir, 'imgs', '2.1.2.png'));
    });

    await test('Markdown：自定义 snippet 支持 ${alt}', async function () {
      settingsOverride = { markdownSnippet: '![图 ${alt}](${path})' };
      const mdEdit = await paste(mdDoc, atSection);
      assert.strictEqual(mdEdit.insertText, '![图 2.1.2.png](imgs/2.1.2.png)');
      settingsOverride = {};
    });

    await test('拖拽 provider 同样返回按章节命名的编辑', async function () {
      const dropProvider = registered.drop[0].provider;
      const dropEdit = await dropProvider.provideDocumentDropEdits(
        mdDoc, new Position(atSection, 0), imageTransfer('image.png'), token
      );
      assert.ok(dropEdit);
      assert.strictEqual(dropEdit.insertText, '![](imgs/2.1.2.png)');
    });

    await test('粘贴非图片（pdf）时不接管', async function () {
      const pdfTransfer = {
        [Symbol.iterator]() {
          return [['files', {
            asFile() { return { name: 'a.pdf', uri: Uri.file(path.join(root, 'a.pdf')) }; },
          }]][Symbol.iterator]();
        },
      };
      const provider = registered.paste[0].provider;
      const edits = await provider.provideDocumentPasteEdits(
        typDoc, [new Range(new Position(atTelnet, 0))], pdfTransfer, undefined, token
      );
      assert.strictEqual(edits, undefined);
    });

    await test('总开关关闭时不接管', async function () {
      settingsOverride = { enabled: false };
      const off = await paste(typDoc, atTelnet);
      assert.strictEqual(off, undefined);
      settingsOverride = {};
    });

    await test('调试命令输出章节号与预览文件名（已落盘 5.9.1/5.9.2，故预览第 3 张）', async function () {
      messages.length = 0;
      fakeVscode.window.activeTextEditor = {
        document: typDoc,
        selection: { active: new Position(atTelnet, 0) },
      };
      await registered.commands[0].handler();
      assert.strictEqual(messages.length, 1);
      assert.ok(/章节号 5\.9/.test(messages[0].message), '实际消息：' + messages[0].message);
      assert.ok(/imgs\/5\.9\.3\.png/.test(messages[0].message), '实际消息：' + messages[0].message);
      fakeVscode.window.activeTextEditor = undefined;
    });

    await test('整个过程没有产生告警', function () {
      const warnings = messages.filter(function (m) { return m.level === 'warn'; });
      assert.deepStrictEqual(warnings, []);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('');
  console.log('通过 ' + passed + ' 项');
  if (failures.length) {
    console.log('失败 ' + failures.length + ' 项：');
    for (const failure of failures) console.log('  - ' + failure.name);
    process.exit(1);
  }
  console.log('全部通过 ✔');
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});

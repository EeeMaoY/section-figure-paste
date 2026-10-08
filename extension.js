'use strict';

const path = require('path');
const vscode = require('vscode');
const core = require('./core');

const IMAGE_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'image/bmp', 'image/avif', 'image/tiff', 'image/svg+xml',
];

const PASTE_KIND = vscode.DocumentDropOrPasteEditKind.Empty.append('sectionImagePaste');

const SELECTOR = [
  { language: 'typst' },
  { pattern: '**/*.typ' },
  { language: 'markdown' },
  { pattern: '**/*.md' },
];

function activate(context) {
  const pasteProvider = {
    provideDocumentPasteEdits(document, ranges, dataTransfer, pasteContext, token) {
      return Promise.resolve().then(async function () {
        const config = readConfig(document);
        if (!config.enabled) return undefined;
        const entries = collectImageEntries(dataTransfer, config);
        if (!entries.length) return undefined;
        const position = ranges && ranges.length ? ranges[0].start : new vscode.Position(0, 0);
        const edit = await buildEdit(document, position, entries, token, false);
        return edit ? [edit] : undefined;
      });
    },
  };

  const dropProvider = {
    provideDocumentDropEdits(document, position, dataTransfer, token) {
      return Promise.resolve().then(async function () {
        const config = readConfig(document);
        if (!config.enabled || !config.handleDrop) return undefined;
        const entries = collectImageEntries(dataTransfer, config);
        if (!entries.length) return undefined;
        return await buildEdit(document, position, entries, token, true);
      });
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(SELECTOR, pasteProvider, {
      providedPasteEditKinds: [PASTE_KIND],
      pasteMimeTypes: IMAGE_MIME_TYPES.concat(['files']),
    }),
    vscode.languages.registerDocumentDropEditProvider(SELECTOR, dropProvider, {
      providedDropEditKinds: [PASTE_KIND],
    }),
    vscode.commands.registerCommand('sectionImagePaste.showSection', showSectionAtCursor)
  );
}

function deactivate() { }

function readConfig(document) {
  const config = vscode.workspace.getConfiguration('sectionImagePaste', document);
  return {
    enabled: config.get('enabled', true),
    targetDir: config.get('targetDir', 'imgs'),
    fileNameFormat: config.get('fileNameFormat', '${section}.${index}.${ext}'),
    sectionNumbering: config.get('sectionNumbering', 'dropFirstLevel'),
    sectionDepth: Number(config.get('sectionDepth', 0)) || 0,
    indexScope: config.get('indexScope', 'perSection'),
    unnumberedLabel: String(config.get('unnumberedLabel', '0')),
    typstSnippet: config.get('typstSnippet', '#image("${path}", width: 80%)'),
    markdownSnippet: config.get('markdownSnippet', '![](${path})'),
    imageExtensions: config.get('imageExtensions', core.DEFAULT_IMAGE_EXTENSIONS),
    handleDrop: config.get('handleDrop', true),
  };
}

function languageOf(document) {
  if (document.languageId === 'markdown') return 'markdown';
  if (document.languageId === 'typst') return 'typst';
  return document.uri.path.toLowerCase().endsWith('.md') ? 'markdown' : 'typst';
}

/**
 * 收集这次粘贴/拖拽里可以处理的图片条目。
 * 优先使用 image/* 数据（剪贴板位图走这里）；没有时才回落到 files（资源管理器复制的图片文件）。
 */
function collectImageEntries(dataTransfer, config) {
  const fromImages = [];
  const fromFiles = [];

  for (const pair of dataTransfer) {
    const mime = pair[0];
    const item = pair[1];
    if (!item || typeof item.asFile !== 'function') continue;
    if (IMAGE_MIME_TYPES.indexOf(mime) === -1 && mime !== 'files') continue;
    let file;
    try {
      file = item.asFile();
    } catch (error) {
      file = undefined;
    }
    if (!file || !file.name) continue;
    const entry = { name: file.name, uri: file.uri, file: file };
    if (mime === 'files') fromFiles.push(entry);
    else fromImages.push(entry);
  }

  const pool = fromImages.length
    ? fromImages
    : fromFiles.filter(function (entry) { return core.isImageName(entry.name, config.imageExtensions); });

  const seen = new Set();
  const entries = [];
  for (const entry of pool) {
    const key = (entry.uri ? entry.uri.toString() : '') + '|' + entry.name;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

async function readEntryContents(entry, token) {
  if (entry.uri && entry.uri.scheme === 'file') {
    return await vscode.workspace.fs.readFile(entry.uri);
  }
  if (entry.file && typeof entry.file.data === 'function') {
    const data = await entry.file.data();
    if (data) return data;
  }
  throw new Error('无法读取图片数据');
}

/** 目标目录：相对当前文档；以 `/` 开头则相对工作区根目录 */
function resolveTargetDirUri(targetDir, document) {
  const raw = core.toPosix(targetDir || '.').replace(/\/+$/, '');
  const segments = raw.split('/').filter(Boolean);
  if (targetDir && core.toPosix(targetDir).startsWith('/')) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const root = folder ? folder.uri : vscode.Uri.joinPath(document.uri, '..');
    return vscode.Uri.joinPath(root, ...segments);
  }
  return vscode.Uri.joinPath(vscode.Uri.joinPath(document.uri, '..'), ...segments);
}

/** 目标目录里已有的文件名 + 文档里已引用的文件名（用于推导下一个序号） */
async function collectExistingNames(dirUri, document, config) {
  const names = new Set();
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    for (const entry of entries) {
      if (entry[1] === vscode.FileType.File) names.add(entry[0]);
    }
  } catch (error) {
    // 目录还不存在，正常情况
  }
  for (const name of core.extractReferencedNames(document.getText(), config.imageExtensions)) {
    names.add(name);
  }
  return Array.from(names);
}

function buildBaseVars(document, info, section, config) {
  const now = core.dateParts();
  const docName = core.stripExtension(document.fileName || document.uri.path);
  return {
    section: section,
    sectionFull: info.sectionFull || config.unnumberedLabel,
    level: info.level || 0,
    title: core.sanitizeSegment(info.title || ''),
    docName: core.sanitizeSegment(docName, 80),
    date: now.date,
    time: now.time,
    timestamp: now.timestamp,
    year: now.year,
  };
}

async function nextIndexFor(document, config, baseVars, targetDirUri) {
  const existing = await collectExistingNames(targetDirUri, document, config);
  // 找已有序号时，扩展名/原文件名按通配处理（模板里的 ${ext} 不该把已有文件排除掉）；
  // perDocument 模式下章节号本身也放宽为通配，实现跨章节连续编号。
  const loose = ['ext', 'origName'];
  if (config.indexScope === 'perDocument') loose.push('section', 'sectionFull');
  return {
    existing: existing,
    index: core.nextIndex(existing, config.fileNameFormat, baseVars, loose),
  };
}

async function buildEdit(document, position, entries, token, isDrop) {
  const config = readConfig(document);
  const language = languageOf(document);
  const line = (position ? position.line : 0) + 1;
  const info = core.sectionAt(core.parseHeadings(document.getText(), language), line);
  const section = core.applyNumbering(info, config.sectionNumbering, config.unnumberedLabel, config.sectionDepth);
  const baseVars = buildBaseVars(document, info, section, config);

  const targetDirTemplate = core.expandTemplate(config.targetDir, baseVars);
  const targetDirUri = resolveTargetDirUri(targetDirTemplate, document);
  const state = await nextIndexFor(document, config, baseVars, targetDirUri);

  const usedNames = new Set(state.existing.map(function (name) { return name.toLowerCase(); }));
  const workspaceEdit = new vscode.WorkspaceEdit();
  const snippets = [];
  let index = state.index;

  for (const entry of entries) {
    if (token && token.isCancellationRequested) return undefined;

    const extension = core.extensionOf(entry.name) || 'png';
    const entryVars = Object.assign({}, baseVars, {
      ext: extension,
      origName: core.sanitizeSegment(core.stripExtension(entry.name)),
    });

    let candidateIndex = index;
    let candidateName = '';
    for (;;) {
      candidateName = core.expandTemplate(config.fileNameFormat, Object.assign({}, entryVars, { index: candidateIndex }));
      if (!usedNames.has(candidateName.toLowerCase()) || candidateIndex > index + 1000) break;
      candidateIndex++;
    }
    index = candidateIndex + 1;

    let contents;
    try {
      contents = await readEntryContents(entry, token);
    } catch (error) {
      vscode.window.showWarningMessage('章节图片粘贴：读取图片失败（' + entry.name + '）：' + (error && error.message ? error.message : error));
      continue;
    }

    const targetUri = vscode.Uri.joinPath(targetDirUri, candidateName);
    workspaceEdit.createFile(targetUri, { contents: contents, overwrite: false, ignoreIfExists: false });
    usedNames.add(candidateName.toLowerCase());

    const relative = core.relativePath(path.dirname(document.uri.fsPath), targetUri.fsPath);
    const template = language === 'markdown' ? config.markdownSnippet : config.typstSnippet;
    snippets.push(core.expandTemplate(template, Object.assign({}, entryVars, {
      index: candidateIndex,
      path: relative,
      name: candidateName,
      alt: candidateName,
    })));
  }

  if (!snippets.length) return undefined;

  const insertText = snippets.join('\n');
  const edit = isDrop
    ? new vscode.DocumentDropEdit(insertText)
    : new vscode.DocumentPasteEdit(insertText, '按章节命名并插入引用', PASTE_KIND);
  edit.additionalEdit = workspaceEdit;
  return edit;
}

async function showSectionAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('章节图片粘贴：当前没有打开的编辑器。');
    return;
  }
  const document = editor.document;
  const config = readConfig(document);
  const language = languageOf(document);
  const info = core.sectionAt(core.parseHeadings(document.getText(), language), editor.selection.active.line + 1);
  const section = core.applyNumbering(info, config.sectionNumbering, config.unnumberedLabel, config.sectionDepth);
  const baseVars = buildBaseVars(document, info, section, config);
  const targetDirUri = resolveTargetDirUri(core.expandTemplate(config.targetDir, baseVars), document);
  const state = await nextIndexFor(document, config, baseVars, targetDirUri);
  const preview = core.expandTemplate(config.fileNameFormat, Object.assign({}, baseVars, {
    index: state.index,
    ext: 'png',
    origName: 'image',
  }));
  const relativeDir = core.relativePath(path.dirname(document.uri.fsPath), targetDirUri.fsPath);
  vscode.window.showInformationMessage(
    '章节号 ' + section + (info.title ? '（' + info.title + '）' : '（光标前没有标题）') +
    ' → 下一个文件：' + (relativeDir ? relativeDir + '/' : '') + preview
  );
}

module.exports = { activate: activate, deactivate: deactivate };

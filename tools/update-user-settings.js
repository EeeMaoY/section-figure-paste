'use strict';

/**
 * 把本扩展需要的用户设置写进 VS Code 的 settings.json。
 *
 *   node tools/update-user-settings.js            # 干跑：只校验并打印将要写入的内容
 *   node tools/update-user-settings.js --write    # 真写（先备份，再校验结果能解析）
 *
 * 设计要点：
 * - settings.json 是 JSONC（带注释、可能带尾逗号），所以只做"插入条目"的文本操作，不重新序列化整个文件，
 *   以免丢掉用户的注释和密钥格式。
 * - 写入前备份为 settings.json.bak-<时间戳>，写入后用自带的 JSONC 解析做一次校验。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ENTRIES = [
  ['tinymist.copyAndPaste', 'disable', '关掉 Tinymist 自带的粘贴处理，交给本扩展接管'],
  ['tinymist.dragAndDrop', 'disable', '同上（拖拽）'],
  ['markdown.editor.filePaste.enabled', 'never', '关掉内置 Markdown 的粘贴处理'],
  ['markdown.editor.drop.enabled', 'never', '同上（拖拽）'],
  ['sectionImagePaste.targetDir', 'imgs', '图片存到文档同目录的 imgs/'],
  ['sectionImagePaste.fileNameFormat', '${section}.${index}.${ext}', '文件名 = 章节号.本节序号.扩展名'],
  ['sectionImagePaste.sectionNumbering', 'dropFirstLevel', '章节号去掉最外层标题'],
];

/** 去掉 // 与 /* *\/ 注释（跳过字符串内部），再去掉尾逗号，然后 JSON.parse 校验 */
function parseJsonc(text) {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === '\n') { inLineComment = false; out += ch; }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') { out += next === undefined ? '' : next; i++; }
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    out += ch;
  }
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(out);
}

function settingsPath() {
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
}

function applyEntries(text, entries) {
  const insert = entries.filter(function (entry) { return !new RegExp('"' + entry[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:').test(text); });
  if (!insert.length) return { text: text, inserted: [], skipped: entries.map(function (e) { return e[0]; }) };

  const index = text.lastIndexOf('}');
  if (index < 0) throw new Error('看起来不是一个 JSON 对象：' + text.slice(0, 80));

  let head = text.slice(0, index);
  const tail = text.slice(index);
  const trimmed = head.replace(/\s+$/, '');
  const lines = insert.map(function (entry) {
    return '    ' + JSON.stringify(entry[0]) + ': ' + JSON.stringify(entry[1]) + ',';
  }).join('\n');

  let newHead;
  if (trimmed.endsWith('{')) {
    newHead = trimmed + '\n' + lines.replace(/,$/, '') + '\n';
  } else if (trimmed.endsWith(',')) {
    newHead = trimmed + '\n' + lines + '\n';
  } else {
    newHead = trimmed + ',\n' + lines + '\n';
  }

  return {
    text: newHead + tail,
    inserted: insert.map(function (e) { return e[0]; }),
    skipped: entries.filter(function (e) { return insert.indexOf(e) === -1; }).map(function (e) { return e[0]; }),
  };
}

function main() {
  const write = process.argv.indexOf('--write') !== -1;
  const file = settingsPath();
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}\n';

  // 先确认原文件本身是能解析的，避免在坏文件上继续叠加
  parseJsonc(original);

  const result = applyEntries(original, ENTRIES);
  if (!result.inserted.length) {
    console.log('所有设置都已存在，无需改动：' + file);
    return;
  }

  const parsed = parseJsonc(result.text);
  for (const entry of ENTRIES) {
    if (result.inserted.indexOf(entry[0]) === -1) continue;
    if (parsed[entry[0]] !== entry[1]) throw new Error('写入校验失败：' + entry[0]);
  }

  console.log('目标文件：' + file);
  console.log('将新增 ' + result.inserted.length + ' 项：');
  for (const entry of ENTRIES) {
    if (result.inserted.indexOf(entry[0]) === -1) continue;
    console.log('  ' + entry[0] + ' = ' + JSON.stringify(entry[1]) + '    // ' + entry[2]);
  }
  if (result.skipped.length) console.log('已存在、跳过：' + result.skipped.join(', '));

  if (!write) {
    console.log('');
    console.log('（干跑模式，未写入。加 --write 才会改文件）');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backup = file + '.bak-' + stamp;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(backup, original, 'utf8');
  fs.writeFileSync(file, result.text, 'utf8');
  console.log('');
  console.log('已写入，原文件备份在：' + backup);
  console.log('在 VS Code 里执行 “Developer: Reload Window” 后生效。');
}

main();

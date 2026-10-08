'use strict';

/**
 * 纯函数核心：标题解析、章节号计算、文件名模板与序号推导。
 * 这个文件不依赖 vscode，可以直接用 node 测试（见 test/core.test.js）。
 */

/** 默认允许处理的图片扩展名（不带点） */
const DEFAULT_IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tif', 'tiff',
];

/**
 * 解析文档中的所有标题。
 *
 * - Typst：`== 标题`（等号个数即层级）
 * - Markdown：`## 标题`（1~6 个 #），跳过 YAML front matter
 *
 * 代码围栏（``` 或 ~~~）内部的行会被忽略。
 *
 * @param {string} text 文档全文
 * @param {'typst'|'markdown'} language
 * @returns {{line:number, level:number, title:string}[]} line 为 1-based 行号
 */
function parseHeadings(text, language) {
  const lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/);
  const headings = [];
  let fence = null;
  let frontMatter = language === 'markdown' && /^---\s*$/.test(lines[0] || '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (frontMatter) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontMatter = false;
      continue;
    }

    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker: marker, length: length };
      } else if (marker === fence.marker && length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const match = language === 'markdown'
      ? /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
      : /^\s*(=+)\s+(.+?)\s*$/.exec(line);

    if (match) {
      headings.push({ line: i + 1, level: match[1].length, title: match[2] });
    }
  }
  return headings;
}

/**
 * 计算某一行（1-based）所处位置的标题层级编号。
 *
 * @param {{line:number, level:number, title:string}[]} headings
 * @param {number} line 1-based 行号（粘贴/光标所在行）
 * @returns {{nums:number[], sectionFull:string, level:number, title:string}}
 */
function sectionAt(headings, line) {
  const counters = new Map();
  let current = null;

  for (const heading of headings) {
    if (heading.line >= line) break;
    // 同级标题要继续累加，只重置比它更深的层级
    for (const level of Array.from(counters.keys())) {
      if (level > heading.level) counters.delete(level);
    }
    counters.set(heading.level, (counters.get(heading.level) || 0) + 1);
    current = heading;
  }

  if (!current) return { nums: [], sectionFull: '', level: 0, title: '' };

  const maxLevel = Math.max.apply(null, Array.from(counters.keys()));
  const nums = [];
  for (let level = 1; level <= maxLevel; level++) nums.push(counters.get(level) || 1);

  return { nums: nums, sectionFull: nums.join('.'), level: current.level, title: current.title };
}

/**
 * 把层级编号整理成最终的章节号字符串。
 *
 * @param {{nums:number[], sectionFull:string}} info
 * @param {'dropFirstLevel'|'full'} mode
 * @param {string} unnumberedLabel 找不到标题时的兜底值
 * @param {number} depth 最多保留几级编号（0/undefined = 不限）。
 *        例如 Typst 报告里设成 2：`====` 小节仍归到所属 `===` 章节，
 *        于是同一 `===` 章节下的图会连续编号 5.5.1、5.5.2……
 */
function applyNumbering(info, mode, unnumberedLabel, depth) {
  let nums = (info && info.nums) || [];
  if (mode !== 'full') nums = nums.slice(1);
  if (depth && depth > 0) nums = nums.slice(0, depth);
  let section = nums.join('.');
  if (!section) section = unnumberedLabel === undefined || unnumberedLabel === null ? '0' : String(unnumberedLabel);
  return section;
}

function pad(value, width) {
  return String(value).padStart(width === undefined ? 2 : width, '0');
}

/** 生成日期/时间类占位符的值（本地时间） */
function dateParts(date) {
  const now = date || new Date();
  return {
    date: String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate()),
    time: pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()),
    timestamp: String(now.getTime()),
    year: String(now.getFullYear()),
  };
}

/** 清掉文件名里不能用的字符，并把空白折成连字符 */
function sanitizeSegment(value, maxLength) {
  const limit = maxLength === undefined ? 60 : maxLength;
  const cleaned = String(value === undefined || value === null ? '' : value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[-.\s]+/, '')
    .replace(/[-.\s]+$/, '');
  return cleaned.slice(0, limit) || 'untitled';
}

/** 展开 `${name}` 占位符；未知占位符原样保留，方便用户发现写错了 */
function expandTemplate(template, vars) {
  const values = vars || {};
  return String(template === undefined || template === null ? '' : template)
    .replace(/\$\{(\w+)\}/g, function (match, name) {
      if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
      const value = values[name];
      return value === undefined || value === null ? match : String(value);
    });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WILDCARD_PLACEHOLDERS = {
  date: '[0-9]{8}',
  time: '[0-9]{6}',
  timestamp: '[0-9]+',
};

/**
 * 由文件名模板生成"用来找已有序号"的正则：`${index}` 变成捕获组，
 * 其余占位符按当前上下文展开成字面量；`looseNames` 里的占位符则放宽为通配。
 */
function indexPattern(format, vars, looseNames) {
  const loose = new Set(looseNames || []);
  const values = vars || {};
  let source = '';
  let lastIndex = 0;
  const re = /\$\{(\w+)\}/g;
  let match;

  while ((match = re.exec(format)) !== null) {
    source += escapeRegExp(String(format).slice(lastIndex, match.index));
    const name = match[1];
    if (name === 'index') {
      source += '(\\d+)';
    } else if (loose.has(name)) {
      source += '.+';
    } else if (Object.prototype.hasOwnProperty.call(WILDCARD_PLACEHOLDERS, name)) {
      source += WILDCARD_PLACEHOLDERS[name];
    } else {
      const value = values[name];
      source += escapeRegExp(value === undefined || value === null ? match[0] : String(value));
    }
    lastIndex = match.index + match[0].length;
  }
  source += escapeRegExp(String(format).slice(lastIndex));
  return new RegExp('^' + source + '$');
}

/** 依据已有文件名推导下一个可用序号（找不到任何匹配则从 1 开始） */
function nextIndex(names, format, vars, looseNames) {
  const pattern = indexPattern(format, vars, looseNames);
  let max = 0;
  for (const name of names || []) {
    const match = pattern.exec(String(name));
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
}

function toPosix(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\\/g, '/');
}

function basename(value) {
  const parts = toPosix(value).split('/');
  return parts[parts.length - 1] || '';
}

function extensionOf(name) {
  const base = basename(name);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index + 1) : '';
}

function stripExtension(name) {
  const base = basename(name);
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(0, index) : base;
}

/** 生成 `fromDir` → `toFile` 的相对路径（一律用正斜杠，供文档引用使用） */
function relativePath(fromDir, toFile) {
  const from = toPosix(fromDir).replace(/\/+$/, '').split('/').filter(Boolean);
  const to = toPosix(toFile).split('/').filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length &&
         from[common].toLowerCase() === to[common].toLowerCase()) {
    common++;
  }
  const upwards = new Array(from.length - common).fill('..');
  return upwards.concat(to.slice(common)).join('/');
}

function normalizeExtensions(extensions) {
  const list = (extensions && extensions.length ? extensions : DEFAULT_IMAGE_EXTENSIONS)
    .map(function (item) { return String(item).replace(/^\./, '').toLowerCase(); })
    .filter(Boolean);
  return list.length ? list : DEFAULT_IMAGE_EXTENSIONS.slice();
}

function isImageName(name, extensions) {
  return normalizeExtensions(extensions).indexOf(extensionOf(name).toLowerCase()) !== -1;
}

/**
 * 从文档正文里找出所有被引用的图片文件名（用于避免和已引用但不在磁盘上的文件重号）。
 */
function extractReferencedNames(text, extensions) {
  const list = normalizeExtensions(extensions);
  const pattern = new RegExp('[^\\s"\'()<>\\[\\]{},;|]*\\.(?:' + list.join('|') + ')\\b', 'gi');
  const names = new Set();
  const source = String(text === undefined || text === null ? '' : text);
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const name = basename(match[0]);
    if (name) names.add(name);
  }
  return Array.from(names);
}

module.exports = {
  DEFAULT_IMAGE_EXTENSIONS: DEFAULT_IMAGE_EXTENSIONS,
  parseHeadings: parseHeadings,
  sectionAt: sectionAt,
  applyNumbering: applyNumbering,
  dateParts: dateParts,
  sanitizeSegment: sanitizeSegment,
  expandTemplate: expandTemplate,
  indexPattern: indexPattern,
  nextIndex: nextIndex,
  toPosix: toPosix,
  basename: basename,
  extensionOf: extensionOf,
  stripExtension: stripExtension,
  relativePath: relativePath,
  isImageName: isImageName,
  extractReferencedNames: extractReferencedNames,
};

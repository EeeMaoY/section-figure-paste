'use strict';

/**
 * 纯函数测试：node test/core.test.js
 * 其中"真实报告"用例会在文件存在时额外校验（不依赖它也能跑）。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../core');

const FIXTURES = path.join(__dirname, 'fixtures');
let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failures.push({ name: name, error: error });
    console.log('  FAIL ' + name + '\n       ' + error.message);
  }
}

function sectionAtText(text, line, language, mode, unnumbered, depth) {
  const info = core.sectionAt(core.parseHeadings(text, language), line);
  return core.applyNumbering(info, mode || 'dropFirstLevel', unnumbered === undefined ? '0' : unnumbered, depth);
}

function lineOf(text, needle) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(needle) !== -1) return i + 1;
  }
  throw new Error('找不到行：' + needle);
}

const typstFixture = fs.readFileSync(path.join(FIXTURES, 'lab-headings.typ'), 'utf8');
const markdownFixture = fs.readFileSync(path.join(FIXTURES, 'doc.md'), 'utf8');

console.log('typst 章节号');

test('=== 节：第 5 个 == 下的第 9 个 === → 5.9', function () {
  const line = lineOf(typstFixture, '=== telnet 命令产生的数据包');
  assert.strictEqual(sectionAtText(typstFixture, line + 2, 'typst'), '5.9');
});

test('=== 节：nslookup → 5.8', function () {
  const line = lineOf(typstFixture, '=== nslookup 命令产生的数据包');
  assert.strictEqual(sectionAtText(typstFixture, line + 2, 'typst'), '5.8');
});

test('==== 节：配置显示过滤器 → 4.2.2', function () {
  const line = lineOf(typstFixture, '==== 配置显示过滤器');
  assert.strictEqual(sectionAtText(typstFixture, line + 2, 'typst'), '4.2.2');
});

test('=== 节：用 Wireshark 观察命令产生的数据包 → 4.4', function () {
  const line = lineOf(typstFixture, '=== 用 Wireshark 观察命令产生的数据包');
  assert.strictEqual(sectionAtText(typstFixture, line + 2, 'typst'), '4.4');
});

test('full 模式带上最外层编号 → 1.5.9', function () {
  const line = lineOf(typstFixture, '=== telnet 命令产生的数据包');
  assert.strictEqual(sectionAtText(typstFixture, line + 2, 'typst', 'full'), '1.5.9');
});

test('sectionDepth=2：==== 小节归到所属 === 章节（lab1 里 5.5.1…5.5.10 的写法）', function () {
  const deep = lineOf(typstFixture, '==== 配置显示过滤器');
  assert.strictEqual(sectionAtText(typstFixture, deep + 2, 'typst', 'dropFirstLevel', '0', 2), '4.2');
  const shallow = lineOf(typstFixture, '=== telnet 命令产生的数据包');
  assert.strictEqual(sectionAtText(typstFixture, shallow + 2, 'typst', 'dropFirstLevel', '0', 2), '5.9');
});

test('第一个标题之前落到兜底标签 0', function () {
  assert.strictEqual(sectionAtText(typstFixture, 1, 'typst'), '0');
});

test('代码块里的 = 行不算标题', function () {
  const line = lineOf(typstFixture, '这是代码块里的假标题');
  const headings = core.parseHeadings(typstFixture, 'typst');
  assert.ok(!headings.some(function (h) { return h.title.indexOf('假标题') !== -1; }));
  assert.strictEqual(sectionAtText(typstFixture, line + 1, 'typst'), sectionAtText(typstFixture, line - 1, 'typst'));
});

console.log('markdown 章节号');

test('#### 细节 → 1.1.1（dropFirstLevel 去掉 # 一级）', function () {
  const line = lineOf(markdownFixture, '#### 细节一');
  assert.strictEqual(sectionAtText(markdownFixture, line + 2, 'markdown'), '1.1.1');
});

test('### 抓包结果 → 2.1（第二个 ## 下的第一个 ###）', function () {
  const line = lineOf(markdownFixture, '### 抓包结果');
  assert.strictEqual(sectionAtText(markdownFixture, line + 2, 'markdown'), '2.1');
});

test('front matter 与代码块里的 # 不算标题', function () {
  const headings = core.parseHeadings(markdownFixture, 'markdown');
  assert.ok(!headings.some(function (h) { return h.title.indexOf('front matter') !== -1; }));
  assert.ok(!headings.some(function (h) { return h.title.indexOf('假标题') !== -1; }));
});

console.log('序号推导');

test('同一章节内递增：已有 5.9.1 / 5.9.2 / 5.9.10 → 下一个 11', function () {
  const names = ['5.9.1.png', '5.9.2.png', '5.9.10.png', '5.9.1-notes.txt', 'other.png'];
  assert.strictEqual(core.nextIndex(names, '${section}.${index}.${ext}', { section: '5.9', ext: 'png' }), 11);
});

test('别的章节不影响本章节序号', function () {
  const names = ['5.8.1.png', '5.8.2.png'];
  assert.strictEqual(core.nextIndex(names, '${section}.${index}.${ext}', { section: '5.9', ext: 'png' }), 1);
});

test('perDocument（section 放宽为通配）跨章节连续编号', function () {
  const names = ['5.8.1.png', '5.8.2.png', '5.9.1.png'];
  assert.strictEqual(
    core.nextIndex(names, '${section}.${index}.${ext}', { section: '5.9', ext: 'png' }, ['section']),
    3
  );
});

test('自定义模板 fig-5.9.1.png 也能识号', function () {
  const names = ['fig-5.9.1.png', 'fig-5.9.3.png'];
  assert.strictEqual(core.nextIndex(names, 'fig-${section}.${index}.${ext}', { section: '5.9', ext: 'png' }), 4);
});

test('date 占位符用通配匹配，不干扰序号', function () {
  const names = ['5.9.1-20260101.png', '5.9.2-20260102.png'];
  assert.strictEqual(
    core.nextIndex(names, '${section}.${index}-${date}.${ext}', { section: '5.9', ext: 'png' }),
    3
  );
});

console.log('模板与工具函数');

test('expandTemplate 只替换已知占位符', function () {
  assert.strictEqual(
    core.expandTemplate('${section}.${index}.${ext}', { section: '5.9', index: 3, ext: 'png' }),
    '5.9.3.png'
  );
  assert.strictEqual(core.expandTemplate('${unknown}', { section: '5.9' }), '${unknown}');
});

test('sanitizeSegment 去掉非法字符并把空白折成连字符', function () {
  assert.strictEqual(core.sanitizeSegment('实验 结果/分析: 第1节'), '实验-结果分析-第1节');
  assert.strictEqual(core.sanitizeSegment('   '), 'untitled');
});

test('相对路径用正斜杠', function () {
  assert.strictEqual(
    core.relativePath('E:\\code\\zju\\lab1', 'E:\\code\\zju\\lab1\\imgs\\5.9.1.png'),
    'imgs/5.9.1.png'
  );
  assert.strictEqual(
    core.relativePath('E:\\code\\zju\\lab1\\sub', 'E:\\code\\zju\\lab1\\imgs\\a.png'),
    '../imgs/a.png'
  );
});

test('extractReferencedNames 抓出正文里引用的图片名', function () {
  const names = core.extractReferencedNames('#image("imgs/5.9.png", width: 80%) ![x](a/b-1.webp)');
  assert.ok(names.indexOf('5.9.png') !== -1);
  assert.ok(names.indexOf('b-1.webp') !== -1);
});

test('扩展名判断', function () {
  assert.strictEqual(core.isImageName('a.PNG', ['png']), true);
  assert.strictEqual(core.isImageName('a.pdf', ['png', 'jpg']), false);
  assert.strictEqual(core.stripExtension('imgs/5.9.1.png'), '5.9.1');
  assert.strictEqual(core.extensionOf('imgs/5.9.1.png'), 'png');
});

console.log('模拟连续粘贴（真实文件系统）');

test('同一章节连粘三次 → 5.9.1 / 5.9.2 / 5.9.3；手工再放一个 5.9.4.png 后 → 5.9.5', function () {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'section-figure-paste-'));
  const format = '${section}.${index}.${ext}';
  const vars = { section: '5.9', ext: 'png' };
  const readNames = function () { return fs.readdirSync(dir); };
  const nextName = function () {
    const index = core.nextIndex(readNames(), format, vars);
    return core.expandTemplate(format, { section: '5.9', index: index, ext: 'png' });
  };
  try {
    const created = [];
    for (let i = 0; i < 3; i++) {
      const name = nextName();
      fs.writeFileSync(path.join(dir, name), 'fake-png');
      created.push(name);
    }
    assert.deepStrictEqual(created, ['5.9.1.png', '5.9.2.png', '5.9.3.png']);

    // 模拟"别的章节的图"和"手工放进去的图"都不会被误用
    fs.writeFileSync(path.join(dir, '5.8.1.png'), 'x');
    fs.writeFileSync(path.join(dir, '5.9.4.png'), 'x');
    assert.strictEqual(nextName(), '5.9.5.png');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log('真实报告回归');

const realReports = [
  {
    label: 'lab1（正文仍在补，含历史遗留命名）',
    file: path.join(__dirname, '..', '..', 'zju-comnet-labs-2026', 'writeups', 'lab1', 'cnet_3220103349_毛毅_lab1.typ'),
    strict: false,
    depth: 2,
  },
  {
    label: 'lab2',
    file: path.join(__dirname, '..', '..', 'zju-comnet-labs-2026', 'writeups', 'lab2', 'cnet_3220103349_毛毅_lab2.typ'),
    strict: true,
    depth: 0,
  },
  {
    label: 'os-lab1',
    file: path.join(__dirname, '..', '..', 'os26-fall', 'docs', 'lab1', 'OS_3220103349_毛毅_lab1.typ'),
    strict: true,
    depth: 0,
  },
];

let realChecked = 0;

for (const report of realReports) {
  if (!fs.existsSync(report.file)) {
    console.log('  skip ' + report.label + '（文件不存在）');
    continue;
  }
  const text = fs.readFileSync(report.file, 'utf8');
  const lines = text.split(/\r?\n/);
  const headings = core.parseHeadings(text, 'typst');
  const references = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /imgs\/([\w.\-\u4e00-\u9fff]+)\.(png|jpe?g|webp|gif)\b/i.exec(lines[i]);
    if (!match) continue;
    references.push({
      line: i + 1,
      base: match[1],
      ext: match[2].toLowerCase(),
      section: core.applyNumbering(core.sectionAt(headings, i + 1), 'dropFirstLevel', '0', report.depth),
    });
  }
  const numeric = references.filter(function (reference) { return /^\d/.test(reference.base); });
  if (!numeric.length) {
    console.log('  skip ' + report.label + '（正文里没有 imgs/<数字>.png 引用）');
    continue;
  }

  // 1) 「章节号.序号」命名的引用，同一章节内序号必须是 1、2、3……
  const ordinalGroups = new Map();
  for (const reference of numeric) {
    if (!reference.base.startsWith(reference.section + '.')) continue;
    const rest = reference.base.slice(reference.section.length + 1);
    if (!/^\d+$/.test(rest)) continue;
    if (!ordinalGroups.has(reference.section)) ordinalGroups.set(reference.section, []);
    ordinalGroups.get(reference.section).push({ line: reference.line, index: Number(rest) });
  }
  if (ordinalGroups.size) {
    test((report.strict ? '同一章节内的图片序号从 1 连续递增：' : '同一章节内的图片序号单调递增（手写规划，允许跳号）：') + report.label, function () {
      for (const entry of ordinalGroups) {
        const actual = entry[1].map(function (item) { return item.index; });
        const where = '（引用在第 ' + entry[1].map(function (item) { return item.line; }).join('、') + ' 行）';
        if (report.strict) {
          const expected = actual.map(function (_, i) { return i + 1; });
          assert.deepStrictEqual(actual, expected, '章节 ' + entry[0] + ' 的序号序列是 ' + actual.join(',') + where);
        } else {
          for (let i = 1; i < actual.length; i++) {
            assert.ok(actual[i] > actual[i - 1], '章节 ' + entry[0] + ' 序号出现回退：' + actual.join(',') + where);
          }
        }
      }
    });
  }

  if (report.strict) {
    test('图片文件名以所在章节号开头，且磁盘文件存在：' + report.label, function () {
      const dir = path.join(path.dirname(report.file), 'imgs');
      for (const reference of numeric) {
        assert.ok(
          reference.base.startsWith(reference.section + '.'),
          '第 ' + reference.line + ' 行 ' + reference.base + ' 与所在章节 ' + reference.section + ' 不一致'
        );
        assert.ok(
          fs.existsSync(path.join(dir, reference.base + '.' + reference.ext)),
          '缺文件 ' + reference.base + '.' + reference.ext
        );
      }
    });
  } else {
    const oldStyle = numeric.filter(function (reference) { return reference.base === reference.section; });
    const stale = numeric.filter(function (reference) {
      return reference.base !== reference.section && !reference.base.startsWith(reference.section + '.');
    });
    console.log(
      '  info ' + report.label + '：共 ' + numeric.length + ' 处引用；' +
      oldStyle.length + ' 处是「一节一图」旧写法 ' +
      oldStyle.map(function (r) { return r.base; }).join('、') + '；' +
      stale.length + ' 处与当前章节结构不一致' +
      (stale.length ? '（' + stale.map(function (r) { return '第' + r.line + '行 ' + r.base + '（应在 ' + r.section + '）'; }).join('；') + '）' : '')
    );
  }

  realChecked += numeric.length;
}

console.log('');
console.log('通过 ' + passed + ' 项' + (realChecked ? '（真实报告里校验了 ' + realChecked + ' 处章节号）' : ''));
if (failures.length) {
  console.log('失败 ' + failures.length + ' 项：');
  for (const failure of failures) console.log('  - ' + failure.name);
  process.exit(1);
}
console.log('全部通过 ✔');

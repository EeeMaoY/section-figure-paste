'use strict';

/**
 * 把本扩展安装到 VS Code 的用户扩展目录（开发者快速迭代用；长期使用/分发请用 .vsix 安装）。
 *
 *   node tools/install.js            # 装到 ~/.vscode/extensions
 *   node tools/install.js <dir>      # 装到指定扩展目录（例如 --extensions-dir 指定的位置）
 *
 * 装完在 VS Code 里执行 “Developer: Reload Window” 生效。
 *
 * 注意：直接拷目录时，VS Code 可能把新目录当成"卸载残留"——写进 .obsolete 后启动时跳过、
 * 随后删除，现象就是"插件不见了"（日志关键字：`Marked extension as removed <目录名>`）。
 * 所以这里会顺手把 .obsolete 里对应的陈旧条目清掉。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../package.json');
const root = path.join(__dirname, '..');

const baseDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(os.homedir(), '.vscode', 'extensions');

const folderName = pkg.publisher + '.' + pkg.name + '-' + pkg.version;
const target = path.join(baseDir, folderName);
const files = ['package.json', 'extension.js', 'core.js', 'README.md', 'LICENSE', 'CHANGELOG.md'];

/** 清掉 .obsolete 里本扩展的陈旧条目，否则 VS Code 启动时会跳过甚至删除这个目录 */
function clearObsoleteEntry() {
  const file = path.join(baseDir, '.obsolete');
  if (!fs.existsSync(file)) return;
  let map;
  try {
    map = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.log('  ! 无法解析 ' + file + '，请手动确认里面没有 ' + folderName);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(map, folderName)) return;
  delete map[folderName];
  fs.writeFileSync(file, JSON.stringify(map), 'utf8');
  console.log('  已从 .obsolete 移除陈旧条目：' + folderName);
}

fs.mkdirSync(target, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(target, file));
  console.log('  copied ' + file);
}
clearObsoleteEntry();

console.log('');
console.log('已安装到：' + target);
console.log('在 VS Code 里执行 “Developer: Reload Window”（或重启 VS Code）后生效。');
console.log('若没生效：命令面板 → “Developer: Show Running Extensions” 里确认 ' + pkg.publisher + '.' + pkg.name + ' 已激活。');
console.log('');
console.log('提示：这样装出来的副本不会被 VS Code 正式登记（扩展面板里可能显示为本地扩展）。');
console.log('      长期使用或给别人分发，请打包成 .vsix 后用 code --install-extension 安装，见 README「安装」一节。');

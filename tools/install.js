'use strict';

/**
 * 把本扩展安装到 VS Code 的用户扩展目录。
 *
 *   node tools/install.js            # 装到 ~/.vscode/extensions
 *   node tools/install.js <dir>      # 装到指定扩展目录（例如 --extensions-dir 指定的位置）
 *
 * 装完在 VS Code 里执行 “Developer: Reload Window” 生效。
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

fs.mkdirSync(target, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(target, file));
  console.log('  copied ' + file);
}

console.log('');
console.log('已安装到：' + target);
console.log('在 VS Code 里执行 “Developer: Reload Window”（或重启 VS Code）后生效。');
console.log('若没生效：命令面板 → “Developer: Show Running Extensions” 里确认 local.section-figure-paste 已激活。');

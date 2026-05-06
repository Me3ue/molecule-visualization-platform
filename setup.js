const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function hasCmd(cmd) {
    try {
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// 项目文件夹路径
const projectDir = __dirname;

console.log('正在自动化配置 Next.js 项目环境...');

if (!hasCmd('node')) {
    console.error('未检测到 Node.js，请先安装 Node.js!');
    process.exit(1);
}

let pkg = 'npm';
if (hasCmd('pnpm')) pkg = 'pnpm';
else if (hasCmd('yarn')) pkg = 'yarn';

console.log(`使用 ${pkg} 进行依赖安装...`);
try {
    // 安装依赖
    execSync(`${pkg} install`, { stdio: 'inherit' });
} catch (e) {
    console.error('依赖安装失败，请检查网络或 package.json 配置。');
    process.exit(1);
}

console.log('启动开发服务器...');
try {
    // 启动开发服务器
    execSync(`${pkg} run dev`, { stdio: 'inherit' });
} catch (e) {
    console.error('开发服务器启动失败，请检查项目配置。');
    process.exit(1);
} 
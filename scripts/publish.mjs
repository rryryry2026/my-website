#!/usr/bin/env node
/**
 * 一键发布：本地构建校验 → 展示变更 → 提交 → 推送到 GitHub。
 * 推送后由 .github/workflows/deploy.yml 自动构建并同步到阿里云。
 *
 *   npm run publish
 *   npm run publish -- "site: fix typo"
 *   npm run publish -- --yes
 *   npm run publish -- --skip-build
 */
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import fs from 'node:fs';

const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((arg) => arg.startsWith('--')));
const messageArg = rawArgs
  .filter((arg) => !arg.startsWith('--'))
  .join(' ')
  .trim();
const assumeYes = flags.has('--yes');
const skipBuild = flags.has('--skip-build');

const die = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

const commandEnv = { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' };

const capture = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: commandEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error,
  };
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: commandEnv,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) die(`无法执行 ${command}：${result.error.message}`);
  return result.status ?? 1;
};

/* 定位仓库根目录 ------------------------------------------------------------- */

const topLevel = capture('git', ['rev-parse', '--show-toplevel']);
if (topLevel.status !== 0 || !topLevel.stdout) {
  die('当前目录不是 Git 仓库。');
}
const repoRoot = topLevel.stdout;
process.chdir(repoRoot);

/* 环境检查 ------------------------------------------------------------------- */

const branch = capture('git', ['branch', '--show-current']).stdout;
if (branch !== 'main') {
  die(`当前分支是 ${branch || '（未知）'}，发布脚本只允许在 main 上运行。`);
}

const remote = capture('git', ['remote', 'get-url', 'origin']);
if (remote.status !== 0 || !remote.stdout) {
  die('没有配置 origin 远端。');
}

const pending = capture('git', ['status', '--porcelain']).stdout;
if (!pending) {
  console.log('\n没有需要发布的修改。');
  console.log('如果只想重新部署一次，可以在 GitHub Actions 页面手动运行 “Deploy to Aliyun”。\n');
  process.exit(0);
}

/* 构建校验 ------------------------------------------------------------------- */

if (!skipBuild) {
  const astroCli = path.join(repoRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!fs.existsSync(astroCli)) {
    die('还没安装依赖，请先运行 npm install（或加 --skip-build 跳过构建校验）。');
  }
  console.log('\n› 正在本地构建校验…\n');
  const status = run(process.execPath, [astroCli, 'build']);
  if (status !== 0) {
    die('构建失败，已停止发布。请根据上面的错误修复后再试。');
  }
  console.log('\n✔ 构建通过。');
}

/* 暂存并展示摘要 -------------------------------------------------------------- */

run('git', ['add', '-A']);

const staged = capture('git', ['diff', '--cached', '--quiet']);
if (staged.status === 0) {
  console.log('\n没有需要提交的修改（构建产物不会进入 Git）。\n');
  process.exit(0);
}

console.log('\n将要提交的变更：\n');
run('git', ['--no-pager', 'status', '--short']);
console.log('');
run('git', ['--no-pager', 'diff', '--cached', '--stat']);

/* 提交信息与确认 -------------------------------------------------------------- */

const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const defaultMessage = `site: publish ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
  now.getDate()
)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
let message = messageArg || defaultMessage;

if (!assumeYes) {
  if (!process.stdin.isTTY) {
    run('git', ['reset'], { stdio: 'ignore' });
    die('当前环境不能交互确认，请加 --yes 参数。');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\n提交信息 [${message}]: `)).trim();
  if (answer) message = answer;

  const confirm = (await rl.question('确认提交并推送到 GitHub？(y/N) '))
    .trim()
    .toLowerCase();
  rl.close();

  if (confirm !== 'y' && confirm !== 'yes') {
    spawnSync('git', ['reset'], { cwd: repoRoot, stdio: 'ignore' });
    console.log('\n已取消发布，文件修改都还在，只是取消了暂存。\n');
    process.exit(0);
  }
}

/* 提交与推送 ------------------------------------------------------------------ */

if (run('git', ['commit', '-m', message]) !== 0) {
  die('提交失败。');
}

console.log('\n› 正在推送到 GitHub…\n');
if (run('git', ['push', 'origin', 'main']) !== 0) {
  die('推送失败。提交已经保存在本地，修复网络或权限后可以重新运行本脚本，或手动执行 git push。');
}

/* 提示 Actions 地址 ----------------------------------------------------------- */

let actionsUrl = '';
const cleaned = remote.stdout
  .replace(/^git@github\.com:/, '')
  .replace(/^https:\/\/github\.com\//, '')
  .replace(/\.git$/, '');
const parts = cleaned.split('/');
if (
  remote.stdout.includes('github.com') &&
  parts.length === 2 &&
  parts.every(Boolean)
) {
  actionsUrl = `https://github.com/${parts[0]}/${parts[1]}/actions`;
}

console.log(`\n✔ 已推送：${message}`);
if (actionsUrl) {
  console.log(`\nGitHub Actions 会自动构建并部署，通常需要 1–3 分钟：`);
  console.log(`  ${actionsUrl}`);
}
console.log('\n部署完成后刷新线上网站即可看到更新。\n');

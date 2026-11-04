/**
 * 本地内容管理端。只监听 127.0.0.1，不对外网开放。
 *
 *   npm run admin   → http://127.0.0.1:4400
 *
 * 直接读写 src/content/blog/*.md、src/data/*.json 和 public/uploads/，
 * 同时启动 Astro 开发服务器用于预览。没有任何第三方依赖。
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ADMIN_DIR = path.join(ROOT, 'admin');
const UI_DIR = path.join(ADMIN_DIR, 'ui');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');

const PORT = Number(process.env.ADMIN_PORT || 4400);
const HOST = '127.0.0.1';
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4321);
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`;

const CATEGORIES = ['技术文章', '生活日常'];
const ICONS = ['github', 'instagram', 'mail'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

/* -------------------------------------------------------------------------- */
/* 工具                                                                        */
/* -------------------------------------------------------------------------- */

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
};

const fail = (res, status, message) => json(res, status, { error: message });

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('请求内容过大');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    const error = new Error('JSON 格式不正确');
    error.status = 400;
    throw error;
  }
}

const unquote = (value) => {
  const text = value.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    if (text.startsWith('"')) {
      try {
        return JSON.parse(text);
      } catch {
        return text.slice(1, -1);
      }
    }
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
};

function parseScalar(value) {
  const text = value.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => unquote(item));
  }
  return unquote(text);
}

/** 只解析本站使用的简单 frontmatter（标量、布尔、字符串列表）。 */
function parsePost(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const data = {};
  let listKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;

    const [, key, value] = pair;
    if (value.trim() === '') {
      listKey = key;
      data[key] = [];
    } else {
      listKey = null;
      data[key] = parseScalar(value);
    }
  }

  return { data, body: match[2] };
}

const yamlValue = (value) => {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(String(value));
};

function serializePost(data, body) {
  const order = ['title', 'description', 'pubDate', 'updatedDate', 'category', 'tags', 'draft'];
  const keys = [...order.filter((key) => data[key] !== undefined && data[key] !== ''),
    ...Object.keys(data).filter((key) => !order.includes(key) && data[key] !== undefined)];

  const lines = ['---'];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${yamlValue(item)}`);
      }
    } else {
      lines.push(`${key}: ${yamlValue(value)}`);
    }
  }
  lines.push('---', '', String(body ?? '').replace(/\s+$/, ''), '');
  return lines.join('\n');
}

function postPath(slug) {
  return path.join(BLOG_DIR, `${slug}.md`);
}

async function listPosts() {
  await fsp.mkdir(BLOG_DIR, { recursive: true });
  const entries = await fsp.readdir(BLOG_DIR, { withFileTypes: true });
  const posts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const raw = await fsp.readFile(path.join(BLOG_DIR, entry.name), 'utf8');
    const { data, body } = parsePost(raw);
    const stat = await fsp.stat(path.join(BLOG_DIR, entry.name));
    posts.push({
      slug: entry.name.replace(/\.md$/, ''),
      title: data.title ?? '',
      description: data.description ?? '',
      pubDate: data.pubDate ?? '',
      updatedDate: data.updatedDate ?? '',
      category: data.category ?? '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      draft: data.draft === true,
      words: (body.match(/[㐀-鿿]/g) ?? []).length +
        (body.match(/[A-Za-z0-9]+/g) ?? []).length,
      updatedAt: stat.mtime.toISOString(),
    });
  }

  return posts.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const tags = [];
  for (const item of value) {
    const tag = String(item ?? '').trim().replace(/^#/, '').slice(0, 30);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 12);
}

function validatePost(input) {
  const errors = [];
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const slug = String(input.slug ?? '').trim();
  const category = String(input.category ?? '');
  const pubDate = String(input.pubDate ?? '').trim();
  const updatedDate = String(input.updatedDate ?? '').trim();
  const draft = input.draft === true;
  const tags = normalizeTags(input.tags);
  const body = String(input.body ?? '');

  if (!title) errors.push('标题不能为空');
  if (title.length > 200) errors.push('标题不能超过 200 字');
  if (!description) errors.push('摘要不能为空');
  if (description.length > 500) errors.push('摘要不能超过 500 字');
  if (!SLUG_RE.test(slug)) errors.push('URL 别名只能使用小写字母、数字和连字符');
  if (!CATEGORIES.includes(category)) errors.push('分类不合法');
  if (!DATE_RE.test(pubDate)) errors.push('发布日期格式应为 YYYY-MM-DD');
  if (updatedDate && !DATE_RE.test(updatedDate)) errors.push('更新日期格式应为 YYYY-MM-DD');

  if (errors.length) {
    const error = new Error(errors.join('；'));
    error.status = 400;
    throw error;
  }

  const data = { title, description, pubDate, category, tags, draft };
  if (updatedDate) data.updatedDate = updatedDate;
  return { data, body, slug };
}

/* -------------------------------------------------------------------------- */
/* 站点数据                                                                     */
/* -------------------------------------------------------------------------- */

const SITE_FILE = path.join(DATA_DIR, 'site.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, file);
}

function validateSite(site) {
  if (!site || typeof site !== 'object' || Array.isArray(site)) {
    throw Object.assign(new Error('站点数据格式不正确'), { status: 400 });
  }
  const required = ['title', 'fullTitle', 'description', 'author', 'intro', 'email'];
  for (const key of required) {
    if (typeof site[key] !== 'string' || !site[key].trim()) {
      throw Object.assign(new Error(`字段 ${key} 不能为空`), { status: 400 });
    }
  }
  if (!Array.isArray(site.socials)) {
    throw Object.assign(new Error('社交链接必须是数组'), { status: 400 });
  }
  for (const social of site.socials) {
    if (!social || typeof social.label !== 'string' || typeof social.href !== 'string') {
      throw Object.assign(new Error('社交链接格式不正确'), { status: 400 });
    }
    if (!ICONS.includes(social.icon)) {
      throw Object.assign(new Error('社交图标只能是 github / instagram / mail'), { status: 400 });
    }
  }
  if (!site.home || !Array.isArray(site.home.lead) || !site.home.postcard) {
    throw Object.assign(new Error('首页文案缺少必要字段'), { status: 400 });
  }
  if (!site.about || !Array.isArray(site.about.texts) || !Array.isArray(site.about.facts)) {
    throw Object.assign(new Error('关于我文案缺少必要字段'), { status: 400 });
  }
  if (site.comments) {
    if (typeof site.comments !== 'object' || Array.isArray(site.comments)) {
      throw Object.assign(new Error('评论配置格式不正确'), { status: 400 });
    }
    for (const key of ['repo', 'repoId', 'category', 'categoryId', 'mapping', 'theme', 'lang']) {
      if (typeof site.comments[key] !== 'string') {
        throw Object.assign(new Error(`评论字段 ${key} 必须是文本`), { status: 400 });
      }
    }
    if (typeof site.comments.enabled !== 'boolean') {
      throw Object.assign(new Error('评论 enabled 必须是布尔值'), { status: 400 });
    }
  }
}

function validatePhotos(photos) {
  if (!Array.isArray(photos)) {
    throw Object.assign(new Error('相册必须是数组'), { status: 400 });
  }
  for (const photo of photos) {
    if (
      !photo ||
      typeof photo.src !== 'string' ||
      !photo.src.trim() ||
      typeof photo.title !== 'string' ||
      typeof photo.note !== 'string' ||
      typeof photo.alt !== 'string'
    ) {
      throw Object.assign(new Error('相册条目需要 src / title / note / alt'), { status: 400 });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 此刻 / 动态 / 友链                                                          */
/* -------------------------------------------------------------------------- */

const DATA_FILES = {
  now: path.join(DATA_DIR, 'now.json'),
  moments: path.join(DATA_DIR, 'moments.json'),
  friends: path.join(DATA_DIR, 'friends.json'),
};

const isRemoteOrLocalImage = (value) =>
  !value ||
  value.startsWith('/uploads/') ||
  value.startsWith('/assets/') ||
  /^https?:\/\//i.test(value);

function validateNow(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw Object.assign(new Error('此刻数据格式不正确'), { status: 400 });
  }
  for (const key of ['updatedAt', 'focus', 'location', 'mood', 'reading', 'listening', 'note']) {
    if (typeof data[key] !== 'string') {
      throw Object.assign(new Error(`此刻字段 ${key} 必须是文本`), { status: 400 });
    }
  }
  if (!DATE_RE.test(data.updatedAt)) {
    throw Object.assign(new Error('此刻更新日期格式应为 YYYY-MM-DD'), { status: 400 });
  }
}

function validateMoments(data) {
  if (!Array.isArray(data)) {
    throw Object.assign(new Error('动态必须是数组'), { status: 400 });
  }
  const ids = new Set();
  for (const moment of data) {
    if (!moment || typeof moment !== 'object') {
      throw Object.assign(new Error('动态条目格式不正确'), { status: 400 });
    }
    for (const key of ['id', 'date', 'text', 'mood', 'location', 'image']) {
      if (typeof moment[key] !== 'string') {
        throw Object.assign(new Error(`动态字段 ${key} 必须是文本`), { status: 400 });
      }
    }
    if (!moment.id.trim() || ids.has(moment.id)) {
      throw Object.assign(new Error('动态 id 不能为空且不能重复'), { status: 400 });
    }
    ids.add(moment.id);
    if (!DATE_RE.test(moment.date)) {
      throw Object.assign(new Error('动态日期格式应为 YYYY-MM-DD'), { status: 400 });
    }
    if (!moment.text.trim()) {
      throw Object.assign(new Error('动态内容不能为空'), { status: 400 });
    }
    if (!isRemoteOrLocalImage(moment.image)) {
      throw Object.assign(new Error('动态图片地址不合法'), { status: 400 });
    }
  }
}

function validateFriends(data) {
  if (!Array.isArray(data)) {
    throw Object.assign(new Error('友链必须是数组'), { status: 400 });
  }
  for (const friend of data) {
    if (!friend || typeof friend !== 'object') {
      throw Object.assign(new Error('友链条目格式不正确'), { status: 400 });
    }
    for (const key of ['name', 'url', 'description', 'avatar']) {
      if (typeof friend[key] !== 'string') {
        throw Object.assign(new Error(`友链字段 ${key} 必须是文本`), { status: 400 });
      }
    }
    if (!friend.name.trim()) {
      throw Object.assign(new Error('友链名称不能为空'), { status: 400 });
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(friend.url);
    } catch {
      throw Object.assign(new Error('友链地址必须是完整的 http:// 或 https:// 链接'), {
        status: 400,
      });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw Object.assign(new Error('友链地址只支持 http / https'), { status: 400 });
    }
    if (!isRemoteOrLocalImage(friend.avatar)) {
      throw Object.assign(new Error('友链头像地址不合法'), { status: 400 });
    }
  }
}

const DATA_VALIDATORS = {
  now: validateNow,
  moments: validateMoments,
  friends: validateFriends,
};

/* -------------------------------------------------------------------------- */
/* 媒体                                                                        */
/* -------------------------------------------------------------------------- */

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

function safeBaseName(name) {
  const base = path
    .basename(String(name ?? 'image'))
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'image';
}

async function saveUpload(buffer, fileName, contentType) {
  const ext = IMAGE_TYPES[String(contentType).split(';')[0].trim()];
  if (!ext) {
    throw Object.assign(new Error('只支持 JPG、PNG、WebP、GIF、AVIF 图片'), { status: 415 });
  }
  if (buffer.length > 20 * 1024 * 1024) {
    throw Object.assign(new Error('图片不能超过 20MB'), { status: 413 });
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const stamp = [
    yyyy,
    mm,
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const random = crypto.randomBytes(3).toString('hex');
  const dir = path.join(UPLOAD_DIR, yyyy, mm);
  await fsp.mkdir(dir, { recursive: true });

  const name = `${safeBaseName(fileName)}-${stamp}-${random}${ext}`;
  await fsp.writeFile(path.join(dir, name), buffer);
  return {
    url: `/uploads/${yyyy}/${mm}/${name}`,
    name,
    size: buffer.length,
  };
}

async function listMedia() {
  const results = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!MIME[path.extname(entry.name).toLowerCase()]?.startsWith('image/')) continue;
      const stat = await fsp.stat(full);
      results.push({
        path: path.relative(ROOT, full).replace(/\\/g, '/'),
        url: `/${path.relative(path.join(ROOT, 'public'), full).replace(/\\/g, '/')}`,
        name: entry.name,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    }
  }
  await walk(UPLOAD_DIR);
  return results.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function resolveMedia(relPath) {
  const normalized = String(relPath ?? '').replace(/\\/g, '/');
  if (!normalized.startsWith('uploads/')) {
    throw Object.assign(new Error('只能删除 uploads 目录下的文件'), { status: 400 });
  }
  const full = path.resolve(path.join(ROOT, 'public'), normalized);
  const inside = path.resolve(UPLOAD_DIR) + path.sep;
  if (!full.startsWith(inside)) {
    throw Object.assign(new Error('非法路径'), { status: 400 });
  }
  return full;
}

/* -------------------------------------------------------------------------- */
/* 标签                                                                        */
/* -------------------------------------------------------------------------- */

async function collectTags() {
  const posts = await listPosts();
  const map = new Map();
  for (const post of posts) {
    for (const tag of post.tags) map.set(tag, (map.get(tag) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
}

async function mapAllPosts(mutator) {
  const posts = await listPosts();
  for (const post of posts) {
    const file = postPath(post.slug);
    const raw = await fsp.readFile(file, 'utf8');
    const { data, body } = parsePost(raw);
    const changed = mutator(data);
    if (changed) await fsp.writeFile(file, serializePost(data, body), 'utf8');
  }
}

/* -------------------------------------------------------------------------- */
/* 预览与构建                                                                   */
/* -------------------------------------------------------------------------- */

let preview = null;
const ASTRO_CLI = path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');

function startPreview() {
  if (process.env.ADMIN_NO_PREVIEW === '1') return;
  preview = spawn(process.execPath, [ASTRO_CLI, 'dev', '--port', String(PREVIEW_PORT)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  preview.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[admin] 预览服务退出，代码 ${code}`);
    }
    preview = null;
  });
}

function stopPreview() {
  if (!preview) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    preview.kill('SIGTERM');
  }
  preview = null;
}

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ASTRO_CLI, 'build'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    const timer = setTimeout(() => {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      resolve({ ok: false, output: `${output}\n构建超时（120 秒）` });
    }, 120000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* 路由                                                                        */
/* -------------------------------------------------------------------------- */

function checkHost(req) {
  const host = String(req.headers.host ?? '');
  const allowed = [`${HOST}:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`];
  return allowed.includes(host);
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return [`http://${HOST}:${PORT}`, `http://localhost:${PORT}`, `http://[::1]:${PORT}`].includes(origin);
}

async function sendFile(res, file) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    fail(res, 404, '文件不存在');
  }
}

async function serveStatic(res, pathname) {
  const relative = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(UI_DIR, `.${relative}`);
  if (!file.startsWith(path.resolve(UI_DIR) + path.sep)) {
    fail(res, 403, '禁止访问');
    return;
  }
  return sendFile(res, file);
}

/** 管理端预览也要能看到站点图片。 */
async function servePublic(res, pathname) {
  const publicDir = path.join(ROOT, 'public');
  const file = path.resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(publicDir + path.sep)) {
    fail(res, 403, '禁止访问');
    return;
  }
  return sendFile(res, file);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  if (pathname === '/api/status' && method === 'GET') {
    return json(res, 200, { previewUrl: PREVIEW_URL, root: ROOT });
  }

  if (pathname === '/api/posts' && method === 'GET') {
    return json(res, 200, { posts: await listPosts() });
  }

  if (pathname === '/api/posts' && method === 'POST') {
    const input = validatePost(await readJson(req));
    const file = postPath(input.slug);
    try {
      await fsp.access(file);
      return fail(res, 409, '这个 URL 别名已经被使用了');
    } catch {
      /* 不存在，可以创建 */
    }
    await fsp.writeFile(file, serializePost(input.data, input.body), 'utf8');
    return json(res, 201, { slug: input.slug });
  }

  const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (postMatch) {
    const slug = decodeURIComponent(postMatch[1]);
    if (!SLUG_RE.test(slug)) return fail(res, 400, 'URL 别名不合法');
    const file = postPath(slug);

    if (method === 'GET') {
      try {
        const raw = await fsp.readFile(file, 'utf8');
        const { data, body } = parsePost(raw);
        return json(res, 200, { slug, data, body });
      } catch {
        return fail(res, 404, '文章不存在');
      }
    }

    if (method === 'PUT') {
      const input = validatePost(await readJson(req));
      let target = file;
      if (input.slug !== slug) {
        target = postPath(input.slug);
        try {
          await fsp.access(target);
          return fail(res, 409, '新的 URL 别名已经被使用了');
        } catch {
          /* 可以改名 */
        }
      }
      await fsp.writeFile(target, serializePost(input.data, input.body), 'utf8');
      if (target !== file) await fsp.unlink(file);
      return json(res, 200, { slug: input.slug });
    }

    if (method === 'DELETE') {
      try {
        await fsp.unlink(file);
        return json(res, 200, { ok: true });
      } catch {
        return fail(res, 404, '文章不存在');
      }
    }
  }

  if (pathname === '/api/media' && method === 'GET') {
    return json(res, 200, { media: await listMedia() });
  }

  if (pathname === '/api/upload' && method === 'POST') {
    const buffer = await readBody(req, 20 * 1024 * 1024 + 1024);
    const saved = await saveUpload(
      buffer,
      url.searchParams.get('name'),
      req.headers['content-type']
    );
    return json(res, 201, saved);
  }

  if (pathname === '/api/media' && method === 'DELETE') {
    const full = resolveMedia(url.searchParams.get('path'));
    try {
      await fsp.unlink(full);
      return json(res, 200, { ok: true });
    } catch {
      return fail(res, 404, '文件不存在');
    }
  }

  if (pathname === '/api/site' && method === 'GET') {
    return json(res, 200, {
      site: await readJsonFile(SITE_FILE, {}),
      photos: await readJsonFile(PHOTOS_FILE, []),
    });
  }

  if (pathname === '/api/site' && method === 'PUT') {
    const input = await readJson(req, 1024 * 1024);
    validateSite(input.site);
    validatePhotos(input.photos);
    await writeJsonFile(SITE_FILE, input.site);
    await writeJsonFile(PHOTOS_FILE, input.photos);
    return json(res, 200, { ok: true });
  }

  const dataMatch = pathname.match(/^\/api\/data\/(now|moments|friends)$/);
  if (dataMatch) {
    const name = dataMatch[1];
    const file = DATA_FILES[name];

    if (method === 'GET') {
      return json(res, 200, {
        name,
        data: await readJsonFile(file, name === 'now' ? {} : []),
      });
    }

    if (method === 'PUT') {
      const input = await readJson(req, 1024 * 1024);
      const data = input?.data;
      DATA_VALIDATORS[name](data);
      await writeJsonFile(file, data);
      return json(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/tags' && method === 'GET') {
    return json(res, 200, { tags: await collectTags() });
  }

  if (pathname === '/api/tags/rename' && method === 'POST') {
    const { from, to } = await readJson(req);
    const oldTag = String(from ?? '').trim();
    const newTag = String(to ?? '').trim().replace(/^#/, '').slice(0, 30);
    if (!oldTag || !newTag) return fail(res, 400, '标签名不能为空');
    if (newTag === oldTag) return json(res, 200, { ok: true, changed: 0 });

    let changed = 0;
    await mapAllPosts((data) => {
      if (!Array.isArray(data.tags) || !data.tags.includes(oldTag)) return false;
      const next = data.tags.map((tag) => (tag === oldTag ? newTag : tag));
      data.tags = [...new Set(next)];
      changed += 1;
      return true;
    });
    return json(res, 200, { ok: true, changed });
  }

  if (pathname === '/api/tags/delete' && method === 'POST') {
    const { tag } = await readJson(req);
    const target = String(tag ?? '').trim();
    if (!target) return fail(res, 400, '标签名不能为空');

    let changed = 0;
    await mapAllPosts((data) => {
      if (!Array.isArray(data.tags) || !data.tags.includes(target)) return false;
      data.tags = data.tags.filter((item) => item !== target);
      changed += 1;
      return true;
    });
    return json(res, 200, { ok: true, changed });
  }

  if (pathname === '/api/build' && method === 'POST') {
    const result = await runBuild();
    return json(res, result.ok ? 200 : 500, result);
  }

  return fail(res, 404, '接口不存在');
}

const server = http.createServer(async (req, res) => {
  try {
    if (!checkHost(req)) return fail(res, 403, '只允许本地访问');
    if (req.method !== 'GET' && req.method !== 'HEAD' && !checkOrigin(req)) {
      return fail(res, 403, '来源不合法');
    }

    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (
        url.pathname.startsWith('/uploads/') ||
        url.pathname.startsWith('/assets/') ||
        url.pathname === '/favicon.svg'
      ) {
        return await servePublic(res, url.pathname);
      }
      return await serveStatic(res, url.pathname);
    }

    return fail(res, 405, '不支持的请求');
  } catch (error) {
    const status = error.status ?? 500;
    if (status >= 500) console.error('[admin]', error);
    if (!res.headersSent) fail(res, status, error.message ?? '服务器错误');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  晚巷管理端  http://${HOST}:${PORT}`);
  console.log(`  站点预览    ${PREVIEW_URL}`);
  console.log('  按 Ctrl+C 退出\n');
  startPreview();
});

process.on('SIGINT', () => {
  stopPreview();
  process.exit(0);
});
process.on('exit', stopPreview);

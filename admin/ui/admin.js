/* 晚巷本地内容管理端 */

const viewEl = document.getElementById('view');
const crumbEl = document.getElementById('crumb');
const toastEl = document.getElementById('toast');
const connEl = document.getElementById('conn');
const dialog = document.getElementById('dialog');
const dialogTitle = document.getElementById('dialog-title');
const dialogBody = document.getElementById('dialog-body');
const fileInput = document.getElementById('file-input');
const multiFileInput = document.getElementById('multi-file-input');

const state = {
  previewUrl: 'http://localhost:4321/',
  posts: [],
  postFilters: { q: '', category: '', status: '' },
  site: null,
  photos: [],
  media: [],
  tags: [],
  dirty: false,
  currentHash: '',
};

let editorKeydown = null;

/* -------------------------------------------------------------------------- */
/* 工具                                                                        */
/* -------------------------------------------------------------------------- */

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

const formatDate = (value) => {
  const text = String(value ?? '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text || '—';
  return `${match[1]}.${match[2]}.${match[3]}`;
};

const today = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const defaultSlug = () => {
  const date = new Date();
  const stamp = `${today().replace(/-/g, '')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `post-${stamp}`;
};

const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

async function api(path, options = {}) {
  const init = { ...options };
  if (init.body && typeof init.body === 'object' && !(init.body instanceof File) && !(init.body instanceof Blob)) {
    init.body = JSON.stringify(init.body);
    init.headers = { 'content-type': 'application/json', ...(init.headers ?? {}) };
  }
  let response;
  try {
    response = await fetch(path, init);
    connEl.textContent = '已连接';
    connEl.classList.add('is-online');
    connEl.classList.remove('is-offline');
  } catch (error) {
    connEl.textContent = '连接断开';
    connEl.classList.add('is-offline');
    connEl.classList.remove('is-online');
    throw new Error('管理服务已断开，请确认 npm run admin 仍在运行');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', isError);
  toastEl.hidden = false;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, isError ? 5200 : 2600);
}

function showDialog(title, bodyHtml) {
  dialogTitle.textContent = title;
  dialogBody.innerHTML = bodyHtml;
  dialog.showModal();
}

document.getElementById('dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

function setCrumb(text) {
  crumbEl.textContent = text;
}

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === name);
  });
}

function loading() {
  viewEl.innerHTML = '<div class="loading">正在加载…</div>';
}

function renderError(error) {
  viewEl.innerHTML = `<div class="empty">加载失败：${esc(error.message)}</div>`;
}

function markDirty(value = true) {
  state.dirty = value;
  const status = document.getElementById('save-state');
  if (status) status.textContent = value ? '有未保存的修改' : '已保存';
}

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

/* -------------------------------------------------------------------------- */
/* 图片上传                                                                    */
/* -------------------------------------------------------------------------- */

let fileResolver = null;

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0] ?? null;
  fileInput.value = '';
  if (fileResolver) {
    const resolve = fileResolver;
    fileResolver = null;
    resolve(file);
  }
});

function pickImage() {
  return new Promise((resolve) => {
    fileResolver = resolve;
    fileInput.click();
  });
}

async function uploadImage(file, name) {
  const response = await fetch(
    `/api/upload?name=${encodeURIComponent(name || file.name)}`,
    {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '上传失败');
  return data;
}

async function pickAndUpload() {
  const file = await pickImage();
  if (!file) return null;
  const saved = await uploadImage(file);
  toast(`已上传 ${saved.name}`);
  return saved;
}

function insertAtCursor(textarea, before, after = '', placeholder = '') {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;
  textarea.setRangeText(`${before}${selected}${after}`, start, end, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  if (!selected) {
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + placeholder.length;
  }
}

/* -------------------------------------------------------------------------- */
/* Markdown 预览                                                               */
/* -------------------------------------------------------------------------- */

function inlineMarkdown(text) {
  let out = esc(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    '<img alt="$1" src="$2" loading="lazy">'
  );
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out;
}

function renderMarkdown(markdown) {
  const codeBlocks = [];
  const source = String(markdown ?? '').replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre><code>${esc(code)}</code></pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  const lines = source.split(/\r?\n/);
  let html = '';
  let list = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`;
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };

  for (const line of lines) {
    const code = line.match(/\u0000CODE(\d+)\u0000/);
    if (code) {
      flushParagraph();
      closeList();
      html += line.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeBlocks[Number(index)]);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html += '<hr>';
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    if (unordered) {
      flushParagraph();
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${inlineMarkdown(unordered[1])}</li>`;
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${inlineMarkdown(ordered[1])}</li>`;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html += `<blockquote>${inlineMarkdown(quote[1])}</blockquote>`;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  return html;
}

function previewDocument(html) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <style>
    body{margin:0;padding:2rem 2.2rem;background:#fffaf2;color:#3b2419;
      font-family:'Noto Serif SC','Songti SC','STSong',serif;font-size:15px;line-height:1.85;}
    h1,h2,h3,h4{font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;line-height:1.4;margin:1.6em 0 .6em;}
    h1{font-size:1.9rem}h2{font-size:1.45rem}h3{font-size:1.15rem}
    p{margin:0 0 1em}img{max-width:100%;height:auto;border-radius:8px}
    a{color:#c7542c}code{background:#f0e4d3;padding:.12em .35em;border-radius:4px;font-size:.9em}
    pre{background:#2b1a13;color:#f6e6d3;padding:1rem;border-radius:8px;overflow:auto}
    pre code{background:none;padding:0;color:inherit}
    blockquote{margin:1.2em 0;padding:.2em 0 .2em 1em;border-left:3px solid #e8b58d;color:#7a5a45}
    ul,ol{margin:0 0 1em;padding-left:1.4em}hr{border:0;border-top:1px solid #e6d6c2;margin:2em 0}
  </style></head><body>${html || '<p style="color:#b09a86">还没有正文。</p>'}</body></html>`;
}

/* -------------------------------------------------------------------------- */
/* 文章列表                                                                    */
/* -------------------------------------------------------------------------- */

async function viewPosts() {
  setNav('posts');
  setCrumb('文章');
  loading();
  const { posts } = await api('/api/posts');
  state.posts = posts;

  const draftCount = posts.filter((post) => post.draft).length;

  viewEl.innerHTML = `
    <div class="page-head">
      <div>
        <h1>文章</h1>
        <p>共 ${posts.length} 篇 · ${draftCount} 篇草稿 · 保存后网站会自动热更新</p>
      </div>
      <a class="btn primary" href="#/posts/new">＋ 新建文章</a>
    </div>
    <div class="toolbar">
      <input class="grow" type="text" id="post-search" placeholder="搜索标题、摘要或标签…" value="${esc(state.postFilters.q)}">
      <select id="filter-category">
        <option value="">全部分类</option>
        <option value="技术文章"${state.postFilters.category === '技术文章' ? ' selected' : ''}>技术文章</option>
        <option value="生活日常"${state.postFilters.category === '生活日常' ? ' selected' : ''}>生活日常</option>
      </select>
      <select id="filter-status">
        <option value="">全部状态</option>
        <option value="published"${state.postFilters.status === 'published' ? ' selected' : ''}>已发布</option>
        <option value="draft"${state.postFilters.status === 'draft' ? ' selected' : ''}>草稿</option>
      </select>
    </div>
    <div class="post-list" id="post-list"></div>
  `;

  const listEl = document.getElementById('post-list');

  const renderRows = () => {
    const { q, category, status } = state.postFilters;
    const keyword = q.trim().toLowerCase();
    const filtered = state.posts.filter((post) => {
      if (category && post.category !== category) return false;
      if (status === 'draft' && !post.draft) return false;
      if (status === 'published' && post.draft) return false;
      if (!keyword) return true;
      return [post.title, post.description, post.tags.join(' '), post.slug]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty">没有符合条件的文章。${keyword ? '换个关键词试试。' : '新建一篇吧。'}</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map(
        (post) => `
        <a class="post-row" href="#/posts/${encodeURIComponent(post.slug)}">
          <div class="post-row-main">
            <div class="post-row-top">
              <span class="chip ${post.category === '生活日常' ? 'life' : ''}">${esc(post.category)}</span>
              ${post.draft ? '<span class="chip draft">草稿</span>' : ''}
            </div>
            <h3>${esc(post.title || '未命名文章')}</h3>
            <p>${esc(post.description || '还没有摘要')}</p>
          </div>
          <div class="post-row-side">
            <time>${formatDate(post.pubDate)}</time>
            <span>${post.words} 字</span>
            ${
              post.tags.length
                ? `<span class="tag-line">${post.tags.slice(0, 3).map((tag) => `<span>#${esc(tag)}</span>`).join('')}</span>`
                : ''
            }
          </div>
        </a>`
      )
      .join('');
  };

  renderRows();

  document.getElementById('post-search').addEventListener('input', (event) => {
    state.postFilters.q = event.target.value;
    renderRows();
  });
  document.getElementById('filter-category').addEventListener('change', (event) => {
    state.postFilters.category = event.target.value;
    renderRows();
  });
  document.getElementById('filter-status').addEventListener('change', (event) => {
    state.postFilters.status = event.target.value;
    renderRows();
  });
}

/* -------------------------------------------------------------------------- */
/* 文章编辑                                                                    */
/* -------------------------------------------------------------------------- */

async function viewEditor(slug) {
  setNav('posts');
  const isNew = !slug || slug === 'new';
  setCrumb(isNew ? '新建文章' : '编辑文章');
  loading();

  let data;
  let body = '';

  if (isNew) {
    data = {
      title: '',
      description: '',
      category: '技术文章',
      pubDate: today(),
      updatedDate: '',
      tags: [],
      draft: true,
    };
    slug = defaultSlug();
  } else {
    const result = await api(`/api/posts/${encodeURIComponent(slug)}`);
    data = result.data;
    body = result.body;
  }

  const safeData = {
    title: data.title ?? '',
    description: data.description ?? '',
    category: data.category ?? '技术文章',
    pubDate: data.pubDate ?? today(),
    updatedDate: data.updatedDate ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    draft: data.draft === true,
  };

  viewEl.innerHTML = `
    <div class="editor-head">
      <a class="back-link" href="#/posts">← 返回文章列表</a>
      <span class="hint" id="save-state">${isNew ? '未保存的新文章' : '已保存'}</span>
    </div>

    <div class="editor-grid">
      <div>
        <textarea class="editor-title" id="f-title" rows="2" placeholder="写下标题…">${esc(safeData.title)}</textarea>
        <label class="field" style="margin-top:0.85rem">
          <span>摘要</span>
          <textarea id="f-description" rows="2" placeholder="一两句话说明这篇文章…">${esc(safeData.description)}</textarea>
        </label>

        <div class="md-wrap" id="md-wrap">
          <div class="md-toolbar">
            <button type="button" data-md="h2">H2</button>
            <button type="button" data-md="h3">H3</button>
            <button type="button" data-md="bold"><strong>B</strong></button>
            <button type="button" data-md="italic"><em>I</em></button>
            <button type="button" data-md="link">链接</button>
            <button type="button" data-md="quote">引用</button>
            <button type="button" data-md="list">列表</button>
            <button type="button" data-md="code">代码</button>
            <button type="button" data-md="image">插入图片</button>
            <span class="spacer"></span>
            <button type="button" id="preview-toggle">预览</button>
          </div>
          <textarea class="md-editor" id="f-body" spellcheck="false" placeholder="用 Markdown 写正文…">${esc(body)}</textarea>
          <iframe class="md-preview" id="md-preview" sandbox="allow-popups" title="正文预览"></iframe>
        </div>
      </div>

      <aside class="editor-side">
        <div class="panel panel-pad side-fields">
          <p class="panel-title">发布设置</p>
          <label class="field">
            <span>分类</span>
            <select id="f-category">
              <option value="技术文章"${safeData.category === '技术文章' ? ' selected' : ''}>技术文章</option>
              <option value="生活日常"${safeData.category === '生活日常' ? ' selected' : ''}>生活日常</option>
            </select>
          </label>
          <label class="field">
            <span>发布日期</span>
            <input type="date" id="f-pubdate" value="${esc(safeData.pubDate)}">
          </label>
          <label class="field">
            <span>更新日期（可选）</span>
            <input type="date" id="f-updated" value="${esc(safeData.updatedDate)}">
          </label>
          <label class="field">
            <span>标签（逗号分隔）</span>
            <input type="text" id="f-tags" value="${esc(safeData.tags.join(', '))}" placeholder="Astro, 前端, 日常">
          </label>
          <label class="check-row">
            <input type="checkbox" id="f-draft"${safeData.draft ? ' checked' : ''}>
            保存为草稿（不在网站显示）
          </label>
        </div>

        <div class="panel panel-pad side-fields">
          <p class="panel-title">URL</p>
          <label class="field">
            <span>地址别名</span>
            <input type="text" id="f-slug" value="${esc(slug)}" placeholder="my-post-slug">
          </label>
          <p class="hint">只能使用小写字母、数字和连字符，发布后就是 /blog/别名/。</p>
        </div>

        <div class="panel panel-pad side-fields">
          <div class="save-bar">
            <button class="btn primary" type="button" id="save-btn">保存</button>
          </div>
          <button class="btn ghost" type="button" id="view-btn">查看页面</button>
          <button class="btn danger" type="button" id="delete-btn">${isNew ? '放弃这篇' : '删除文章'}</button>
        </div>
      </aside>
    </div>
  `;

  const titleEl = document.getElementById('f-title');
  const descEl = document.getElementById('f-description');
  const bodyEl = document.getElementById('f-body');
  const slugEl = document.getElementById('f-slug');
  const categoryEl = document.getElementById('f-category');
  const pubDateEl = document.getElementById('f-pubdate');
  const updatedEl = document.getElementById('f-updated');
  const tagsEl = document.getElementById('f-tags');
  const draftEl = document.getElementById('f-draft');
  const previewEl = document.getElementById('md-preview');
  const mdWrap = document.getElementById('md-wrap');
  const toggleEl = document.getElementById('preview-toggle');

  let slugTouched = !isNew;
  let currentSlug = slug;

  const refreshPreview = () => {
    if (!mdWrap.classList.contains('is-previewing')) return;
    previewEl.srcdoc = previewDocument(renderMarkdown(bodyEl.value));
  };

  const markEdited = () => markDirty(true);
  [titleEl, descEl, bodyEl, slugEl, pubDateEl, updatedEl, tagsEl, categoryEl].forEach((el) => {
    el.addEventListener('input', markEdited);
    el.addEventListener('change', markEdited);
  });
  draftEl.addEventListener('change', markEdited);
  bodyEl.addEventListener('input', refreshPreview);

  slugEl.addEventListener('input', () => {
    slugTouched = true;
  });
  titleEl.addEventListener('input', () => {
    if (!isNew || slugTouched) return;
    const generated = slugify(titleEl.value);
    if (generated) slugEl.value = generated;
  });

  document.querySelectorAll('[data-md]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.md;
      if (action === 'h2') insertAtCursor(bodyEl, '## ', '', '小标题');
      else if (action === 'h3') insertAtCursor(bodyEl, '### ', '', '小标题');
      else if (action === 'bold') insertAtCursor(bodyEl, '**', '**', '加粗文字');
      else if (action === 'italic') insertAtCursor(bodyEl, '*', '*', '斜体文字');
      else if (action === 'link') insertAtCursor(bodyEl, '[', '](https://)', '链接文字');
      else if (action === 'quote') insertAtCursor(bodyEl, '> ', '', '引用内容');
      else if (action === 'list') insertAtCursor(bodyEl, '- ', '', '列表项');
      else if (action === 'code') insertAtCursor(bodyEl, '`', '`', '代码');
      else if (action === 'image') {
        try {
          const saved = await pickAndUpload();
          if (saved) insertAtCursor(bodyEl, `![`, `](${saved.url})`, saved.name.replace(/\.[^.]+$/, ''));
        } catch (error) {
          toast(error.message, true);
        }
      }
    });
  });

  toggleEl.addEventListener('click', () => {
    const previewing = mdWrap.classList.toggle('is-previewing');
    toggleEl.textContent = previewing ? '编辑' : '预览';
    if (previewing) refreshPreview();
  });

  const collect = () => ({
    title: titleEl.value.trim(),
    description: descEl.value.trim(),
    body: bodyEl.value,
    slug: slugEl.value.trim(),
    category: categoryEl.value,
    pubDate: pubDateEl.value,
    updatedDate: updatedEl.value,
    tags: tagsEl.value
      .split(/[,，\n]/)
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter(Boolean),
    draft: draftEl.checked,
  });

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    const saveButton = document.getElementById('save-btn');
    saveButton.disabled = true;
    saveButton.textContent = '保存中…';
    try {
      const payload = collect();
      const result = isNew
        ? await api('/api/posts', { method: 'POST', body: payload })
        : await api(`/api/posts/${encodeURIComponent(currentSlug)}`, {
            method: 'PUT',
            body: payload,
          });
      currentSlug = result.slug;
      slugTouched = true;
      markDirty(false);
      toast(isNew ? '文章已创建' : '文章已保存');
      state.dirty = false;
      if (isNew) {
        history.replaceState(null, '', `#/posts/${encodeURIComponent(currentSlug)}`);
        state.currentHash = location.hash;
        viewEditor(currentSlug);
        return;
      }
      document.getElementById('save-state').textContent = '已保存';
      document.getElementById('delete-btn').textContent = '删除文章';
    } catch (error) {
      toast(error.message, true);
    } finally {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = '保存';
    }
  };

  document.getElementById('save-btn').addEventListener('click', save);

  document.getElementById('view-btn').addEventListener('click', () => {
    const target = `${state.previewUrl}blog/${encodeURIComponent(currentSlug)}/`;
    if (draftEl.checked) {
      toast('草稿不会生成页面，取消勾选并保存后即可预览');
      return;
    }
    window.open(target, '_blank', 'noreferrer');
  });

  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (isNew) {
      state.dirty = false;
      location.hash = '#/posts';
      return;
    }
    if (!confirm(`确定删除《${titleEl.value || '未命名文章'}》吗？此操作不可撤销。`)) return;
    try {
      await api(`/api/posts/${encodeURIComponent(currentSlug)}`, { method: 'DELETE' });
      state.dirty = false;
      toast('文章已删除');
      location.hash = '#/posts';
    } catch (error) {
      toast(error.message, true);
    }
  });

  if (editorKeydown) document.removeEventListener('keydown', editorKeydown);
  editorKeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', editorKeydown);
}

/* -------------------------------------------------------------------------- */
/* 图片库                                                                      */
/* -------------------------------------------------------------------------- */

async function viewMedia() {
  setNav('media');
  setCrumb('图片');
  loading();

  const { media } = await api('/api/media');
  state.media = media;

  viewEl.innerHTML = `
    <div class="page-head">
      <div>
        <h1>图片</h1>
        <p>${media.length} 张图片 · 上传后会保存到 public/uploads，文章中可直接引用</p>
      </div>
      <button class="btn primary" type="button" id="upload-btn">＋ 上传图片</button>
    </div>

    <div class="drop-zone" id="drop-zone">
      <div>
        <strong>把图片拖到这里，或点击选择</strong>
        <span>支持 JPG / PNG / WebP / GIF / AVIF，单张最大 20MB</span>
      </div>
    </div>

    ${
      media.length
        ? `<div class="media-grid">${media
            .map(
              (item) => `
          <div class="media-card">
            <img class="media-thumb" src="${esc(item.url)}" alt="${esc(item.name)}" loading="lazy">
            <div class="media-info">
              <div class="media-name" title="${esc(item.name)}">${esc(item.name)}</div>
              <div class="media-actions">
                <button class="btn ghost" type="button" data-copy="${esc(item.url)}">复制地址</button>
                <button class="btn danger" type="button" data-delete="${esc(item.path)}">删除</button>
              </div>
            </div>
          </div>`
            )
            .join('')}</div>`
        : '<div class="empty">还没有上传图片。</div>'
    }
  `;

  const dropZone = document.getElementById('drop-zone');

  const uploadFiles = async (files) => {
    const list = [...files].filter((file) => file.type.startsWith('image/'));
    if (!list.length) return;
    let uploaded = 0;
    for (const file of list) {
      try {
        await uploadImage(file);
        uploaded += 1;
      } catch (error) {
        toast(`${file.name}：${error.message}`, true);
      }
    }
    if (uploaded) {
      toast(`已上传 ${uploaded} 张图片`);
      viewMedia();
    }
  };

  document.getElementById('upload-btn').addEventListener('click', () => multiFileInput.click());
  dropZone.addEventListener('click', () => multiFileInput.click());
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-over');
    uploadFiles(event.dataTransfer.files);
  });

  multiFileInput.onchange = () => {
    uploadFiles(multiFileInput.files);
    multiFileInput.value = '';
  };

  viewEl.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        toast(`已复制 ${button.dataset.copy}`);
      } catch {
        toast(button.dataset.copy, false);
      }
    });
  });

  viewEl.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('确定删除这张图片吗？正在使用它的文章会显示不出来。')) return;
      try {
        await api(`/api/media?path=${encodeURIComponent(button.dataset.delete)}`, {
          method: 'DELETE',
        });
        toast('图片已删除');
        viewMedia();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

/* -------------------------------------------------------------------------- */
/* 站点文案                                                                    */
/* -------------------------------------------------------------------------- */

const LABELS = {
  title: '标题',
  fullTitle: '完整标题',
  description: '描述',
  author: '作者',
  role: '身份',
  intro: '个人简介',
  location: '所在地',
  email: '邮箱',
  socials: '社交链接',
  home: '首页文案',
  eyebrow: '顶部小字',
  pretitle: '标题前缀',
  titleAccent: '标题强调字',
  titleEn: '英文副标题',
  lead: '引导语',
  introKicker: '问候语前缀',
  postcard: '手写明信片',
  stamp: '邮戳文字',
  quote: '引文',
  note: '附言',
  vertical: '竖排文字',
  quoteSource: '引文出处',
  scrollLabel: '滚动提示',
  about: '关于我',
  photo: '照片',
  src: '图片地址',
  alt: '图片描述',
  caption: '图注',
  texts: '正文段落',
  facts: '小档案',
  label: '名称',
  value: '内容',
  siteQuote: '站点引言',
  siteText: '站点说明',
  href: '链接地址',
  icon: '图标',
};

const LABEL_OVERRIDES = {
  'home.title': '主标题（前半）',
  'home.titleAccent': '主标题（强调字）',
  'about.title': '标题前缀',
  'about.titleAccent': '标题强调字',
  'home.lead': '引导语（每行一句）',
  'home.postcard.quote': '明信片引文（每行一句）',
  'home.postcard.note': '明信片附言（每行一句）',
  'home.quote': '首页引文（每行一句）',
  'about.texts': '正文段落（每行一段）',
};

const labelFor = (path, key) =>
  LABEL_OVERRIDES[path] ?? LABELS[key] ?? key;

function fieldLabel(path, key) {
  return `<span>${esc(labelFor(path, key))}</span>`;
}

function renderStringField(key, value, path) {
  const label = fieldLabel(path, key);

  if (key === 'icon') {
    return `<label class="field">${label}
      <select data-path="${esc(path)}">
        ${['github', 'instagram', 'mail']
          .map((icon) => `<option value="${icon}"${icon === value ? ' selected' : ''}>${icon}</option>`)
          .join('')}
      </select>
    </label>`;
  }

  if (key === 'src') {
    return `<label class="field">${label}
      <span class="src-row">
        <input type="text" data-path="${esc(path)}" value="${esc(value)}" placeholder="/uploads/...">
        <button class="upload-mini" type="button" data-upload-for="${esc(path)}">上传</button>
      </span>
    </label>`;
  }

  const long = String(value).length > 70 || String(value).includes('\n');
  if (long) {
    return `<label class="field">${label}
      <textarea data-path="${esc(path)}" rows="3">${esc(value)}</textarea>
    </label>`;
  }

  return `<label class="field">${label}
    <input type="${key === 'email' ? 'email' : 'text'}" data-path="${esc(path)}" value="${esc(value)}">
  </label>`;
}

function renderArrayOfStrings(key, value, path) {
  return `<label class="field">
    ${fieldLabel(path, key)}
    <textarea data-path="${esc(path)}" data-kind="strings" rows="${Math.min(8, Math.max(2, value.length + 1))}" placeholder="每行一条">${esc(value.join('\n'))}</textarea>
  </label>`;
}

function renderObjectFields(object, basePath) {
  return `<div class="nested-fields">
    ${Object.entries(object)
      .map(([key, value]) => renderValue(key, value, `${basePath}.${key}`))
      .join('')}
  </div>`;
}

function renderArrayOfObjects(key, value, path) {
  const template = value[0] && typeof value[0] === 'object' ? value[0] : {};
  return `<div class="nested">
    <div class="field-label">${esc(labelFor(path, key))}</div>
    <div class="repeat-list">
      ${value
        .map(
          (item, index) => `
        <div class="repeat-card">
          ${renderObjectFields(item, `${path}.${index}`)}
          <div class="repeat-actions">
            <button class="btn danger small" type="button" data-remove-item="${esc(path)}" data-index="${index}">移除</button>
          </div>
        </div>`
        )
        .join('')}
    </div>
    <button class="btn ghost small" type="button" data-add-item="${esc(path)}">＋ 添加</button>
  </div>`;
}

function renderValue(key, value, path) {
  if (typeof value === 'boolean') {
    return `<label class="check-row"><input type="checkbox" data-path="${esc(path)}"${value ? ' checked' : ''}> ${esc(labelFor(path, key))}</label>`;
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return renderArrayOfStrings(key, value, path);
    }
    return renderArrayOfObjects(key, value, path);
  }

  if (value && typeof value === 'object') {
    return `<div class="nested">
      <div class="field-label">${esc(labelFor(path, key))}</div>
      ${renderObjectFields(value, path)}
    </div>`;
  }

  return renderStringField(key, value, path);
}

function setByPath(object, path, value) {
  const parts = path.split('.');
  let cursor = object;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = parts[index + 1];
    if (cursor[part] === undefined || cursor[part] === null) {
      cursor[part] = /^\d+$/.test(next) ? [] : {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function sectionCard(key, title, subtitle, bodyHtml) {
  return `<section class="section-card" data-section="${key}">
    <div class="section-head" data-toggle>
      <div>
        <h2>${esc(title)}</h2>
        <div class="section-sub">${esc(subtitle)}</div>
      </div>
      <span class="section-sub">展开 / 收起</span>
    </div>
    <div class="section-body">${bodyHtml}</div>
  </section>`;
}

async function loadSiteData() {
  const result = await api('/api/site');
  state.site = result.site;
  state.photos = result.photos;
}

function renderSiteForm() {
  const site = state.site;
  const basics = ['title', 'fullTitle', 'description', 'author', 'role', 'intro', 'location', 'email'];

  viewEl.innerHTML = `
    <div class="page-head">
      <div>
        <h1>站点文案</h1>
        <p>修改全站的基础信息、首页文案和关于我页面</p>
      </div>
      <button class="btn primary" type="button" id="save-site">保存文案</button>
    </div>

    <form class="settings-sections" id="site-form">
      ${sectionCard(
        'basic',
        '基础信息',
        '站点名称、作者和联系方式',
        basics.map((key) => renderValue(key, site[key], key)).join('') +
          renderValue('socials', site.socials, 'socials')
      )}
      ${sectionCard(
        'home',
        '首页文案',
        '首屏标题、明信片和引文',
        Object.entries(site.home)
          .map(([key, value]) => renderValue(key, value, `home.${key}`))
          .join('')
      )}
      ${sectionCard(
        'about',
        '关于我',
        '关于页面的介绍、照片和小档案',
        Object.entries(site.about)
          .map(([key, value]) => renderValue(key, value, `about.${key}`))
          .join('')
      )}
    </form>

    <div class="toolbar" style="margin-top:1rem">
      <button class="btn primary" type="button" id="save-site-bottom">保存文案</button>
      <span class="hint" id="site-state">保存后网站会自动热更新</span>
    </div>
  `;

  const form = document.getElementById('site-form');

  const syncField = (input) => {
    const path = input.dataset.path;
    if (!path) return;
    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.dataset.kind === 'strings') {
      value = input.value.split('\n').map((line) => line.trim()).filter(Boolean);
    } else value = input.value;
    setByPath(state.site, path, value);
    markDirty(true);
    const siteState = document.getElementById('site-state');
    if (siteState) siteState.textContent = '有未保存的修改';
  };

  form.addEventListener('input', (event) => {
    if (event.target.matches('[data-path]')) syncField(event.target);
  });
  form.addEventListener('change', (event) => {
    if (event.target.matches('[data-path]')) syncField(event.target);
  });

  form.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const body = toggle.nextElementSibling;
      body?.classList.toggle('is-collapsed');
      return;
    }

    const addButton = event.target.closest('[data-add-item]');
    if (addButton) {
      const path = addButton.dataset.addItem;
      const array = getByPath(state.site, path) ?? [];
      const template = array[0] && typeof array[0] === 'object'
        ? Object.fromEntries(Object.keys(array[0]).map((key) => [key, '']))
        : {};
      if (path === 'socials') {
        Object.assign(template, { label: '新链接', href: 'https://', icon: 'github' });
      }
      array.push(template);
      setByPath(state.site, path, array);
      markDirty(true);
      renderSiteForm();
      return;
    }

    const removeButton = event.target.closest('[data-remove-item]');
    if (removeButton) {
      const path = removeButton.dataset.removeItem;
      const index = Number(removeButton.dataset.index);
      const array = getByPath(state.site, path) ?? [];
      array.splice(index, 1);
      setByPath(state.site, path, array);
      markDirty(true);
      renderSiteForm();
      return;
    }

    const uploadButton = event.target.closest('[data-upload-for]');
    if (uploadButton) {
      (async () => {
        try {
          const saved = await pickAndUpload();
          if (!saved) return;
          setByPath(state.site, uploadButton.dataset.uploadFor, saved.url);
          markDirty(true);
          renderSiteForm();
        } catch (error) {
          toast(error.message, true);
        }
      })();
    }
  });

  const save = async () => {
    try {
      await api('/api/site', { method: 'PUT', body: { site: state.site, photos: state.photos } });
      markDirty(false);
      const siteState = document.getElementById('site-state');
      if (siteState) siteState.textContent = '已保存';
      toast('站点文案已保存');
    } catch (error) {
      toast(error.message, true);
    }
  };

  document.getElementById('save-site').addEventListener('click', save);
  document.getElementById('save-site-bottom').addEventListener('click', save);
}

function getByPath(object, path) {
  return path.split('.').reduce((cursor, part) => (cursor == null ? undefined : cursor[part]), object);
}

async function viewSite() {
  setNav('site');
  setCrumb('站点文案');
  loading();
  await loadSiteData();
  renderSiteForm();
}

/* -------------------------------------------------------------------------- */
/* 相册                                                                        */
/* -------------------------------------------------------------------------- */

function renderPhotosForm() {
  const photos = state.photos;

  viewEl.innerHTML = `
    <div class="page-head">
      <div>
        <h1>相册</h1>
        <p>${photos.length} 张照片 · 首页与「生活日常」共用这份相册</p>
      </div>
      <div class="top-actions">
        <a class="btn ghost" href="${esc(state.previewUrl)}life/" target="_blank" rel="noreferrer">预览页面 ↗</a>
        <button class="btn ghost" type="button" id="add-photo">＋ 添加照片</button>
        <button class="btn primary" type="button" id="save-photos">保存相册</button>
      </div>
    </div>

    ${
      photos.length
        ? `<div class="photo-grid">${photos
            .map(
              (photo, index) => `
          <div class="photo-card" data-index="${index}">
            ${photo.src ? `<img src="${esc(photo.src)}" alt="${esc(photo.alt)}" loading="lazy">` : '<div class="media-thumb"></div>'}
            <div class="panel-pad">
              <label class="field">
                <span>图片</span>
                <span class="src-row">
                  <input type="text" data-photo="${index}" data-field="src" value="${esc(photo.src)}" placeholder="/uploads/...">
                  <button class="upload-mini" type="button" data-upload-photo="${index}">上传</button>
                </span>
              </label>
              <label class="field">
                <span>标题</span>
                <input type="text" data-photo="${index}" data-field="title" value="${esc(photo.title)}">
              </label>
              <label class="field">
                <span>图注</span>
                <input type="text" data-photo="${index}" data-field="note" value="${esc(photo.note)}">
              </label>
              <label class="field">
                <span>替代文字（无障碍）</span>
                <input type="text" data-photo="${index}" data-field="alt" value="${esc(photo.alt)}">
              </label>
              <div class="actions">
                <button class="btn ghost small" type="button" data-move="${index}" data-dir="-1"${index === 0 ? ' disabled' : ''}>↑ 上移</button>
                <button class="btn ghost small" type="button" data-move="${index}" data-dir="1"${index === photos.length - 1 ? ' disabled' : ''}>↓ 下移</button>
                <button class="btn danger small" type="button" data-remove-photo="${index}">删除</button>
              </div>
            </div>
          </div>`
            )
            .join('')}</div>`
        : '<div class="empty">相册还是空的，添加第一张照片吧。</div>'
    }

    <div class="toolbar" style="margin-top:1rem">
      <button class="btn primary" type="button" id="save-photos-bottom">保存相册</button>
      <span class="hint" id="photo-state">顺序会同步到首页和「生活日常」</span>
    </div>
  `;

  viewEl.oninput = (event) => {
    const target = event.target.closest('[data-photo]');
    if (!target) return;
    const index = Number(target.dataset.photo);
    const field = target.dataset.field;
    state.photos[index][field] = target.value;
    markDirty(true);
    const hint = document.getElementById('photo-state');
    if (hint) hint.textContent = '有未保存的修改';
  };

  viewEl.onclick = (event) => {
    const uploadButton = event.target.closest('[data-upload-photo]');
    if (uploadButton) {
      (async () => {
        try {
          const index = Number(uploadButton.dataset.uploadPhoto);
          const saved = await pickAndUpload();
          if (!saved) return;
          state.photos[index].src = saved.url;
          markDirty(true);
          renderPhotosForm();
        } catch (error) {
          toast(error.message, true);
        }
      })();
      return;
    }

    const moveButton = event.target.closest('[data-move]');
    if (moveButton) {
      const index = Number(moveButton.dataset.move);
      const direction = Number(moveButton.dataset.dir);
      const target = index + direction;
      if (target < 0 || target >= state.photos.length) return;
      [state.photos[index], state.photos[target]] = [state.photos[target], state.photos[index]];
      markDirty(true);
      renderPhotosForm();
      return;
    }

    const removeButton = event.target.closest('[data-remove-photo]');
    if (removeButton) {
      if (!confirm('确定从相册移除这张照片吗？图片文件不会被删除。')) return;
      state.photos.splice(Number(removeButton.dataset.removePhoto), 1);
      markDirty(true);
      renderPhotosForm();
      return;
    }

    if (event.target.closest('#add-photo')) {
      state.photos.push({ src: '', alt: '', title: '', note: '' });
      markDirty(true);
      renderPhotosForm();
      return;
    }

    if (event.target.closest('#save-photos') || event.target.closest('#save-photos-bottom')) {
      (async () => {
        try {
          await api('/api/site', { method: 'PUT', body: { site: state.site, photos: state.photos } });
          markDirty(false);
          const hint = document.getElementById('photo-state');
          if (hint) hint.textContent = '已保存';
          toast('相册已保存');
        } catch (error) {
          toast(error.message, true);
        }
      })();
    }
  };
}

async function viewPhotos() {
  setNav('photos');
  setCrumb('相册');
  loading();
  await loadSiteData();
  renderPhotosForm();
}

/* -------------------------------------------------------------------------- */
/* 标签                                                                        */
/* -------------------------------------------------------------------------- */

async function viewTags() {
  setNav('tags');
  setCrumb('标签');
  loading();
  const { tags } = await api('/api/tags');
  state.tags = tags;

  viewEl.innerHTML = `
    <div class="page-head">
      <div>
        <h1>标签</h1>
        <p>${tags.length} 个标签 · 重命名或删除会同步修改所有文章</p>
      </div>
    </div>
    ${
      tags.length
        ? `<div class="tag-table">${tags
            .map(
              (tag) => `
          <div class="tag-row">
            <span class="tag-name">#${esc(tag.name)}</span>
            <span class="tag-count">${tag.count} 篇</span>
            <input class="tag-edit" type="text" data-rename="${esc(tag.name)}" value="${esc(tag.name)}" aria-label="重命名 ${esc(tag.name)}">
            <div class="tag-actions">
              <button class="btn ghost small" type="button" data-save-tag="${esc(tag.name)}">重命名</button>
              <button class="btn danger small" type="button" data-delete-tag="${esc(tag.name)}">删除</button>
            </div>
          </div>`
            )
            .join('')}</div>`
        : '<div class="empty">还没有标签。写文章时用逗号分隔即可添加。</div>'
    }
  `;

  viewEl.querySelectorAll('[data-save-tag]').forEach((button) => {
    button.addEventListener('click', async () => {
      const from = button.dataset.saveTag;
      const input = viewEl.querySelector(`[data-rename="${CSS.escape(from)}"]`);
      const to = input?.value.trim();
      if (!to || to === from) return;
      try {
        const result = await api('/api/tags/rename', { method: 'POST', body: { from, to } });
        toast(`已重命名 ${result.changed} 篇文章的标签`);
        viewTags();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  viewEl.querySelectorAll('[data-delete-tag]').forEach((button) => {
    button.addEventListener('click', async () => {
      const tag = button.dataset.deleteTag;
      if (!confirm(`从所有文章中删除标签 #${tag} 吗？`)) return;
      try {
        const result = await api('/api/tags/delete', { method: 'POST', body: { tag } });
        toast(`已从 ${result.changed} 篇文章中移除`);
        viewTags();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

/* -------------------------------------------------------------------------- */
/* 路由                                                                        */
/* -------------------------------------------------------------------------- */

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [section, ...rest] = hash.split('/');

  if (editorKeydown) {
    document.removeEventListener('keydown', editorKeydown);
    editorKeydown = null;
  }
  viewEl.onclick = null;
  viewEl.oninput = null;

  state.currentHash = location.hash;

  try {
    if (section === 'posts' && rest[0]) {
      await viewEditor(decodeURIComponent(rest.join('/')));
    } else if (section === 'media') {
      await viewMedia();
    } else if (section === 'site') {
      await viewSite();
    } else if (section === 'photos') {
      await viewPhotos();
    } else if (section === 'tags') {
      await viewTags();
    } else {
      await viewPosts();
    }
  } catch (error) {
    renderError(error);
  }
}

window.addEventListener('hashchange', () => {
  if (state.dirty) {
    const leave = confirm('当前修改还没有保存，确定离开吗？');
    if (!leave) {
      history.replaceState(null, '', state.currentHash || '#/posts');
      return;
    }
  }
  state.dirty = false;
  document.querySelectorAll('[data-path], [data-photo]').forEach(() => {});
  route();
});

/* -------------------------------------------------------------------------- */
/* 全局操作                                                                    */
/* -------------------------------------------------------------------------- */

document.getElementById('refresh-btn').addEventListener('click', () => {
  state.dirty = false;
  route();
});

document.getElementById('build-btn').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!confirm('现在运行 npm run build 生成可部署的 dist 吗？')) return;
  button.disabled = true;
  button.textContent = '构建中…';
  try {
    const result = await api('/api/build', { method: 'POST' });
    if (result.ok) {
      toast('构建完成，dist 已更新');
    } else {
      showDialog('构建失败', `<pre>${esc(result.output || '没有输出')}</pre>`);
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = '构建站点';
  }
});

async function boot() {
  try {
    const status = await api('/api/status');
    state.previewUrl = status.previewUrl;
    document.getElementById('preview-link').href = status.previewUrl;
    connEl.textContent = '已连接';
    connEl.classList.add('is-online');
  } catch {
    connEl.textContent = '连接断开';
    connEl.classList.add('is-offline');
  }

  if (!location.hash) history.replaceState(null, '', '#/posts');
  await route();
}

boot();

# Giscus 评论与留言板配置

本站的文章评论和留言板都使用 [Giscus](https://giscus.app)。Giscus 把评论存在 GitHub Discussions 里，不需要自建数据库或后端，适合当前的纯静态 Astro 站点。

未配置时：

- 文章页不显示评论区
- `/guestbook/` 显示「留言板正在准备中」

配置完成后，文章底部和留言板会共用同一套评论系统。

---

## 一、开启 GitHub Discussions

1. 打开仓库：

   ```text
   https://github.com/rryryry2026/my-website/settings
   ```

2. 在 **Features** 区域勾选 **Discussions**。

## 二、安装 Giscus App

打开：

```text
https://github.com/apps/giscus
```

点击 **Install**，选择 **Only select repositories**，勾选 `rryryry2026/my-website`，完成安装。

## 三、创建评论分类

1. 打开仓库的 **Discussions** 标签页。
2. 点击分类旁的设置，创建一个分类，例如：
   - 名称：`Comments`
   - 描述：`文章评论与留言`
3. 也可以直接使用默认的 `Announcements`，但独立分类更方便管理。

## 四、在 giscus.app 获取两个 ID

打开：

```text
https://giscus.app/zh-CN
```

按下面填写：

| 选项 | 值 |
| --- | --- |
| 仓库 | `rryryry2026/my-website` |
| Discussion 分类 | 你在上一步创建的分类 |
| 页面与 discussion 的映射 | `pathname` |
| 主题 | `transparent_dark` |
| 语言 | `zh-CN` |

页面下方会生成一段 `<script>`，其中有两个关键值：

```html
data-repo-id="R_xxxxxxxx"
data-category-id="DIC_xxxxxxxx"
```

复制这两个值。

## 五、在管理端填写配置

```bash
npm run admin
```

打开 `http://127.0.0.1:4400` → **站点文案** → **评论与留言**：

| 字段 | 填什么 |
| --- | --- |
| 启用评论 | 勾选 |
| GitHub 仓库 | `rryryry2026/my-website` |
| Repository ID | `R_xxxxxxxx` |
| Discussion 分类名 | `Comments`（和 GitHub 里一致） |
| Category ID | `DIC_xxxxxxxx` |
| 映射方式 | `pathname` |
| Giscus 主题 | `transparent_dark` |
| 语言 | `zh-CN` |

点击 **保存文案**，然后发布：

```bash
npm run publish
```

部署完成后：

- 任意文章底部会出现评论区
- `/guestbook/` 会出现留言板
- 评论会出现在仓库的 **Discussions** 里，可以直接在 GitHub 审核或删除

## 六、注意事项

- **映射方式建议保持 `pathname`**。它用页面路径关联 discussion；如果你改了文章 slug，旧评论仍留在旧路径下，新页面会是一条新的 discussion。
- `repoId` 和 `categoryId` 是公开配置，不是密钥，会出现在页面 HTML 里，这是 Giscus 的正常设计。
- Giscus 依赖 `giscus.app` 和 GitHub。国内网络访问 GitHub 可能较慢，评论加载不出来时先在浏览器里测试 `https://giscus.app` 是否可达。
- 如果以后想去掉评论：管理端取消勾选「启用评论」，保存并发布即可。已产生的 Discussions 不会被删除。
- 如果 Giscus 长期不可用，可以换成 Waline、Twikoo 等评论系统；届时需要额外部署服务或使用它们的托管方案。

## 七、相关文件

- [`src/components/Comments.astro`](../src/components/Comments.astro)：评论组件
- [`src/pages/guestbook/index.astro`](../src/pages/guestbook/index.astro)：留言板页面
- [`src/data/site.json`](../src/data/site.json)：评论配置数据

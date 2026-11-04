import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** glob loader 的 id 可能带 .md 后缀，统一去掉，作为 URL slug */
export function getPostSlug(post: Post): string {
  return post.id.replace(/\.(md|mdx)$/i, '');
}

export function getPublishedPosts(posts: Post[]): Post[] {
  return posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function getPostsByCategory(posts: Post[], category: string): Post[] {
  return posts.filter((post) => post.data.category === category);
}

export function getPostsByTag(posts: Post[], tag: string): Post[] {
  return posts.filter((post) => post.data.tags.includes(tag));
}

export function getAllTags(posts: Post[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
}

export function tagHref(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}

export interface ArchiveMonth {
  month: number;
  posts: Post[];
}

export interface ArchiveYear {
  year: number;
  count: number;
  months: ArchiveMonth[];
}

export function getArchive(posts: Post[]): ArchiveYear[] {
  const years = new Map<number, Map<number, Post[]>>();

  for (const post of posts) {
    const year = post.data.pubDate.getUTCFullYear();
    const month = post.data.pubDate.getUTCMonth() + 1;
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(post);
  }

  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => {
      const monthList = [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, monthPosts]) => ({ month, posts: monthPosts }));
      return {
        year,
        count: monthList.reduce((total, item) => total + item.posts.length, 0),
        months: monthList,
      };
    });
}

/** 把 Markdown 粗略转成纯文本，用于搜索索引 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

/** 中文按 300 字/分钟，英文按 200 词/分钟估算 */
export function getReadingTime(markdown: string): number {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  const cjkCount = (plain.match(/[㐀-鿿]/g) ?? []).length;
  const latinWords = (plain
    .replace(/[㐀-鿿]/g, ' ')
    .match(/[A-Za-z0-9]+/g) ?? []).length;

  return Math.max(1, Math.round(cjkCount / 300 + latinWords / 200));
}

export function getYear(): number {
  return new Date().getFullYear();
}

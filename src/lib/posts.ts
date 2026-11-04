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

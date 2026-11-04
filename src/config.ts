/**
 * 站点资料与文案都放在 src/data/site.json，由本地管理端维护。
 * 这里只做类型整理和固定导航。
 */
import data from './data/site.json';

export type SocialIcon = 'github' | 'instagram' | 'mail';

export interface SiteSocial {
  label: string;
  href: string;
  icon: SocialIcon;
}

export const categories = [
  { label: '技术文章', slug: 'tech', href: '/tech/' },
  { label: '生活日常', slug: 'life', href: '/life/' },
] as const;

export type CategoryName = (typeof categories)[number]['label'];

export const site = {
  ...data,
  socials: data.socials as SiteSocial[],
  nav: [
    { label: '首页', href: '/' },
    ...categories.map((category) => ({ label: category.label, href: category.href })),
    { label: '关于我', href: '/about/' },
  ],
};

export function getCategoryMeta(category: string) {
  return categories.find((item) => item.label === category) ?? categories[1];
}

export function getCategoryHref(category: string): string {
  return getCategoryMeta(category).href;
}

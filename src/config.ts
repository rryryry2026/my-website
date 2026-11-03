/**
 * 全站资料都在这里改。
 * 社交链接目前是占位地址，换成你自己的即可。
 */
export const site = {
  title: '晚巷',
  fullTitle: '晚巷 · 我的郁金香小姐',
  description: '在黄昏与屋檐之间，收藏缓慢的句子、照片，以及一些不想忘记的日常。',
  author: '晚巷主人',
  role: '写字的人 · 黄昏收藏家',
  intro:
    '喜欢旧巷、晚霞和一切慢慢发生的事。这里没有宏大的叙事，只有一些被黄昏照亮的小日子。',
  location: '某座有晚霞的小城',
  email: 'hello@example.com',
  socials: [
    { label: 'GitHub', href: 'https://github.com/', icon: 'github' },
    { label: 'Instagram', href: 'https://www.instagram.com/', icon: 'instagram' },
    { label: '邮箱', href: 'mailto:hello@example.com', icon: 'mail' },
  ],
  nav: [
    { label: '首页', href: '/' },
    { label: '文章', href: '/blog/' },
    { label: '随笔 / 摄影', href: '/notes/' },
    { label: '关于我', href: '/about/' },
  ],
} as const;

export type SocialIcon = (typeof site.socials)[number]['icon'];

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPostSlug, getPublishedPosts, stripMarkdown } from '../lib/posts';
import { moments } from '../lib/data';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = getPublishedPosts(await getCollection('blog'));

  const items = [
    ...posts.map((post) => ({
      type: 'post',
      title: post.data.title,
      description: post.data.description,
      url: `/blog/${getPostSlug(post)}/`,
      category: post.data.category,
      tags: post.data.tags,
      date: post.data.pubDate.toISOString().slice(0, 10),
      text: stripMarkdown(post.body ?? '').slice(0, 1200),
    })),
    ...moments.map((moment) => ({
      type: 'moment',
      title: moment.text.slice(0, 48),
      description: [moment.mood, moment.location].filter(Boolean).join(' · '),
      url: '/moments/',
      category: '动态',
      tags: [],
      date: moment.date,
      text: moment.text,
    })),
  ];

  return new Response(JSON.stringify(items), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};

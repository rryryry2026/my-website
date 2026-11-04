import nowData from '../data/now.json';
import momentsData from '../data/moments.json';
import friendsData from '../data/friends.json';
import photosData from '../data/photos.json';

export interface NowData {
  updatedAt: string;
  focus: string;
  location: string;
  mood: string;
  reading: string;
  listening: string;
  note: string;
}

export interface Moment {
  id: string;
  date: string;
  text: string;
  mood: string;
  location: string;
  image: string;
}

export interface Friend {
  name: string;
  url: string;
  description: string;
  avatar: string;
}

export interface Photo {
  src: string;
  alt: string;
  title: string;
  note: string;
}

export const now = nowData as NowData;

export const moments = [...(momentsData as Moment[])].sort((a, b) =>
  b.date.localeCompare(a.date)
);

export const friends = friendsData as Friend[];

export const photos = photosData as Photo[];

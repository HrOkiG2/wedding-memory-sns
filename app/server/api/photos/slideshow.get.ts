// スライドショー用のモック写真データ
const SLIDESHOW_PHOTOS = [
  {
    photoId: 'slide-1',
    url: 'https://picsum.photos/seed/slide1/1920/1080',
    guestName: '田中太郎',
    likes: 15,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    photoId: 'slide-2',
    url: 'https://picsum.photos/seed/slide2/1920/1080',
    guestName: '山田花子',
    likes: 22,
    createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    photoId: 'slide-3',
    url: 'https://picsum.photos/seed/slide3/1920/1080',
    guestName: '新郎新婦',
    likes: 50,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    photoId: 'slide-4',
    url: 'https://picsum.photos/seed/slide4/1920/1080',
    guestName: '佐藤次郎',
    likes: 8,
    createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  {
    photoId: 'slide-5',
    url: 'https://picsum.photos/seed/slide5/1920/1080',
    guestName: '鈴木三郎',
    likes: 18,
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
];

export default defineEventHandler(async () => {
  // スライドショーは認証不要（会場のスクリーン用）
  // またはeventIdで絞り込む

  return {
    photos: SLIDESHOW_PHOTOS,
    interval: 5000, // 5秒間隔
  };
});
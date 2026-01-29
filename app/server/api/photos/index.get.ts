// ローカル開発用のモック写真データ
const MOCK_PHOTOS = [
  {
    photoId: 'photo-1',
    eventId: 'WEDDING_DEV',
    s3Key: 'photos/sample1.jpg',
    uploadedBy: 'TABLE_1',
    guestName: '田中太郎',
    likes: 5,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30分前
    url: 'https://picsum.photos/seed/wedding1/800/600',
  },
  {
    photoId: 'photo-2',
    eventId: 'WEDDING_DEV',
    s3Key: 'photos/sample2.jpg',
    uploadedBy: 'TABLE_2',
    guestName: '山田花子',
    likes: 12,
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1時間前
    url: 'https://picsum.photos/seed/wedding2/800/600',
  },
  {
    photoId: 'photo-3',
    eventId: 'WEDDING_DEV',
    s3Key: 'photos/sample3.jpg',
    uploadedBy: 'TABLE_1',
    guestName: '田中太郎',
    likes: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(), // 1.5時間前
    url: 'https://picsum.photos/seed/wedding3/600/800',
  },
  {
    photoId: 'photo-4',
    eventId: 'WEDDING_DEV',
    s3Key: 'photos/sample4.jpg',
    uploadedBy: 'ADMIN',
    guestName: '新郎新婦',
    likes: 25,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2時間前
    url: 'https://picsum.photos/seed/wedding4/800/600',
  },
];

export default defineEventHandler(async (event) => {
  // 認証チェック（ローカルでは簡易的に）
  const authHeader = getHeader(event, 'authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  // クエリパラメータ
  const query = getQuery(event);
  const limit = parseInt(query.limit as string) || 20;
  const cursor = query.cursor as string | undefined;

  // カーソルベースのページネーション（モック）
  let photos = [...MOCK_PHOTOS];
  if (cursor) {
    const cursorIndex = photos.findIndex((p) => p.photoId === cursor);
    if (cursorIndex !== -1) {
      photos = photos.slice(cursorIndex + 1);
    }
  }
  photos = photos.slice(0, limit);

  const nextCursor = photos.length === limit ? photos[photos.length - 1]?.photoId : undefined;

  return {
    photos,
    nextCursor,
    total: MOCK_PHOTOS.length,
  };
});
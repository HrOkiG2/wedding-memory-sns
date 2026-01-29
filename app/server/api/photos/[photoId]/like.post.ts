// いいねのカウントをメモリに保存
const likeStorage: Map<string, number> = new Map();

export default defineEventHandler(async (event) => {
  // 認証チェック
  const authHeader = getHeader(event, 'authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const photoId = getRouterParam(event, 'photoId');
  if (!photoId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Photo ID is required',
    });
  }

  // いいねをインクリメント
  const currentLikes = likeStorage.get(photoId) || 0;
  const newLikes = currentLikes + 1;
  likeStorage.set(photoId, newLikes);

  return {
    success: true,
    likes: newLikes,
  };
});
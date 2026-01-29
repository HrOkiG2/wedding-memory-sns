import { randomUUID } from 'crypto';

// メモリ内にモック写真を保存
const photoStorage: Map<string, object> = new Map();

export default defineEventHandler(async (event) => {
  // 認証チェック
  const authHeader = getHeader(event, 'authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = await readBody(event);
  const { s3Key, eventId } = body;

  if (!s3Key || !eventId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields',
    });
  }

  const photoId = randomUUID();
  const now = new Date().toISOString();

  const photo = {
    photoId,
    eventId,
    s3Key,
    uploadedBy: 'TABLE_1', // JWTからデコードするべきだが、モックなので固定
    guestName: 'テストユーザー',
    likes: 0,
    createdAt: now,
  };

  photoStorage.set(photoId, photo);

  return {
    success: true,
    photo,
  };
});
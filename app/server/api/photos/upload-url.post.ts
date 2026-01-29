import { randomUUID } from 'crypto';

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
  const { mimeType, fileName } = body;
  const contentType = mimeType;

  if (!contentType || !fileName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields',
    });
  }

  // ローカル開発用：実際のS3 URLの代わりにモックURLを返す
  const photoId = randomUUID();
  const s3Key = `photos/${photoId}/${fileName}`;

  // ローカルではファイルアップロードをシミュレート
  // 実際にはアップロードをスキップして、プレースホルダー画像を使用
  return {
    uploadUrl: '/api/photos/upload-mock', // ローカルモックエンドポイント
    s3Key,
    photoId,
    // ローカル開発ではこのフラグでクライアント側の処理を変える
    isMock: true,
  };
});
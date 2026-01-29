import { SignJWT } from 'jose';

// ローカル開発用のモックデータ
const MOCK_GUESTS: Record<string, { guestName: string; tableId: string; eventId: string }> = {
  // テスト用トークン
  'dev-table-1': { guestName: '田中太郎', tableId: 'TABLE_1', eventId: 'WEDDING_DEV' },
  'dev-table-2': { guestName: '山田花子', tableId: 'TABLE_2', eventId: 'WEDDING_DEV' },
  'dev-admin': { guestName: '新郎新婦', tableId: 'ADMIN', eventId: 'WEDDING_DEV' },
};

// ローカル開発用のJWTシークレット
const JWT_SECRET = new TextEncoder().encode('local-dev-secret-key-minimum-32-chars');

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body;

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token is required',
    });
  }

  // モックデータから検索
  const guest = MOCK_GUESTS[token];
  if (!guest) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid token',
      data: { message: '無効なトークンです' },
    });
  }

  // JWT生成
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    guestName: guest.guestName,
    tableId: guest.tableId,
    eventId: guest.eventId,
    role: guest.tableId === 'ADMIN' ? 'ADMIN' : 'GUEST',
    iat: now,
    exp: now + 24 * 60 * 60, // 24時間
  };

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(JWT_SECRET);

  return {
    token: jwt,
    expiresIn: 86400,
  };
});

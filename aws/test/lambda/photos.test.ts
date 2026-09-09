import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner');

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

// joseは純ESMパッケージであり、aws/tsconfig.json(NodeNext)からの通常import・型importの
// どちらも型エラーになる（実行時もJestの自動モックが実体の読み込みに失敗する）ため、
// 一切importせずモック関数を直接jest.mockのファクトリに注入する。
const mockedJwtVerify = jest.fn<Promise<{ payload: JwtPayloadFixture }>, [string, Uint8Array]>();
jest.mock('jose', () => ({ jwtVerify: mockedJwtVerify }));

const PHOTOS_TABLE = 'test-photos-table';
const PENDING_UPLOADS_TABLE = 'test-pending-uploads-table';
const PHOTO_BUCKET = 'test-photo-bucket';

type LambdaResult = { statusCode: number; headers?: Record<string, string>; body: string };

interface JwtPayloadFixture {
  sub: string;
  tableId: string;
  role: 'GUEST' | 'ADMIN';
}

function buildEvent(options: {
  routeKey: string;
  authorization?: string;
  body?: unknown;
  queryStringParameters?: Record<string, string>;
}): APIGatewayProxyEventV2 {
  return {
    headers: options.authorization ? { authorization: options.authorization } : {},
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    queryStringParameters: options.queryStringParameters,
    requestContext: {
      routeKey: options.routeKey,
      http: { sourceIp: '203.0.113.10' },
    },
    // このLambdaが実際に読むフィールドのみを用意した最小限のフィクスチャ
  } as unknown as APIGatewayProxyEventV2;
}

function asResult(result: APIGatewayProxyResultV2): LambdaResult {
  return result as LambdaResult;
}

function parseBody<T>(result: APIGatewayProxyResultV2): T {
  return JSON.parse(asResult(result).body) as T;
}

const GUEST_TOKEN = 'guest.jwt.token';
const GUEST_PAYLOAD: JwtPayloadFixture = { sub: 'authtoken-1', tableId: 'TABLE_1', role: 'GUEST' };
const ADMIN_TOKEN = 'admin.jwt.token';
const ADMIN_PAYLOAD: JwtPayloadFixture = { sub: 'authtoken-admin', tableId: 'ADMIN', role: 'ADMIN' };

describe('photos lambda handler', () => {
  let handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;
  const mockDynamo = mockClient(DynamoDBDocumentClient);
  const mockSecrets = mockClient(SecretsManagerClient);

  beforeAll(() => {
    // Lambdaモジュールはトップレベルでprocess.envを読むため、importより前に設定する必要がある。
    // importのhoistingを避けるため、意図的にrequireを使う。
    process.env.PHOTOS_TABLE = PHOTOS_TABLE;
    process.env.PENDING_UPLOADS_TABLE = PENDING_UPLOADS_TABLE;
    process.env.PHOTO_BUCKET = PHOTO_BUCKET;
    process.env.JWT_SECRET_ARN =
      'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:test-abc';
    process.env.EVENT_ID = 'TEST_EVENT';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ handler } = require('../../lambda/photos'));
  });

  beforeEach(() => {
    mockDynamo.reset();
    mockSecrets.reset();
    mockedGetSignedUrl.mockReset();
    mockedJwtVerify.mockReset();

    mockSecrets.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({ key: 'unit-test-secret-key' }),
    });
    mockedGetSignedUrl.mockResolvedValue('https://presigned.example.com/mock');
  });

  function authorizeAs(payload: JwtPayloadFixture): void {
    mockedJwtVerify.mockResolvedValue({ payload });
  }

  describe('authorization', () => {
    it('should return 401 when the Authorization header is missing', async () => {
      // Arrange
      const event = buildEvent({ routeKey: 'GET /photos' });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({ error: 'UNAUTHORIZED' });
    });

    it('should return 401 when the token fails verification', async () => {
      // Arrange
      mockedJwtVerify.mockRejectedValue(new Error('bad signature'));
      const event = buildEvent({ routeKey: 'GET /photos', authorization: 'Bearer invalid-token' });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({ error: 'INVALID_TOKEN' });
    });
  });

  describe('GET /photos', () => {
    it('should default to limit=20 and return photos with a relative CDN url', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({
        Items: [
          {
            eventId: 'TEST_EVENT',
            createdAt: '2026-01-01T00:00:02.000Z',
            photoId: 'p2',
            tableId: 'TABLE_1',
            s3Key: 'photos/TABLE_1/b.jpg',
            isVisible: true,
            likes: 0,
          },
        ],
      });
      const event = buildEvent({ routeKey: 'GET /photos', authorization: `Bearer ${GUEST_TOKEN}` });

      // Act
      const result = asResult(await handler(event));
      const body = JSON.parse(result.body) as { photos: Array<{ url: string }>; nextToken?: string };

      // Assert
      expect(result.statusCode).toBe(200);
      expect(body.photos[0].url).toBe('/photos/TABLE_1/b.jpg');
      expect(body.nextToken).toBeUndefined();

      const queryInput = mockDynamo.commandCalls(QueryCommand)[0].args[0].input;
      expect(queryInput.Limit).toBe(20);
      expect(queryInput.KeyConditionExpression).toBe('eventId = :eventId');
    });

    it('should clamp an out-of-range limit to the maximum of 50', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({ Items: [] });
      const event = buildEvent({
        routeKey: 'GET /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        queryStringParameters: { limit: '999' },
      });

      // Act
      await handler(event);

      // Assert
      const queryInput = mockDynamo.commandCalls(QueryCommand)[0].args[0].input;
      expect(queryInput.Limit).toBe(50);
    });

    it('should query strictly older photos using nextToken as the createdAt cursor', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({ Items: [] });
      const event = buildEvent({
        routeKey: 'GET /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        queryStringParameters: { nextToken: '2026-01-01T00:00:01.000Z' },
      });

      // Act
      await handler(event);

      // Assert
      const queryInput = mockDynamo.commandCalls(QueryCommand)[0].args[0].input;
      expect(queryInput.KeyConditionExpression).toBe('eventId = :eventId AND createdAt < :before');
      expect(queryInput.ExpressionAttributeValues?.[':before']).toBe('2026-01-01T00:00:01.000Z');
    });

    it('should return nextToken from LastEvaluatedKey when more pages remain', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({
        Items: [
          {
            eventId: 'TEST_EVENT',
            createdAt: '2026-01-01T00:00:01.000Z',
            photoId: 'p1',
            tableId: 'TABLE_1',
            s3Key: 'photos/TABLE_1/a.jpg',
            isVisible: true,
            likes: 0,
          },
        ],
        LastEvaluatedKey: { eventId: 'TEST_EVENT', createdAt: '2026-01-01T00:00:01.000Z' },
      });
      const event = buildEvent({ routeKey: 'GET /photos', authorization: `Bearer ${GUEST_TOKEN}` });

      // Act
      const body = parseBody<{ nextToken?: string }>(await handler(event));

      // Assert
      expect(body.nextToken).toBe('2026-01-01T00:00:01.000Z');
    });

    it('should omit nextToken when there is no further page', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({ Items: [] });
      const event = buildEvent({ routeKey: 'GET /photos', authorization: `Bearer ${GUEST_TOKEN}` });

      // Act
      const body = parseBody<{ nextToken?: string }>(await handler(event));

      // Assert
      expect(body.nextToken).toBeUndefined();
    });
  });

  describe('GET /photos/slideshow', () => {
    it('should query the full history up to the 5-minute cutoff when since is not given', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({ Items: [] });
      const event = buildEvent({
        routeKey: 'GET /photos/slideshow',
        authorization: `Bearer ${GUEST_TOKEN}`,
      });

      // Act
      await handler(event);

      // Assert
      const queryInput = mockDynamo.commandCalls(QueryCommand)[0].args[0].input;
      expect(queryInput.KeyConditionExpression).toBe('eventId = :eventId AND createdAt <= :time');
    });

    it('should query BETWEEN since and the cutoff when since is given', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({ Items: [] });
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1時間前
      const event = buildEvent({
        routeKey: 'GET /photos/slideshow',
        authorization: `Bearer ${GUEST_TOKEN}`,
        queryStringParameters: { since },
      });

      // Act
      await handler(event);

      // Assert
      const queryInput = mockDynamo.commandCalls(QueryCommand)[0].args[0].input;
      expect(queryInput.KeyConditionExpression).toBe(
        'eventId = :eventId AND createdAt BETWEEN :since AND :time',
      );
      expect(queryInput.ExpressionAttributeValues?.[':since']).toBe(since);
    });

    it('should skip querying DynamoDB and return an empty list when since is already past the cutoff', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      const since = new Date(Date.now() + 60 * 1000).toISOString(); // 未来（5分前カットオフより後）
      const event = buildEvent({
        routeKey: 'GET /photos/slideshow',
        authorization: `Bearer ${GUEST_TOKEN}`,
        queryStringParameters: { since },
      });

      // Act
      const body = parseBody<{ photos: unknown[] }>(await handler(event));

      // Assert
      expect(body.photos).toEqual([]);
      expect(mockDynamo.commandCalls(QueryCommand)).toHaveLength(0);
    });
  });

  describe('POST /photos/upload-url', () => {
    it('should reject non-jpeg mime types', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      const event = buildEvent({
        routeKey: 'POST /photos/upload-url',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { mimeType: 'image/png' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'INVALID_MIME_TYPE' });
    });

    it("should issue a presigned URL scoped to the caller's tableId and record a pending upload", async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(PutCommand).resolves({});
      const event = buildEvent({
        routeKey: 'POST /photos/upload-url',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { mimeType: 'image/jpeg' },
      });

      // Act
      const body = parseBody<{ uploadUrl: string; s3Key: string }>(await handler(event));

      // Assert
      expect(body.uploadUrl).toBe('https://presigned.example.com/mock');
      expect(body.s3Key.startsWith(`photos/${GUEST_PAYLOAD.tableId}/`)).toBe(true);

      const putInput = mockDynamo.commandCalls(PutCommand)[0].args[0].input;
      expect(putInput.TableName).toBe(PENDING_UPLOADS_TABLE);
      expect(putInput.Item).toMatchObject({
        s3Key: body.s3Key,
        tableId: GUEST_PAYLOAD.tableId,
        used: false,
      });
    });
  });

  describe('POST /photos (registration)', () => {
    const s3Key = 'photos/TABLE_1/2026-01-01T00-00-00-000Z_abcd1234.jpg';

    it('should return 400 when s3Key is missing', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      const event = buildEvent({
        routeKey: 'POST /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { mimeType: 'image/jpeg' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ error: 'MISSING_S3_KEY' });
    });

    it('should return 403 when there is no pending upload record for the s3Key', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(GetCommand).resolves({ Item: undefined });
      const event = buildEvent({
        routeKey: 'POST /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { s3Key, mimeType: 'image/jpeg' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ error: 'INVALID_S3_KEY' });
    });

    it('should return 403 when the pending upload belongs to a different tableId', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD); // TABLE_1としてログイン
      mockDynamo.on(GetCommand).resolves({ Item: { s3Key, tableId: 'TABLE_2', used: false } });
      const event = buildEvent({
        routeKey: 'POST /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { s3Key, mimeType: 'image/jpeg' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toEqual({ error: 'INVALID_S3_KEY' });
    });

    it('should return 409 when the s3Key was already registered (re-registration / moderation bypass attempt)', async () => {
      // Arrange: 過去に一度使用済み(used=true)のためConditionExpressionが失敗するケースを再現
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(GetCommand).resolves({ Item: { s3Key, tableId: 'TABLE_1', used: false } });
      mockDynamo
        .on(UpdateCommand)
        .rejects(
          new ConditionalCheckFailedException({ message: 'conditional check failed', $metadata: {} }),
        );
      const event = buildEvent({
        routeKey: 'POST /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { s3Key, mimeType: 'image/jpeg' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body)).toEqual({ error: 'ALREADY_REGISTERED' });
      // 写真アイテムが作られていない（削除済み写真が復活しない）ことも確認する
      expect(mockDynamo.commandCalls(PutCommand)).toHaveLength(0);
    });

    it('should create the photo and mark the pending upload as used on success', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(GetCommand).resolves({ Item: { s3Key, tableId: 'TABLE_1', used: false } });
      mockDynamo.on(UpdateCommand).resolves({});
      mockDynamo.on(PutCommand).resolves({});
      const event = buildEvent({
        routeKey: 'POST /photos',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { s3Key, mimeType: 'image/jpeg' },
      });

      // Act
      const result = asResult(await handler(event));
      const body = JSON.parse(result.body) as { tableId: string; url: string };

      // Assert
      expect(result.statusCode).toBe(201);
      expect(body.tableId).toBe('TABLE_1');
      expect(body.url).toBe(`/${s3Key}`);

      const updateInput = mockDynamo.commandCalls(UpdateCommand)[0].args[0].input;
      expect(updateInput.TableName).toBe(PENDING_UPLOADS_TABLE);
      expect(updateInput.ConditionExpression).toContain('used = :false');

      const putInput = mockDynamo.commandCalls(PutCommand)[0].args[0].input;
      expect(putInput.TableName).toBe(PHOTOS_TABLE);
      expect(putInput.Item).toMatchObject({ s3Key, tableId: 'TABLE_1', isVisible: true, likes: 0 });
    });
  });

  describe('DELETE /photos/{photoId}', () => {
    it('should return 404 when the photo cannot be found', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(QueryCommand).resolves({ Items: [] });
      const event = buildEvent({
        routeKey: 'DELETE /photos/{photoId}',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { createdAt: '2026-01-01T00:00:00.000Z' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(404);
    });

    it("should return 403 when a GUEST tries to delete another table's photo", async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD); // TABLE_1
      mockDynamo
        .on(QueryCommand)
        .resolves({ Items: [{ tableId: 'TABLE_2', createdAt: '2026-01-01T00:00:00.000Z' }] });
      const event = buildEvent({
        routeKey: 'DELETE /photos/{photoId}',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { createdAt: '2026-01-01T00:00:00.000Z' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(403);
      expect(mockDynamo.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('should allow the owner to soft-delete their own photo', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD); // TABLE_1
      mockDynamo
        .on(QueryCommand)
        .resolves({ Items: [{ tableId: 'TABLE_1', createdAt: '2026-01-01T00:00:00.000Z' }] });
      mockDynamo.on(UpdateCommand).resolves({});
      const event = buildEvent({
        routeKey: 'DELETE /photos/{photoId}',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { createdAt: '2026-01-01T00:00:00.000Z' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(200);
      const updateInput = mockDynamo.commandCalls(UpdateCommand)[0].args[0].input;
      expect(updateInput.ExpressionAttributeValues).toEqual({ ':visible': false });
    });

    it("should allow an ADMIN to delete any table's photo", async () => {
      // Arrange
      authorizeAs(ADMIN_PAYLOAD);
      mockDynamo
        .on(QueryCommand)
        .resolves({ Items: [{ tableId: 'TABLE_1', createdAt: '2026-01-01T00:00:00.000Z' }] });
      mockDynamo.on(UpdateCommand).resolves({});
      const event = buildEvent({
        routeKey: 'DELETE /photos/{photoId}',
        authorization: `Bearer ${ADMIN_TOKEN}`,
        body: { createdAt: '2026-01-01T00:00:00.000Z' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(200);
    });
  });

  describe('POST /photos/{photoId}/like', () => {
    it('should increment the like counter and return success', async () => {
      // Arrange
      authorizeAs(GUEST_PAYLOAD);
      mockDynamo.on(UpdateCommand).resolves({});
      const event = buildEvent({
        routeKey: 'POST /photos/{photoId}/like',
        authorization: `Bearer ${GUEST_TOKEN}`,
        body: { createdAt: '2026-01-01T00:00:00.000Z' },
      });

      // Act
      const result = asResult(await handler(event));

      // Assert
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ success: true });
      const updateInput = mockDynamo.commandCalls(UpdateCommand)[0].args[0].input;
      expect(updateInput.UpdateExpression).toBe('SET likes = likes + :inc');
    });
  });
});

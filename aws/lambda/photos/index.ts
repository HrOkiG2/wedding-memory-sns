import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { jwtVerify } from "jose";
import { randomUUID } from "crypto";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const secretsClient = new SecretsManagerClient({});

const PHOTOS_TABLE = process.env.PHOTOS_TABLE!;
const PENDING_UPLOADS_TABLE = process.env.PENDING_UPLOADS_TABLE!;
const PHOTO_BUCKET = process.env.PHOTO_BUCKET!;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const EVENT_ID = process.env.EVENT_ID || "WEDDING_DEV";

// upload-urlで発行してからPOST /photosで登録されるまでの猶予（秒）
const PENDING_UPLOAD_TTL_SECONDS = 10 * 60;

// アップロード後の写真は不変（上書きされない）ため、CloudFront/ブラウザで長期キャッシュさせる。
// 署名付きPUT URL生成時に指定し、クライアント側のPUTリクエストヘッダーも同じ値にする必要がある
// （SigV4署名の対象に含まれるため）。
const PHOTO_CACHE_CONTROL = "public, max-age=31536000, immutable";

// 写真配信用CloudFrontビヘイビア（/photos/*）経由の相対パスを組み立てる。
// s3Keyは常に "photos/..." で始まるため、そのまま "/" を付けるだけでよい。
function toPhotoUrl(s3Key: string): string {
  return `/${s3Key}`;
}

let cachedJwtSecret: string | null = null;

async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) return cachedJwtSecret;

  const command = new GetSecretValueCommand({ SecretId: JWT_SECRET_ARN });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString!);
  cachedJwtSecret = secret.key;
  return cachedJwtSecret!;
}

interface JwtPayload {
  sub: string;
  tableId: string;
  role: "GUEST" | "ADMIN";
}

async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const jwtSecret = await getJwtSecret();
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

function getAuthToken(event: APIGatewayProxyEventV2): string | null {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

// 共通ヘッダー定義
const HEADERS = {
  "Content-Type": "application/json",
};

// GET /photos/slideshow - Photos with 5min delay（差分取得対応）
// 招待客以外に写真が見えてしまうため、他のAPI同様に認証必須（呼び出し元でJWT検証済み）
// ?since=<前回ポーリングで見た最新のcreatedAt> を付けると、それ以降に
// 追加された写真だけを返す。スライドショーは30秒間隔でポーリングするため、
// 毎回全件を返すと写真が増えるほど転送量が増えてしまう問題を解消する。
async function handleSlideshow(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const queryParams = event.queryStringParameters || {};
  const since = queryParams.since;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // sinceが既に5分前カットオフ以降の場合、新着はまだ表示解禁前なので問い合わせ不要
  if (since && since >= fiveMinutesAgo) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ photos: [] }),
    };
  }

  const keyConditionExpression = since
    ? "eventId = :eventId AND createdAt BETWEEN :since AND :time"
    : "eventId = :eventId AND createdAt <= :time";
  const values: Record<string, unknown> = {
    ":eventId": EVENT_ID,
    ":time": fiveMinutesAgo,
    ":visible": true,
  };
  if (since) {
    values[":since"] = since;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: PHOTOS_TABLE,
      KeyConditionExpression: keyConditionExpression,
      FilterExpression: "isVisible = :visible",
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
    }),
  );

  const photos = (result.Items || []).map((item) => ({
    ...item,
    url: toPhotoUrl(item.s3Key),
  }));

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ photos }),
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  // Remove /api prefix from routeKey if present (e.g., "POST /api/photos" -> "POST /photos")
  const rawRouteKey = event.requestContext.routeKey;
  const routeKey = rawRouteKey.replace(" /api/", " /");
  const token = getAuthToken(event);

  if (!token) {
    return {
      statusCode: 401,
      headers: HEADERS, // ★追加
      body: JSON.stringify({ error: "UNAUTHORIZED" }),
    };
  }

  const user = await verifyJwt(token);
  if (!user) {
    return {
      statusCode: 401,
      headers: HEADERS, // ★追加
      body: JSON.stringify({ error: "INVALID_TOKEN" }),
    };
  }

  try {
    // GET /photos - List photos（ページネーション対応）
    // ?limit=20&nextToken=<前ページ末尾のcreatedAt> で古い写真を追加取得する。
    // limitを指定しない・全件取得しない設計にすることで、写真が増えても
    // 1回のレスポンスサイズを一定に保つ（DynamoDBの1クエリ1MB制限の回避にもなる）。
    if (routeKey === "GET /photos") {
      const queryParams = event.queryStringParameters || {};
      const limit = Math.min(
        Math.max(parseInt(queryParams.limit || "20", 10) || 20, 1),
        50,
      );
      const nextToken = queryParams.nextToken;

      const keyConditionParts = ["eventId = :eventId"];
      const values: Record<string, unknown> = {
        ":eventId": EVENT_ID,
        ":visible": true,
      };
      if (nextToken) {
        keyConditionParts.push("createdAt < :before");
        values[":before"] = nextToken;
      }

      const result = await docClient.send(
        new QueryCommand({
          TableName: PHOTOS_TABLE,
          KeyConditionExpression: keyConditionParts.join(" AND "),
          FilterExpression: "isVisible = :visible",
          ExpressionAttributeValues: values,
          ScanIndexForward: false,
          Limit: limit,
        }),
      );

      const photos = (result.Items || []).map((item) => ({
        ...item,
        url: toPhotoUrl(item.s3Key),
      }));
      const nextPageToken = result.LastEvaluatedKey
        ? (result.LastEvaluatedKey.createdAt as string)
        : undefined;

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ photos, nextToken: nextPageToken }),
      };
    }

    // GET /photos/slideshow - 招待客以外に写真が見えてしまうため認証必須
    if (routeKey === "GET /photos/slideshow") {
      return await handleSlideshow(event);
    }

    // POST /photos/upload-url - Get presigned URL for upload
    // クライアント側でJPEGに変換済みのため、JPEGのみ受け付ける
    if (routeKey === "POST /photos/upload-url") {
      const body = JSON.parse(event.body || "{}");
      const { mimeType } = body;

      if (mimeType !== "image/jpeg") {
        return {
          statusCode: 400,
          headers: HEADERS,
          body: JSON.stringify({ error: "INVALID_MIME_TYPE" }),
        };
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const uuid = randomUUID().slice(0, 8);
      const s3Key = `photos/${user.tableId}/${timestamp}_${uuid}.jpg`;

      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: PHOTO_BUCKET,
          Key: s3Key,
          ContentType: mimeType,
          CacheControl: PHOTO_CACHE_CONTROL,
        }),
        { expiresIn: 300 },
      );

      // このs3Keyが本人に発行されたものであることを記録しておく。
      // POST /photos ではこの予約レコードがある場合のみ登録を許可し、
      // 未使用チェック(used)により同じs3Keyの使い回し（削除済み写真の復活など）を防ぐ。
      const now = Math.floor(Date.now() / 1000);
      await docClient.send(
        new PutCommand({
          TableName: PENDING_UPLOADS_TABLE,
          Item: {
            s3Key,
            tableId: user.tableId,
            used: false,
            expiresAt: now + PENDING_UPLOAD_TTL_SECONDS,
          },
        }),
      );

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ uploadUrl, s3Key }),
      };
    }

    // POST /photos - Register photo metadata
    if (routeKey === "POST /photos") {
      const body = JSON.parse(event.body || "{}");
      const { s3Key, mimeType } = body;

      if (!s3Key) {
        return {
          statusCode: 400,
          headers: HEADERS,
          body: JSON.stringify({ error: "MISSING_S3_KEY" }),
        };
      }

      // s3Keyが本当にこのユーザー宛にupload-urlで発行されたものか確認する
      const pending = await docClient.send(
        new GetCommand({
          TableName: PENDING_UPLOADS_TABLE,
          Key: { s3Key },
        }),
      );

      if (!pending.Item || pending.Item.tableId !== user.tableId) {
        return {
          statusCode: 403,
          headers: HEADERS,
          body: JSON.stringify({ error: "INVALID_S3_KEY" }),
        };
      }

      // 既に登録済み（モデレーションで削除された写真の再登録試行を含む）の場合は拒否する。
      // ConditionExpressionで未使用の予約のみをusedに更新し、同時リクエストによる
      // 二重登録（race condition）も防ぐ。
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: PENDING_UPLOADS_TABLE,
            Key: { s3Key },
            UpdateExpression: "SET used = :true REMOVE expiresAt",
            ConditionExpression:
              "attribute_exists(s3Key) AND used = :false",
            ExpressionAttributeValues: { ":true": true, ":false": false },
          }),
        );
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
          return {
            statusCode: 409,
            headers: HEADERS,
            body: JSON.stringify({ error: "ALREADY_REGISTERED" }),
          };
        }
        throw err;
      }

      const photoId = randomUUID();
      const createdAt = new Date().toISOString();

      const photoItem = {
        eventId: EVENT_ID,
        createdAt,
        photoId,
        tableId: user.tableId,
        s3Key,
        mimeType,
        isVisible: true,
        likes: 0,
      };

      await docClient.send(
        new PutCommand({
          TableName: PHOTOS_TABLE,
          Item: photoItem,
        }),
      );

      return {
        statusCode: 201,
        headers: HEADERS,
        body: JSON.stringify({ ...photoItem, url: toPhotoUrl(s3Key) }),
      };
    }

    // DELETE /photos/{photoId} - Soft delete
    if (routeKey === "DELETE /photos/{photoId}") {
      const body = JSON.parse(event.body || "{}");
      const { createdAt } = body;

      const result = await docClient.send(
        new QueryCommand({
          TableName: PHOTOS_TABLE,
          KeyConditionExpression:
            "eventId = :eventId AND createdAt = :createdAt",
          ExpressionAttributeValues: {
            ":eventId": EVENT_ID,
            ":createdAt": createdAt,
          },
        }),
      );

      const photo = result.Items?.[0];
      if (!photo) {
        return {
          statusCode: 404,
          headers: HEADERS,
          body: JSON.stringify({ error: "NOT_FOUND" }),
        };
      }

      if (user.role !== "ADMIN" && photo.tableId !== user.tableId) {
        return {
          statusCode: 403,
          headers: HEADERS,
          body: JSON.stringify({ error: "FORBIDDEN" }),
        };
      }

      await docClient.send(
        new UpdateCommand({
          TableName: PHOTOS_TABLE,
          Key: { eventId: EVENT_ID, createdAt },
          UpdateExpression: "SET isVisible = :visible",
          ExpressionAttributeValues: { ":visible": false },
        }),
      );

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /photos/{photoId}/like
    if (routeKey === "POST /photos/{photoId}/like") {
      const body = JSON.parse(event.body || "{}");
      const { createdAt } = body;

      await docClient.send(
        new UpdateCommand({
          TableName: PHOTOS_TABLE,
          Key: { eventId: EVENT_ID, createdAt },
          UpdateExpression: "SET likes = likes + :inc",
          ExpressionAttributeValues: { ":inc": 1 },
        }),
      );

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 404,
      headers: HEADERS,
      body: JSON.stringify({ error: "NOT_FOUND" }),
    };
  } catch (error) {
    console.error("Photos error:", error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: "INTERNAL_ERROR" }),
    };
  }
};

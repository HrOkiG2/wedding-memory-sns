import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
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
const PHOTO_BUCKET = process.env.PHOTO_BUCKET!;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const EVENT_ID = process.env.EVENT_ID || "WEDDING_DEV";

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

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const { routeKey } = event.requestContext;
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
    // GET /photos - List photos
    if (routeKey === "GET /photos") {
      const result = await docClient.send(
        new QueryCommand({
          TableName: PHOTOS_TABLE,
          KeyConditionExpression: "eventId = :eventId",
          FilterExpression: "isVisible = :visible",
          ExpressionAttributeValues: {
            ":eventId": EVENT_ID,
            ":visible": true,
          },
          ScanIndexForward: false,
        }),
      );

      const photos = await Promise.all(
        (result.Items || []).map(async (item) => ({
          ...item,
          url: await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: item.s3Key }),
            { expiresIn: 3600 },
          ),
        })),
      );

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ photos }),
      };
    }

    // GET /photos/slideshow - Photos with 5min delay
    if (routeKey === "GET /photos/slideshow") {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const result = await docClient.send(
        new QueryCommand({
          TableName: PHOTOS_TABLE,
          KeyConditionExpression: "eventId = :eventId AND createdAt <= :time",
          FilterExpression: "isVisible = :visible",
          ExpressionAttributeValues: {
            ":eventId": EVENT_ID,
            ":time": fiveMinutesAgo,
            ":visible": true,
          },
          ScanIndexForward: false,
        }),
      );

      const photos = await Promise.all(
        (result.Items || []).map(async (item) => ({
          ...item,
          url: await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: item.s3Key }),
            { expiresIn: 3600 },
          ),
        })),
      );

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ photos }),
      };
    }

    // POST /photos/upload-url - Get presigned URL for upload
    if (routeKey === "POST /photos/upload-url") {
      const body = JSON.parse(event.body || "{}");
      const { mimeType } = body;

      if (
        !mimeType ||
        !["image/jpeg", "image/png", "image/heic"].includes(mimeType)
      ) {
        return {
          statusCode: 400,
          headers: HEADERS,
          body: JSON.stringify({ error: "INVALID_MIME_TYPE" }),
        };
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const uuid = randomUUID().slice(0, 8);
      const ext =
        mimeType === "image/jpeg"
          ? "jpg"
          : mimeType === "image/png"
            ? "png"
            : "heic";
      const s3Key = `photos/${user.tableId}/${timestamp}_${uuid}.${ext}`;

      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: PHOTO_BUCKET,
          Key: s3Key,
          ContentType: mimeType,
        }),
        { expiresIn: 300 },
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

      const photoId = randomUUID();
      const createdAt = new Date().toISOString();

      await docClient.send(
        new PutCommand({
          TableName: PHOTOS_TABLE,
          Item: {
            eventId: EVENT_ID,
            createdAt,
            photoId,
            tableId: user.tableId,
            s3Key,
            mimeType,
            isVisible: true,
            likes: 0,
          },
        }),
      );

      return {
        statusCode: 201,
        headers: HEADERS,
        body: JSON.stringify({ photoId, createdAt }),
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

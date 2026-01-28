import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { SignJWT } from "jose";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

const GUEST_AUTH_TABLE = process.env.GUEST_AUTH_TABLE!;
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE!;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;

let cachedJwtSecret: string | null = null;

async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) return cachedJwtSecret;

  const command = new GetSecretValueCommand({ SecretId: JWT_SECRET_ARN });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString!);
  cachedJwtSecret = secret.key;
  return cachedJwtSecret!;
}

async function checkRateLimit(clientIp: string): Promise<boolean> {
  const WINDOW_SECONDS = 900;
  const MAX_ATTEMPTS = 10;
  const now = Math.floor(Date.now() / 1000);

  const result = await docClient.send(
    new GetCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk: `ip#${clientIp}` },
    }),
  );

  if (result.Item && result.Item.attempts >= MAX_ATTEMPTS) {
    return false;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk: `ip#${clientIp}` },
      UpdateExpression:
        "SET attempts = if_not_exists(attempts, :zero) + :inc, expiresAt = :ttl",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":inc": 1,
        ":ttl": now + WINDOW_SECONDS,
      },
    }),
  );

  return true;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const clientIp = event.requestContext.http.sourceIp;

  // Rate limit check
  const allowed = await checkRateLimit(clientIp);
  if (!allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: "TOO_MANY_REQUESTS",
        message: "しばらく時間をおいてから再度お試しください",
        retryAfter: 900,
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { token } = body;

    if (!token) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "MISSING_TOKEN",
          message: "トークンが必要です",
        }),
      };
    }

    // Lookup token in DynamoDB
    const result = await docClient.send(
      new GetCommand({
        TableName: GUEST_AUTH_TABLE,
        Key: { authToken: token },
      }),
    );

    if (!result.Item) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "INVALID_TOKEN",
          message: "無効なQRコードです",
        }),
      };
    }

    const { tableId, tableName } = result.Item;
    const role = tableId === "ADMIN" ? "ADMIN" : "GUEST";

    // Generate JWT
    const jwtSecret = await getJwtSecret();
    const secret = new TextEncoder().encode(jwtSecret);

    const jwt = await new SignJWT({ sub: token, tableId, role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: jwt, tableId, tableName }),
    };
  } catch (error) {
    console.error("Auth error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "サーバーエラーが発生しました",
      }),
    };
  }
};

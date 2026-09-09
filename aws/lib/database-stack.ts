import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly guestAuthTable: dynamodb.Table;
  public readonly photosTable: dynamodb.Table;
  public readonly rateLimitTable: dynamodb.Table;
  public readonly pendingUploadsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // GuestAuth Table
    this.guestAuthTable = new dynamodb.Table(this, 'GuestAuthTable', {
      tableName: 'Wedding_GuestAuth',
      partitionKey: { name: 'authToken', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Photos Table
    this.photosTable = new dynamodb.Table(this, 'PhotosTable', {
      tableName: 'Wedding_Photos',
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // RateLimit Table (TTL enabled)
    this.rateLimitTable = new dynamodb.Table(this, 'RateLimitTable', {
      tableName: 'Wedding_RateLimit',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // PendingUploads Table
    // upload-url発行時にs3Key⇔tableIdを記録し、POST /photosで
    // 「本当にこのユーザーに発行されたs3Keyか」「既に登録済み(=モデレーション済み)でないか」
    // を検証するために使用する。未使用の予約はTTLで自動削除されるが、
    // 一度使用(used=true)された予約はexpiresAtを外すためTTL削除されず、再登録を恒久的に防ぐ。
    this.pendingUploadsTable = new dynamodb.Table(this, 'PendingUploadsTable', {
      tableName: 'Wedding_PendingUploads',
      partitionKey: { name: 's3Key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly guestAuthTable: dynamodb.Table;
  public readonly photosTable: dynamodb.Table;
  public readonly rateLimitTable: dynamodb.Table;

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
  }
}

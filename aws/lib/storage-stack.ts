import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface StorageStackProps extends cdk.StackProps {
  domainName?: string;
}

export class StorageStack extends cdk.Stack {
  public readonly photoBucket: s3.Bucket;
  public readonly jwtSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: StorageStackProps) {
    super(scope, id, props);

    const { domainName } = props ?? {};

    // JWT Secret
    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'wedding-app/jwt-secret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ algorithm: 'HS256' }),
        generateStringKey: 'key',
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    // Photo Storage Bucket
    this.photoBucket = new s3.Bucket(this, 'PhotoBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          // 閲覧(GET)はCloudFront経由(同一オリジン)で配信するため、
          // ブラウザから直接S3へアクセスするのはアップロード(PUT)のみ
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: domainName ? [`https://${domainName}`] : ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront(OAC)からの読み取りを許可する。
    // バケットとCloudFrontディストリビューションが別スタックのため、
    // ディストリビューションARNを条件にするとスタック間で循環依存になる。
    // そのため同一AWSアカウント内のCloudFrontからのアクセスであることを条件にする
    // （バケット自体はBlockPublicAccessのままなので、直接の公開アクセスは不可）。
    this.photoBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipalReadOnly',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [this.photoBucket.arnForObjects('*')],
        conditions: {
          StringEquals: { 'AWS:SourceAccount': cdk.Aws.ACCOUNT_ID },
        },
      }),
    );

    // Outputs
    new cdk.CfnOutput(this, 'PhotoBucketName', {
      value: this.photoBucket.bucketName,
      exportName: 'PhotoBucketName',
    });
  }
}

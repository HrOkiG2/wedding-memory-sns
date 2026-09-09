import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';

// bin/aws.tsと同じ順序・依存関係でスタックを組み立てる（カスタムドメインなし構成）。
// 各スタックを1回だけ合成し、複数のテストで使い回す。
function buildApp() {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'ap-northeast-1' };

  const databaseStack = new DatabaseStack(app, 'WeddingDatabaseStack', { env });
  const storageStack = new StorageStack(app, 'WeddingStorageStack', { env });
  const apiStack = new ApiStack(app, 'WeddingApiStack', {
    env,
    guestAuthTable: databaseStack.guestAuthTable,
    photosTable: databaseStack.photosTable,
    rateLimitTable: databaseStack.rateLimitTable,
    pendingUploadsTable: databaseStack.pendingUploadsTable,
    photoBucket: storageStack.photoBucket,
    jwtSecret: storageStack.jwtSecret,
    domainName: '',
  });
  apiStack.addDependency(databaseStack);
  apiStack.addDependency(storageStack);

  const cdnStack = new CdnStack(app, 'WeddingCdnStack', {
    env,
    crossRegionReferences: true,
    httpApi: apiStack.httpApi,
    photoBucket: storageStack.photoBucket,
  });
  cdnStack.addDependency(apiStack);
  cdnStack.addDependency(storageStack);

  return { databaseStack, storageStack, apiStack, cdnStack };
}

// esbuildによるLambdaバンドルはコストが小さくないため、全describeで1回だけ合成して使い回す
const { databaseStack, storageStack, apiStack, cdnStack } = buildApp();

describe('WeddingDatabaseStack', () => {
  const template = Template.fromStack(databaseStack);

  it('should create a PendingUploads table keyed by s3Key with TTL enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Wedding_PendingUploads',
      KeySchema: [{ AttributeName: 's3Key', KeyType: 'HASH' }],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });
});

describe('WeddingStorageStack', () => {
  const template = Template.fromStack(storageStack);

  it('should keep the photo bucket fully blocked from public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('should allow CloudFront to read objects scoped by AWS:SourceAccount (not a specific distribution ARN)', () => {
    // ディストリビューションARNを条件にすると別スタックとの循環依存になるため、
    // 同一アカウント内のCloudFrontからの読み取りのみを許可する設計になっているはず。
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Condition: { StringEquals: { 'AWS:SourceAccount': { Ref: 'AWS::AccountId' } } },
          }),
        ]),
      }),
    });
  });

  it('should only allow PUT (not GET) from the browser via CORS, since viewing goes through CloudFront', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([Match.objectLike({ AllowedMethods: ['PUT'] })]),
      },
    });
  });
});

describe('WeddingApiStack', () => {
  const template = Template.fromStack(apiStack);

  it("should pass the PendingUploads table name to the Photos function's environment", () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'wedding-photos',
      Environment: {
        Variables: Match.objectLike({
          PENDING_UPLOADS_TABLE: Match.anyValue(),
        }),
      },
    });
  });

  it('should grant the Photos function write access to the photo bucket but not read access', () => {
    // PhotosFunctionのロールにアタッチされたポリシーだけを対象に、
    // s3:PutObject は含まれるが s3:GetObject は含まれない（閲覧はCloudFront経由になったため）
    // ことを確認する。
    const policies = template.findResources('AWS::IAM::Policy');
    const photosFunctionPolicies = Object.entries(policies)
      .filter(([logicalId]) => logicalId.startsWith('PhotosFunctionServiceRoleDefaultPolicy'))
      .map(([, resource]) => resource);

    expect(photosFunctionPolicies.length).toBeGreaterThan(0);

    const statements = photosFunctionPolicies.flatMap(
      (policy) => (policy.Properties?.PolicyDocument?.Statement ?? []) as Array<Record<string, unknown>>,
    );
    const actions = statements.flatMap((statement) => {
      const action = statement.Action;
      return Array.isArray(action) ? action : [action];
    });

    expect(actions).toContain('s3:PutObject');
    expect(actions).not.toContain('s3:GetObject');
  });
});

describe('WeddingCdnStack', () => {
  const template = Template.fromStack(cdnStack);

  it('should use PriceClass_200 so guests in Japan are served from a nearby edge', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ PriceClass: 'PriceClass_200' }),
    });
  });

  it('should serve /photos/* read-only from the photo bucket via OAC', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/photos/*',
            // GET/HEADのみ（PUT/POST/DELETEは許可しない = 閲覧専用）
            AllowedMethods: Match.arrayWith(['GET', 'HEAD']),
          }),
        ]),
      }),
    });
  });
});

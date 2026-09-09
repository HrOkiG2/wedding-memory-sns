import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  guestAuthTable: dynamodb.ITable;
  photosTable: dynamodb.ITable;
  rateLimitTable: dynamodb.ITable;
  pendingUploadsTable: dynamodb.ITable;
  photoBucket: s3.IBucket;
  jwtSecret: secretsmanager.ISecret;
  domainName: string
}

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { guestAuthTable, photosTable, rateLimitTable, pendingUploadsTable, photoBucket, jwtSecret, domainName } = props;

    // Log Groups
    const authLogGroup = new logs.LogGroup(this, 'AuthFunctionLogGroup', {
      logGroupName: '/aws/lambda/wedding-auth',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const photosLogGroup = new logs.LogGroup(this, 'PhotosFunctionLogGroup', {
      logGroupName: '/aws/lambda/wedding-photos',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Common Lambda props
    const lambdaCommonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(29),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        GUEST_AUTH_TABLE: guestAuthTable.tableName,
        PHOTOS_TABLE: photosTable.tableName,
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
        PENDING_UPLOADS_TABLE: pendingUploadsTable.tableName,
        PHOTO_BUCKET: photoBucket.bucketName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
      },
    };

    // Auth Lambda
    const authFunction = new lambdaNodejs.NodejsFunction(this, 'AuthFunction', {
      ...lambdaCommonProps,
      entry: path.join(__dirname, '../lambda/auth/index.ts'),
      functionName: 'wedding-auth',
      memorySize: 256,
      logGroup: authLogGroup,
    });

    // Photos Lambda
    const photosFunction = new lambdaNodejs.NodejsFunction(this, 'PhotosFunction', {
      ...lambdaCommonProps,
      entry: path.join(__dirname, '../lambda/photos/index.ts'),
      functionName: 'wedding-photos',
      memorySize: 512,
      logGroup: photosLogGroup,
    });

    // Grant permissions
    guestAuthTable.grantReadData(authFunction);
    rateLimitTable.grantReadWriteData(authFunction);
    jwtSecret.grantRead(authFunction);

    photosTable.grantReadWriteData(photosFunction);
    pendingUploadsTable.grantReadWriteData(photosFunction);
    // 写真の閲覧はCloudFront(OAC)経由でS3から直接配信するため、
    // Lambdaは署名付きPUT URLの発行(アップロード)権限のみで足りる。
    photoBucket.grantWrite(photosFunction);
    jwtSecret.grantRead(photosFunction);

    // HTTP API
    this.httpApi = new apigatewayv2.HttpApi(this, 'WeddingApi', {
      apiName: 'wedding-photo-api',
      corsPreflight: {
        allowOrigins: [
          (domainName.length > 0) ? `https://${domainName}` : '*'
        ],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Auth routes
    this.httpApi.addRoutes({
      path: '/api/auth/login',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'AuthIntegration',
        authFunction
      ),
    });

    // Photos routes
    const photosIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'PhotosIntegration',
      photosFunction
    );

    this.httpApi.addRoutes({
      path: '/api/photos',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: photosIntegration,
    });

    this.httpApi.addRoutes({
      path: '/api/photos/upload-url',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: photosIntegration,
    });

    this.httpApi.addRoutes({
      path: '/api/photos/slideshow',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: photosIntegration,
    });

    this.httpApi.addRoutes({
      path: '/api/photos/{photoId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: photosIntegration,
    });

    this.httpApi.addRoutes({
      path: '/api/photos/{photoId}/like',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: photosIntegration,
    });

    // Output
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.httpApi.apiEndpoint,
      exportName: 'ApiEndpoint',
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

// CloudFront Function: Rewrite URIs for S3 static hosting
// /feed → /feed/index.html
const URI_REWRITE_FUNCTION_CODE = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // If URI has a file extension, serve as-is
  if (uri.includes('.')) {
    return request;
  }

  // If URI ends with /, append index.html
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else {
    // Append /index.html for directory-style paths
    request.uri = uri + '/index.html';
  }

  return request;
}
`;

interface CdnStackProps extends cdk.StackProps {
  httpApi: apigatewayv2.IHttpApi;
  // 写真バケット（/photos/* をCloudFront経由で配信し、署名なしの安定したURLで
  // ブラウザ/エッジキャッシュを効かせるため）
  photoBucket: s3.IBucket;
  // カスタムドメイン（オプション）
  domainName?: string;
  certificate?: acm.ICertificate;
  hostedZone?: route53.IHostedZone;
}

export class CdnStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly domainUrl: string;
  public readonly webBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { httpApi, photoBucket, domainName, certificate, hostedZone } = props;

    // Web Hosting Bucket
    this.webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3 Origin with OAC（同一Stack内なのでバケットポリシーも自動設定される）
    const s3Origin =
      cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(this.webBucket);

    // 写真バケット用Origin（OAC経由。バケット自体はBlockPublicAccessのまま）
    // withOriginAccessControl()は本来、バケット側に「このディストリビューションからの
    // 読み取りを許可する」ポリシーを自動付与するが、それには distribution の ARN が必要になり、
    // バケットが別スタック(StorageStack)にあるとスタック間で循環依存になってしまう。
    // ここでは「インポートされたバケット」として扱うことでその自動付与をスキップし
    // （実際のバケットポリシーはStorageStack側で手動付与済み）、循環を避ける。
    const importedPhotoBucket = s3.Bucket.fromBucketName(
      this,
      "ImportedPhotoBucket",
      photoBucket.bucketName,
    );
    const photoOrigin =
      cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(importedPhotoBucket);

    // CloudFront Function for URI rewriting (SPA routing)
    const uriRewriteFunction = new cloudfront.Function(
      this,
      "UriRewriteFunction",
      {
        code: cloudfront.FunctionCode.fromInline(URI_REWRITE_FUNCTION_CODE),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      },
    );

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, "WebDistribution", {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: uriRewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new cloudfrontOrigins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`,
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        // 写真配信用（読み取り専用）。s3Keyが常に "photos/..." で始まるため
        // パスプレフィックスの書き換えなしでそのままS3キーに対応する。
        // アップロード時にCache-Control: immutableを付与しているため長期キャッシュされる。
        "/photos/*": {
          origin: photoOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
      // 会場（日本）のゲストが東京エッジ経由でアクセスできるようアジアを含める
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      ...(domainName && certificate
        ? { domainNames: [domainName], certificate }
        : {}),
    });

    // Route53 Aレコード（カスタムドメイン使用時）
    if (domainName && hostedZone) {
      new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(this.distribution),
        ),
      });
    }

    // URL
    this.domainUrl = domainName
      ? `https://${domainName}`
      : `https://${this.distribution.distributionDomainName}`;

    // Outputs
    new cdk.CfnOutput(this, "WebsiteUrl", {
      value: this.domainUrl,
      exportName: "WebsiteUrl",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      exportName: "DistributionId",
    });

    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: this.distribution.distributionDomainName,
      exportName: "CloudFrontDomain",
    });

    new cdk.CfnOutput(this, "WebBucketName", {
      value: this.webBucket.bucketName,
      exportName: "WebBucketName",
    });
  }
}

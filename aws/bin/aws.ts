#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';
import { DnsStack } from '../lib/dns-stack';

const app = new cdk.App();

const APP_NAME = 'wedding-photo-sns';

// 環境変数から設定を取得
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// カスタムドメイン設定（オプション）
const domainName = process.env.DOMAIN_NAME; // 例: photos.example.com
const rootDomain = process.env.ROOT_DOMAIN; // 例: example.com
const hostedZoneId = process.env.HOSTED_ZONE_ID; // Route53ホストゾーンID

// Database Stack
const databaseStack = new DatabaseStack(app, 'WeddingDatabaseStack', { env });

// Storage Stack
const storageStack = new StorageStack(app, 'WeddingStorageStack', { env });

// API Stack
const apiStack = new ApiStack(app, 'WeddingApiStack', {
  env,
  guestAuthTable: databaseStack.guestAuthTable,
  photosTable: databaseStack.photosTable,
  rateLimitTable: databaseStack.rateLimitTable,
  photoBucket: storageStack.photoBucket,
  jwtSecret: storageStack.jwtSecret,
  domainName: domainName ?? ''
});
apiStack.addDependency(databaseStack);
apiStack.addDependency(storageStack);

// DNS Stack（カスタムドメイン使用時のみ）
let dnsStack: DnsStack | undefined;
if (domainName && rootDomain && hostedZoneId) {
  dnsStack = new DnsStack(app, 'WeddingDnsStack', {
    env,
    domainName,
    rootDomain,
    hostedZoneId,
    crossRegionReferences: true,
  });
}

// CDN Stack
const cdnStack = new CdnStack(app, 'WeddingCdnStack', {
  env,
  crossRegionReferences: true,
  httpApi: apiStack.httpApi,
  // カスタムドメイン（設定がある場合のみ）
  domainName,
  certificate: dnsStack?.certificate,
  hostedZone: dnsStack?.hostedZone,
});
cdnStack.addDependency(apiStack);
if (dnsStack) {
  cdnStack.addDependency(dnsStack);
}

// Add tags to all stacks
const stacks: cdk.Stack[] = [databaseStack, storageStack, apiStack, cdnStack];
if (dnsStack) stacks.push(dnsStack);

stacks.forEach((stack) => {
  cdk.Tags.of(stack).add('Name', APP_NAME);
  cdk.Tags.of(stack).add('Project', APP_NAME);
});

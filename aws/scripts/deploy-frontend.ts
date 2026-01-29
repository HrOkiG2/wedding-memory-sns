#!/usr/bin/env npx tsx

/**
 * フロントエンドデプロイスクリプト
 *
 * 使い方:
 *   npx tsx scripts/deploy-frontend.ts              # ビルド + デプロイ
 *   npx tsx scripts/deploy-frontend.ts --skip-build # ビルドをスキップ
 *   npx tsx scripts/deploy-frontend.ts --dry-run    # 実際にはアップロードしない
 *
 * 環境変数:
 *   AWS_REGION        - AWSリージョン（デフォルト: ap-northeast-1）
 *   WEB_BUCKET_NAME   - S3バケット名（CDK出力から自動取得）
 *   DISTRIBUTION_ID   - CloudFront Distribution ID（CDK出力から自動取得）
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { lookup } from 'mime-types';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

const cfnClient = new CloudFormationClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });
const cfClient = new CloudFrontClient({ region: AWS_REGION });

// 色付き出力
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
};

async function getStackOutput(
  stackName: string,
  exportName: string
): Promise<string | undefined> {
  try {
    const result = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
    const output = result.Stacks?.[0]?.Outputs?.find(
      (o) => o.ExportName === exportName
    );
    return output?.OutputValue;
  } catch {
    return undefined;
  }
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      files.push(relative(baseDir, fullPath));
    }
  }

  return files;
}

async function uploadToS3(
  buildDir: string,
  bucketName: string,
  dryRun: boolean
): Promise<number> {
  const files = getAllFiles(buildDir);

  console.log(`  アップロード対象: ${files.length} ファイル\n`);

  for (const file of files) {
    const filePath = join(buildDir, file);
    const contentType = lookup(file) || 'application/octet-stream';

    console.log(`  ${dryRun ? '[dry-run] ' : ''}${file}`);

    if (!dryRun) {
      const body = readFileSync(filePath);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: file,
          Body: body,
          ContentType: contentType,
          CacheControl:
            file.includes('_nuxt') || file.includes('assets')
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=0, must-revalidate',
        })
      );
    }
  }

  return files.length;
}

async function cleanupOldFiles(
  buildDir: string,
  bucketName: string,
  dryRun: boolean
): Promise<void> {
  const localFiles = new Set(getAllFiles(buildDir));

  // S3の既存ファイル一覧を取得
  const listResult = await s3Client.send(
    new ListObjectsV2Command({ Bucket: bucketName })
  );

  const s3Keys = listResult.Contents?.map((obj) => obj.Key!) || [];
  const keysToDelete = s3Keys.filter((key) => !localFiles.has(key));

  if (keysToDelete.length === 0) {
    console.log('  削除対象なし\n');
    return;
  }

  console.log(`  削除対象: ${keysToDelete.length} ファイル`);

  if (!dryRun) {
    // 1000件ずつ削除（S3の制限）
    for (let i = 0; i < keysToDelete.length; i += 1000) {
      const batch = keysToDelete.slice(i, i + 1000);
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
          },
        })
      );
    }
  }

  console.log('');
}

async function invalidateCloudFront(
  distributionId: string,
  dryRun: boolean
): Promise<string | null> {
  if (dryRun) {
    console.log('  [dry-run] キャッシュ無効化をスキップ\n');
    return null;
  }

  const result = await cfClient.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `deploy-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
      },
    })
  );

  return result.Invalidation?.Id || null;
}

async function main() {
  const args = process.argv.slice(2);
  const skipBuild = args.includes('--skip-build');
  const dryRun = args.includes('--dry-run');

  console.log(colors.blue('\n=========================================='));
  console.log(colors.blue('  Wedding Photo SNS - Frontend Deploy'));
  console.log(colors.blue('==========================================\n'));

  // 設定の取得
  let bucketName = process.env.WEB_BUCKET_NAME;
  let distributionId = process.env.DISTRIBUTION_ID;

  if (!bucketName) {
    console.log(colors.yellow('WEB_BUCKET_NAME が未設定。CDK出力から取得中...'));
    bucketName = await getStackOutput('WeddingCdnStack', 'WebBucketName');
    if (!bucketName) {
      console.log(colors.red('エラー: WEB_BUCKET_NAME を取得できませんでした'));
      console.log('先にCDKをデプロイするか、環境変数を設定してください');
      process.exit(1);
    }
  }

  if (!distributionId) {
    console.log(colors.yellow('DISTRIBUTION_ID が未設定。CDK出力から取得中...'));
    distributionId = await getStackOutput('WeddingCdnStack', 'DistributionId');
    if (!distributionId) {
      console.log(colors.red('エラー: DISTRIBUTION_ID を取得できませんでした'));
      console.log('先にCDKをデプロイするか、環境変数を設定してください');
      process.exit(1);
    }
  }

  console.log(colors.green('\n設定:'));
  console.log(`  S3 Bucket:    ${bucketName}`);
  console.log(`  Distribution: ${distributionId}`);
  console.log(`  Skip Build:   ${skipBuild}`);
  console.log(`  Dry Run:      ${dryRun}\n`);

  // Step 1: ビルド
  // awsディレクトリから実行されるので、親ディレクトリを基準にする
  const projectRoot = join(process.cwd(), '..');
  const appDir = join(projectRoot, 'app');

  if (!skipBuild) {
    console.log(colors.blue('[1/4] フロントエンドをビルド中...'));
    try {
      execSync('npm run generate', {
        cwd: appDir,
        stdio: 'inherit',
      });
      console.log(colors.green('✓ ビルド完了\n'));
    } catch (error) {
      console.log(colors.red('✗ ビルド失敗'));
      process.exit(1);
    }
  } else {
    console.log(colors.yellow('[1/4] ビルドをスキップ\n'));
  }

  // ビルド成果物の確認
  const buildDir = join(appDir, '.output', 'public');
  try {
    statSync(buildDir);
  } catch {
    console.log(colors.red(`エラー: ビルド成果物が見つかりません: ${buildDir}`));
    process.exit(1);
  }

  // Step 2: 古いファイルの削除
  console.log(colors.blue('[2/4] 古いファイルをクリーンアップ中...'));
  await cleanupOldFiles(buildDir, bucketName, dryRun);
  console.log(colors.green('✓ クリーンアップ完了\n'));

  // Step 3: S3にアップロード
  console.log(colors.blue('[3/4] S3にアップロード中...'));
  const uploadedCount = await uploadToS3(buildDir, bucketName, dryRun);
  console.log(colors.green(`✓ ${uploadedCount} ファイルをアップロード完了\n`));

  // Step 4: CloudFrontキャッシュ無効化
  console.log(colors.blue('[4/4] CloudFrontキャッシュを無効化中...'));
  const invalidationId = await invalidateCloudFront(distributionId, dryRun);
  if (invalidationId) {
    console.log(`  Invalidation ID: ${invalidationId}`);
  }
  console.log(colors.green('✓ キャッシュ無効化リクエスト送信\n'));

  // 完了
  console.log(colors.green('=========================================='));
  console.log(colors.green('  デプロイ完了!'));
  console.log(colors.green('==========================================\n'));

  if (!dryRun) {
    const websiteUrl = await getStackOutput('WeddingCdnStack', 'WebsiteUrl');
    if (websiteUrl) {
      console.log(colors.blue(`サイトURL: ${websiteUrl}\n`));
    }
    console.log(colors.yellow('注意: キャッシュ無効化には数分かかる場合があります\n'));
  }
}

main().catch((err) => {
  console.error(colors.red(`\nエラー: ${err.message}`));
  process.exit(1);
});

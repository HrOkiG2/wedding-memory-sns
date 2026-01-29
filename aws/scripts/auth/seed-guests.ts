#!/usr/bin/env npx tsx

import 'dotenv/config';

/**
 * GuestAuthテーブルにゲストデータを登録するスクリプト
 *
 * 使い方:
 *   npx tsx scripts/seed-guests.ts                      # guests.json を読み込んで登録
 *   npx tsx scripts/seed-guests.ts --file custom.json   # カスタムファイルを指定
 *   npx tsx scripts/seed-guests.ts --dry-run            # 実際には登録せずプレビュー
 *   npx tsx scripts/seed-guests.ts --generate 10        # 10テーブル分のサンプルを生成
 *
 * 環境変数:
 *   AWS_REGION          - AWSリージョン (デフォルト: ap-northeast-1)
 *   GUEST_AUTH_TABLE    - テーブル名 (デフォルト: Wedding_GuestAuth)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.GUEST_AUTH_TABLE || 'Wedding_GuestAuth';

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface GuestData {
  authToken: string;
  tableId: string;
  tableName: string;
}

/**
 * セキュアなトークンを生成
 * - 256ビット（32バイト）のエントロピー
 * - URL-safe Base64エンコード（43文字）
 * - ブルートフォース耐性: 2^256 通り
 */
function generateToken(): string {
  return randomBytes(32)
    .toString('base64url')  // URL-safe Base64（+/ を -_ に置換、パディングなし）
    .slice(0, 43);          // 43文字（256ビット相当）
}

function generateSampleGuests(count: number): GuestData[] {
  const adminToken = process.env.ADMIN_AUTH_TOKEN;
  if (!adminToken) {
    throw new Error('環境変数 ADMIN_AUTH_TOKEN が設定されていません');
  }

  const guests: GuestData[] = [];

  // 管理者
  guests.push({
    authToken: adminToken,
    tableId: 'ADMIN',
    tableName: '新郎新婦',
  });

  // ゲストテーブル
  for (let i = 1; i <= count; i++) {
    // ASCIIコード変換: 65('A') スタート
    // i=1 のとき 64+1=65 -> 'A'
    // i=2 のとき 64+2=66 -> 'B'
    const tableLetter = String.fromCharCode(64 + i);

    guests.push({
      authToken: generateToken(),
      tableId: `TABLE_${tableLetter}`,
      tableName: `テーブル ${tableLetter}`,
    });
  }

  return guests;
}

async function seedGuests(guests: GuestData[], dryRun: boolean): Promise<void> {
  console.log(`\n📝 登録対象: ${guests.length}件\n`);

  for (const guest of guests) {
    const isAdmin = guest.tableId === 'ADMIN';
    const icon = isAdmin ? '👑' : '🪑';

    console.log(`${icon} ${guest.tableName} (${guest.tableId})`);
    console.log(`   Token: ${guest.authToken}`);

    if (!dryRun) {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: guest,
        })
      );
      console.log('   ✅ 登録完了');
    } else {
      console.log('   ⏭️  スキップ (dry-run)');
    }
    console.log('');
  }
}

async function listExistingGuests(): Promise<void> {
  console.log('\n📋 既存のゲストデータ:\n');

  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    console.log('   (データなし)\n');
    return;
  }

  for (const item of result.Items) {
    const isAdmin = item.tableId === 'ADMIN';
    const icon = isAdmin ? '👑' : '🪑';
    console.log(`${icon} ${item.tableName} (${item.tableId})`);
    console.log(`   Token: ${item.authToken}`);
    console.log('');
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const listOnly = args.includes('--list');

  console.log('\n🎉 Wedding Photo SNS - ゲストデータ登録\n');
  console.log('='.repeat(50));
  console.log(`リージョン: ${AWS_REGION}`);
  console.log(`テーブル: ${TABLE_NAME}`);
  console.log('='.repeat(50));

  // 既存データの一覧表示
  if (listOnly) {
    listExistingGuests().catch(console.error);
    return;
  }

  // サンプルデータ生成モード
  const generateIdx = args.indexOf('--generate');
  if (generateIdx !== -1) {
    const count = parseInt(args[generateIdx + 1] || '10', 10);
    const guests = generateSampleGuests(count);

    const outputPath = join(process.cwd(), 'scripts/auth', 'guests.json');
    writeFileSync(outputPath, JSON.stringify(guests, null, 2));

    console.log(`\n✅ ${count}テーブル分のサンプルデータを生成しました`);
    console.log(`   ファイル: ${outputPath}\n`);

    console.log('📝 次のステップ:');
    console.log('   1. guests.json を確認・編集');
    console.log('   2. npx tsx scripts/seed-guests.ts --dry-run でプレビュー');
    console.log('   3. npx tsx scripts/seed-guests.ts で登録\n');
    return;
  }

  // ファイルからデータを読み込んで登録
  const fileIdx = args.indexOf('--file');
  const filePath =
    fileIdx !== -1
      ? args[fileIdx + 1]
      : join(process.cwd(), 'scripts/auth', 'guests.json');

  if (!existsSync(filePath)) {
    console.log(`\n❌ ファイルが見つかりません: ${filePath}`);
    console.log('\n💡 ヒント:');
    console.log('   npx tsx scripts/seed-guests.ts --generate 10');
    console.log('   でサンプルデータを生成してください\n');
    process.exit(1);
  }

  const guests: GuestData[] = JSON.parse(readFileSync(filePath, 'utf-8'));

  if (dryRun) {
    console.log('\n🔍 ドライランモード（実際には登録しません）\n');
  }

  seedGuests(guests, dryRun)
    .then(() => {
      console.log('='.repeat(50));
      if (dryRun) {
        console.log('\n✅ ドライラン完了');
        console.log('   実際に登録するには --dry-run を外して実行してください\n');
      } else {
        console.log('\n✅ 全てのゲストデータを登録しました\n');
      }
    })
    .catch((err) => {
      console.error('\n❌ エラーが発生しました:', err.message);
      process.exit(1);
    });
}

main();

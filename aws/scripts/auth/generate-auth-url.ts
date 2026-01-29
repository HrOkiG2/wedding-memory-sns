#!/usr/bin/env npx tsx

/**
 * ローカル開発用の認証URLを生成するスクリプト
 *
 * 使い方:
 *   npx tsx scripts/generate-auth-url.ts
 *   npx tsx scripts/generate-auth-url.ts --table 2
 *   npx tsx scripts/generate-auth-url.ts --admin
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

// 利用可能なテストトークン（server/api/auth/login.post.ts と同期）
const TOKENS = {
  'dev-table-1': { guestName: '田中太郎', tableId: 'TABLE_1' },
  'dev-table-2': { guestName: '山田花子', tableId: 'TABLE_2' },
  'dev-admin': { guestName: '新郎新婦', tableId: 'ADMIN' },
};

function generateUrl(token: string): string {
  return `${BASE_URL}/?token=${token}`;
}

function main() {
  const args = process.argv.slice(2);

  console.log('\n🎉 Wedding Photo SNS - 認証URL生成\n');
  console.log('=' .repeat(50));

  if (args.includes('--admin')) {
    const token = 'dev-admin';
    const info = TOKENS[token];
    console.log(`\n👑 管理者用URL:`);
    console.log(`   ゲスト名: ${info.guestName}`);
    console.log(`   URL: ${generateUrl(token)}\n`);
    return;
  }

  const tableArg = args.find(a => a.startsWith('--table'));
  if (tableArg) {
    const tableNum = args[args.indexOf(tableArg) + 1] || '1';
    const token = `dev-table-${tableNum}` as keyof typeof TOKENS;
    const info = TOKENS[token];
    if (info) {
      console.log(`\n🪑 テーブル${tableNum}用URL:`);
      console.log(`   ゲスト名: ${info.guestName}`);
      console.log(`   URL: ${generateUrl(token)}\n`);
    } else {
      console.log(`\n❌ テーブル${tableNum}は存在しません\n`);
    }
    return;
  }

  // すべてのURLを表示
  console.log('\n📋 利用可能な認証URL:\n');

  Object.entries(TOKENS).forEach(([token, info]) => {
    const isAdmin = token === 'dev-admin';
    const icon = isAdmin ? '👑' : '🪑';
    console.log(`${icon} ${info.guestName} (${info.tableId})`);
    console.log(`   ${generateUrl(token)}`);
    console.log('');
  });

  console.log('=' .repeat(50));
  console.log('\n💡 使い方:');
  console.log('   1. 上記のURLをブラウザで開く');
  console.log('   2. 自動的にログインしてフィードページへ遷移');
  console.log('');
  console.log('📝 オプション:');
  console.log('   --table N  : テーブルN用のURLのみ表示');
  console.log('   --admin    : 管理者用URLのみ表示');
  console.log('');
}

main();
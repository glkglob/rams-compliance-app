#!/usr/bin/env node

/**
 * Helper script to switch between Local and Remote Supabase
 *
 * Usage:
 *   npm run supabase:switch:local
 *   npm run supabase:switch:remote
 *   npm run supabase:mode
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DEV_LOCAL = path.join(ROOT, '.env.development.local');
const DEV_REMOTE = path.join(ROOT, '.env.development.remote');

const LOCAL_CONTENT = `# Local Supabase (from \`supabase start\`)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
`;

const REMOTE_CONTENT = `# Remote Supabase (production/staging)
NEXT_PUBLIC_SUPABASE_URL=https://gfykygieoxattypakrwa.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_X4osdi2ggYXoAxaIpQR-TA_Brqi5Dds
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

DATABASE_URL=postgresql://postgres:qn^m6UZbZwXr5vuv%JTc1ThrXqWS6@db.gfykygieoxattypakrwa.supabase.co:5432/postgres
`;

function switchTo(mode: 'local' | 'remote') {
  const targetFile = mode === 'local' ? DEV_LOCAL : DEV_REMOTE;
  const content = mode === 'local' ? LOCAL_CONTENT : REMOTE_CONTENT;

  if (fs.existsSync(DEV_LOCAL)) {
    const current = fs.readFileSync(DEV_LOCAL, 'utf8');
    const currentlyLocal = current.includes('127.0.0.1') || current.includes('localhost');

    if (currentlyLocal !== (mode === 'local')) {
      fs.writeFileSync(DEV_REMOTE, current);
      console.log('📦 Backed up previous config to .env.development.remote');
    }
  }

  fs.writeFileSync(DEV_LOCAL, content);
  console.log(`✅ Switched to ${mode.toUpperCase()} Supabase`);
  console.log(`   → .env.development.local updated`);
  console.log(`   → Run "npm run dev:local" (or restart dev server)`);
}

function showStatus() {
  if (!fs.existsSync(DEV_LOCAL)) {
    console.log('❌ No .env.development.local file found');
    return;
  }

  const content = fs.readFileSync(DEV_LOCAL, 'utf8');
  const isLocal = content.includes('127.0.0.1') || content.includes('localhost');

  console.log(`Current Supabase mode: ${isLocal ? '🟢 LOCAL' : '🔴 REMOTE'}`);
  console.log('Config file: .env.development.local\n');

  const urlLine = content.split('\n').find(l => l.includes('SUPABASE_URL'));
  if (urlLine) console.log('  ' + urlLine.trim());
}

const command = process.argv[2];

switch (command) {
  case 'local':
    switchTo('local');
    break;
  case 'remote':
    switchTo('remote');
    break;
  case 'status':
  default:
    showStatus();
    console.log('\nAvailable commands:');
    console.log('  npm run supabase:switch:local     → Use local Supabase');
    console.log('  npm run supabase:switch:remote    → Use remote Supabase');
    console.log('  npm run supabase:mode             → Show current mode');
    console.log('  npm run dev:local                 → Start Next.js with local Supabase');
}

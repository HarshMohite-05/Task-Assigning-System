// Creates/updates tables on deploy (the repo has no migrations). Skipped when no DB is configured.
const { execSync } = require('child_process');
const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
if (!url) {
  console.log('[db-push] No database URL set, skipping.');
  process.exit(0);
}
const direct = process.env.POSTGRES_URL_NON_POOLING || url;
try {
  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: direct },
  });
} catch (e) {
  console.error('[db-push] Schema push failed:', e.message);
  process.exit(1);
}

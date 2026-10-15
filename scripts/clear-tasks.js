// Deletes ALL tasks from the database. Usage: DATABASE_URL=... node scripts/clear-tasks.js --yes
const { PrismaClient } = require('@prisma/client');

const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Set DATABASE_URL (or POSTGRES_PRISMA_URL) first.');
  process.exit(1);
}
if (!process.argv.includes('--yes')) {
  console.error('This permanently deletes every task. Re-run with --yes to confirm.');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
prisma.task
  .deleteMany()
  .then((r) => console.log(`Deleted ${r.count} task(s).`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

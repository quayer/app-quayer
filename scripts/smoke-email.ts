/**
 * Smoke test for Resend email integration.
 * Sends a login-code template to the address in argv[2] (default: contato@quayer.com).
 *
 * Run with: npx tsx scripts/smoke-email.ts [to@example.com]
 */

import 'dotenv/config';
import { emailService } from '../src/lib/email/email.service';

async function main() {
  const to = process.argv[2] || process.env.ADMIN_EMAIL || 'contato@quayer.com';

  console.log(`\n🚬 Smoke test — sending login-code to: ${to}`);
  console.log(`   EMAIL_FROM:  ${process.env.EMAIL_FROM}`);
  console.log(`   EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || '(auto)'}\n`);

  try {
    await emailService.sendLoginCodeEmail(
      to,
      'Quayer Tester',
      '123456',
      'http://localhost:3000/login/verify?token=smoke-test',
      15,
    );
    console.log('\n✅ Smoke test passed.');
  } catch (err) {
    console.error('\n❌ Smoke test FAILED:');
    console.error(err);
    process.exit(1);
  }
}

main();

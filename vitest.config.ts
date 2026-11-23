import { defineConfig } from 'vitest/config';

// CHANDELIER_TEST_SLOW=<factor> stretches time limits on slow machines (an emulated x64 VM starts PowerShell in ~50 s).
const slow = Number(process.env.CHANDELIER_TEST_SLOW) || 1;
export default defineConfig({ test: { include: ['test/unit/**/*.test.ts'], testTimeout: 5_000 * slow, hookTimeout: 10_000 * slow } });

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    // like ava, fail a test that finishes without checking anything
    expect: { requireAssertions: true },
  },
})

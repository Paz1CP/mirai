import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "apps/*/src/**/*.{ts,tsx}",
        "apps/extension/{entrypoints,lib}/**/*.{ts,tsx}",
        "packages/*/src/**/*.{ts,tsx}",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      thresholds: { lines: 29, statements: 27.8, functions: 18.38, branches: 24.48 },
    },
  },
});

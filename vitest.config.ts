import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**"],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});

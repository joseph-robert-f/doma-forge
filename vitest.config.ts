import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 30_000,
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentOptions: { jsdom: { url: "http://localhost:3000" } },
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});

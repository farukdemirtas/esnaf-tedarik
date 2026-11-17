import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    // Testler geliştirme veritabanına değil, ayrı test veritabanına bağlanır
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://esnaf:esnaf_dev_pw@localhost:5433/esnaf_tedarik_test?schema=public",
      DATA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      UPLOAD_DIR: "./storage/test-uploads",
    },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});

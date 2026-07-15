import { defineConfig } from "drizzle-kit";

// D1 用のマイグレーション SQL を migrations/ に生成する設定。
// 適用は wrangler (`npm run db:migrate:local` / GH Actions) が行う。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});

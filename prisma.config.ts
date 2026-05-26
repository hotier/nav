import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
  },
});

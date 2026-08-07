import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The "@/..." alias is declared in tsconfig.json for Next; vitest does not read
// tsconfig paths, so it is mirrored here rather than pulling in another plugin.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

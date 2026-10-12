import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/audio-*.test.ts", "tests/mixer-*.test.ts"], environment: "node" } });

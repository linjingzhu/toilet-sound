import { cp, mkdir, rm } from "node:fs/promises";
// The native bundle receives only app assets; simulated device chrome stays in preview.
await rm(new URL("../native-public/", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../native-public/app/", import.meta.url), { recursive: true });
await cp(new URL("../public/app/", import.meta.url), new URL("../native-public/app/", import.meta.url), { recursive: true });

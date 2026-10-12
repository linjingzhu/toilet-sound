import { rename, stat } from "node:fs/promises";
await rename(new URL("../dist-native/native.html", import.meta.url), new URL("../dist-native/index.html", import.meta.url));
await stat(new URL("../dist-native/index.html", import.meta.url));

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.veil.toiletsound",
  appName: "커튼모드",
  webDir: "dist-native",
  ios: { contentInset: "never" },
  android: { backgroundColor: "#eef0f5" },
};

export default config;

# toilet-sound Project Lessons

## 클라우드 세션의 네이티브 빌드 제약 (2026-10-12 확인)

- Claude Code 클라우드 컨테이너는 JDK 21·Gradle 8.14.3을 제공하지만 Android SDK가 없다. `dl.google.com`이 기본 네트워크 정책에서 차단되어 SDK와 Google Maven(AGP)을 받을 수 없다. Android 빌드 전에 환경의 허용 도메인에 `dl.google.com`, `maven.google.com`을 추가해야 한다.
- iOS 빌드는 macOS·Xcode가 필요하다. Linux 클라우드 세션에서는 실행할 수 없다.
- 근거: `.ai/reports/2026-10-12-native-build-environment.md`.

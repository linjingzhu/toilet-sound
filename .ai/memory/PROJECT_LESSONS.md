# toilet-sound Project Lessons

## 클라우드 세션의 네이티브 빌드 제약 (2026-10-12 확인)

- Claude Code 클라우드 컨테이너는 JDK 21·Gradle 8.14.3을 제공하지만 Android SDK가 없다. `dl.google.com`이 기본 네트워크 정책에서 차단되어 SDK와 Google Maven(AGP)을 받을 수 없다. Android 빌드에는 환경의 허용 도메인에 `dl.google.com`이 필요하다.
- `dl.google.com` 허용 후 Android SDK 36 설치와 `./gradlew assembleDebug`가 동작한다. Maven Central은 공유 IP 한도로 429를 줄 수 있으며, 같은 명령을 재시도하면 캐시가 쌓여 통과한다. 컨테이너에 `/dev/kvm`이 없어 에뮬레이터 실행은 불가하다.
- `lintDebug`를 빌드 게이트로 함께 실행한다. `assembleDebug`는 minSdk 미만 API 호출(`NewApi`)을 잡지 못한다.
- iOS 빌드는 macOS·Xcode가 필요하다. Linux 클라우드 세션에서는 실행할 수 없다.
- 근거: `.ai/reports/2026-10-12-native-build-environment.md`.

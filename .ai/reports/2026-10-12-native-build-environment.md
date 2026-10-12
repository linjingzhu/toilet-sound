# 네이티브 빌드 환경 확인 보고

- 기준일: 2026-10-12, Asia/Seoul (UTC+09:00)
- 기준 커밋: `main` @ `1511050` (#2 Capacitor, #3 Flutter 병합 후)
- 인계 자료: Claude Code 인계 패키지(기준 HEAD `932b57f`). 해당 커밋은 이미 `main`에 포함되어 있어 스냅샷을 덮어쓰지 않았다.
- 규칙: `linjingzhu/ai-dev-rule` @ `7e9013d`(stable 4.1.0) 원문을 읽었다.

## 환경

| 항목 | 결과 |
| --- | --- |
| Node / npm | 22.22.0 / 10.9.4 (문서 기준 Node 22 이상 충족) |
| JDK | OpenJDK 21 (`@capacitor/android` 8.5.3 기준과 일치) |
| Gradle | 8.14.3 설치 (wrapper 버전과 일치) |
| Android SDK | 최초 확인 시 `dl.google.com` 차단(403). 사용자가 허용한 뒤 cmdline-tools, `platforms;android-36`, `build-tools;36.0.0`, `platform-tools` 설치 |
| Google Maven (AGP 8.13.0) | 허용 후 접근 가능 |
| Maven Central | 공유 IP 요청 한도로 간헐적 429. 설정 변경 없이 재시도해 해결 |
| 에뮬레이터 | `/dev/kvm` 없음. 실행 불가 |
| Xcode / Swift / CocoaPods | 없음. Linux 클라우드 컨테이너라 iOS 빌드 불가 |
| Flutter SDK | 없음. 다운로드 호스트는 접근 가능 |

## 실행한 검사

| 명령 (`app/`) | 결과 | 답하는 질문 |
| --- | --- | --- |
| `npm run check:runtime` | PASS, 28파일 | 보호 런타임 파일이 바뀌지 않았는가 |
| `npm test` | PASS, 3파일 41개 | 믹서 상태·수명주기 단위 동작이 기대대로인가 |
| `npm run build`, `npm run build:native` | PASS | 웹·네이티브용 웹 번들이 생성되는가 |
| `npm run test:sites` | PASS, 4개 | 미리보기 패키징 계약이 유지되는가 |
| `npx cap sync` | PASS, Android·iOS 플러그인 각 1개 발견, 작업 트리 변경 없음 | 커밋된 플랫폼 셸이 현재 웹 번들·플러그인과 동기 상태인가 |

## Android 빌드

| 명령 (`app/android`) | 결과 | 답하는 질문 |
| --- | --- | --- |
| `./gradlew assembleDebug` | PASS, `app-debug.apk` 생성 | Java 플러그인과 앱 셸이 SDK 36에서 컴파일·패키징되는가 |
| `./gradlew lintDebug` (수정 전) | FAIL, `NewApi` 오류 4개 | 최소 API 24 기기에서 없는 API를 호출하는가 |
| `./gradlew lintDebug` (수정 후) | PASS, 오류 0 | 같은 질문 |
| `aapt2 dump xmltree` (APK manifest) | `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `INTERNET`. 서비스 타입 `mediaPlayback`. 전화 상태 권한 없음 | 병합된 manifest가 설계 문서와 일치하는가 |

- 수정: `MediaPlayer`의 경로 감지 API(`addOnRoutingChangedListener`, `removeOnRoutingChangedListener`, `getRoutedDevice`)는 API 28부터 존재한다. 이전에는 API 24~27 기기에서 첫 재생 준비 시 `NoSuchMethodError`로 앱이 종료될 수 있었다. 이제 버전 조건으로 감싸며, 해당 기기에서는 출력 이름을 기본값으로 표시한다.
- 남은 경고: `StaticFieldLeak` 1건은 엔진이 Application context만 보관해 오탐으로 판단했다. 앱 모듈의 15건은 Capacitor 기본 템플릿의 리소스·아이콘 항목이다.

## 동시 재생 관련 소스 검토

런타임 증거가 아니라 소스 검토 결과다.

- 네이티브 실행 시 `Capacitor.isNativePlatform()`이면 `VeilAudio` 플러그인만 사용한다(`app/src/veil/engine.ts:116`). 네이티브 화면 코드에 Web Audio·`<audio>` 재생이 없어 WebView가 오디오 포커스를 잡을 경로가 없다.
- Android: `requestAudioFocus`, 스트림 음량 변경, `MediaSession` 호출이 없다. `USAGE_MEDIA` 속성과 `PARTIAL_WAKE_LOCK`만 설정한다.
- iOS: `.playback` + `[.mixWithOthers]`로 설정하고 `.duckOthers`가 섞이면 재설정한다. `Info.plist`에 `UIBackgroundModes: audio`가 있다.

## NOT VERIFIED

- Android 기기·에뮬레이터 실행(설치, 재생, API 24~27 실제 동작)
- iOS Swift/Xcode 컴파일
- 실기기 YouTube 동시 재생(A-01~A-09), 백그라운드·잠금·출력 변경·통화
- Flutter MVP의 `flutter analyze`·`flutter test`

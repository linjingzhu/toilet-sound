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
| Android SDK | 없음. `dl.google.com` 접근이 네트워크 정책으로 차단(403)되어 설치 불가 |
| Google Maven (AGP 8.13.0) | `maven.google.com`이 `dl.google.com`으로 리디렉션되어 차단. Gradle 빌드 불가 |
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

## 동시 재생 관련 소스 검토

런타임 증거가 아니라 소스 검토 결과다.

- 네이티브 실행 시 `Capacitor.isNativePlatform()`이면 `VeilAudio` 플러그인만 사용한다(`app/src/veil/engine.ts:116`). 네이티브 화면 코드에 Web Audio·`<audio>` 재생이 없어 WebView가 오디오 포커스를 잡을 경로가 없다.
- Android: `requestAudioFocus`, 스트림 음량 변경, `MediaSession` 호출이 없다. `USAGE_MEDIA` 속성과 `PARTIAL_WAKE_LOCK`만 설정한다.
- iOS: `.playback` + `[.mixWithOthers]`로 설정하고 `.duckOthers`가 섞이면 재설정한다. `Info.plist`에 `UIBackgroundModes: audio`가 있다.

## NOT VERIFIED

- Android Gradle/Java 컴파일, APK 생성
- iOS Swift/Xcode 컴파일
- 실기기 YouTube 동시 재생(A-01~A-09), 백그라운드·잠금·출력 변경·통화
- Flutter MVP의 `flutter analyze`·`flutter test`

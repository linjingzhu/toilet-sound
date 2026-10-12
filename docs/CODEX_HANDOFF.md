# Codex 개발 인계

작성: 2026-10-12, Asia/Seoul. 이 문서는 ChatGPT에서 진행한 `toilet-sound` 개발을 Codex가 이어받기 위한 현재 상태 기록이다. 대화 세션·로그인·실행 중 브라우저 자체를 이전한 것은 아니다.

## 1. 시작 위치

| 항목 | 값 |
| --- | --- |
| 저장소 | https://github.com/linjingzhu/toilet-sound |
| 작업 브랜치 | `feat/pure-ease-mixer` |
| 초안 PR | https://github.com/linjingzhu/toilet-sound/pull/2 |
| 인계 직전 코드·자료 스냅샷 | `afca354aa7b07373208057b5688d96a4bf5cd12d` |
| 기준 main | `328692f8fba8cdfd9decc54c33011eb742134b97` |
| 실제 앱 프로젝트 | `app/` |
| 네이티브 오디오 플러그인 | `native/veil-audio/` |

현재 브랜치를 fetch하고 위 스냅샷과 후속 인계 문서 커밋을 확인한다. 다른 변경이 있으면 보존한다. 초기 앱을 새로 생성하거나 main에서 이미 구현한 기능을 다시 만들지 않는다. PR은 draft이며 병합하지 않았다.

## 2. 먼저 읽을 문서와 규칙

1. 루트 `AGENTS.md`, `.ai/PROJECT_CONTEXT.md`, `.ai/rules-source.json`.
2. `.ai/rules-source.json`이 고정한 `linjingzhu/ai-dev-rule`의 원본 진입 문서와 요구 문서. 고정 커밋은 `7e9013d4594a94486152d8a74a5b9252bfcd4297`, stable 4.1.0이다. 비공개 원문을 이 공개 저장소에 복제하지 않았다. 접근이 없으면 규칙을 읽은 것으로 간주하지 않는다.
3. 앱 변경 전 `app/AGENTS.md` 전체. 보호된 모바일 런타임과 편집 경계를 따른다.
4. [개발 보고](../.ai/reports/2026-10-12-pure-ease-development.md), [제품 요구](product-requirements.md), [동시 재생 시나리오](audio-coexistence.md), [네이티브 설계](native-audio.md), [디자인 QA](../app/design-qa.md).

프로젝트 커뮤니케이션은 **한국어 요약 보고체**다. 다음 해야 할 사항은 `번호` 열이 있는 표로, 1부터 연속 번호를 부여한다. 완료·미실시·사용자 결정 대기를 구분한다. 사용자는 반복적인 확인 요청보다 이미 지시한 작업의 진행을 선호한다.

기능 브랜치를 사용하고 커밋당 변경 파일은 20개 이하로 나눈다. 자동 개발 반복 실행, 유료 CI, 배포·스토어 제출·PR 병합은 이 인계에서 수행한 일이 아니다.

## 3. 제품과 사용자 결정

- 목적: 화장실에서 느끼는 소리의 민망함을 줄이는 사운드 마스킹 매너 앱.
- 배포 목표: Google Play와 Apple App Store.
- 기능: 물·새소리·자연음·노이즈 여러 개와 피아노 한 곡을 섞고, 개별 음량과 앱 전체 음량을 조절한다.
- **핵심 요구: YouTube 등 다른 앱을 정지시키거나 자동으로 음량을 낮추지 않고 함께 재생해야 한다.** 앱이 외부 앱 자체의 백그라운드 재생 제한을 해제하는 기능은 아니다.
- 수익: 광고형. 현재는 광고 예시 영역이며 실제 SDK·운영 키는 없다.
- 마이크·녹음 기능 없음. ANC·완전한 차음·검증하지 않은 소음 제거율을 효과로 표시하지 않는다.
- 사용자가 추가 시안 1번 Pure Ease로 개발 시작을 지시했고, 이후 커튼 개념의 이름과 새로운 참고 색감·디자인을 요청했다.
- 최신 스타일: 펄그레이 홈, 블루그레이 소리 선택 시트, 라벤더·민트 포인트, 부드러운 원형 다이얼과 입체 슬라이더. 참고 원본은 `docs/design/assets/curtain-style-reference.jpg`.

### 제품명은 아직 미확정

현재 UI·설정·Android/iOS 표시명은 **커튼모드 / CURTAIN MODE** 가칭이다. 내부 `@veil/*`, `VeilAudio`, `app.veil.toiletsound`, 저장 키는 기존 기술 이름이다.

사용자에게 새로 제안한 이름은 **1순위 쉿커튼**, 대안 **살랑커튼**, **소곤커튼**이다. 추천 문구는 “소리를 켜고, 마음은 편하게.”이다. 사용자가 이름을 선택한 것은 아니다. 이름을 확정한 것으로 처리하거나 저장소·패키지 전체를 일괄 개명하지 않는다.

[이름 후보·선행 사용 확인·최신 스크린샷](design/name-proposals.md)에 이유를 기록했다. Sound Curtain은 동종 믹서 앱, 커튼온은 공연 앱, 커튼모드는 삼성 TV 기능명 사용 사례를 확인했다. 후보의 사용 가능성·상표 등록 가능성은 확정하지 않았다.

## 4. 구현 상태

| 영역 | 구현 |
| --- | --- |
| 화면 | React·TypeScript. 홈 재생/일시정지, 소리 추가·제거, 개별 음량, 고정 `커튼 음량`, 피아노 선택, 설정, 빈 상태 |
| 웹 믹서 | Web Audio. 트랙별 gain→앱 master gain. 유지 중인 트랙을 불필요하게 재시작하지 않음. 늦은 fetch/decode/resume 및 실패 후 잠재 재생 취소 |
| 상태 복원 | 마지막 트랙·음량 저장. 새 실행은 정지 상태. 기본값은 물 65%, 새 20%, 차분한 피아노 35%, 전체 70% |
| 네이티브 공유 경계 | `src/veil/engine.ts`의 공유 NativeAudioSession, 참조 수·세대·종료 장벽으로 StrictMode/재마운트와 dispose 경합 처리 |
| Android | 트랙별 MediaPlayer, 자체 mediaPlayback foreground 서비스와 정지 알림. 오디오 포커스 요청·시스템 음량 변경 없음. 출력·중단 감지 시 자체 재생 정지 |
| iOS | 트랙별 AVAudioPlayer, `.playback` + `.mixWithOthers`, 백그라운드 오디오 설정. 중단·출력 변경 후 자동 재개 안 함 |
| 내장 음원 | 16초 mono 22050Hz PCM16 데모 WAV 13개. 자연음/노이즈 10종과 피아노풍 3종. 외부 녹음·음악 샘플 없이 NumPy로 생성 |

React 19·Vite 8·Capacitor 8 기반이다. 검증 환경은 Node 24.19.0, npm 11.9.0이었다. 정확한 의존성은 `app/package-lock.json`을 따른다.

### 진입점과 편집 경계

- 웹 미리보기: `App → MobileRuntime/PhoneFrame → Prototype → VeilApp`.
- 실제 앱: `native.html → native-main.tsx → native-app.tsx → VeilApp`. 기기 모형은 실제 앱 번들에 포함하지 않는다.
- 기능 UI: `app/src/veil/VeilApp.tsx`, `app/src/prototype.css`.
- 믹서: `app/src/audio/`, `app/src/veil/useMixer.ts`, `app/src/veil/engine.ts`.
- 보호 런타임: `app/AGENTS.md`에 지정된 `src/mobile/`, App/main/styles, 기기 자산 등 28파일. 이 작업에서 수정하지 않았다. 필요 없이 런타임 잠금 검사를 완화하지 않는다.
- `qa-preview.html`은 1:1 스크린샷을 위한 개발 전용 iframe이며 배포 번들에서 제외된다.

## 5. 실제 검증과 남은 게이트

| 항목 | 결과 |
| --- | --- |
| 믹스 상태·웹 믹서·네이티브 어댑터 단위 테스트 | PASS, 3파일 41개 |
| 모바일 런타임 무결성 | PASS, 28파일 |
| TypeScript 및 웹/네이티브용 웹 번들 | PASS |
| Sites worker | PASS, 4개 |
| Capacitor sync | PASS, Android/iOS 로컬 플러그인 각 1개 발견 |
| WAV 재생성 | 13 WAV + manifest 총 14파일 바이트 일치 |
| 번들 경계 | 두 번들 각각 WAV 13개, QA fixture 0개 |
| 브라우저 UI | 홈·소리 추가·피아노 교체·음량·설정 복원·빈 상태·Pixel 배치 확인 |
| 디자인 QA | passed. 원본과 구현을 같은 입력으로 비교, iPhone 화면 393×852 CSS px / DPR 1 |
| 독립 코드 리뷰 | PASS, 별도 GPT-6 Sol 읽기 전용 FALLBACK REVIEW. 소스·브라우저·웹 패키징 범위 |
| Android/iOS 전체 네이티브 컴파일 | **NOT RUN** — 이전 환경에 Android SDK/JDK 21/Xcode 없음 |
| 실제 기기 YouTube 공존·잠금·중단·출력 전환 | **NOT RUN** |
| 실제 광고 SDK·음원 청취 품질·배터리·스토어 | **NOT RUN** |

네이티브용 웹 번들과 cap sync를 Java/Swift 전체 컴파일이나 실기기 성공으로 보고하지 않는다. Android 알림 권한 흐름·기본 앱 아이콘·음원의 출시 품질은 후속이다. 실제 패키지 엔트리를 Node에서 직접 import하는 경우의 sibling `file:` 의존성 해석은 별도 정리가 필요할 수 있으나 현재 앱은 registerPlugin 경로로 빌드·동기화된다.

주요 검증 명령은 `app/`에서 실행한다.

```sh
npm ci
npm test
npm run check:runtime
npm run build
npm run build:native
npm run test:sites
npx cap sync
```

데모 음원 생성기는 루트 `scripts/generate_demo_audio.py`이며 NumPy가 필요하다. 재현성 확인은 임시 디렉터리에 생성 후 비교하고, 정식 자산을 필요 없이 덮어쓰지 않는다. 생성·통합은 한 담당자가 수행한다.

## 6. 사용자가 요청한 최신 스크린샷

2026-10-12 10:33~10:35 KST에 실제 브라우저 미리보기에서 촬영했다. 모두 393×852px JPG다.

- [홈](design/evidence/curtain-home-20261012.jpg)
- [소리 선택](design/evidence/curtain-library-20261012.jpg)
- [피아노 선택](design/evidence/curtain-piano-20261012.jpg)

현재 ChatGPT의 임시 실행 URL이나 로그인·브라우저 핸들은 Codex에 자동 상속되지 않는다. Codex 환경에서 미리보기 서버를 다시 열면 된다. 실행 방법과 런타임 제약은 `app/AGENTS.md`를 따른다.

## 7. 권장 다음 작업

| 번호 | 다음 할 사항 | 완료 기준 |
| --- | --- | --- |
| 1 | 브랜치·문서·개발 환경 확인 | 기존 구현과 인계 스냅샷을 보존하고 SDK/Xcode 가용성 확인 |
| 2 | Android·iOS 실제 빌드 | Java/Swift 타입·브리지·리소스 연결 오류 해결 및 컴파일 결과 기록 |
| 3 | 실기기 동시 재생 검증 | YouTube 양방향 시작 순서, 백그라운드·잠금·출력 변경·통화/VoIP 확인 |
| 4 | 이름 결정 반영 | 사용자 선택 후 워드마크·표시명·앱 아이콘 정리 |
| 5 | 출시용 음원·광고 SDK | 청취 품질과 광고 결합 전후 오디오 공존 재검증 |

사용자가 아직 선택하지 않은 이름·광고 SDK·스토어 설정을 확정했다고 보고하지 않는다. 수행한 검사와 환경상 수행하지 못한 항목을 분리해 보고한다.

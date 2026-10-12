---
doc_id: ai-project-context
version: 1.2.0
canonical_path: .ai/PROJECT_CONTEXT.md
updated: 2026-10-12
---

# toilet-sound Context

날짜 기준: Asia/Seoul (UTC+09:00).

## repository_mode

```text
repository_mode: personal
```

## Facts the checks read

```text
base_branch: main
merge_deploys: no
runtime_gate: flutter test test/mixer_screen_test.dart
test_command: flutter test
lint_command: flutter analyze && git diff --check
build_command: none
generated: assets/audio/*.wav <- dart run tool/generate_audio_assets.dart
external_scripts: none
public_ids: app.veil.toiletsound (provisional development identifier)
owner_ledger: docs/OWNER_ACTIONS.md
```

Flutter SDK가 PATH에 있는 환경에서 정적 분석과 단위·위젯 테스트를 실행합니다. 위젯 런타임 게이트는 390×844 논리 화면에서 핵심 흐름과 레이아웃 예외를 확인합니다. Android·iOS 빌드 및 실기기 실행 게이트는 아직 정의되지 않았습니다.

## Authoritative product constraints

- 최신 가칭은 커튼모드 / CURTAIN MODE이며 최종 제품명은 미확정입니다. 기존 VEIL은 내부 패키지·플러그인 이름에 남아 있습니다. 개발 저장소명은 `toilet-sound`이며 Android와 iOS를 모두 대상으로 합니다.
- 물소리·자연음·노이즈와 피아노를 혼합하는 광고형 앱입니다. 확정 요구와 기획 제안의 구분은 `docs/product-requirements.md`를 따릅니다.
- 이 앱 때문에 유튜브 등 다른 앱이 정지하거나 자동으로 음량이 줄어들지 않아야 합니다. 검증 조건은 `docs/audio-coexistence.md`에 있습니다.

## Current architecture

- Flutter 기반 Android·iOS 앱 스캐폴드와 첫 믹서 MVP가 있습니다. `just_audio` 다중 플레이어, `audio_session`, `shared_preferences`를 사용합니다.
- iOS는 `.playback + .mixWithOthers` 세션 후보와 오디오 백그라운드 모드를 구성합니다. Android에서는 플레이어의 자동 세션 활성화를 끄고 앱이 오디오 포커스를 요청하지 않는 후보 구조를 구현했습니다. 둘 다 실기기 검증 전입니다.
- `assets/audio/*.wav`는 `tool/generate_audio_assets.dart`가 만드는 기술 검증용 샘플입니다. 출시용 음원 및 권리 확인을 대신하지 않습니다.
- 광고는 화면 내 비활성 자리 표시자만 있으며 AdMob SDK는 아직 연결하지 않았습니다.
- `app/`에는 PR #2의 이전 Capacitor 구현과 `DESIGN-002` 커튼 시안 작업이 남아 있습니다. 시간상 더 최근인 Flutter MVP(PR #3)를 현재 기준으로 삼습니다. 두 구현 가운데 하나를 정리할지는 사용자가 결정합니다(`docs/OWNER_ACTIONS.md`의 `ARCH-001`).
- 공통 규칙은 `.ai/rules-source.json`에 고정된 커밋을 외부 참조합니다. 정책 원문·도구·에이전트를 복제한 전체 도입 상태가 아닙니다.
- 프로젝트별 요구는 이 문서와 `docs/`, 실행 기록은 `.ai/reports/`에서 관리합니다. 최종 검증 스크린샷은 `docs/design/evidence/`에, 임시 스크린샷과 로그는 저장소 밖에 둡니다.

## Current development slice

- 시안 1 `Pure Ease`를 되돌릴 수 있는 구현 기준으로 사용한 첫 Flutter MVP를 정적 분석·테스트합니다. 디자인 결정 기록은 `docs/OWNER_ACTIONS.md`의 `DESIGN-001`·`DESIGN-002`입니다.
- 다음 검증 대상은 Android·iPhone 실기기에서의 혼합, 다른 앱과의 동시 재생, 백그라운드 유지입니다.
- AdMob 연결, 출시용 음원 선정, 스토어 제출·배포는 아직 시작하지 않습니다.

## Communication rules

- 진행·완료 보고는 한국어 요약 보고체로 작성합니다. 핵심 결과, 결정, 미해결 사항을 먼저 짧게 제시합니다.
- 다음 해야 할 사항은 `다음 할 사항` 표로 제시합니다. 첫 번째 열은 `번호`이며, 실행 순서에 따라 1부터 연속 번호를 부여합니다.
- 표의 기본 열은 `번호`, `다음 할 사항`입니다. 필요한 경우에만 상태, 담당 또는 완료 기준을 추가합니다.
- 완료한 작업과 후속 작업을 구분합니다. 사용자 선택이 필요한 항목과 아직 실행하지 않은 항목은 각각 그 상태를 명시합니다.

## Permanently excluded scope

- ANC, 완전한 차음, 검증하지 않은 소음 제거율을 제품 효과로 보장하지 않습니다.

## Local rules

- `커튼 음량`은 앱 내부 믹서 출력만 조절하고 기기 공용 미디어 음량을 변경하지 않습니다.
- 피아노 추가·변경·정지가 기존 환경음이나 다른 앱의 재생을 끊지 않게 합니다.
- 광고 SDK 초기화와 배너 갱신도 동시 재생 검증에 포함합니다.
- 문서나 웹 미리보기 확인을 Android·iPhone 실기기 오디오 검증으로 보고하지 않습니다.

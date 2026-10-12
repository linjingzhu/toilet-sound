---
doc_id: ai-project-context
version: 1.3.0
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
runtime_gate: cd app && npm run check:runtime
test_command: cd app && npm test && npm run test:sites
lint_command: git diff --check
build_command: cd app && npm run build && npm run build:native
generated: app/public/app/audio/*.wav and manifest.json via scripts/generate_demo_audio.py; copied Capacitor web bundles via npm run sync:native
external_scripts: none
public_ids: app.veil.toiletsound (provisional development identifier)
owner_ledger: docs/OWNER_ACTIONS.md
```

웹 믹서·공통 화면·플랫폼별 오디오 기반을 구현했습니다. 실행 결과는 `.ai/reports/2026-10-12-pure-ease-development.md`에 기록합니다. 현재 환경에는 Android SDK, JDK 21과 Xcode가 없어 네이티브 컴파일·실기기 검증은 미실시 상태입니다.

## Authoritative product constraints

- 최신 가칭은 커튼모드 / CURTAIN MODE이며 최종 제품명은 미확정입니다. 기존 VEIL은 내부 패키지·플러그인 이름에 남아 있습니다. 개발 저장소명은 `toilet-sound`이며 Android와 iOS를 모두 대상으로 합니다.
- 물소리·자연음·노이즈와 피아노를 혼합하는 광고형 앱입니다. 확정 요구와 기획 제안의 구분은 `docs/product-requirements.md`를 따릅니다.
- 이 앱 때문에 유튜브 등 다른 앱이 정지하거나 자동으로 음량이 줄어들지 않아야 합니다. 검증 조건은 `docs/audio-coexistence.md`에 있습니다.

## Current architecture

- 앱 프로젝트는 `app/`에서 관리합니다. React·TypeScript 화면과 Capacitor Android·iOS 셸을 연결하는 구조로 개발합니다. Flutter는 이전 검토안입니다.
- Product Design의 보호된 모바일 런타임은 UI 미리보기에 사용하고, 실제 기기용 진입점은 별도로 구성해 앱 화면 코드를 공유합니다.
- 공통 규칙은 `.ai/rules-source.json`에 고정된 커밋을 외부 참조합니다. 정책 원문·도구·에이전트를 복제한 전체 도입 상태가 아닙니다.
- 프로젝트별 요구는 이 문서와 `docs/`, 실행 기록은 `.ai/reports/`에서 관리합니다. 최종 검증 스크린샷은 `docs/design/evidence/`에, 임시 스크린샷과 로그는 저장소 밖에 둡니다.

## Current development slice

- 최초 개발 선택은 Pure Ease(`DESIGN-001`)입니다. 이후 사용자가 제공한 `docs/design/assets/curtain-style-reference.jpg`가 현재 색감·재질 기준이며 `DESIGN-002`에 기록합니다. 펄그레이 홈, 블루그레이 시트와 입체적인 다이얼·슬라이더를 적용합니다.
- 메인 믹서, 소리 선택·혼합, 피아노 변경과 플랫폼별 오디오 기반을 구현합니다. 다른 앱과 동시 재생은 실제 기기의 별도 검증 대상입니다.
- 광고는 배치와 통합 경계를 준비합니다. 실제 광고 운영 키, 자동 개발 루프, 스토어 제출이나 배포는 이번 범위에 포함하지 않습니다.

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

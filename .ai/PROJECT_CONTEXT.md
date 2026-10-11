---
doc_id: ai-project-context
version: 1.0.0
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
runtime_gate: none
test_command: none
lint_command: git diff --check
build_command: none
generated: none
external_scripts: none
public_ids: none
owner_ledger: docs/OWNER_ACTIONS.md
```

현재는 문서만 있는 저장소입니다. 앱 테스트·빌드·실기기 실행 명령은 아직 없습니다.

## Authoritative product constraints

- 제품 가칭은 VEIL / 베일, 개발 저장소명은 `toilet-sound`입니다. Android와 iOS를 모두 대상으로 합니다.
- 물소리·자연음·노이즈와 피아노를 혼합하는 광고형 앱입니다. 확정 요구와 기획 제안의 구분은 `docs/product-requirements.md`를 따릅니다.
- VEIL 때문에 유튜브 등 다른 앱이 정지하거나 자동으로 음량이 줄어들지 않아야 합니다. 검증 조건은 `docs/audio-coexistence.md`에 있습니다.

## Current architecture

- 현재는 기획 문서만 있으며 실행 가능한 앱은 없습니다. Flutter와 AdMob은 검토 방향입니다.
- 공통 규칙은 `.ai/rules-source.json`에 고정된 커밋을 외부 참조합니다. 정책 원문·도구·에이전트를 복제한 전체 도입 상태가 아닙니다.
- 프로젝트별 요구는 이 문서와 `docs/`, 실행 기록은 `.ai/reports/`에서 관리합니다. 임시 스크린샷과 로그 등 작업 산출물은 저장소 밖에 둡니다.

## Current development slice

- 빈 GitHub 저장소를 초기화하고 제품 요구사항과 개발 규칙 참조를 연결합니다.
- 다음 구현 검토 대상은 다른 앱과의 동시 재생을 확인하는 오디오 실험입니다. 실제 UI 구현 전 필요한 디자인 선택은 `docs/OWNER_ACTIONS.md`의 `DESIGN-001`을 참조합니다.
- 이번 작업에서 앱 구현, 자동 개발 루프, 스토어 제출이나 배포를 시작하지 않습니다.

## Permanently excluded scope

- ANC, 완전한 차음, 검증하지 않은 소음 제거율을 제품 효과로 보장하지 않습니다.

## Local rules

- `VEIL 음량`은 앱 내부 믹서 출력만 조절하고 기기 공용 미디어 음량을 변경하지 않습니다.
- 피아노 추가·변경·정지가 기존 환경음이나 다른 앱의 재생을 끊지 않게 합니다.
- 광고 SDK 초기화와 배너 갱신도 동시 재생 검증에 포함합니다.
- 문서나 웹 미리보기 확인을 Android·iPhone 실기기 오디오 검증으로 보고하지 않습니다.

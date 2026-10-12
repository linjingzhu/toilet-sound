# toilet-sound

**커튼모드 / CURTAIN MODE (가칭)** — 물소리, 자연음, 노이즈와 피아노를 섞어 듣는 모바일 매너 앱. 최종 제품명은 검토 중이며 내부 패키지·플러그인에는 기존 VEIL 이름을 사용합니다.

Android / Google Play와 iOS / App Store를 대상으로 개발합니다. 소리를 더해 주변 소리가 덜 두드러지도록 하는 사운드 마스킹 제품이며, ANC나 완전한 차음을 보장하지 않습니다.

## 현재 개발 상태

사용자가 선택한 **추가 시안 1번 · Pure Ease**로 개발을 시작한 뒤, 새 참고 이미지에 맞춰 **펄그레이 홈·블루그레이 선택 화면·입체적인 다이얼과 슬라이더**로 수정했습니다. 화면은 React·TypeScript, 앱 셸은 Capacitor 8, 오디오는 Web Audio와 플랫폼별 로컬 플러그인을 사용합니다. Flutter는 이전 검토안입니다.

| 영역 | 구현 상태 | 검증 범위 |
| --- | --- | --- |
| 메인 믹서 | 재생·일시정지, 소리 추가·제거, 개별 음량, 고정된 커튼 음량 | 웹 빌드·믹서 단위 테스트·브라우저 조작 |
| 소리 라이브러리 | 환경음·노이즈 10종 + 피아노풍 3종 | 원본 합성 데모 WAV 및 생성·무결성 검사 |
| 피아노 변경 | 환경음을 유지하며 피아노 한 곡 교체 | Web Audio 소스 연속성 테스트 |
| 마지막 믹스 | 이 기기에 설정 저장, 새 실행에서 자동 재생 안 함 | 설정 정리·복원 테스트 |
| Android | Java 믹서, mediaPlayback 서비스, 알림 정지 동작 소스 | Capacitor 플러그인 발견·동기화. 네이티브 빌드/실기기 미실시 |
| iOS | Swift 믹서, 혼합 오디오 세션, 백그라운드 오디오 설정 | Capacitor 플러그인 발견·동기화. 네이티브 빌드/실기기 미실시 |
| 광고 | 조작부와 분리한 고정 배너 예시 | 실제 광고 SDK·운영 키·수익 연동 미실시 |

**유튜브 등 다른 앱과의 동시 재생은 최우선 출시 검증 항목으로 남아 있습니다.** 브라우저 재생이나 플랫폼 소스 검토로 실기기 통과를 주장하지 않습니다. 현재 개발 환경에는 Android SDK, JDK 21, Xcode가 없습니다.

## 실행

Node.js 22 이상과 npm을 사용합니다. 음원과 시안용 이미지가 저장소에 포함되어 있어 일반 앱 실행에 Python은 필요하지 않습니다.

```bash
cd app
npm ci
npm run dev
```

개발 서버의 기본 화면은 iPhone / Pixel 10 기기 프레임을 포함한 UI 미리보기입니다. 개발 전용 `qa-preview.html`은 보호된 런타임을 1400 × 1200 iframe에서 실행해 393 × 852 원본 크기로 화면을 검증합니다. 이 파일은 배포 빌드에 포함하지 않습니다. 실제 앱은 별도 `native.html` 진입점에서 **같은 화면 코드**를 사용하며, 기기 모형이나 모의 키보드를 앱에 포함하지 않습니다.

## 검증 명령

```bash
cd app
npm run check:runtime
npm test
npm run build
npm run build:native
npm run test:sites
```

`build:native`는 앱에 포함할 **HTML·CSS·JavaScript·음원 번들**을 만드는 명령입니다. Android APK/AAB나 iOS 앱을 컴파일하는 명령이 아닙니다. `test:sites`는 템플릿의 정적 파일 라우팅 검사이며 외부 서비스 배포를 수행하지 않습니다.

### 실제 기기 프로젝트

```bash
cd app
npm run sync:native
npx cap open android
npx cap open ios
```

- Android: JDK 21 및 호환 Android Studio/SDK 환경에서 `android/` 프로젝트를 엽니다.
- iOS: macOS/Xcode 환경에서 `ios/App/App.xcodeproj`를 엽니다. Swift Package Manager를 사용합니다.
- 식별자 `app.veil.toiletsound`는 개발용 임시 식별자입니다. 배포 계정·서명·최종 앱 이름·출시 식별자는 출시 준비 단계에서 확정합니다.
- 설치된 로컬 플러그인의 네이티브 파일 변경 후 `npx cap sync`를 실행합니다. 상세 동작과 제한은 [네이티브 오디오 문서](docs/native-audio.md)를 따릅니다.

## 구조

```text
app/src/veil/               공통 화면·컨트롤러·네이티브 브리지 연결
app/src/audio/              소리 목록·설정 정리·Web Audio 믹서
app/src/Prototype.tsx       보호된 모바일 미리보기 런타임 연결
app/src/native-app.tsx      실제 앱 화면 연결
app/android/               Android 프로젝트
app/ios/                   iOS 프로젝트
app/public/app/            음원·시안 이미지
native/veil-audio/          로컬 Capacitor Java/Swift 오디오 플러그인
scripts/generate_demo_audio.py  결정적 데모 음원 생성기
```

소리별 게인과 앱 마스터 게인만 변경합니다. 기기 공용 미디어 음량을 변경하거나 다른 앱의 재생을 직접 조작하지 않습니다. 피아노 교체는 해당 레이어만 교체합니다. Android는 오디오 포커스를 요청하지 않고, iOS는 `.playback`과 `.mixWithOthers`를 사용합니다. 실제 OS·앱 조합에서의 결과는 아래 검증표에 기록해야 합니다.

## 음원

현재 음원은 외부 녹음·샘플·MIDI·악보를 사용하지 않은 **합성 데모**입니다. 출시용 자연음의 실재감, 피아노의 음질, 반복 피로도와 소리 마스킹 효과를 검증한 상태가 아닙니다.

음원을 재생성할 때만 Python 3와 NumPy가 필요합니다. 저장소 루트에서 실행합니다.

```bash
python3 scripts/generate_demo_audio.py --output-dir app/public/app/audio
python3 scripts/generate_demo_audio.py --output-dir app/public/app/audio --verify-only
```

현재 생성 환경과 파일별 SHA-256은 `app/public/app/audio/manifest.json`에 기록됩니다. 상세는 [음원 문서](docs/audio-assets.md)를 참고합니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [제품 요구사항](docs/product-requirements.md) | 확정 요구·첫 버전 범위 |
| [최신 디자인·이름 방향](docs/design/curtain-direction.md) | 사용자 참고 이미지에 따른 스타일 전환·가칭 검토 |
| [현재 메인 화면](docs/design/evidence/curtain-main.jpg) | 실제 실행 화면, 393 × 852 |
| [디자인 검수](app/design-qa.md) | 실제 화면 비교·조작·미검증 범위 |
| [동시 재생 검증](docs/audio-coexistence.md) | Android/iOS 실기기 시나리오 |
| [네이티브 오디오](docs/native-audio.md) | 플랫폼별 동작·정지 정책·제한 |
| [첫 개발 버전 보고](.ai/reports/2026-10-12-pure-ease-development.md) | 구현·검증·독립 검토 기록 |
| [프로젝트 컨텍스트](.ai/PROJECT_CONTEXT.md) | 작업 규칙·검증 명령 |
| [사용자 결정 항목](docs/OWNER_ACTIONS.md) | 시안 선택 기록 |

## 개발 규칙

공통 지침은 비공개 [linjingzhu/ai-dev-rule](https://github.com/linjingzhu/ai-dev-rule) 저장소의 `stable`, 세트 `4.1.0`, 커밋 `7e9013d4594a94486152d8a74a5b9252bfcd4297`을 **외부 참조**합니다. Codex는 [AGENTS.md](AGENTS.md), Claude Code는 [CLAUDE.md](CLAUDE.md)를 통해 인증된 원문을 읽습니다. 비공개 규칙을 이 공개 저장소에 복제하지 않으며, 전체 자동 개발 도구 도입이나 자동 개발 루프를 시작한 상태도 아닙니다.

## 다음 할 사항

| 번호 | 다음 할 사항 | 완료 기준 |
| --- | --- | --- |
| 1 | Android·iOS 네이티브 빌드 및 기기 설치 | 두 플랫폼 컴파일·실행 결과 기록 |
| 2 | 유튜브 동시 재생·잠금·경로 변경 검증 | OS·기기·상대 앱별 시나리오 통과 |
| 3 | 출시용 음원 청취·품질 결정 | 반복·볼륨·사용 권한 확인 |
| 4 | 광고 SDK 연결 후 오디오 재검증 | 광고 표시·갱신이 재생을 방해하지 않음 |
| 5 | 스토어 출시 준비 | 명칭·식별자·서명·고지·심사 자료 확정 |

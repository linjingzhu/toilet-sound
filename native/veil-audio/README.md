# @veil/native-audio

VEIL 전용 로컬 Capacitor 8 플러그인입니다. JavaScript 이름은 `VeilAudio`입니다.

`setMix`, `getState`, `dispose`, `stateChanged` 계약과 통합·검증 안내는 저장소의
[`docs/native-audio.md`](../../docs/native-audio.md)에 있습니다. 웹 오디오 대체 구현은
앱이 담당합니다. 이 패키지는 Android/iOS 네이티브 구현만 등록합니다.

Capacitor CLI가 npm 패키지 이름에서 계산하는 iOS 제품 이름은
`VeilNativeAudio`입니다. `Package.swift`의 제품 이름과 일치해야 합니다.

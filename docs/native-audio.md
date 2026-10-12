# VEIL 네이티브 오디오

작성일: 2026-10-12 · 구현: 로컬 Capacitor 8 플러그인 · 실기기 검증: 미실시

`native/veil-audio/`의 `@veil/native-audio`는 Android와 iOS에서 VEIL의 내장 음원을 혼합한다. 앱의 JavaScript 이름은 **`VeilAudio`**다. UI 계약은 `app/src/audio/contracts.ts`와 동일하다.

이 구현은 다른 앱의 재생을 방해하지 않는 것을 목표로 한다. 소스 검토와 플러그인 발견 확인을 Android·iPhone의 실제 동시 재생 통과로 간주하지 않는다. 출시 검증은 [다른 앱과의 동시 재생 시나리오](audio-coexistence.md)의 A-01~A-09를 따른다.

## 호출 계약

```ts
interface MixerRequest {
  playing: boolean;
  masterVolume: number;
  tracks: { id: string; file: string; volume: number }[];
}

interface AudioStatus {
  playing: boolean;
  outputName: string;
  interrupted?: boolean;
  error?: string;
}

setMix(request: MixerRequest): Promise<AudioStatus>;
getState(): Promise<AudioStatus>;
dispose(): Promise<void>;
addListener("stateChanged", (status: AudioStatus) => void);
```

현재 앱은 앱 쪽 `@capacitor/core`의 `registerPlugin<VeilAudioPlugin>("VeilAudio")`로 직접 등록한다. 패키지의 JavaScript 내보내기는 일반 패키지 설치에서도 사용할 수 있다. 다만 이 저장소처럼 형제 디렉터리를 npm `file:` 심볼릭 링크로 설치하면, 패키지의 실경로에서 앱 쪽 peer dependency를 찾지 못할 수 있다. 직접 내보내기를 사용하려면 `npm install --install-links`로 복사 설치하거나 번들러에서 `@capacitor/core`의 단일 해석 경로를 지정한다. 웹 대체 오디오 엔진은 앱이 담당한다. 이 네이티브 패키지는 웹에서 가짜 성공 상태를 반환하지 않는다.

| 항목 | 동작 |
| --- | --- |
| 음량 | 숫자이며 유한한 값이어야 한다. 각 값을 0~1로 제한한 뒤 `masterVolume × track.volume`을 해당 플레이어에 적용한다. 시스템 미디어 음량은 변경하지 않는다. |
| 트랙 식별자 | 고유한 ASCII 식별자, 최대 64자. 영문·숫자로 시작하고 영문·숫자·`_`·`-`만 허용한다. |
| 파일 | 최대 96자의 영문·숫자·`_`·`-` 본체와 소문자 `wav`, `mp3`, `m4a`, `aac` 확장자만 허용한다. 본체는 영문·숫자로 시작한다. 경로 구분자, `..`, URL, 쿼리 문자열은 허용하지 않는다. |
| 트랙 수 | 한 요청에 최대 16개. 현재 앱의 13개 데모 음원을 수용한다. 빈 목록은 정지 상태가 된다. |
| 잘못된 요청 | 전체 요청을 먼저 검증하고 `INVALID_MIX`로 거절한다. 검증 실패만으로 현재 믹스를 바꾸지 않는다. |
| 음원 준비 실패 | 새 플레이어를 해제한다. 기존 재생이 있었다면 유지하며 `error`를 반환·전달한다. 이미 정지 상태라면 `interrupted: true`도 전달한다. |
| 정상 정지 | `playing: false`. 기존 외부 중단이 없으면 `interrupted: false`. 약 120ms의 자체 페이드가 뒤따를 수 있다. |
| 정지 중 선택 변경 | 새 파일을 열거나 준비하지 않고 즉시 상태를 완료한다. 동일한 `id`/`file`의 기존 플레이어만 일시정지 위치를 유지하며, 새 파일 준비는 다음 재생 요청까지 미룬다. |
| 외부 정지 | 알림 정지, 출력 경로 변경, 시스템 중단, 재생 오류로 멈추면 `playing: false, interrupted: true`. `getState()`에도 유지한다. |
| 중단 해제 | 성공한 새 `setMix({ playing: true, ... })` 또는 `dispose()`가 중단 플래그를 해제한다. 중단 후 UI의 정지 상태 동기화는 플래그를 지우지 않는다. |
| 재생 상태 | 음량이 0이어도 사용자가 재생을 켜 놓았다면 `playing: true`다. 가청 여부나 출력 음압 측정값이 아니다. |
| `dispose` | 준비 중 작업, 페이드 완료 작업, 플레이어, 서비스/세션, 관찰자를 정리한다. 이후 새 호출은 정지 상태의 엔진을 만들 수 있다. |

여러 `setMix`가 겹치면 아직 준비 중인 이전 요청을 취소하고 그 요청의 Promise는 취소 시점의 상태로 완료한다. 플레이어를 다시 켜기 위해 이전 요청을 재시도하지 않는다. 앱 컨트롤러는 최신 요청 순서를 관리하고, `interrupted: true` 이벤트를 받으면 대기 중인 재생 의도를 취소해야 한다. 이 계약에는 사용자 재생과 오래된 브리지 요청을 구분하는 별도 명령 ID가 없으므로, 네이티브와 UI 양쪽의 취소 처리가 필요하다.

## 내장 파일 경로

개발 원본 음원 위치는 `app/public/app/audio/`다. `build:native`와 `cap sync`를 거친 결과의 경로는 다음과 같다.

| 플랫폼 | 네이티브가 여는 위치 |
| --- | --- |
| Android | APK asset `public/app/audio/<file>` |
| iOS | 앱 번들 `public/app/audio/<file>` |

Android는 `AssetManager.openFd`의 파일 디스크립터를 `MediaPlayer`에 전달한 뒤 디스크립터를 닫는다. 앱의 `androidResources.noCompress`에 `wav`, `mp3`, `m4a`, `aac`를 지정해 음원 asset이 압축되지 않게 한다. iOS는 파일 이름 검증에 더해 정규화·심볼릭 링크 해석 후 부모 디렉터리와 일반 파일 여부를 검사한다. 두 플랫폼 모두 임의 URL이나 다운로드 파일을 입력으로 받지 않는다.

현재 앱 파일 이름은 `water.wav`, `stream.wav`, `rain.wav`, `ocean.wav`, `birds.wav`, `wind.wav`, `fan.wav`, `white-noise.wav`, `pink-noise.wav`, `brown-noise.wav`, `piano-calm.wav`, `piano-warm.wav`, `piano-night.wav`다. 실제 파일의 포맷 지원과 반복 경계 품질은 실기기에서 확인한다. 네이티브 플레이어의 반복 설정만으로 모든 인코딩의 무음 간격 없는 반복을 보장하지 않는다.

## Android 구현

`VeilAudioPlugin`이 입력을 검증하고 메인 Looper의 `VeilAudioEngine`으로 전달한다. 플레이어 생성·준비 콜백·재생·정리도 같은 Looper에서 처리한다. Android 공식 API는 `MediaPlayer`가 스레드 안전하지 않으며 생성과 접근을 같은 Looper 스레드에서 수행하도록 안내한다. [Android: MediaPlayer](https://developer.android.com/reference/android/media/MediaPlayer)

각 트랙은 독립적인 `MediaPlayer`다. `AudioAttributes.USAGE_MEDIA`와 `CONTENT_TYPE_MUSIC`을 지정하며, 포커스 요청 API와 공용 스트림 음량 조절 API를 호출하지 않는다. `MediaSession`, 미디어 버튼 수신기, 외부 세션 컨트롤러도 만들지 않는다. 이 선택은 다른 앱을 정지·덕킹시키지 않으려는 제품 요구를 따른다. Android의 일반적인 미디어 앱 지침은 포커스 요청을 권장하므로, 포커스를 요청하지 않는 이 구조의 기기·OS별 동작은 반드시 실제로 확인해야 한다. [Android: Manage audio focus](https://developer.android.com/media/optimize/audio-focus)

재생 시작 시 앱이 전경인지 확인하고, 소리가 나기 전에 비공개 `VeilAudioService`를 `mediaPlayback` foreground service로 올린다. 서비스는 즉시 무음 알림을 만들고, 준비 완료 이후 재생을 시작한다. manifest에는 `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, 플레이어용 `WAKE_LOCK`을 포함한다. Android는 해당 서비스 타입과 foreground 알림을 요구한다. [Android: foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#media), [Android: foreground service 시작](https://developer.android.com/develop/background-work/services/fgs/launch)

알림의 **정지** 동작은 이 앱의 서비스로 향하는 명시적·불변 `PendingIntent`다. 앱 전환·화면 잠금에는 재생을 유지한다. 알림 정지, 앱 작업 제거, 서비스 종료, 브리지 파괴에는 자체 재생을 정리한다. 서비스는 `START_NOT_STICKY`이므로 프로세스 종료 후 자동 재생하지 않는다. 정상 일시정지는 페이드가 끝난 뒤 foreground service를 종료하며, 외부 중단은 즉시 음소거·일시정지한다.

현재 프로토타입은 마지막 브리지 소유자가 파괴되면 플레이어와 서비스를 함께 정리한다. 따라서 단순 앱 전환·잠금과, 시스템이 Activity/프로세스를 실제로 파괴하는 경우의 지속 재생 범위는 다르다. A-06에서 두 경우를 구분해 기록한다. 알림 아이콘과 동작 아이콘은 Android가 제공하는 `android.R.drawable` 리소스를 사용한다.

Android 13 이상에서 foreground service를 시작하는 데 `POST_NOTIFICATIONS` 허용이 필수는 아니다. 다만 알림을 거부한 경우 일반 foreground 알림은 알림창에 표시되지 않아 그 안의 정지 버튼도 사용할 수 없다. 시스템의 활성 앱 관리 화면은 별도로 남는다. 이 플러그인은 런타임 알림 권한을 임의로 요청하지 않는다. 앱이 알림창 정지를 제공하려면 앱 manifest의 `POST_NOTIFICATIONS`와 사용자에게 설명하는 권한 요청 흐름이 필요하다. [Android: notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)

이어폰 분리의 `ACTION_AUDIO_BECOMING_NOISY`, 실제 출력 장치 제거와 플레이어 경로 변경을 감시한다. 재생 중 `getRoutedDevice()`를 통해 확인한 출력 이름을 전달하고, 정지 상태에는 **기기 기본 출력**을 전달해 연결 장치 목록을 실제 재생 경로로 오인하지 않게 한다. 통화·통신 모드는 권한 없이 읽을 수 있는 `AudioManager.getMode()`를 재생 의도가 있는 동안 500ms마다 확인해 감지 시 정지한다. 포커스 손실 콜백이나 전화 상태 권한을 사용하지 않으므로, 모든 OEM의 전화·VoIP 중단을 이 감지만으로 보장하지 않는다. 특히 A-08은 출시 전 별도 확인 대상이다. [Android: AudioManager](https://developer.android.com/reference/android/media/AudioManager), [Android: AudioRouting](https://developer.android.com/reference/android/media/AudioRouting)

## iOS 구현

Swift `VeilAudioPlugin`은 `CAPBridgedPlugin`으로 `setMix`, `getState`, `dispose`를 내보낸다. `@MainActor` 엔진이 `AVAudioPlayer`, 오디오 세션, 페이드 완료 작업과 시스템 알림을 한 실행 순서로 처리한다. 트랙마다 `AVAudioPlayer` 하나를 유지한다.

명시적인 재생 시작에서 `AVAudioSession`의 `.playback`, `.default`, `.mixWithOthers`를 설정한다. `.duckOthers`와 `.interruptSpokenAudioAndMixWithOthers`를 활성화하지 않는다. `prepareToPlay()` 자체가 세션을 활성화할 수 있으므로 **믹싱 옵션 설정을 음원 준비보다 먼저** 수행한다. 정지 상태의 선택 변경은 새 플레이어 생성과 `prepareToPlay()` 모두 다음 재생 요청까지 미룬다. [Apple: mixWithOthers](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/mixwithothers), [Apple: prepareToPlay](https://developer.apple.com/documentation/avfaudio/avaudioplayer/preparetoplay())

앱의 `Info.plist`에 `UIBackgroundModes`의 `audio` 항목이 필요하다. 앱이 비활성화되거나 다른 앱이 전경으로 나왔다는 이유만으로 재생을 멈추지 않는다. 재생 중단 후에는 자체 플레이어가 멈춘 것을 확인하고 세션을 비활성화한다. 외부 앱용 원격 제어와 `MPNowPlayingInfoCenter`를 등록하지 않는다. [Apple: background audio 설정](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/MediaPlaybackGuide/Contents/Resources/en.lproj/ConfiguringAudioSettings/ConfiguringAudioSettings.html)

시스템 중단이 시작되면 자체 플레이어를 멈추고 준비 중 명령을 무효화한다. 중단 종료의 `.shouldResume`은 자동 재생 근거로 사용하지 않는다. 사용자가 새로 재생을 눌러야 재개한다. 출력 경로가 실제로 달라지거나 기존 출력이 사라져도 일시정지한다. 엔진 자신의 첫 세션 활성화가 동일한 경로로 보내는 알림은 별도로 처리한다. 미디어 서비스 손실·재설정에는 이전 플레이어를 해제하고 다음 사용자 재생에서 다시 만든다. [Apple: audio interruptions](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions), [Apple: audio route changes](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes), [Apple: media services reset](https://developer.apple.com/documentation/avfaudio/avaudiosession/mediaserviceswereresetnotification)

## 트랙 교체와 작업 취소

동일한 `id`와 `file`의 플레이어를 재사용한다. 피아노를 바꾸거나 지워도 다른 환경음의 플레이어를 재생성하거나 재생 위치를 되돌리지 않는다. 새 파일 준비가 끝나면 새 플레이어를 0 게인에서 시작하고 기존 트랙과 약 120ms 동안 교차 전환한다. 삭제된 플레이어는 해당 페이드가 끝난 뒤 해제한다. 개별 음량과 VEIL 음량도 자체 게인으로 전환한다. iOS는 `setVolume(_:fadeDuration:)`, Android는 Looper에서 실행하는 플레이어별 게인 변경을 사용한다. [Apple: player volume fade](https://developer.apple.com/documentation/avfaudio/avaudioplayer/setvolume(_:fadeduration:))

Android의 비동기 준비 콜백은 현재 요청과 플레이어 소유자를 확인한다. iOS는 파일마다 메인 큐를 양보하고 명령 세대 번호를 다시 확인한다. 새 요청·정지·dispose는 이전 준비 작업과 교체 예정 플레이어를 정리한다. 페이드 후 일시정지 작업에도 취소 확인을 둬서, 빠르게 재개한 플레이어를 이전 정지 작업이 뒤늦게 멈추지 못하게 한다. 게인이 0인 상태에서의 재개에도 같은 규칙을 적용한다.

네이티브 엔진은 합산 음량을 자동 정규화하지 않는다. 트랙이 겹칠 때의 헤드룸, 왜곡, 반복 경계, 배터리 사용량은 음원과 실기기를 함께 검증해야 한다.

## 설치와 Capacitor 발견

앱 디렉터리 `app/`에서 실행한다. 플랫폼 디렉터리가 이미 있으면 `cap add`를 반복하지 않는다.

```sh
npm install ../native/veil-audio
npm run build:native
npx cap add android
npx cap add ios
npx cap sync
```

플랫폼 생성 뒤에는 `npm run sync:native`로 네이티브용 웹 빌드와 동기화를 함께 실행할 수 있다. 패키지 설치와 플랫폼 생성·동기화는 통합 담당 작업이며, Swift/Gradle 컴파일은 별도 단계다.

| 발견 지점 | 예상 값 |
| --- | --- |
| 앱 의존성 | `@veil/native-audio: file:../native/veil-audio` |
| 패키지 metadata | `capacitor.android.src = android`, `capacitor.ios.src = ios` |
| Android plugin class | `app.veil.audio.VeilAudioPlugin` |
| Android JS 이름 | `@CapacitorPlugin(name = "VeilAudio")` |
| iOS Objective-C class | `@objc(VeilAudioPlugin)` |
| iOS JS 이름 | `jsName = "VeilAudio"` |
| SPM 제품 | `VeilNativeAudio` |

Capacitor 8의 기본 iOS 프로젝트는 Swift Package Manager를 사용한다. CLI는 npm 이름 `@veil/native-audio`를 `VeilNativeAudio`로 변환하므로, `Package.swift`의 라이브러리 제품 이름도 이를 따른다. CocoaPods 프로젝트의 로컬 경로 연결을 위한 podspec도 포함하지만, 패키지를 레지스트리나 원격 저장소 태그로 배포하는 절차는 이번 범위가 아니다. [Capacitor: iOS SPM](https://capacitorjs.com/docs/ios/spm), [Capacitor: v8 migration](https://capacitorjs.com/docs/updating/8-0)

설치된 Capacitor 8.5.3의 `cli/dist/plugin.js`, `android/common.js`, `ios/common.js`, `util/spm.js`와 네이티브 브리지 소스를 기준으로 발견 규칙을 확인했다. Java annotation과 Swift `CAPBridgedPlugin` 등록 방식은 공식 가이드를 따른다. [Capacitor: Android plugin](https://capacitorjs.com/docs/plugins/android), [Capacitor: iOS plugin](https://capacitorjs.com/docs/plugins/ios)

네이티브 빌드 환경은 Node 22 이상, Android SDK 36·최소 API 24, JDK 21, iOS 15 이상, Xcode 26 이상을 기준으로 한다. JDK 21은 설치된 `@capacitor/android` 8.5.3의 `compileOptions`와 일치시켰다. 이 작업 환경은 Node 24·JDK 17이며 Android SDK, Xcode와 Swift 도구가 없어 앱 네이티브 빌드를 실행하지 않았다. [Capacitor: environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [Capacitor: v8 migration](https://capacitorjs.com/docs/updating/8-0)

## 검증 범위와 다음 할 사항

2026-10-12에 Android SDK 36·JDK 21 환경에서 `app/android`의 `./gradlew assembleDebug lintDebug`가 통과했다(디버그 APK 생성, lint 오류 0). lint가 찾은 API 28 전용 경로 감지 호출 4곳은 버전 조건으로 감쌌다. API 24~27에서는 출력 경로 변경을 이어폰 분리·장치 제거 감시로만 감지한다. Swift 컴파일, 실제 기기 실행, 백그라운드 동작, 실제 오디오 품질과 다른 앱 동시 재생은 **NOT RUN**이다. 기록: `.ai/reports/2026-10-12-native-build-environment.md`.

| 번호 | 다음 할 사항 | 완료 기준 |
| --- | --- | --- |
| 1 | 플랫폼 셸 동기화 결과 확인 | Android `capacitor.plugins.json`의 classpath, iOS `packageClassList`의 `VeilAudioPlugin`, SPM `VeilNativeAudio` 의존성, 13개 번들 음원 확인 |
| 2 | Android SDK·JDK 21 환경과 Xcode 26 환경에서 네이티브 빌드 | Gradle 빌드 및 iOS 시뮬레이터/기기 빌드 성공, API·actor·manifest 오류 없음 |
| 3 | 다른 앱을 재생하면서 환경음·피아노 교체 및 음량 조절 | A-01~A-04, 기존 환경음의 재생 위치 유지와 외부 앱 정지·덕킹 없음 |
| 4 | 잠금·앱 전환·알림 정지·빠른 정지/재개·0 음량 재개 확인 | 재생과 UI 상태 일치, 이전 페이드/준비 작업의 뒤늦은 재생 또는 정지 없음 |
| 5 | 이어폰·Bluetooth·통화·VoIP·미디어 서비스 중단 확인 | A-06~A-08, 개인정보 보호를 위한 출력 전환 정지와 사용자 의도 없는 자동 재생 없음 |
| 6 | 실제 광고 SDK 적용 시 동시 재생 회귀 검증 | A-05 통과. 현재 네이티브 패키지에는 실제 광고 SDK가 없음 |

위 항목을 통과하기 전에는 두 플랫폼에서 동시 재생을 검증 완료했다고 표시하지 않는다.

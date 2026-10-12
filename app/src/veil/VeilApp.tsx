import { useState, type ComponentType, type CSSProperties, type PropsWithChildren } from "react";
import {
  Bird, CaretRight, Check, CircleNotch, CloudRain, Drop, Fan, GearSix,
  MusicNotes, Pause, Play, PlusCircle, SpeakerHigh, Waveform, Waves, Wind, X,
} from "@phosphor-icons/react";
import {
  DEFAULT_MIX, SOUND_CATALOG, removeSound, selectPiano,
  setMasterVolume, setTrackVolume, toggleSound,
} from "../audio";
import type { SoundCategory } from "../audio/contracts";
import { useMixer } from "./useMixer";

export type ScrollProps = PropsWithChildren<{ className?: string }>;
export type SheetProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  snap?: number;
}>;

type SheetKind = "sounds" | "piano" | "settings" | null;
const categories: { id: SoundCategory; label: string }[] = [
  { id: "nature", label: "자연의 소리" },
  { id: "noise", label: "백색 소음" },
  { id: "piano", label: "피아노" },
];

function SoundIcon({ id, size = 28 }: { id: string; size?: number }) {
  const Icon = id.startsWith("piano") ? MusicNotes
    : id === "birds" ? Bird
    : id === "wind" ? Wind
    : id === "rain" ? CloudRain
    : id === "ocean" || id === "stream" ? Waves
    : id === "fan" ? Fan
    : id.includes("noise") ? Waveform : Drop;
  return <Icon size={size} weight="light" aria-hidden="true" />;
}

function VolumeSlider({ label, value, onChange, master = false }: {
  label: string; value: number; onChange: (value: number) => void; master?: boolean;
}) {
  return (
    <div className={`volume-control ${master ? "volume-control-master" : ""}`} data-scroll-drag="ignore">
      <div className="volume-rail" aria-hidden="true">
        <span style={{ width: `${value * 100}%` }} />
      </div>
      <input
        type="range" min="0" max="100" step="1"
        value={Math.round(value * 100)} aria-label={label}
        aria-valuetext={`${Math.round(value * 100)}%`}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
      />
    </div>
  );
}

export function VeilApp({ Scroll, Sheet, safeAreaTop }: {
  Scroll: ComponentType<ScrollProps>;
  Sheet: ComponentType<SheetProps>;
  safeAreaTop?: number;
}) {
  const { mix, status, busy, update } = useMixer();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [category, setCategory] = useState<SoundCategory>("nature");
  const [notice, setNotice] = useState("");
  const playing = status.playing;
  const tracks = mix.tracks.map((track) => ({ ...track, sound: SOUND_CATALOG.find((sound) => sound.id === track.id)! }));
  const sheetTitle = sheet === "piano" ? "함께 듣는 피아노" : sheet === "settings" ? "내 소리 설정" : "소리 추가";
  const sheetDescription = sheet === "piano" ? "다른 소리는 그대로, 피아노만 바꿔요."
    : sheet === "settings" ? "편안하게 듣기 위한 작은 안내"
    : "좋아하는 소리를 골라 나만의 믹스를 만들어요.";
  const activeCategory = sheet === "piano" ? "piano" : category;

  function openSounds() { setCategory("nature"); setSheet("sounds"); setNotice(""); }
  function closeSheet() { setSheet(null); }

  return (
    <div className="veil-app" data-testid="veil-app" data-playing={playing} style={safeAreaTop === undefined ? undefined : { "--veil-top": `${safeAreaTop}px` } as CSSProperties}>
      <header className="veil-header">
        <span className="veil-wordmark" aria-label="커튼모드">CURTAIN<span>MODE</span></span>
        <button type="button" className="icon-button settings-button" aria-label="설정" onClick={() => { setSheet("settings"); setNotice(""); }}>
          <GearSix size={27} weight="regular" aria-hidden="true" />
        </button>
      </header>

      <Scroll className="veil-scroll">
        <main className="veil-content">
          <section className="hero" aria-label="재생">
            <h1>나만의 소리 커튼</h1>
            <p className="hero-subtitle">다른 앱과 함께 편안하게</p>
            <button
              type="button" className="play-button"
              aria-label={playing ? "믹스 일시정지" : "믹스 재생"}
              aria-pressed={playing}
              disabled={tracks.length === 0}
              onClick={() => update((current) => ({ ...current, playing: !current.playing }))}
            >
              <img src="/app/art/curtain-dial.png" alt="" aria-hidden="true" draggable={false} />
              <span className="play-button-content">
                {busy && !playing ? <CircleNotch className="loading-icon" size={35} aria-hidden="true" />
                  : playing ? <Pause size={34} weight="fill" aria-hidden="true" />
                  : <Play className="play-triangle" size={36} weight="fill" aria-hidden="true" />}
                <span>{busy && !playing ? "준비 중" : playing ? "일시정지" : "커튼 켜기"}</span>
              </span>
            </button>
            <p className="audio-output"><span className="play-state-dot" aria-hidden="true" /><span>{status.outputName || "기본 출력"}</span></p>
          </section>

          {status.error ? <div className="audio-message" role="alert"><p>{status.error}</p><button type="button" onClick={() => update((current) => ({ ...current, playing: true }))}>다시 시도</button></div>
            : status.interrupted ? <p className="audio-message" role="status">재생이 멈췄어요. 준비되면 다시 재생해 주세요.</p> : null}

          <section className="mixer" aria-labelledby="mixer-heading">
            <div className="mixer-heading-row">
              <h2 id="mixer-heading">현재 믹스</h2>
              <button type="button" className="text-button add-sound-button" onClick={openSounds}>
                <PlusCircle size={25} weight="light" aria-hidden="true" />소리 추가
              </button>
            </div>
            <div className="track-list" data-testid="track-list">
              {tracks.map((track) => (
                <article className={`track-row ${track.sound.category === "piano" ? "track-row-piano" : ""}`} key={track.id} data-track-id={track.id}>
                  <div className="track-icon"><SoundIcon id={track.id} size={31} /></div>
                  <div className="track-controls">
                    <div className="track-label-row"><h3>{track.sound.label}</h3><span className="track-volume-value" aria-hidden="true">{Math.round(track.volume * 100)}<small>%</small></span><button type="button" className="icon-button remove-button" aria-label={`${track.sound.label} 제거`} onClick={() => update((current) => removeSound(current, track.id))}><X size={18} weight="light" aria-hidden="true" /></button></div>
                    <VolumeSlider label={`${track.sound.label} 음량`} value={track.volume} onChange={(value) => update((current) => setTrackVolume(current, track.id, value))} />
                    {track.sound.category === "piano" ? <button type="button" className="text-button change-piano-button" onClick={() => setSheet("piano")}>곡 변경<CaretRight size={17} aria-hidden="true" /></button> : null}
                  </div>
                </article>
              ))}
              {tracks.length === 0 ? <div className="empty-mix"><MusicNotes size={34} weight="light" aria-hidden="true" /><h3>첫 소리를 골라볼까요?</h3><p>좋아하는 소리를 더하면 재생할 수 있어요.</p><button type="button" className="primary-button" onClick={openSounds}>소리 고르기</button></div> : null}
            </div>
          </section>

          <span className="visually-hidden" role="status" aria-live="polite">{busy ? "소리 준비 중" : playing ? "믹스 재생 중" : "믹스 정지"}</span>
        </main>
      </Scroll>

      <section className="master-volume" aria-labelledby="master-heading">
        <h2 id="master-heading"><SpeakerHigh size={19} weight="light" aria-hidden="true" />커튼 음량</h2>
        <VolumeSlider master label="커튼 음량" value={mix.masterVolume} onChange={(value) => update((current) => setMasterVolume(current, value))} />
        <span className="master-value" aria-hidden="true">{Math.round(mix.masterVolume * 100)}<small>%</small></span>
      </section>

      <aside className="ad-slot" aria-label="광고 예시" data-testid="ad-slot">
        <span className="ad-label">광고 예시</span>
        <p>일상에 작은 쉼표<span>편안한 공간을 위한 새로운 영감</span></p>
      </aside>

      <Sheet open={sheet !== null} onOpenChange={(open) => { if (!open) closeSheet(); }} title={sheetTitle} description={sheetDescription} snap={0.78}>
        <div className={`veil-sheet-content ${sheet === "settings" ? "veil-sheet-light" : "veil-sheet-dark"}`}>
          <button type="button" className="icon-button sheet-close" aria-label="닫기" onClick={closeSheet}><X size={21} aria-hidden="true" /></button>
          {sheet === "settings" ? (
            <div className="settings-content">
              <div className="settings-card"><SpeakerHigh size={24} weight="light" aria-hidden="true" /><div><h3>다른 앱과 함께 듣기</h3><p>커튼 음량은 이 앱의 소리만 조절해요. 기기의 음량 버튼은 다른 앱 소리에도 영향을 줄 수 있어요.</p><p className="output-setting">현재 출력 · {status.outputName || "기본 출력"}</p></div></div>
              <div className="settings-card"><Drop size={24} weight="light" aria-hidden="true" /><div><h3>편안한 소리로 감싸기</h3><p>주변 소리가 덜 신경 쓰이도록 소리를 더해요. 마이크나 녹음은 사용하지 않아요.</p></div></div>
              <div className="settings-card"><MusicNotes size={24} weight="light" aria-hidden="true" /><div><h3>다음에도 내 믹스 그대로</h3><p>소리와 음량을 이 기기에 저장해요. 앱을 다시 열면 직접 재생할 수 있어요.</p></div></div>
              <button type="button" className="secondary-button" onClick={() => { update(() => ({ ...DEFAULT_MIX, playing: false, tracks: DEFAULT_MIX.tracks.map((track) => ({ ...track })) })); setNotice("기본 믹스를 불러왔어요."); }}>기본 믹스로 되돌리기</button>
              {notice ? <p className="settings-notice" role="status">{notice}</p> : null}
              <p className="version-note">커튼모드 0.1 · 개발 미리보기<br />합성 데모 사운드와 광고 예시를 사용하고 있어요.</p>
            </div>
          ) : (
            <>
              {sheet !== "piano" ? <div className="sound-tabs" role="tablist" aria-label="소리 종류">{categories.map((item, index) => <button key={item.id} type="button" role="tab" id={`tab-${item.id}`} aria-controls="sound-panel" aria-selected={category === item.id} tabIndex={category === item.id ? 0 : -1} onClick={() => setCategory(item.id)} onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % categories.length : event.key === "ArrowLeft" ? (index + categories.length - 1) % categories.length : event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault();
                setCategory(categories[next].id);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus({ preventScroll: true });
              }}>{item.label}</button>)}</div> : null}
              <div className="sound-library" role={sheet === "piano" ? "group" : "tabpanel"} id="sound-panel" aria-labelledby={sheet === "piano" ? undefined : `tab-${category}`} aria-label={sheet === "piano" ? "피아노 곡" : undefined}>
                {SOUND_CATALOG.filter((sound) => sound.category === activeCategory).map((sound) => {
                  const selected = mix.tracks.some((track) => track.id === sound.id);
                  return <button key={sound.id} type="button" className={`sound-option ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => update((current) => sound.category === "piano" ? selectPiano(current, selected ? null : sound.id) : toggleSound(current, sound.id))}>
                    <span className="sound-option-icon"><SoundIcon id={sound.id} /></span><span className="sound-option-copy"><strong>{sound.label}</strong><span>{sound.description}</span></span><span className="sound-option-indicator">{selected ? <Check size={18} weight="bold" aria-hidden="true" /> : <PlusCircle size={22} weight="light" aria-hidden="true" />}</span>
                  </button>;
                })}
              </div>
              {activeCategory === "piano" ? <p className="library-note">피아노는 한 곡씩 함께 재생돼요.</p> : null}
              <button type="button" className="primary-button library-done" onClick={closeSheet}>믹스로 돌아가기<span>{mix.tracks.length}개의 소리</span></button>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

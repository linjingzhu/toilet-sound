import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:veil/main.dart';
import 'package:veil/src/audio/mixer_audio_engine.dart';
import 'package:veil/src/mixer/mixer_controller.dart';
import 'package:veil/src/model/sound_track.dart';
import 'package:veil/src/persistence/mixer_preferences.dart';

void main() {
  testWidgets('primary mixer flow is visible and interactive', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final engine = _FakeAudioEngine();
    final controller = MixerController(engine, _MemoryPreferences());
    await controller.initialize();

    await tester.pumpWidget(VeilApp(controller: controller));

    expect(find.text('나만의 소리, 편안하게'), findsOneWidget);
    expect(find.text('흐르는 물'), findsOneWidget);
    expect(find.text('새소리'), findsOneWidget);
    expect(find.text('차분한 피아노'), findsOneWidget);

    await tester.tap(find.text('재생'));
    await tester.pump();
    expect(find.text('일시정지'), findsOneWidget);
    expect(engine.playedTracks.single, controller.selectedTracks);

    await tester.tap(find.text('소리 추가'));
    await tester.pumpAndSettle();
    expect(find.text('환경음 선택'), findsOneWidget);
    expect(find.text('화이트 노이즈'), findsOneWidget);
  });
}

class _FakeAudioEngine implements MixerAudioEngine {
  final List<Set<SoundTrackId>> playedTracks = [];

  @override
  Future<void> dispose() async {}

  @override
  Future<void> initialize(List<SoundTrack> tracks) async {}

  @override
  Future<void> pause() async {}

  @override
  Future<void> play(Set<SoundTrackId> activeTracks) async {
    playedTracks.add(Set.of(activeTracks));
  }

  @override
  Future<void> setMasterVolume(double volume) async {}

  @override
  Future<void> setTrackActive(SoundTrackId id, bool active) async {}

  @override
  Future<void> setTrackVolume(SoundTrackId id, double volume) async {}
}

class _MemoryPreferences implements MixerPreferences {
  @override
  Future<MixerSnapshot?> load() async => null;

  @override
  Future<void> save(MixerSnapshot snapshot) async {}
}

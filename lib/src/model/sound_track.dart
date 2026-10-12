import 'package:flutter/material.dart';

enum SoundKind { ambience, music }

enum SoundTrackId {
  flowingWater,
  birds,
  whiteNoise,
  pinkNoise,
  calmPiano,
  dawnPiano,
}

@immutable
class SoundTrack {
  const SoundTrack({
    required this.id,
    required this.label,
    required this.assetPath,
    required this.kind,
    required this.icon,
    required this.defaultVolume,
    this.selectedByDefault = false,
  });

  final SoundTrackId id;
  final String label;
  final String assetPath;
  final SoundKind kind;
  final IconData icon;
  final double defaultVolume;
  final bool selectedByDefault;
}

const soundCatalog = <SoundTrack>[
  SoundTrack(
    id: SoundTrackId.flowingWater,
    label: '흐르는 물',
    assetPath: 'assets/audio/flowing_water.wav',
    kind: SoundKind.ambience,
    icon: Icons.water_drop_outlined,
    defaultVolume: 0.66,
    selectedByDefault: true,
  ),
  SoundTrack(
    id: SoundTrackId.birds,
    label: '새소리',
    assetPath: 'assets/audio/birds.wav',
    kind: SoundKind.ambience,
    icon: Icons.flutter_dash_outlined,
    defaultVolume: 0.24,
    selectedByDefault: true,
  ),
  SoundTrack(
    id: SoundTrackId.whiteNoise,
    label: '화이트 노이즈',
    assetPath: 'assets/audio/white_noise.wav',
    kind: SoundKind.ambience,
    icon: Icons.graphic_eq,
    defaultVolume: 0.34,
  ),
  SoundTrack(
    id: SoundTrackId.pinkNoise,
    label: '핑크 노이즈',
    assetPath: 'assets/audio/pink_noise.wav',
    kind: SoundKind.ambience,
    icon: Icons.blur_on_outlined,
    defaultVolume: 0.34,
  ),
  SoundTrack(
    id: SoundTrackId.calmPiano,
    label: '차분한 피아노',
    assetPath: 'assets/audio/calm_piano.wav',
    kind: SoundKind.music,
    icon: Icons.music_note_rounded,
    defaultVolume: 0.36,
    selectedByDefault: true,
  ),
  SoundTrack(
    id: SoundTrackId.dawnPiano,
    label: '새벽의 피아노',
    assetPath: 'assets/audio/dawn_piano.wav',
    kind: SoundKind.music,
    icon: Icons.music_note_rounded,
    defaultVolume: 0.36,
  ),
];

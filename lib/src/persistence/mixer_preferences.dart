import 'package:shared_preferences/shared_preferences.dart';

import '../model/sound_track.dart';

class MixerSnapshot {
  const MixerSnapshot({
    required this.masterVolume,
    required this.selectedTracks,
    required this.trackVolumes,
  });

  final double masterVolume;
  final Set<SoundTrackId> selectedTracks;
  final Map<SoundTrackId, double> trackVolumes;
}

abstract interface class MixerPreferences {
  Future<MixerSnapshot?> load();

  Future<void> save(MixerSnapshot snapshot);
}

class SharedPreferencesMixerPreferences implements MixerPreferences {
  static const _masterKey = 'mixer.masterVolume';
  static const _selectedKey = 'mixer.selectedTracks';

  @override
  Future<MixerSnapshot?> load() async {
    final preferences = await SharedPreferences.getInstance();
    final selectedNames = preferences.getStringList(_selectedKey);
    if (selectedNames == null) return null;

    final selected = <SoundTrackId>{};
    final volumes = <SoundTrackId, double>{};
    for (final id in SoundTrackId.values) {
      if (selectedNames.contains(id.name)) selected.add(id);
      volumes[id] =
          preferences.getDouble(_volumeKey(id)) ??
          soundCatalog.firstWhere((track) => track.id == id).defaultVolume;
    }

    return MixerSnapshot(
      masterVolume: preferences.getDouble(_masterKey) ?? 0.72,
      selectedTracks: selected,
      trackVolumes: volumes,
    );
  }

  @override
  Future<void> save(MixerSnapshot snapshot) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setDouble(_masterKey, snapshot.masterVolume);
    await preferences.setStringList(
      _selectedKey,
      snapshot.selectedTracks.map((id) => id.name).toList(growable: false),
    );
    for (final entry in snapshot.trackVolumes.entries) {
      await preferences.setDouble(_volumeKey(entry.key), entry.value);
    }
  }

  static String _volumeKey(SoundTrackId id) => 'mixer.volume.${id.name}';
}

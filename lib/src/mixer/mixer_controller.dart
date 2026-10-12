import 'package:flutter/foundation.dart';

import '../audio/mixer_audio_engine.dart';
import '../model/sound_track.dart';
import '../persistence/mixer_preferences.dart';

class MixerController extends ChangeNotifier {
  MixerController(this._audioEngine, this._preferences);

  final MixerAudioEngine _audioEngine;
  final MixerPreferences _preferences;
  final Set<SoundTrackId> _selectedTracks = {};
  final Map<SoundTrackId, double> _trackVolumes = {};

  double _masterVolume = 0.72;
  bool _isPlaying = false;
  bool _isBusy = false;
  String? _errorMessage;

  List<SoundTrack> get tracks => soundCatalog;
  bool get isPlaying => _isPlaying;
  bool get isBusy => _isBusy;
  double get masterVolume => _masterVolume;
  String? get errorMessage => _errorMessage;
  Set<SoundTrackId> get selectedTracks => Set.unmodifiable(_selectedTracks);

  Iterable<SoundTrack> get selectedSoundTracks =>
      soundCatalog.where((track) => _selectedTracks.contains(track.id));

  Iterable<SoundTrack> get ambienceTracks =>
      soundCatalog.where((track) => track.kind == SoundKind.ambience);

  SoundTrack get selectedMusic => soundCatalog.firstWhere(
    (track) =>
        track.kind == SoundKind.music && _selectedTracks.contains(track.id),
    orElse: () =>
        soundCatalog.firstWhere((track) => track.kind == SoundKind.music),
  );

  double volumeFor(SoundTrackId id) => _trackVolumes[id] ?? 0;

  bool isSelected(SoundTrackId id) => _selectedTracks.contains(id);

  Future<void> initialize() async {
    final snapshot = await _preferences.load();
    _masterVolume = snapshot?.masterVolume ?? 0.72;

    for (final track in soundCatalog) {
      _trackVolumes[track.id] =
          snapshot?.trackVolumes[track.id] ?? track.defaultVolume;
      if (snapshot?.selectedTracks.contains(track.id) ??
          track.selectedByDefault) {
        _selectedTracks.add(track.id);
      }
    }

    if (!_selectedTracks.any(_isMusic)) {
      _selectedTracks.add(SoundTrackId.calmPiano);
    }

    await _audioEngine.initialize(soundCatalog);
    await _audioEngine.setMasterVolume(_masterVolume);
    for (final entry in _trackVolumes.entries) {
      await _audioEngine.setTrackVolume(entry.key, entry.value);
    }
  }

  Future<void> togglePlayback() async {
    if (_isBusy) return;
    _setBusy(true);
    try {
      if (_isPlaying) {
        await _audioEngine.pause();
        _isPlaying = false;
      } else {
        await _audioEngine.play(_selectedTracks);
        _isPlaying = true;
      }
      _errorMessage = null;
    } catch (_) {
      _errorMessage = '소리를 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    } finally {
      _setBusy(false);
    }
  }

  Future<void> setTrackSelected(SoundTrackId id, bool selected) async {
    final track = soundCatalog.firstWhere((item) => item.id == id);
    if (track.kind == SoundKind.music && !selected) return;

    if (selected) {
      _selectedTracks.add(id);
    } else {
      _selectedTracks.remove(id);
    }
    if (_isPlaying) await _audioEngine.setTrackActive(id, selected);
    notifyListeners();
    await _save();
  }

  Future<void> setTrackVolume(SoundTrackId id, double volume) async {
    _trackVolumes[id] = volume;
    notifyListeners();
    await _audioEngine.setTrackVolume(id, volume);
    await _save();
  }

  Future<void> setMasterVolume(double volume) async {
    _masterVolume = volume;
    notifyListeners();
    await _audioEngine.setMasterVolume(volume);
    await _save();
  }

  Future<void> changeMusic() async {
    final current = selectedMusic.id;
    final next = current == SoundTrackId.calmPiano
        ? SoundTrackId.dawnPiano
        : SoundTrackId.calmPiano;
    _selectedTracks
      ..removeWhere(_isMusic)
      ..add(next);

    if (_isPlaying) {
      await _audioEngine.setTrackActive(current, false);
      await _audioEngine.setTrackActive(next, true);
    }
    notifyListeners();
    await _save();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  bool _isMusic(SoundTrackId id) =>
      soundCatalog.firstWhere((track) => track.id == id).kind ==
      SoundKind.music;

  Future<void> _save() => _preferences.save(
    MixerSnapshot(
      masterVolume: _masterVolume,
      selectedTracks: _selectedTracks,
      trackVolumes: _trackVolumes,
    ),
  );

  void _setBusy(bool value) {
    _isBusy = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _audioEngine.dispose();
    super.dispose();
  }
}

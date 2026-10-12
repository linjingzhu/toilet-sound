import 'dart:async';

import 'package:flutter/material.dart';

import '../model/sound_track.dart';
import '../theme/veil_theme.dart';
import 'mixer_controller.dart';

class MixerScreen extends StatefulWidget {
  const MixerScreen({required this.controller, super.key});

  final MixerController controller;

  @override
  State<MixerScreen> createState() => _MixerScreenState();
}

class _MixerScreenState extends State<MixerScreen> {
  MixerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    controller.addListener(_onControllerChanged);
  }

  @override
  void dispose() {
    controller.removeListener(_onControllerChanged);
    controller.dispose();
    super.dispose();
  }

  void _onControllerChanged() {
    if (!mounted) return;
    setState(() {});
    final message = controller.errorMessage;
    if (message != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              content: Text(message),
              action: SnackBarAction(
                label: '닫기',
                onPressed: controller.clearError,
              ),
            ),
          );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF6FAF7), VeilColors.cream],
            stops: [0, 0.38],
          ),
        ),
        child: SafeArea(
          child: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(24, 14, 24, 28),
                sliver: SliverList.list(
                  children: [
                    _Header(onSettings: _showAbout),
                    const SizedBox(height: 30),
                    Text(
                      '나만의 소리, 편안하게',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 7),
                    Text(
                      '다른 앱의 소리를 방해하지 않고 함께 들어요.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 28),
                    _PlayButton(
                      isPlaying: controller.isPlaying,
                      isBusy: controller.isBusy,
                      onPressed: controller.togglePlayback,
                    ),
                    const SizedBox(height: 15),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.volume_up_outlined,
                          size: 19,
                          color: VeilColors.muted,
                        ),
                        SizedBox(width: 7),
                        Text(
                          '휴대폰 스피커',
                          style: TextStyle(color: VeilColors.muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 36),
                    _SectionHeader(onAdd: _showSoundPicker),
                    const Divider(height: 26),
                    ...controller.selectedSoundTracks.map(
                      (track) => _TrackControl(
                        track: track,
                        volume: controller.volumeFor(track.id),
                        onVolumeChanged: (value) => unawaited(
                          controller.setTrackVolume(track.id, value),
                        ),
                        onRemove: track.kind == SoundKind.ambience
                            ? () => unawaited(
                                controller.setTrackSelected(track.id, false),
                              )
                            : null,
                        onChangeMusic: track.kind == SoundKind.music
                            ? () => unawaited(controller.changeMusic())
                            : null,
                      ),
                    ),
                    const SizedBox(height: 9),
                    _MasterVolume(
                      value: controller.masterVolume,
                      onChanged: (value) =>
                          unawaited(controller.setMasterVolume(value)),
                    ),
                    const SizedBox(height: 24),
                    const _AdPlaceholder(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showSoundPicker() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('환경음 선택', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                '여러 소리를 함께 켜고 각각의 크기를 조절할 수 있어요.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 12),
              ...controller.ambienceTracks.map(
                (track) => CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  secondary: Icon(track.icon, color: VeilColors.teal),
                  title: Text(track.label),
                  value: controller.isSelected(track.id),
                  onChanged: (selected) {
                    unawaited(
                      controller.setTrackSelected(track.id, selected ?? false),
                    );
                    Navigator.of(context).pop();
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showAbout() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => const SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(24, 6, 24, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'VEIL 오디오 안내',
                style: TextStyle(
                  color: VeilColors.ink,
                  fontSize: 21,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 12),
              Text(
                'VEIL 음량은 이 앱의 믹스만 바꿉니다. 다른 앱이나 휴대폰의 미디어 음량은 변경하지 않습니다.',
                style: TextStyle(color: VeilColors.muted, height: 1.55),
              ),
              SizedBox(height: 8),
              Text(
                '현재 음원은 기술 검증용으로 생성한 샘플이며, 출시용 음원은 별도로 교체해야 합니다.',
                style: TextStyle(color: VeilColors.muted, height: 1.55),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onSettings});

  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Text(
          'V E I L',
          style: TextStyle(
            color: VeilColors.ink,
            fontWeight: FontWeight.w700,
            fontSize: 18,
            letterSpacing: 2.5,
          ),
        ),
        const Spacer(),
        IconButton(
          tooltip: '오디오 안내',
          onPressed: onSettings,
          icon: const Icon(Icons.info_outline_rounded),
          color: VeilColors.ink,
        ),
      ],
    );
  }
}

class _PlayButton extends StatelessWidget {
  const _PlayButton({
    required this.isPlaying,
    required this.isBusy,
    required this.onPressed,
  });

  final bool isPlaying;
  final bool isBusy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = isPlaying ? '일시정지' : '재생';
    return Center(
      child: Semantics(
        button: true,
        label: 'VEIL 믹스 $label',
        child: InkResponse(
          onTap: isBusy ? null : onPressed,
          radius: 84,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            width: 154,
            height: 154,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [VeilColors.tealLight, VeilColors.teal],
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x33237F7C),
                  blurRadius: 30,
                  offset: Offset(0, 12),
                ),
              ],
              border: Border.all(color: Colors.white, width: 5),
            ),
            child: isBusy
                ? const Center(
                    child: SizedBox.square(
                      dimension: 31,
                      child: CircularProgressIndicator(
                        strokeWidth: 3,
                        color: Colors.white,
                      ),
                    ),
                  )
                : Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        isPlaying
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 54,
                      ),
                      Text(
                        label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text('현재 믹스', style: Theme.of(context).textTheme.titleLarge),
        const Spacer(),
        TextButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.add_circle_outline),
          label: const Text('소리 추가'),
        ),
      ],
    );
  }
}

class _TrackControl extends StatelessWidget {
  const _TrackControl({
    required this.track,
    required this.volume,
    required this.onVolumeChanged,
    this.onRemove,
    this.onChangeMusic,
  });

  final SoundTrack track;
  final double volume;
  final ValueChanged<double> onVolumeChanged;
  final VoidCallback? onRemove;
  final VoidCallback? onChangeMusic;

  @override
  Widget build(BuildContext context) {
    final percent = (volume * 100).round();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: const BoxDecoration(
                  color: VeilColors.mist,
                  shape: BoxShape.circle,
                ),
                child: Icon(track.icon, color: VeilColors.teal),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  track.label,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text(
                '$percent%',
                style: const TextStyle(
                  color: VeilColors.muted,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              if (onRemove != null)
                IconButton(
                  tooltip: '${track.label} 제거',
                  onPressed: onRemove,
                  icon: const Icon(Icons.close_rounded),
                  color: VeilColors.muted,
                ),
            ],
          ),
          Semantics(
            label: '${track.label} 음량',
            value: '$percent%',
            child: Slider(value: volume, onChanged: onVolumeChanged),
          ),
          if (onChangeMusic != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onChangeMusic,
                iconAlignment: IconAlignment.end,
                icon: const Icon(Icons.chevron_right_rounded),
                label: const Text('곡 변경'),
              ),
            ),
          const Divider(height: 15),
        ],
      ),
    );
  }
}

class _MasterVolume extends StatelessWidget {
  const _MasterVolume({required this.value, required this.onChanged});

  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final percent = (value * 100).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('VEIL 음량', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            Text('$percent%', style: const TextStyle(color: VeilColors.muted)),
          ],
        ),
        Semantics(
          label: 'VEIL 전체 믹스 음량',
          value: '$percent%',
          child: Slider(value: value, onChanged: onChanged),
        ),
      ],
    );
  }
}

class _AdPlaceholder extends StatelessWidget {
  const _AdPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '광고가 표시될 영역',
      child: Container(
        height: 92,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFEAF2EB),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFD6E1D7)),
        ),
        child: const Row(
          children: [
            Icon(Icons.spa_outlined, color: VeilColors.teal),
            SizedBox(width: 13),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '광고 영역',
                    style: TextStyle(color: VeilColors.muted, fontSize: 12),
                  ),
                  SizedBox(height: 3),
                  Text(
                    '재생 조작과 분리된 배너 자리',
                    style: TextStyle(
                      color: VeilColors.ink,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

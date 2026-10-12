import 'package:flutter/material.dart';

import 'src/audio/veil_audio_engine.dart';
import 'src/mixer/mixer_controller.dart';
import 'src/mixer/mixer_screen.dart';
import 'src/persistence/mixer_preferences.dart';
import 'src/theme/veil_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final controller = MixerController(
    VeilAudioEngine(),
    SharedPreferencesMixerPreferences(),
  );
  await controller.initialize();

  runApp(VeilApp(controller: controller));
}

class VeilApp extends StatelessWidget {
  const VeilApp({required this.controller, super.key});

  final MixerController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VEIL',
      debugShowCheckedModeBanner: false,
      theme: VeilTheme.light,
      home: MixerScreen(controller: controller),
    );
  }
}

import 'package:flutter/material.dart';

abstract final class VeilColors {
  static const ink = Color(0xFF092C3C);
  static const teal = Color(0xFF237F7C);
  static const tealLight = Color(0xFF6DB8B2);
  static const cream = Color(0xFFF8F5EE);
  static const mist = Color(0xFFE8F3F1);
  static const muted = Color(0xFF667477);
}

abstract final class VeilTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: VeilColors.teal,
      brightness: Brightness.light,
      surface: VeilColors.cream,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme.copyWith(
        primary: VeilColors.teal,
        onPrimary: Colors.white,
        surface: VeilColors.cream,
        onSurface: VeilColors.ink,
      ),
      scaffoldBackgroundColor: VeilColors.cream,
      textTheme: const TextTheme(
        headlineMedium: TextStyle(
          color: VeilColors.ink,
          fontSize: 30,
          fontWeight: FontWeight.w800,
          height: 1.18,
          letterSpacing: -1.1,
        ),
        titleLarge: TextStyle(
          color: VeilColors.ink,
          fontSize: 22,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
        ),
        titleMedium: TextStyle(
          color: VeilColors.ink,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
        bodyMedium: TextStyle(color: VeilColors.muted, fontSize: 15),
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: VeilColors.teal,
        inactiveTrackColor: Color(0xFFD9DEDC),
        thumbColor: VeilColors.teal,
        overlayColor: Color(0x22237F7C),
        trackHeight: 5,
      ),
    );
  }
}

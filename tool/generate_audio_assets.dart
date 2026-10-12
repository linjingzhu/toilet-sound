import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

const sampleRate = 22050;
const durationSeconds = 8;
const sampleCount = sampleRate * durationSeconds;

void main() {
  final output = Directory('assets/audio')..createSync(recursive: true);
  final random = Random(20261012);

  _writeWav(
    '${output.path}/white_noise.wav',
    List.generate(sampleCount, (_) => (random.nextDouble() * 2 - 1) * 0.25),
  );
  _writeWav('${output.path}/pink_noise.wav', _pinkNoise(Random(1701)));
  _writeWav('${output.path}/flowing_water.wav', _water(Random(4242)));
  _writeWav('${output.path}/birds.wav', _birds());
  _writeWav(
    '${output.path}/calm_piano.wav',
    _piano([261.63, 329.63, 392.00, 329.63]),
  );
  _writeWav(
    '${output.path}/dawn_piano.wav',
    _piano([220.00, 277.18, 329.63, 246.94]),
  );
}

List<double> _pinkNoise(Random random) {
  final rows = List<double>.filled(7, 0);
  var counter = 0;
  return List.generate(sampleCount, (_) {
    counter++;
    var changed = counter;
    var index = 0;
    while ((changed & 1) == 0 && index < rows.length) {
      rows[index] = random.nextDouble() * 2 - 1;
      changed >>= 1;
      index++;
    }
    final value = rows.reduce((a, b) => a + b) / rows.length;
    return value * 0.42;
  });
}

List<double> _water(Random random) {
  var smooth = 0.0;
  var slower = 0.0;
  return List.generate(sampleCount, (index) {
    final noise = random.nextDouble() * 2 - 1;
    smooth = smooth * 0.87 + noise * 0.13;
    slower = slower * 0.993 + noise * 0.007;
    final time = index / sampleRate;
    final ripple = sin(2 * pi * 1.25 * time) * 0.025;
    return (smooth * 0.64 + slower * 0.42 + ripple).clamp(-0.8, 0.8);
  });
}

List<double> _birds() {
  return List.generate(sampleCount, (index) {
    final time = index / sampleRate;
    var value = 0.0;
    for (final start in [0.75, 2.25, 4.8, 6.35]) {
      final local = time - start;
      if (local >= 0 && local < 0.32) {
        final envelope = sin(pi * local / 0.32);
        final frequency = 1600 + 1050 * local;
        value += sin(2 * pi * frequency * local) * envelope * 0.2;
      }
    }
    return value;
  });
}

List<double> _piano(List<double> notes) {
  return List.generate(sampleCount, (index) {
    final time = index / sampleRate;
    final noteIndex = (time / 2).floor().clamp(0, notes.length - 1);
    final local = time % 2;
    final frequency = notes[noteIndex];
    final attack = min(1.0, local / 0.05);
    final decay = exp(-local * 1.45);
    final envelope = attack * decay;
    final tone =
        sin(2 * pi * frequency * local) +
        0.35 * sin(2 * pi * frequency * 2 * local) +
        0.12 * sin(2 * pi * frequency * 3 * local);
    return tone * envelope * 0.18;
  });
}

void _writeWav(String path, List<double> samples) {
  final dataLength = samples.length * 2;
  final bytes = BytesBuilder();
  bytes.add('RIFF'.codeUnits);
  bytes.add(_littleEndian(36 + dataLength, 4));
  bytes.add('WAVEfmt '.codeUnits);
  bytes.add(_littleEndian(16, 4));
  bytes.add(_littleEndian(1, 2));
  bytes.add(_littleEndian(1, 2));
  bytes.add(_littleEndian(sampleRate, 4));
  bytes.add(_littleEndian(sampleRate * 2, 4));
  bytes.add(_littleEndian(2, 2));
  bytes.add(_littleEndian(16, 2));
  bytes.add('data'.codeUnits);
  bytes.add(_littleEndian(dataLength, 4));
  for (final sample in samples) {
    final value = (sample.clamp(-1.0, 1.0) * 32767).round();
    bytes.add(_littleEndian(value & 0xffff, 2));
  }
  File(path).writeAsBytesSync(bytes.takeBytes(), flush: true);
}

Uint8List _littleEndian(int value, int length) {
  final result = Uint8List(length);
  for (var index = 0; index < length; index++) {
    result[index] = (value >> (index * 8)) & 0xff;
  }
  return result;
}

import AVFoundation
import Foundation
import UIKit

/// A single actor owns players, fades, session changes and native callbacks.
@MainActor
final class VeilAudioEngine: NSObject, AVAudioPlayerDelegate {
    private static let fadeDuration: TimeInterval = 0.12

    private final class Track {
        let id: String
        let file: String
        let player: AVAudioPlayer
        var cleanup: DispatchWorkItem?
        var cleanupVersion = 0

        init(entry: AudioMixRequest.Entry, player: AVAudioPlayer) {
            id = entry.id
            file = entry.file
            self.player = player
        }
    }

    private final class PendingMix {
        let request: AudioMixRequest
        let token: UInt64
        let completion: ([String: Any]) -> Void
        var remaining: [AudioMixRequest.Entry]
        var staged: [String: Track] = [:]

        init(_ request: AudioMixRequest, token: UInt64, completion: @escaping ([String: Any]) -> Void) {
            self.request = request
            self.token = token
            self.completion = completion
            remaining = request.tracks
        }
    }

    var onStateChange: (([String: Any]) -> Void)?
    private let commands: AudioCommandGate
    private let session = AVAudioSession.sharedInstance()
    private var tracks: [String: Track] = [:]
    private var retiring: [ObjectIdentifier: Track] = [:]
    private var pending: PendingMix?
    private var observers: [NSObjectProtocol] = []
    private var playing = false
    private var interrupted = false
    private var systemInterruptionActive = false
    private var sessionActive = false
    private var disposed = false
    private var lastError: String?
    private var routeSignature = ""

    init(commands: AudioCommandGate) {
        self.commands = commands
        super.init()
        routeSignature = currentRouteSignature()
        observe(AVAudioSession.interruptionNotification) { [weak self] note in self?.handleInterruption(note) }
        observe(AVAudioSession.routeChangeNotification) { [weak self] note in self?.handleRouteChange(note) }
        observe(AVAudioSession.mediaServicesWereLostNotification) { [weak self] _ in
            self?.mediaServicesUnavailable()
        }
        observe(AVAudioSession.mediaServicesWereResetNotification) { [weak self] _ in
            self?.mediaServicesUnavailable()
        }
        let token = NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification, object: nil, queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.async { self?.dispose() }
        }
        observers.append(token)
    }

    private func observe(_ name: Notification.Name, action: @escaping @MainActor (Notification) -> Void) {
        let token = NotificationCenter.default.addObserver(forName: name, object: session, queue: .main) { note in
            DispatchQueue.main.async { action(note) }
        }
        observers.append(token)
    }

    func state() -> [String: Any] {
        let names = session.currentRoute.outputs.map(\.portName)
        var status: [String: Any] = [
            "playing": playing,
            "outputName": names.isEmpty ? "기기 기본 출력" : names.joined(separator: ", "),
            "interrupted": interrupted
        ]
        if let lastError { status["error"] = lastError }
        return status
    }

    private func emit() {
        guard !disposed else { return }
        onStateChange?(state())
    }

    private var wantsPlayback: Bool { playing || pending?.request.playing == true }

    private var hasRunningAudio: Bool {
        !retiring.isEmpty || tracks.values.contains(where: { $0.player.isPlaying })
    }

    func setMix(_ request: AudioMixRequest, token: UInt64, completion: @escaping ([String: Any]) -> Void) {
        guard !disposed, commands.contains(token) else { completion(state()); return }
        // The next Play supplies the selection again. Stop never opens or prepares a file.
        if !request.playing {
            playing = false
            lastError = nil
            cancelPending()
            var retained: [String: Track] = [:]
            for entry in request.tracks {
                if let old = tracks[entry.id], old.file == entry.file { retained[entry.id] = old }
            }
            for old in tracks.values {
                if retained[old.id] === old { fadePause(old) }
                else { retire(old) }
            }
            tracks = retained
            deactivateIfIdle()
            emit()
            completion(state())
            return
        }
        cancelPending()
        if request.playing && systemInterruptionActive {
            stopExternally("통화나 시스템 오디오 중단이 끝난 뒤 다시 재생해 주세요.")
            completion(state())
            return
        }
        let command = PendingMix(request, token: token, completion: completion)
        pending = command
        if request.playing {
            do {
                // prepareToPlay() itself activates the session. Configure mixing first.
                if session.category != .playback || session.mode != .default || session.categoryOptions != [.mixWithOthers] {
                    try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
                }
                if !sessionActive || !playing {
                    try session.setActive(true)
                    sessionActive = true
                }
                routeSignature = currentRouteSignature()
            } catch {
                failPending(command, "소리 재생을 시작하지 못했습니다. 다시 시도해 주세요.")
                return
            }
        }
        prepareNext(command)
    }

    private func assetURL(_ filename: String) throws -> URL {
        guard let resources = Bundle.main.resourceURL else {
            throw AudioMixError.playback("앱의 오디오 폴더를 찾을 수 없습니다.")
        }
        let base = resources.appendingPathComponent("public/app/audio", isDirectory: true)
            .standardizedFileURL.resolvingSymlinksInPath()
        let file = base.appendingPathComponent(filename, isDirectory: false)
            .standardizedFileURL.resolvingSymlinksInPath()
        guard file.deletingLastPathComponent() == base,
              (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else {
            throw AudioMixError.playback("내장 음원을 열 수 없습니다. 앱의 오디오 파일을 확인해 주세요.")
        }
        return file
    }

    private func prepareNext(_ command: PendingMix) {
        guard pending === command else { return }
        guard commands.contains(command.token) else { cancelPending(); deactivateIfIdle(); return }
        guard !command.remaining.isEmpty else { commit(command); return }
        let entry = command.remaining.removeFirst()
        do {
            if let existing = tracks[entry.id], existing.file == entry.file {
                if command.request.playing && !existing.player.isPlaying && !existing.player.prepareToPlay() {
                    throw AudioMixError.playback("소리를 준비하지 못했습니다.")
                }
            } else {
                let player = try AVAudioPlayer(contentsOf: assetURL(entry.file))
                player.numberOfLoops = -1
                player.volume = 0
                player.delegate = self
                let track = Track(entry: entry, player: player)
                command.staged[entry.id] = track
                // Stopped selection changes do not activate the device's audio session.
                if command.request.playing && !player.prepareToPlay() {
                    throw AudioMixError.playback("소리를 준비하지 못했습니다.")
                }
            }
        } catch {
            failPending(command, "내장 음원을 재생할 수 없습니다. 앱의 오디오 파일을 확인해 주세요.")
            return
        }
        // Yield between files so Stop, disposal and route/interruption callbacks can cancel.
        DispatchQueue.main.async { [weak self, weak command] in
            guard let self, let command else { return }
            self.prepareNext(command)
        }
    }

    private func commit(_ command: PendingMix) {
        guard pending === command, commands.contains(command.token) else { return }
        var replacement: [String: Track] = [:]
        var started: [Track] = []
        for entry in command.request.tracks {
            guard let track = command.staged[entry.id] ?? tracks[entry.id] else {
                failPending(command, "소리를 준비하지 못했습니다.")
                return
            }
            replacement[entry.id] = track
            if command.request.playing && !track.player.isPlaying {
                cancelCleanup(track)
                track.player.volume = 0
                guard track.player.play() else {
                    for item in started { pauseNow(item) }
                    failPending(command, "소리 재생을 시작하지 못했습니다. 다시 시도해 주세요.")
                    return
                }
                started.append(track)
            }
        }
        let previous = tracks
        tracks = replacement
        pending = nil
        command.staged.removeAll() // Ownership has moved to tracks.
        playing = command.request.playing
        if playing { interrupted = false }
        lastError = nil
        for old in previous.values where tracks[old.id] !== old { retire(old) }
        for entry in command.request.tracks {
            guard let track = tracks[entry.id] else { continue }
            if playing {
                // Cancel a previous fade-to-pause even when the resumed gain remains zero.
                cancelCleanup(track)
                track.player.setVolume(entry.gain, fadeDuration: Self.fadeDuration)
            } else {
                fadePause(track)
            }
        }
        routeSignature = currentRouteSignature()
        deactivateIfIdle()
        emit()
        command.completion(state())
    }

    private func cancelPending() {
        guard let old = pending else { return }
        pending = nil
        for track in old.staged.values { release(track) }
        old.staged.removeAll()
        old.completion(state())
    }

    private func failPending(_ command: PendingMix, _ message: String) {
        guard pending === command else { return }
        lastError = message
        if !playing { interrupted = true }
        cancelPending()
        deactivateIfIdle()
        emit()
    }

    private func cancelCleanup(_ track: Track) {
        track.cleanupVersion += 1
        track.cleanup?.cancel()
        track.cleanup = nil
    }

    private func afterFade(_ track: Track, action: @escaping @MainActor (Track) -> Void) {
        cancelCleanup(track)
        let version = track.cleanupVersion
        let work = DispatchWorkItem { [weak self, weak track] in
            DispatchQueue.main.async {
                guard self != nil, let track, track.cleanupVersion == version else { return }
                track.cleanup = nil
                action(track)
            }
        }
        track.cleanup = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.fadeDuration, execute: work)
    }

    private func fadePause(_ track: Track) {
        cancelCleanup(track)
        guard track.player.isPlaying else { return }
        track.player.setVolume(0, fadeDuration: Self.fadeDuration)
        afterFade(track) { [weak self] track in
            self?.pauseNow(track)
            self?.deactivateIfIdle()
        }
    }

    private func retire(_ track: Track) {
        guard track.player.isPlaying else { release(track); return }
        retiring[ObjectIdentifier(track)] = track
        track.player.setVolume(0, fadeDuration: Self.fadeDuration)
        afterFade(track) { [weak self] track in
            self?.retiring.removeValue(forKey: ObjectIdentifier(track))
            self?.release(track)
            self?.deactivateIfIdle()
        }
    }

    private func pauseNow(_ track: Track) {
        cancelCleanup(track)
        track.player.setVolume(0, fadeDuration: 0)
        track.player.pause()
    }

    private func release(_ track: Track) {
        cancelCleanup(track)
        track.player.delegate = nil
        track.player.stop()
    }

    private func deactivateIfIdle() {
        guard sessionActive, !wantsPlayback, retiring.isEmpty,
              !tracks.values.contains(where: { $0.player.isPlaying }) else { return }
        do {
            try session.setActive(false)
            sessionActive = false
        } catch {
            // Own players are already stopped; surface the failed session release.
            lastError = "오디오 세션을 정리하지 못했습니다. 다시 시도해 주세요."
            emit()
        }
    }

    private func stopExternally(_ message: String?) {
        guard !disposed else { return }
        commands.advance()
        playing = false
        interrupted = true
        lastError = message
        cancelPending()
        for track in tracks.values { pauseNow(track) }
        for track in retiring.values { release(track) }
        retiring.removeAll()
        deactivateIfIdle()
        emit()
    }

    private func handleInterruption(_ notification: Notification) {
        guard !disposed,
              let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            systemInterruptionActive = true
            sessionActive = false
            stopExternally(nil)
        case .ended:
            systemInterruptionActive = false
            // Intentionally ignore .shouldResume. Only a new user Play can resume.
            emit()
        @unknown default:
            systemInterruptionActive = true
            sessionActive = false
            stopExternally(nil)
        }
    }

    private func currentRouteSignature() -> String {
        session.currentRoute.outputs.map(\.uid).joined(separator: "|")
    }

    private func handleRouteChange(_ notification: Notification) {
        guard !disposed else { return }
        let current = currentRouteSignature()
        let changed = current != routeSignature
        routeSignature = current
        let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
        let incompatibleSession = session.category != .playback || !session.categoryOptions.contains(.mixWithOthers)
            || session.categoryOptions.contains(.duckOthers)
            || session.categoryOptions.contains(.interruptSpokenAudioAndMixWithOthers)
        if (wantsPlayback || hasRunningAudio) && (changed || reason == .oldDeviceUnavailable || reason == .noSuitableRouteForCategory
            || incompatibleSession) {
            stopExternally(nil)
        } else {
            // Our initial activation/category notification with the same route is benign.
            emit()
        }
    }

    private func mediaServicesUnavailable() {
        guard !disposed else { return }
        sessionActive = false
        systemInterruptionActive = false
        stopExternally("오디오 서비스가 재시작되었습니다. 다시 재생해 주세요.")
        for track in tracks.values { release(track) }
        tracks.removeAll()
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        guard let failed = tracks.values.first(where: { $0.player === player }) else { return }
        stopExternally("소리 재생이 중단되었습니다. 다시 재생해 주세요.")
        tracks.removeValue(forKey: failed.id)
        release(failed)
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        guard playing, tracks.values.contains(where: { $0.player === player }) else { return }
        // All bundled tracks loop. An unexpected completion must update the UI.
        stopExternally("소리 재생이 중단되었습니다. 다시 재생해 주세요.")
    }

    func dispose() {
        guard !disposed else { return }
        playing = false
        interrupted = false
        lastError = nil
        cancelPending()
        for track in tracks.values { release(track) }
        tracks.removeAll()
        for track in retiring.values { release(track) }
        retiring.removeAll()
        deactivateIfIdle()
        emit()
        disposed = true
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers.removeAll()
        onStateChange = nil
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }
}

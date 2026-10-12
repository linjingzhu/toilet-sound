import Foundation
import Capacitor

@objc(VeilAudioPlugin)
public class VeilAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VeilAudioPlugin"
    public let jsName = "VeilAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMix", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dispose", returnType: CAPPluginReturnPromise)
    ]

    private let commands = AudioCommandGate()
    // Accessed only from the main queue. CAPPlugin's bridge entrypoints are not actor isolated.
    private var audio: VeilAudioEngine?

    @MainActor
    private func engine() -> VeilAudioEngine {
        if let audio { return audio }
        let audio = VeilAudioEngine(commands: commands)
        audio.onStateChange = { [weak self] state in
            guard let self, let bridge = self.bridge as? CapacitorBridge else { return }
            // Serialize listener delivery with Capacitor's add/removeListener calls.
            bridge.dispatchQueue.async { [weak self] in
                self?.notifyListeners("stateChanged", data: state)
            }
        }
        self.audio = audio
        return audio
    }

    public override func load() {
        DispatchQueue.main.async { [weak self] in _ = self?.engine() }
    }

    @objc public func setMix(_ call: CAPPluginCall) {
        let request: AudioMixRequest
        do {
            request = try AudioMixRequest.parse(call.options as? [String: Any] ?? [:])
        } catch {
            call.reject(error.localizedDescription, "INVALID_MIX")
            return
        }
        let token = commands.advance()
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Audio bridge has been destroyed", "UNAVAILABLE")
                return
            }
            self.engine().setMix(request, token: token) { state in call.resolve(state) }
        }
    }

    @objc public func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Audio bridge has been destroyed", "UNAVAILABLE")
                return
            }
            call.resolve(self.engine().state())
        }
    }

    @objc public func dispose(_ call: CAPPluginCall) {
        commands.advance()
        DispatchQueue.main.async { [weak self] in
            self?.audio?.dispose()
            self?.audio = nil
            call.resolve()
        }
    }

    deinit {
        commands.advance()
        let retainedAudio = audio
        DispatchQueue.main.async { retainedAudio?.dispose() }
    }
}

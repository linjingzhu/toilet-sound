import CoreFoundation
import Foundation

struct AudioMixRequest {
    struct Entry {
        let id: String
        let file: String
        let gain: Float
    }

    let playing: Bool
    let tracks: [Entry]

    static func parse(_ data: [String: Any]) throws -> AudioMixRequest {
        guard let playing = data["playing"] as? NSNumber,
              CFGetTypeID(playing) == CFBooleanGetTypeID(),
              let tracks = data["tracks"] as? [[String: Any]] else {
            throw AudioMixError.invalid("playing must be a boolean and tracks must be an array")
        }
        guard tracks.count <= 16 else { throw AudioMixError.invalid("At most 16 tracks are supported") }
        let master = try volume(data["masterVolume"], name: "masterVolume")
        var ids = Set<String>()
        var entries: [Entry] = []
        for track in tracks {
            guard let id = track["id"] as? String,
                  matches(id, "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"),
                  ids.insert(id).inserted else {
                throw AudioMixError.invalid("Track ids must be unique safe identifiers")
            }
            guard let file = track["file"] as? String,
                  matches(file, "^[A-Za-z0-9][A-Za-z0-9_-]{0,95}\\.(wav|mp3|m4a|aac)$") else {
                throw AudioMixError.invalid("file must be a bundled wav, mp3, m4a or aac basename")
            }
            entries.append(Entry(id: id, file: file, gain: master * (try volume(track["volume"], name: "volume"))))
        }
        return AudioMixRequest(playing: playing.boolValue && !entries.isEmpty, tracks: entries)
    }

    private static func matches(_ value: String, _ expression: String) -> Bool {
        guard let range = value.range(of: expression, options: .regularExpression) else { return false }
        // A trailing newline must not exploit the regular expression's end anchor.
        return range == (value.startIndex..<value.endIndex)
    }

    private static func volume(_ raw: Any?, name: String) throws -> Float {
        guard let number = raw as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite else {
            throw AudioMixError.invalid("\(name) must be a finite number")
        }
        return Float(max(0, min(1, number.doubleValue)))
    }
}

enum AudioMixError: LocalizedError {
    case invalid(String)
    case playback(String)

    var errorDescription: String? {
        switch self {
        case .invalid(let message), .playback(let message): return message
        }
    }
}

/// Invalidates work when a newer bridge command or a system interruption arrives.
final class AudioCommandGate: @unchecked Sendable {
    private let lock = NSLock()
    private var current: UInt64 = 0

    @discardableResult
    func advance() -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        current &+= 1
        return current
    }

    func contains(_ token: UInt64) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return current == token
    }
}

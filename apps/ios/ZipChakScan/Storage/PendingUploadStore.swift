import Foundation
import ZipChakCore

/// Persists scanned `RoomData` JSON locally when API upload fails or offline,
/// enabling retry and easy JSON export for `packages/schema/fixtures/rooms/`.
@MainActor
public final class PendingUploadStore {
    public struct StoredScan: Identifiable, Hashable, Sendable {
        public var id: String { room.roomId }
        public var room: RoomData
        public var jsonFileURL: URL
        public var usdzFileURL: URL?
    }

    private let folderURL: URL

    public init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        self.folderURL = docs.appendingPathComponent("PendingRoomScans", isDirectory: true)
        try? FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
    }

    public func saveLocally(_ room: RoomData, usdzURL: URL? = nil) throws -> StoredScan {
        let jsonURL = folderURL.appendingPathComponent("\(room.roomId).json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(room)
        try data.write(to: jsonURL, options: [.atomic])

        var savedUSDZ: URL?
        if let usdzURL, FileManager.default.fileExists(atPath: usdzURL.path) {
            let targetUSDZ = folderURL.appendingPathComponent("\(room.roomId).usdz")
            if usdzURL != targetUSDZ {
                try? FileManager.default.removeItem(at: targetUSDZ)
                try? FileManager.default.copyItem(at: usdzURL, to: targetUSDZ)
            }
            savedUSDZ = targetUSDZ
        }

        return StoredScan(room: room, jsonFileURL: jsonURL, usdzFileURL: savedUSDZ)
    }

    public func loadAll() -> [StoredScan] {
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: folderURL,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        let jsonURLs = urls.filter { $0.pathExtension.lowercased() == "json" }
        var results: [StoredScan] = []
        let decoder = JSONDecoder()

        for url in jsonURLs {
            guard let data = try? Data(contentsOf: url),
                  let room = try? decoder.decode(RoomData.self, from: data) else {
                continue
            }
            let usdzCandidate = folderURL.appendingPathComponent("\(room.roomId).usdz")
            let usdz = FileManager.default.fileExists(atPath: usdzCandidate.path) ? usdzCandidate : nil
            results.append(StoredScan(room: room, jsonFileURL: url, usdzFileURL: usdz))
        }

        return results.sorted { $0.room.updatedAt > $1.room.updatedAt }
    }

    public func remove(roomId: String) {
        let jsonURL = folderURL.appendingPathComponent("\(roomId).json")
        let usdzURL = folderURL.appendingPathComponent("\(roomId).usdz")
        try? FileManager.default.removeItem(at: jsonURL)
        try? FileManager.default.removeItem(at: usdzURL)
    }

    public func exportTemporaryJSONFile(for room: RoomData) -> URL? {
        let safeName = room.roomId.replacingOccurrences(of: "/", with: "_")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safeName).json")
        guard let pretty = try? room.toPrettyJSON() else { return nil }
        try? Data(pretty.utf8).write(to: url, options: [.atomic])
        return url
    }
}

import Foundation

/// Loads canonical studio templates (M1-3) directly from `packages/schema/fixtures/templates/*.json`
/// bundled into the app target (or from a directory URL in unit tests), avoiding duplicate Swift definitions.
public enum RoomTemplates {
    public static let templateFileNames: [String] = [
        "tpl-4py-studio",
        "tpl-5py-studio",
        "tpl-6py-studio"
    ]

    /// Loads template `RoomData` JSON files included in an app or test `Bundle`.
    public static func load(from bundle: Bundle = .main) -> [RoomData] {
        let decoder = JSONDecoder()
        return templateFileNames.compactMap { name in
            let url = bundle.url(forResource: name, withExtension: "json")
                ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "templates")
            guard let url,
                  let data = try? Data(contentsOf: url),
                  let room = try? decoder.decode(RoomData.self, from: data) else {
                return nil
            }
            return room
        }
    }

    /// Loads template `RoomData` JSON files from a filesystem directory (e.g. `packages/schema/fixtures/templates/`).
    public static func load(fromDirectory directoryURL: URL) throws -> [RoomData] {
        let decoder = JSONDecoder()
        return try templateFileNames.map { name in
            let fileURL = directoryURL.appendingPathComponent("\(name).json")
            let data = try Data(contentsOf: fileURL)
            return try decoder.decode(RoomData.self, from: data)
        }
    }
}

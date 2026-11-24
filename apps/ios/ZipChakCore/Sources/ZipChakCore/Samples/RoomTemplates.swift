import Foundation

/// Loads canonical studio templates (M1-3) directly from `packages/schema/fixtures/templates/*.json`
/// bundled into the app target (or from a directory URL in unit tests), avoiding duplicate Swift definitions.
public enum RoomTemplates {
    public struct LoadFailure: Sendable, Hashable {
        public let templateName: String
        public let reason: String

        public init(templateName: String, reason: String) {
            self.templateName = templateName
            self.reason = reason
        }
    }

    public struct LoadResult: Sendable, Hashable {
        public let templates: [RoomData]
        public let failures: [LoadFailure]

        public init(templates: [RoomData], failures: [LoadFailure]) {
            self.templates = templates
            self.failures = failures
        }
    }

    public static let templateFileNames: [String] = [
        "tpl-4py-studio",
        "tpl-5py-studio",
        "tpl-6py-studio"
    ]

    /// Loads template `RoomData` JSON files included in an app or test `Bundle`,
    /// returning both decoded templates and any load/decode failures.
    public static func loadWithDiagnostics(from bundle: Bundle = .main) -> LoadResult {
        let decoder = JSONDecoder()
        var templates: [RoomData] = []
        var failures: [LoadFailure] = []

        for name in templateFileNames {
            let url = bundle.url(forResource: name, withExtension: "json")
                ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "templates")
            guard let url else {
                failures.append(LoadFailure(templateName: name, reason: "번들에서 \(name).json 리소스를 찾지 못했습니다."))
                continue
            }
            do {
                let data = try Data(contentsOf: url)
                let room = try decoder.decode(RoomData.self, from: data)
                templates.append(room)
            } catch {
                failures.append(LoadFailure(templateName: name, reason: "\(name).json 디코딩 실패: \(error.localizedDescription)"))
            }
        }
        return LoadResult(templates: templates, failures: failures)
    }

    /// Loads template `RoomData` JSON files included in an app or test `Bundle`.
    /// Logs failures and triggers `assertionFailure` in `DEBUG` builds when a bundled template is missing or malformed.
    public static func load(from bundle: Bundle = .main, assertOnFailure: Bool = true) -> [RoomData] {
        let result = loadWithDiagnostics(from: bundle)
        if !result.failures.isEmpty {
            let summary = result.failures.map { "[\($0.templateName)] \($0.reason)" }.joined(separator: "; ")
            #if DEBUG
            print("[RoomTemplates] 템플릿 로드 오류: \(summary)")
            if assertOnFailure {
                assertionFailure("원룸 템플릿 JSON 로드 실패: \(summary)")
            }
            #endif
        }
        return result.templates
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

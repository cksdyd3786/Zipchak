import Foundation
import Observation
@preconcurrency import RoomPlan
import ZipChakCore

@MainActor
@Observable
final class ZipChakScanViewModel {
    enum Screen: Hashable {
        case start
        case scanning
        case preview
        case uploadComplete(APIUploadResult)
    }

    var currentScreen: Screen = .start
    var activeRoom: RoomData?
    var activeUSDZURL: URL?

    var pendingScans: [PendingUploadStore.StoredScan] = []
    var isUploading: Bool = false
    var uploadErrorMessage: String?

    var apiBaseURLString: String {
        didSet { UserDefaults.standard.set(apiBaseURLString, forKey: "zipchak_api_base_url") }
    }
    var webBaseURLString: String {
        didSet { UserDefaults.standard.set(webBaseURLString, forKey: "zipchak_web_base_url") }
    }
    var accessToken: String {
        didSet { UserDefaults.standard.set(accessToken, forKey: "zipchak_access_token") }
    }

    let pendingStore = PendingUploadStore()

    init() {
        self.apiBaseURLString = UserDefaults.standard.string(forKey: "zipchak_api_base_url") ?? "http://localhost:4000"
        self.webBaseURLString = UserDefaults.standard.string(forKey: "zipchak_web_base_url") ?? "http://localhost:5173"
        self.accessToken = UserDefaults.standard.string(forKey: "zipchak_access_token") ?? ""
        refreshPendingScans()
    }

    var isLiDARSupported: Bool {
        RoomCaptureSession.isSupported
    }

    var webFreeModeURL: URL? {
        let base = webBaseURLString.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        return URL(string: "\(base)/create")
    }

    func refreshPendingScans() {
        pendingScans = pendingStore.loadAll()
    }

    func startScan() {
        uploadErrorMessage = nil
        currentScreen = .scanning
    }

    func openTemplateForPreview(_ template: RoomData) {
        activeRoom = template
        activeUSDZURL = nil
        uploadErrorMessage = nil
        currentScreen = .preview
    }

    func openPendingScan(_ stored: PendingUploadStore.StoredScan) {
        activeRoom = stored.room
        activeUSDZURL = stored.usdzFileURL
        uploadErrorMessage = nil
        currentScreen = .preview
    }

    func handleScanCompleted(_ output: RoomPlanBridge.CaptureOutput) {
        activeRoom = output.roomData
        activeUSDZURL = output.usdzURL
        uploadErrorMessage = nil
        currentScreen = .preview
    }

    func updateActiveRoomName(_ newName: String) {
        guard var room = activeRoom else { return }
        room.name = String(newName.prefix(40))
        room.updatedAt = RoomData.iso8601UTCNow()
        activeRoom = room
    }

    func uploadActiveRoom() async {
        guard let room = activeRoom else { return }
        isUploading = true
        uploadErrorMessage = nil
        defer { isUploading = false }

        let client = APIClient(
            apiBaseURLString: apiBaseURLString,
            webBaseURLString: webBaseURLString,
            accessToken: accessToken
        )

        do {
            let result = try await client.uploadRoom(room, usdzURL: activeUSDZURL)
            pendingStore.remove(roomId: room.roomId)
            refreshPendingScans()
            currentScreen = .uploadComplete(result)
        } catch {
            // Per apps/ios/CLAUDE.md: save JSON locally on upload failure so user can retry or export
            _ = try? pendingStore.saveLocally(room, usdzURL: activeUSDZURL)
            refreshPendingScans()
            uploadErrorMessage = "\(error.localizedDescription)\n\n기기 로컬에 RoomData JSON을 안전하게 임시 저장했습니다. 서버 설정을 확인한 뒤 재시도하거나 JSON 파일을 바로 공유할 수 있습니다."
        }
    }

    func saveActiveRoomLocallyOnly() {
        guard let room = activeRoom else { return }
        _ = try? pendingStore.saveLocally(room, usdzURL: activeUSDZURL)
        refreshPendingScans()
    }

    func deletePendingScan(roomId: String) {
        pendingStore.remove(roomId: roomId)
        refreshPendingScans()
    }

    func returnToStart() {
        uploadErrorMessage = nil
        activeRoom = nil
        activeUSDZURL = nil
        currentScreen = .start
    }
}

import Foundation
import ZipChakCore

public enum APIClientError: LocalizedError, Sendable {
    case invalidBaseURL
    case httpError(statusCode: Int, message: String)
    case decodingError(String)
    case networkError(String)

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "API 서버 주소가 올바르지 않습니다. 설정에서 서버 URL을 확인해 주세요."
        case .httpError(let code, let message):
            return "서버 오류 (HTTP \(code)): \(message)"
        case .decodingError(let msg):
            return "서버 응답 해석 오류: \(msg)"
        case .networkError(let msg):
            return "네트워크 연결 실패: \(msg)"
        }
    }
}

public struct APIUploadResult: Sendable, Hashable {
    public let uploadedRoom: RoomData
    public let rawAssetUrl: String?
    public let webRoomURL: URL?

    public init(uploadedRoom: RoomData, rawAssetUrl: String?, webRoomURL: URL?) {
        self.uploadedRoom = uploadedRoom
        self.rawAssetUrl = rawAssetUrl
        self.webRoomURL = webRoomURL
    }
}

private struct ServerErrorEnvelope: Decodable {
    struct Inner: Decodable {
        let code: String?
        let message: String?
    }
    let error: Inner?
}

private struct ScanAssetUploadResponse: Decodable {
    let rawAssetUrl: String
}

/// REST client for Zipchak `services/api` (`POST /rooms` and `POST /rooms/:roomId/scan-asset`).
public final class APIClient: Sendable {
    public let apiBaseURLString: String
    public let webBaseURLString: String
    public let accessToken: String?

    public init(apiBaseURLString: String, webBaseURLString: String, accessToken: String? = nil) {
        self.apiBaseURLString = apiBaseURLString.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        self.webBaseURLString = webBaseURLString.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        let trimmedToken = accessToken?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.accessToken = (trimmedToken?.isEmpty == false) ? trimmedToken : nil
    }

    public func webURL(forRoomID roomId: String) -> URL? {
        URL(string: "\(webBaseURLString)/rooms/\(roomId)")
    }

    /// Uploads `RoomData` via `POST /rooms`, and optionally uploads raw `.usdz` via `POST /rooms/:roomId/scan-asset`.
    public func uploadRoom(_ room: RoomData, usdzURL: URL? = nil) async throws -> APIUploadResult {
        guard let roomsEndpoint = URL(string: "\(apiBaseURLString)/rooms") else {
            throw APIClientError.invalidBaseURL
        }

        var request = URLRequest(url: roomsEndpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(room.toCreatePayload())

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIClientError.networkError(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.networkError("유효하지 않은 HTTP 응답")
        }
        guard (200...299).contains(http.statusCode) else {
            let serverMsg = (try? JSONDecoder().decode(ServerErrorEnvelope.self, from: data))?.error?.message
                ?? String(decoding: data.prefix(200), as: UTF8.self)
            throw APIClientError.httpError(statusCode: http.statusCode, message: serverMsg)
        }

        let createdRoom: RoomData
        do {
            createdRoom = try JSONDecoder().decode(RoomData.self, from: data)
        } catch {
            throw APIClientError.decodingError(error.localizedDescription)
        }

        var rawAssetUrl: String?
        if let usdzURL, FileManager.default.fileExists(atPath: usdzURL.path) {
            rawAssetUrl = try? await uploadUSDZAsset(roomId: createdRoom.roomId, fileURL: usdzURL)
        }

        return APIUploadResult(
            uploadedRoom: createdRoom,
            rawAssetUrl: rawAssetUrl,
            webRoomURL: webURL(forRoomID: createdRoom.roomId)
        )
    }

    private func uploadUSDZAsset(roomId: String, fileURL: URL) async throws -> String {
        guard let url = URL(string: "\(apiBaseURLString)/rooms/\(roomId)/scan-asset") else {
            throw APIClientError.invalidBaseURL
        }
        let fileData = try Data(contentsOf: fileURL)
        let boundary = "ZipChakBoundary-\(UUID().uuidString)"

        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(roomId).usdz\"\r\n".utf8))
        body.append(Data("Content-Type: model/vnd.usdz+zip\r\n\r\n".utf8))
        body.append(fileData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw APIClientError.httpError(statusCode: code, message: "USDZ 업로드 실패")
        }
        let parsed = try JSONDecoder().decode(ScanAssetUploadResponse.self, from: data)
        return parsed.rawAssetUrl
    }
}

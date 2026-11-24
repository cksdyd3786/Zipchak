import Foundation
@preconcurrency import RoomPlan
import UIKit
import ZipChakCore
import simd

/// Bridges Apple RoomPlan's `CapturedRoom` into `ZipChakCore.RawCapturedRoom`
/// and runs the pure `RoomDataConverter` to produce a `packages/schema/room.schema.json`-compliant `RoomData`.
public enum RoomPlanBridge {
    public struct CaptureOutput: Sendable {
        public let roomData: RoomData
        public let usdzURL: URL?
        public let warnings: [ConversionWarning]
    }

    @MainActor
    public static func convert(
        _ capturedRoom: CapturedRoom,
        defaultName: String? = nil,
        exportUSDZ: Bool = true
    ) throws -> CaptureOutput {
        let floorY = resolvedFloorY(from: capturedRoom)
        var surfaces: [RawSurfaceM] = []
        surfaces.reserveCapacity(
            capturedRoom.walls.count +
            capturedRoom.doors.count +
            capturedRoom.windows.count +
            capturedRoom.openings.count
        )

        for wall in capturedRoom.walls {
            surfaces.append(convertSurface(wall, kind: .wall, floorY: floorY))
        }
        for door in capturedRoom.doors {
            surfaces.append(convertSurface(door, kind: .door, floorY: floorY))
        }
        for window in capturedRoom.windows {
            surfaces.append(convertSurface(window, kind: .window, floorY: floorY))
        }
        for opening in capturedRoom.openings {
            surfaces.append(convertSurface(opening, kind: .opening, floorY: floorY))
        }

        let objects: [RawObjectM] = capturedRoom.objects.map { obj in
            let pos = obj.transform.columns.3
            let forwardX = obj.transform.columns.2.x
            let forwardZ = obj.transform.columns.2.z
            let yaw = atan2(forwardX, forwardZ)

            return RawObjectM(
                id: obj.identifier,
                category: mapCategory(obj.category),
                centerX: pos.x,
                centerZ: pos.z,
                width: max(0.15, obj.dimensions.x),
                depth: max(0.15, obj.dimensions.z),
                height: max(0.15, obj.dimensions.y),
                yaw: yaw,
                confidence: mapConfidence(obj.confidence)
            )
        }

        let floorPolygonM = extractFloorPolygonM(from: capturedRoom)
        let ceilingHeightM = max(2.0, capturedRoom.walls.map(\.dimensions.y).max() ?? 2.4)

        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd HH:mm"
        let roomName = defaultName ?? "내 방 스캔 (\(formatter.string(from: Date())))"

        let raw = RawCapturedRoom(
            identifier: capturedRoom.identifier,
            name: roomName,
            floorPolygonM: floorPolygonM,
            surfaces: surfaces,
            objects: objects,
            ceilingHeightM: ceilingHeightM,
            deviceModel: currentDeviceIdentifier(),
            roomPlanVersion: "iOS \(UIDevice.current.systemVersion)",
            capturedAt: Date()
        )

        let conversion = try RoomDataConverter.convertWithDiagnostics(raw, refineOrthogonalWalls: true)
        let roomData = conversion.room

        var exportedURL: URL?
        if exportUSDZ {
            let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            if let dir = caches?.appendingPathComponent("ZipChakScans", isDirectory: true) {
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let fileURL = dir.appendingPathComponent("\(roomData.roomId).usdz")
                do {
                    try capturedRoom.export(to: fileURL, exportOptions: .mesh)
                    exportedURL = fileURL
                } catch {
                    exportedURL = nil
                }
            }
        }

        return CaptureOutput(roomData: roomData, usdzURL: exportedURL, warnings: conversion.warnings)
    }

    private static func resolvedFloorY(from capturedRoom: CapturedRoom) -> Float {
        if let floor = capturedRoom.floors.first {
            return floor.transform.columns.3.y
        }
        return capturedRoom.walls.map { $0.transform.columns.3.y - $0.dimensions.y * 0.5 }.min() ?? 0
    }

    private static func convertSurface(
        _ surface: CapturedRoom.Surface,
        kind: RawSurfaceKind,
        floorY: Float
    ) -> RawSurfaceM {
        let pos = surface.transform.columns.3
        let forwardX = surface.transform.columns.2.x
        let forwardZ = surface.transform.columns.2.z
        let yaw = atan2(forwardX, forwardZ)
        let bottomY = max(0, (pos.y - surface.dimensions.y * 0.5) - floorY)

        return RawSurfaceM(
            id: surface.identifier,
            kind: kind,
            centerX: pos.x,
            centerZ: pos.z,
            baseY: bottomY,
            length: max(0.15, surface.dimensions.x),
            height: max(0.15, surface.dimensions.y),
            thickness: surface.dimensions.z,
            yaw: yaw,
            parentWallID: surface.parentIdentifier,
            confidence: mapConfidence(surface.confidence)
        )
    }

    private static func extractFloorPolygonM(from capturedRoom: CapturedRoom) -> [RawPoint2M] {
        guard let floorSurface = capturedRoom.floors.max(by: {
            $0.dimensions.x * $0.dimensions.z < $1.dimensions.x * $1.dimensions.z
        }), floorSurface.polygonCorners.count >= 3 else {
            return []
        }
        let transform = floorSurface.transform
        return floorSurface.polygonCorners.map { corner in
            let world = transform * SIMD4<Float>(corner.x, corner.y, corner.z, 1.0)
            return RawPoint2M(x: world.x, z: world.z)
        }
    }

    private static func mapConfidence(_ c: CapturedRoom.Confidence) -> ConfidenceLevel {
        switch c {
        case .high: return .high
        case .medium: return .medium
        case .low: return .low
        @unknown default: return .medium
        }
    }

    private static func mapCategory(_ c: CapturedRoom.Object.Category) -> RawObjectCategory {
        switch c {
        case .bed: return .bed
        case .table: return .table
        case .chair: return .chair
        case .sofa: return .sofa
        case .storage: return .storage
        case .television: return .television
        case .fireplace: return .fireplace
        case .sink: return .sink
        case .toilet: return .toilet
        case .bathtub: return .bathtub
        case .refrigerator: return .refrigerator
        case .stove, .oven, .dishwasher: return .stove
        case .washerDryer: return .washerDryer
        case .stairs: return .stairs
        @unknown default: return .other
        }
    }

    private static func currentDeviceIdentifier() -> String {
        var sysinfo = utsname()
        uname(&sysinfo)
        let machine = withUnsafePointer(to: &sysinfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
        return machine.isEmpty ? "iPhone Pro" : machine
    }
}

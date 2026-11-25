import XCTest
@testable import ZipChakCore

final class RoomDataConverterTests: XCTestCase {

    func testMetersToMmRounding() {
        XCTAssertEqual(RoomDataConverter.metersToMm(3.2004), 3200)
        XCTAssertEqual(RoomDataConverter.metersToMm(3.2006), 3201)
        XCTAssertEqual(RoomDataConverter.metersToMm(-1.5), -1500)
        XCTAssertEqual(RoomDataConverter.metersToMm(0.12), 120)
    }

    func testRotationSnappingToQuarterTurnsAndFacingOffset() {
        // Default RoomPlan +Z front matches Zipchak convention (+Z = 0, +X = 90, -Z = 180, -X = 270)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: 0), 0)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: 0.08), 0)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: .pi * 0.5), 90)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: .pi), 180)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: -.pi * 0.5), 270)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: -.pi * 0.05), 0)

        // Calibration offset support (e.g., if real-device check discovers a 180° flip on a specific setup)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: 0, facingOffsetDeg: 180), 180)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: .pi * 0.5, facingOffsetDeg: 180), 270)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: -.pi * 0.5, facingOffsetDeg: 180), 90)
    }

    func testOriginTranslationAndWallDimensionsAccuracy() throws {
        let northID = UUID()
        let southID = UUID()
        let westID = UUID()
        let eastID = UUID()

        let raw = RawCapturedRoom(
            name: "실측 테스트 원룸",
            floorPolygonM: [
                RawPoint2M(x: -2.10, z: -1.75),
                RawPoint2M(x:  2.10, z: -1.75),
                RawPoint2M(x:  2.10, z:  1.75),
                RawPoint2M(x: -2.10, z:  1.75)
            ],
            surfaces: [
                RawSurfaceM(id: northID, kind: .wall, centerX: 0, centerZ: -1.75, length: 4.20, height: 2.45, thickness: 0.0, yaw: 0),
                RawSurfaceM(id: eastID,  kind: .wall, centerX: 2.10, centerZ: 0, length: 3.50, height: 2.45, thickness: 0.14, yaw: -.pi * 0.5),
                RawSurfaceM(id: southID, kind: .wall, centerX: 0, centerZ: 1.75, length: 4.20, height: 2.45, thickness: 0.12, yaw: .pi),
                RawSurfaceM(id: westID,  kind: .wall, centerX: -2.10, centerZ: 0, length: 3.50, height: 2.45, thickness: 0.12, yaw: .pi * 0.5),
                RawSurfaceM(kind: .window, centerX: 0.35, centerZ: -1.75, baseY: 0.85, length: 1.60, height: 1.20, thickness: 0.12, yaw: 0, parentWallID: northID),
                RawSurfaceM(kind: .door, centerX: 1.20, centerZ: 1.75, baseY: 0.0, length: 0.90, height: 2.10, thickness: 0.12, yaw: .pi, parentWallID: southID)
            ],
            objects: [
                RawObjectM(category: .bed, centerX: -1.0, centerZ: 0.5, width: 1.15, depth: 2.05, height: 0.55, yaw: 0.04, confidence: .high),
                RawObjectM(category: .television, centerX: 1.8, centerZ: -0.5, width: 1.20, depth: 0.35, height: 0.70, yaw: -.pi * 0.5, confidence: .medium)
            ],
            ceilingHeightM: 2.45,
            deviceModel: "iPhone 15 Pro Max"
        )

        let result = try RoomDataConverter.convertWithDiagnostics(raw)
        XCTAssertTrue(result.warnings.isEmpty)
        let room = result.room

        // 1. Metadata & schema constants
        XCTAssertEqual(room.schemaVersion, "1.0")
        XCTAssertTrue(room.roomId.hasPrefix("room_"))
        XCTAssertEqual(room.source, .lidar)
        XCTAssertEqual(room.unit, "mm")
        XCTAssertEqual(room.ceilingHeight, 2450)
        XCTAssertEqual(room.sourceMeta?.device, "iPhone 15 Pro Max")

        // 2. Origin shifted strictly to min (x, z) == (0, 0)
        XCTAssertEqual(room.floorPolygon.map(\.x).min(), 0)
        XCTAssertEqual(room.floorPolygon.map(\.z).min(), 0)
        XCTAssertEqual(room.floorPolygon.map(\.x).max(), 4200)
        XCTAssertEqual(room.floorPolygon.map(\.z).max(), 3500)

        // 3. Wall lengths & default thickness (120mm when RoomPlan reports 0)
        XCTAssertEqual(room.walls.count, 4)
        XCTAssertEqual(room.walls[0].thickness, 120)
        XCTAssertEqual(room.walls[1].thickness, 140)
        XCTAssertEqual(Int(room.walls[0].lengthMm.rounded()), 4200)
        XCTAssertEqual(Int(room.walls[1].lengthMm.rounded()), 3500)

        // 4. Openings
        XCTAssertEqual(room.openings.count, 2)
        let win = try XCTUnwrap(room.openings.first(where: { $0.type == .window }))
        XCTAssertEqual(win.wallId, "wall_1")
        XCTAssertEqual(win.offset, 1650)
        XCTAssertEqual(win.width, 1600)
        XCTAssertEqual(win.height, 1200)
        XCTAssertEqual(win.sillHeight, 850)
        XCTAssertNil(win.facing)
        XCTAssertNil(win.swing)

        let door = try XCTUnwrap(room.openings.first(where: { $0.type == .door }))
        XCTAssertEqual(door.wallId, "wall_3")
        XCTAssertEqual(door.offset, 450)
        XCTAssertEqual(door.width, 900)
        XCTAssertEqual(door.sillHeight, 0)
        XCTAssertEqual(door.swing, .defaultHinged)

        // 5. Existing furniture mapping & rotation snapping
        XCTAssertEqual(room.existingFurniture.count, 2)
        XCTAssertEqual(room.existingFurniture[0].category, .bed)
        XCTAssertEqual(room.existingFurniture[0].rotationDeg, 0)
        XCTAssertEqual(room.existingFurniture[0].position, RoomPoint2(x: 1100, z: 2250))
        XCTAssertEqual(room.existingFurniture[0].confidence, .high)

        XCTAssertEqual(room.existingFurniture[1].category, .etc)
        XCTAssertEqual(room.existingFurniture[1].rotationDeg, 270)
        XCTAssertEqual(room.existingFurniture[1].confidence, .medium)
    }

    func testInsufficientScanThrowsInsteadOfFakeFallbackRoom() {
        // Only 1 wall and no floor polygon -> MUST throw instead of fabricating a fake 3.2×4.0m room!
        let incomplete = RawCapturedRoom(
            name: "실패 스캔",
            floorPolygonM: [],
            surfaces: [
                RawSurfaceM(kind: .wall, centerX: 0, centerZ: 0, length: 2.0, height: 2.4, yaw: 0)
            ]
        )

        XCTAssertThrowsError(try RoomDataConverter.convertWithDiagnostics(incomplete)) { error in
            XCTAssertEqual(error as? RoomConversionError, .insufficientScanData)
        }
    }

    func testMissingFloorPolygonEmitsEstimatedRoomWarning() throws {
        // 4 walls exist, but RoomPlan failed to produce floorPolygon -> reconstructs from walls AND warns!
        let raw = RawCapturedRoom(
            name: "바닥 누락 스캔",
            floorPolygonM: [],
            surfaces: [
                RawSurfaceM(kind: .wall, centerX: 0, centerZ: -1.5, length: 3.0, height: 2.4, yaw: 0),
                RawSurfaceM(kind: .wall, centerX: 1.5, centerZ: 0, length: 3.0, height: 2.4, yaw: -.pi * 0.5),
                RawSurfaceM(kind: .wall, centerX: 0, centerZ: 1.5, length: 3.0, height: 2.4, yaw: .pi),
                RawSurfaceM(kind: .wall, centerX: -1.5, centerZ: 0, length: 3.0, height: 2.4, yaw: .pi * 0.5)
            ]
        )

        let result = try RoomDataConverter.convertWithDiagnostics(raw)
        XCTAssertTrue(result.warnings.contains(.estimatedRoom))
        XCTAssertTrue(result.warnings.contains(.estimatedFloorFromWalls))
        XCTAssertEqual(result.room.floorPolygon.map(\.x).min(), 0)
        XCTAssertEqual(result.room.floorPolygon.map(\.z).min(), 0)
    }

    func testSynthesizedWallsFromFloorEmitsEstimatedRoomWarning() throws {
        // Valid floor polygon exists, but only 2 walls were captured -> synthesizes walls AND warns!
        let raw = RawCapturedRoom(
            name: "벽 일부 누락 스캔",
            floorPolygonM: [
                RawPoint2M(x: 0, z: 0),
                RawPoint2M(x: 3.0, z: 0),
                RawPoint2M(x: 3.0, z: 4.0),
                RawPoint2M(x: 0, z: 4.0)
            ],
            surfaces: [
                RawSurfaceM(kind: .wall, centerX: 1.5, centerZ: 0, length: 3.0, height: 2.4, yaw: 0)
            ]
        )

        let result = try RoomDataConverter.convertWithDiagnostics(raw)
        XCTAssertTrue(result.warnings.contains(.estimatedRoom))
        XCTAssertTrue(result.warnings.contains(.synthesizedWallsFromFloor))
        XCTAssertEqual(result.room.walls.count, 4)
    }

    func testTemplatesLoadFromSingleSourceOfTruthFixtureJSONs() throws {
        // Resolve packages/schema/fixtures/templates relative to this test file in the monorepo
        let testFileURL = URL(fileURLWithPath: #filePath)
        // Tests/ZipChakCoreTests/RoomDataConverterTests.swift -> ZipChakCore -> ios -> apps -> repo root
        let repoRoot = testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let templatesDir = repoRoot.appendingPathComponent("packages/schema/fixtures/templates", isDirectory: true)

        let templates = try RoomTemplates.load(fromDirectory: templatesDir)
        XCTAssertEqual(templates.count, 3)

        XCTAssertEqual(templates[0].floorAreaPyeong, 3.993, accuracy: 0.15)
        XCTAssertEqual(templates[1].floorAreaPyeong, 5.040, accuracy: 0.15)
        XCTAssertEqual(templates[2].floorAreaPyeong, 6.002, accuracy: 0.15)

        for t in templates {
            XCTAssertEqual(t.source, .template)
            XCTAssertEqual(t.floorPolygon.map(\.x).min(), 0)
            XCTAssertEqual(t.floorPolygon.map(\.z).min(), 0)
            XCTAssertGreaterThanOrEqual(t.walls.count, 4)

            let json = try t.toPrettyJSON()
            XCTAssertTrue(json.contains("\"swing\" : null"))
            XCTAssertTrue(json.contains("\"schemaVersion\" : \"1.0\""))
            let decoded = try JSONDecoder().decode(RoomData.self, from: Data(json.utf8))
            XCTAssertEqual(decoded, t)
        }
    }

    func testBundleTemplateLoadingAndFailureReporting() throws {
        let testFileURL = URL(fileURLWithPath: #filePath)
        let repoRoot = testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let templatesDir = repoRoot.appendingPathComponent("packages/schema/fixtures/templates", isDirectory: true)

        // 1. Valid bundle containing all 3 canonical fixture JSONs
        let fm = FileManager.default
        let validBundleURL = fm.temporaryDirectory.appendingPathComponent("ZipChakValidTemplates-\(UUID().uuidString).bundle", isDirectory: true)
        try fm.createDirectory(at: validBundleURL, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: validBundleURL) }

        for name in RoomTemplates.templateFileNames {
            let src = templatesDir.appendingPathComponent("\(name).json")
            let dst = validBundleURL.appendingPathComponent("\(name).json")
            try fm.copyItem(at: src, to: dst)
        }

        let validBundle = try XCTUnwrap(Bundle(url: validBundleURL))
        let okResult = RoomTemplates.loadWithDiagnostics(from: validBundle)
        XCTAssertEqual(okResult.templates.count, 3)
        XCTAssertTrue(okResult.failures.isEmpty)
        XCTAssertEqual(RoomTemplates.load(from: validBundle).count, 3)

        // 2. Corrupted/missing bundle reports exact template failures instead of failing silently
        let brokenBundleURL = fm.temporaryDirectory.appendingPathComponent("ZipChakBrokenTemplates-\(UUID().uuidString).bundle", isDirectory: true)
        try fm.createDirectory(at: brokenBundleURL, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: brokenBundleURL) }

        try Data("{ invalid json".utf8).write(to: brokenBundleURL.appendingPathComponent("tpl-4py-studio.json"))
        let brokenBundle = try XCTUnwrap(Bundle(url: brokenBundleURL))
        let brokenResult = RoomTemplates.loadWithDiagnostics(from: brokenBundle)
        XCTAssertTrue(brokenResult.templates.isEmpty)
        XCTAssertEqual(brokenResult.failures.count, 3)
        XCTAssertEqual(brokenResult.failures.map(\.templateName), RoomTemplates.templateFileNames)
        XCTAssertTrue(RoomTemplates.load(from: brokenBundle, assertOnFailure: false).isEmpty)
    }

    func testDiagonallyScannedRoomAlignsWallsAndFurnitureToAxes() throws {
        // Simulate real-device ARKit scan where user started facing +38° off axis.
        // Without rigid alignment by -dominantYaw, walls stay tilted 38° while furniture snaps to 0/90/180/270.
        let tilt: Float = 38.0 * .pi / 180.0
        func rot(_ x: Float, _ z: Float) -> RawPoint2M {
            let c = cos(tilt), s = sin(tilt)
            return RawPoint2M(x: x * c + z * s, z: -x * s + z * c)
        }

        let northID = UUID(), eastID = UUID(), southID = UUID(), westID = UUID()
        let baseFloor = [
            RawPoint2M(x: -1.5, z: -1.1),
            RawPoint2M(x:  1.5, z: -1.1),
            RawPoint2M(x:  1.5, z:  1.1),
            RawPoint2M(x: -1.5, z:  1.1)
        ].map { rot($0.x, $0.z) }

        let nC = rot(0, -1.1), eC = rot(1.5, 0), sC = rot(0, 1.1), wC = rot(-1.5, 0)
        let doorC = rot(1.5, -0.3)
        let bedC = rot(-0.6, -0.1)
        let storageC = rot(0.9, 0.4)

        let raw = RawCapturedRoom(
            name: "대각선 실기기 스캔",
            floorPolygonM: baseFloor,
            surfaces: [
                RawSurfaceM(id: northID, kind: .wall, centerX: nC.x, centerZ: nC.z, length: 3.0, height: 2.3, yaw: 0 + tilt),
                RawSurfaceM(id: eastID,  kind: .wall, centerX: eC.x, centerZ: eC.z, length: 2.2, height: 2.3, yaw: -.pi * 0.5 + tilt),
                RawSurfaceM(id: southID, kind: .wall, centerX: sC.x, centerZ: sC.z, length: 3.0, height: 2.3, yaw: .pi + tilt),
                RawSurfaceM(id: westID,  kind: .wall, centerX: wC.x, centerZ: wC.z, length: 2.2, height: 2.3, yaw: .pi * 0.5 + tilt),
                RawSurfaceM(kind: .door, centerX: doorC.x, centerZ: doorC.z, length: 0.85, height: 2.05, yaw: -.pi * 0.5 + tilt, parentWallID: eastID)
            ],
            objects: [
                // Bed parallel to north wall (local +Z facing +Z in unrotated room -> should snap to 0°)
                RawObjectM(category: .bed, centerX: bedC.x, centerZ: bedC.z, width: 1.1, depth: 2.0, height: 0.55, yaw: 0 + tilt),
                // Storage against east wall (local +Z facing -X -> 270° in unrotated room)
                RawObjectM(category: .storage, centerX: storageC.x, centerZ: storageC.z, width: 0.8, depth: 0.5, height: 1.2, yaw: -.pi * 0.5 + tilt)
            ],
            ceilingHeightM: 2.3
        )

        let result = try RoomDataConverter.convertWithDiagnostics(raw)
        let room = result.room
        XCTAssertTrue(result.warnings.isEmpty)

        // Floor bounding box must match exact 3000 × 2200mm (not inflated by diagonal rotation)
        let b = room.boundsMm
        XCTAssertEqual(b.minX, 0)
        XCTAssertEqual(b.minZ, 0)
        XCTAssertEqual(b.maxX, 3000, accuracy: 2)
        XCTAssertEqual(b.maxZ, 2200, accuracy: 2)

        // All walls must now be strictly axis-aligned
        for wall in room.walls {
            let isHorizontal = abs(wall.start.z - wall.end.z) <= 2
            let isVertical = abs(wall.start.x - wall.end.x) <= 2
            XCTAssertTrue(isHorizontal || isVertical, "Wall \(wall.id) not axis-aligned: \(wall.start) -> \(wall.end)")
        }

        // Furniture must preserve exact room-relative orientation and sit strictly inside the room
        XCTAssertEqual(room.existingFurniture.count, 2)
        XCTAssertEqual(room.existingFurniture[0].rotationDeg, 0)
        XCTAssertEqual(room.existingFurniture[0].position.x, 900, accuracy: 3)
        XCTAssertEqual(room.existingFurniture[0].position.z, 1000, accuracy: 3)

        XCTAssertEqual(room.existingFurniture[1].rotationDeg, 270)
        XCTAssertEqual(room.existingFurniture[1].position.x, 2400, accuracy: 3)
        XCTAssertEqual(room.existingFurniture[1].position.z, 1500, accuracy: 3)

        // Door must stay attached to east wall at exact offset (1.1 + (-0.3) - 0.85/2 = 0.375m -> 375mm)
        let door = try XCTUnwrap(room.openings.first)
        XCTAssertEqual(door.wallId, "wall_2")
        XCTAssertEqual(door.offset, 375, accuracy: 3)
    }
}

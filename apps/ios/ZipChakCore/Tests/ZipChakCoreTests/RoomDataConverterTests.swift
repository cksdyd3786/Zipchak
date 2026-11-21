import XCTest
@testable import ZipChakCore

final class RoomDataConverterTests: XCTestCase {

    func testMetersToMmRounding() {
        XCTAssertEqual(RoomDataConverter.metersToMm(3.2004), 3200)
        XCTAssertEqual(RoomDataConverter.metersToMm(3.2006), 3201)
        XCTAssertEqual(RoomDataConverter.metersToMm(-1.5), -1500)
        XCTAssertEqual(RoomDataConverter.metersToMm(0.12), 120)
    }

    func testRotationSnappingToQuarterTurns() {
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: 0), 0)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: 0.08), 0)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: .pi * 0.5), 90)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: .pi), 180)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: -.pi * 0.5), 270)
        XCTAssertEqual(RoomDataConverter.snapRotationDeg(yawRadians: -.pi * 0.05), 0)
    }

    func testOriginTranslationAndWallDimensionsAccuracy() {
        // Simulated RoomPlan capture centered around (-2.1..+2.1, -1.75..+1.75) => 4200 × 3500 mm
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
                // Window on north wall centered at x = 0.35 -> shifted x = 2450, length 1600 -> offset = 2450 - 800 = 1650
                RawSurfaceM(kind: .window, centerX: 0.35, centerZ: -1.75, baseY: 0.85, length: 1.60, height: 1.20, thickness: 0.12, yaw: 0, parentWallID: northID),
                // Door on south wall centered at x = 1.20 -> wall_S goes from (4200,3500) to (0,3500), center shifted x = 3300 -> dist from start = 900 -> offset = 900 - 450 = 450
                RawSurfaceM(kind: .door, centerX: 1.20, centerZ: 1.75, baseY: 0.0, length: 0.90, height: 2.10, thickness: 0.12, yaw: .pi, parentWallID: southID)
            ],
            objects: [
                RawObjectM(category: .bed, centerX: -1.0, centerZ: 0.5, width: 1.15, depth: 2.05, height: 0.55, yaw: 0.04, confidence: .high),
                RawObjectM(category: .television, centerX: 1.8, centerZ: -0.5, width: 1.20, depth: 0.35, height: 0.70, yaw: -.pi * 0.5, confidence: .medium)
            ],
            ceilingHeightM: 2.45,
            deviceModel: "iPhone 15 Pro Max"
        )

        let room = RoomDataConverter.convert(raw)

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

        // 4. Openings: window & door host wall, offset, sillHeight, swing, facing
        XCTAssertEqual(room.openings.count, 2)
        let win = try! XCTUnwrap(room.openings.first(where: { $0.type == .window }))
        XCTAssertEqual(win.wallId, "wall_1")
        XCTAssertEqual(win.offset, 1650)
        XCTAssertEqual(win.width, 1600)
        XCTAssertEqual(win.height, 1200)
        XCTAssertEqual(win.sillHeight, 850)
        XCTAssertNil(win.facing)
        XCTAssertNil(win.swing)

        let door = try! XCTUnwrap(room.openings.first(where: { $0.type == .door }))
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

        // television maps to .etc per apps/ios/CLAUDE.md
        XCTAssertEqual(room.existingFurniture[1].category, .etc)
        XCTAssertEqual(room.existingFurniture[1].rotationDeg, 270)
        XCTAssertEqual(room.existingFurniture[1].confidence, .medium)
    }

    func testJSONEncodingEmitsExplicitNullForWindowSwingAndFacing() throws {
        let room = RoomTemplates.studio4Pyeong()
        let json = try room.toPrettyJSON()
        XCTAssertTrue(json.contains("\"swing\" : null"))
        XCTAssertTrue(json.contains("\"facing\" : \"S\""))
        XCTAssertTrue(json.contains("\"schemaVersion\" : \"1.0\""))
        XCTAssertTrue(json.contains("\"unit\" : \"mm\""))

        // Round-trip decode
        let decoded = try JSONDecoder().decode(RoomData.self, from: Data(json.utf8))
        XCTAssertEqual(decoded, room)
    }

    func testStudioTemplatesAreasAndOrigin() {
        let t4 = RoomTemplates.studio4Pyeong()
        let t5 = RoomTemplates.studio5Pyeong()
        let t6 = RoomTemplates.studio6PyeongLShape()

        XCTAssertEqual(t4.floorAreaPyeong, 3.993, accuracy: 0.15)
        XCTAssertEqual(t5.floorAreaPyeong, 5.040, accuracy: 0.15)
        XCTAssertEqual(t6.floorAreaPyeong, 6.002, accuracy: 0.15)

        for t in [t4, t5, t6] {
            XCTAssertEqual(t.source, .template)
            XCTAssertEqual(t.floorPolygon.map(\.x).min(), 0)
            XCTAssertEqual(t.floorPolygon.map(\.z).min(), 0)
            XCTAssertGreaterThanOrEqual(t.walls.count, 4)
        }
    }
}

import Foundation

/// M1-3: Korean studio templates (4평 / 5평 / 6평) conforming to `packages/schema/room.schema.json`.
public enum RoomTemplates {
    public static let allTemplates: [RoomData] = [
        studio4Pyeong(),
        studio5Pyeong(),
        studio6PyeongLShape()
    ]

    /// 4평 오픈형 원룸: 3000 × 4400 mm = 13.2㎡ (약 4.0평)
    public static func studio4Pyeong() -> RoomData {
        RoomData(
            schemaVersion: "1.0",
            roomId: "room_01J0TEMPLATE04PYSTUDIO00",
            ownerId: "user_template_system",
            name: "4평 오픈형 원룸 (3.0×4.4m)",
            source: .template,
            sourceMeta: RoomSourceMeta(templateId: "tpl_4py"),
            unit: "mm",
            ceilingHeight: 2350,
            floorPolygon: [
                RoomPoint2(x: 0, z: 0),
                RoomPoint2(x: 3000, z: 0),
                RoomPoint2(x: 3000, z: 4400),
                RoomPoint2(x: 0, z: 4400)
            ],
            walls: [
                RoomWall(id: "wall_N", start: RoomPoint2(x: 0, z: 0), end: RoomPoint2(x: 3000, z: 0), height: 2350, thickness: 120),
                RoomWall(id: "wall_E", start: RoomPoint2(x: 3000, z: 0), end: RoomPoint2(x: 3000, z: 4400), height: 2350, thickness: 120),
                RoomWall(id: "wall_S", start: RoomPoint2(x: 3000, z: 4400), end: RoomPoint2(x: 0, z: 4400), height: 2350, thickness: 120),
                RoomWall(id: "wall_W", start: RoomPoint2(x: 0, z: 4400), end: RoomPoint2(x: 0, z: 0), height: 2350, thickness: 120)
            ],
            openings: [
                RoomOpening(
                    id: "win_main",
                    type: .window,
                    wallId: "wall_N",
                    offset: 700,
                    width: 1600,
                    height: 1200,
                    sillHeight: 900,
                    facing: .S,
                    swing: nil
                ),
                RoomOpening(
                    id: "door_main",
                    type: .door,
                    wallId: "wall_S",
                    offset: 300,
                    width: 850,
                    height: 2050,
                    sillHeight: 0,
                    facing: nil,
                    swing: .defaultHinged
                )
            ],
            fixtures: [
                RoomFixture(
                    id: "fix_aircon",
                    type: .aircon,
                    position: RoomPoint3(x: 3000, y: 2050, z: 1200),
                    direction: RoomPoint2(x: -1, z: 0)
                ),
                RoomFixture(
                    id: "fix_outlet_1",
                    type: .outlet,
                    position: RoomPoint3(x: 0, y: 300, z: 1800)
                )
            ],
            existingFurniture: [],
            createdAt: "2026-11-21T00:00:00Z",
            updatedAt: "2026-11-21T00:00:00Z"
        )
    }

    /// 5평 직사각형 원룸: 3400 × 4900 mm = 16.66㎡ (약 5.04평)
    public static func studio5Pyeong() -> RoomData {
        RoomData(
            schemaVersion: "1.0",
            roomId: "room_01J0TEMPLATE05PYSTUDIO00",
            ownerId: "user_template_system",
            name: "5평 표준 직사각 원룸 (3.4×4.9m)",
            source: .template,
            sourceMeta: RoomSourceMeta(templateId: "tpl_5py"),
            unit: "mm",
            ceilingHeight: 2400,
            floorPolygon: [
                RoomPoint2(x: 0, z: 0),
                RoomPoint2(x: 3400, z: 0),
                RoomPoint2(x: 3400, z: 4900),
                RoomPoint2(x: 0, z: 4900)
            ],
            walls: [
                RoomWall(id: "wall_N", start: RoomPoint2(x: 0, z: 0), end: RoomPoint2(x: 3400, z: 0), height: 2400, thickness: 120),
                RoomWall(id: "wall_E", start: RoomPoint2(x: 3400, z: 0), end: RoomPoint2(x: 3400, z: 4900), height: 2400, thickness: 120),
                RoomWall(id: "wall_S", start: RoomPoint2(x: 3400, z: 4900), end: RoomPoint2(x: 0, z: 4900), height: 2400, thickness: 120),
                RoomWall(id: "wall_W", start: RoomPoint2(x: 0, z: 4900), end: RoomPoint2(x: 0, z: 0), height: 2400, thickness: 120)
            ],
            openings: [
                RoomOpening(
                    id: "win_balcony",
                    type: .window,
                    wallId: "wall_N",
                    offset: 700,
                    width: 2000,
                    height: 1500,
                    sillHeight: 650,
                    facing: .S,
                    swing: nil
                ),
                RoomOpening(
                    id: "door_entry",
                    type: .door,
                    wallId: "wall_S",
                    offset: 350,
                    width: 900,
                    height: 2100,
                    sillHeight: 0,
                    facing: nil,
                    swing: .defaultHinged
                )
            ],
            fixtures: [
                RoomFixture(
                    id: "fix_closet",
                    type: .closetBuiltin,
                    footprint: [
                        RoomPoint2(x: 0, z: 3700),
                        RoomPoint2(x: 600, z: 3700),
                        RoomPoint2(x: 600, z: 4900),
                        RoomPoint2(x: 0, z: 4900)
                    ],
                    height: 2400
                ),
                RoomFixture(
                    id: "fix_aircon",
                    type: .aircon,
                    position: RoomPoint3(x: 3400, y: 2100, z: 1400),
                    direction: RoomPoint2(x: -1, z: 0)
                )
            ],
            existingFurniture: [],
            createdAt: "2026-11-21T00:00:00Z",
            updatedAt: "2026-11-21T00:00:00Z"
        )
    }

    /// 6평 ㄱ자 분리형 원룸: 4600×4800 - 1400×1600 = 19.84㎡ (약 6.0평)
    public static func studio6PyeongLShape() -> RoomData {
        RoomData(
            schemaVersion: "1.0",
            roomId: "room_01J0TEMPLATE06PYLSHAPE00",
            ownerId: "user_template_system",
            name: "6평 ㄱ자 분리형 원룸 (4.6×4.8m)",
            source: .template,
            sourceMeta: RoomSourceMeta(templateId: "tpl_6py"),
            unit: "mm",
            ceilingHeight: 2450,
            floorPolygon: [
                RoomPoint2(x: 0, z: 0),
                RoomPoint2(x: 3200, z: 0),
                RoomPoint2(x: 3200, z: 1600),
                RoomPoint2(x: 4600, z: 1600),
                RoomPoint2(x: 4600, z: 4800),
                RoomPoint2(x: 0, z: 4800)
            ],
            walls: [
                RoomWall(id: "wall_1", start: RoomPoint2(x: 0, z: 0), end: RoomPoint2(x: 3200, z: 0), height: 2450, thickness: 120),
                RoomWall(id: "wall_2", start: RoomPoint2(x: 3200, z: 0), end: RoomPoint2(x: 3200, z: 1600), height: 2450, thickness: 120),
                RoomWall(id: "wall_3", start: RoomPoint2(x: 3200, z: 1600), end: RoomPoint2(x: 4600, z: 1600), height: 2450, thickness: 120),
                RoomWall(id: "wall_4", start: RoomPoint2(x: 4600, z: 1600), end: RoomPoint2(x: 4600, z: 4800), height: 2450, thickness: 120),
                RoomWall(id: "wall_5", start: RoomPoint2(x: 4600, z: 4800), end: RoomPoint2(x: 0, z: 4800), height: 2450, thickness: 120),
                RoomWall(id: "wall_6", start: RoomPoint2(x: 0, z: 4800), end: RoomPoint2(x: 0, z: 0), height: 2450, thickness: 120)
            ],
            openings: [
                RoomOpening(
                    id: "win_north",
                    type: .window,
                    wallId: "wall_1",
                    offset: 600,
                    width: 1800,
                    height: 1300,
                    sillHeight: 850,
                    facing: .S,
                    swing: nil
                ),
                RoomOpening(
                    id: "win_east",
                    type: .window,
                    wallId: "wall_4",
                    offset: 900,
                    width: 1200,
                    height: 1100,
                    sillHeight: 950,
                    facing: .E,
                    swing: nil
                ),
                RoomOpening(
                    id: "door_entry",
                    type: .door,
                    wallId: "wall_5",
                    offset: 400,
                    width: 900,
                    height: 2100,
                    sillHeight: 0,
                    facing: nil,
                    swing: .defaultHinged
                )
            ],
            fixtures: [
                RoomFixture(
                    id: "fix_aircon",
                    type: .aircon,
                    position: RoomPoint3(x: 0, y: 2150, z: 1800),
                    direction: RoomPoint2(x: 1, z: 0)
                ),
                RoomFixture(
                    id: "fix_outlet",
                    type: .outlet,
                    position: RoomPoint3(x: 4600, y: 300, z: 3600)
                )
            ],
            existingFurniture: [],
            createdAt: "2026-11-21T00:00:00Z",
            updatedAt: "2026-11-21T00:00:00Z"
        )
    }
}

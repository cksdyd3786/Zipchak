import Foundation

// MARK: - Core Geometry Types (mm integer, right-handed Y-up, floor = XZ)

public struct RoomPoint2: Codable, Sendable, Hashable {
    public var x: Int
    public var z: Int

    public init(x: Int, z: Int) {
        self.x = x
        self.z = z
    }
}

public struct RoomPoint3: Codable, Sendable, Hashable {
    public var x: Int
    public var y: Int
    public var z: Int

    public init(x: Int, y: Int, z: Int) {
        self.x = x
        self.y = y
        self.z = z
    }
}

public struct RoomDimensions: Codable, Sendable, Hashable {
    public var width: Int
    public var depth: Int
    public var height: Int

    public init(width: Int, depth: Int, height: Int) {
        self.width = max(1, width)
        self.depth = max(1, depth)
        self.height = max(1, height)
    }
}

// MARK: - Schema Enums

public enum RoomSource: String, Codable, Sendable, Hashable {
    case lidar
    case manual
    case template
    case floorplan
}

public enum OpeningType: String, Codable, Sendable, Hashable {
    case door
    case window
    case opening
}

public enum CompassFacing: String, Codable, Sendable, Hashable, CaseIterable {
    case N, NE, E, SE, S, SW, W, NW
}

public enum DoorSwingKind: String, Codable, Sendable, Hashable {
    case hinged
    case sliding
}

public enum HingeSide: String, Codable, Sendable, Hashable {
    case left
    case right
}

public enum FixtureType: String, Codable, Sendable, Hashable {
    case radiator
    case pillar
    case outlet
    case aircon
    case sink
    case closetBuiltin = "closet_builtin"
}

public enum FurnitureCategory: String, Codable, Sendable, Hashable, CaseIterable {
    case bed
    case desk
    case chair
    case storage
    case shelf
    case table
    case wardrobe
    case sofa
    case lamp
    case decor
    case etc

    public var koreanName: String {
        switch self {
        case .bed: return "침대"
        case .desk: return "책상"
        case .chair: return "의자"
        case .storage: return "수납장"
        case .shelf: return "선반"
        case .table: return "테이블"
        case .wardrobe: return "옷장"
        case .sofa: return "소파"
        case .lamp: return "조명"
        case .decor: return "소품"
        case .etc: return "기타 가구"
        }
    }
}

public enum DetectedBy: String, Codable, Sendable, Hashable {
    case roomplan
    case user
}

public enum ConfidenceLevel: String, Codable, Sendable, Hashable {
    case high
    case medium
    case low
}

// MARK: - RoomData Nested Models (strictly matching packages/schema/room.schema.json)

public struct RoomSourceMeta: Codable, Sendable, Hashable {
    public var device: String?
    public var roomPlanVersion: String?
    public var rawAssetUrl: String?
    public var templateId: String?
    public var floorplanImageUrl: String?

    public init(
        device: String? = nil,
        roomPlanVersion: String? = nil,
        rawAssetUrl: String? = nil,
        templateId: String? = nil,
        floorplanImageUrl: String? = nil
    ) {
        self.device = device
        self.roomPlanVersion = roomPlanVersion
        self.rawAssetUrl = rawAssetUrl
        self.templateId = templateId
        self.floorplanImageUrl = floorplanImageUrl
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(device, forKey: .device)
        try c.encode(roomPlanVersion, forKey: .roomPlanVersion)
        try c.encode(rawAssetUrl, forKey: .rawAssetUrl)
        try c.encode(templateId, forKey: .templateId)
        try c.encode(floorplanImageUrl, forKey: .floorplanImageUrl)
    }
}

public struct RoomWall: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var start: RoomPoint2
    public var end: RoomPoint2
    public var height: Int
    public var thickness: Int

    public init(id: String, start: RoomPoint2, end: RoomPoint2, height: Int, thickness: Int = 120) {
        self.id = id
        self.start = start
        self.end = end
        self.height = max(1, height)
        self.thickness = max(1, thickness)
    }

    public var lengthMm: Double {
        let dx = Double(end.x - start.x)
        let dz = Double(end.z - start.z)
        return hypot(dx, dz)
    }
}

public struct DoorSwing: Codable, Sendable, Hashable {
    public var kind: DoorSwingKind
    public var hingeSide: HingeSide
    public var opensInward: Bool
    public var maxAngleDeg: Int

    public init(
        kind: DoorSwingKind = .hinged,
        hingeSide: HingeSide = .left,
        opensInward: Bool = true,
        maxAngleDeg: Int = 90
    ) {
        self.kind = kind
        self.hingeSide = hingeSide
        self.opensInward = opensInward
        self.maxAngleDeg = max(0, min(180, maxAngleDeg))
    }

    public static let defaultHinged = DoorSwing(kind: .hinged, hingeSide: .left, opensInward: true, maxAngleDeg: 90)
}

public struct RoomOpening: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var type: OpeningType
    public var wallId: String
    public var offset: Int
    public var width: Int
    public var height: Int
    public var sillHeight: Int
    public var facing: CompassFacing?
    public var swing: DoorSwing?

    public init(
        id: String,
        type: OpeningType,
        wallId: String,
        offset: Int,
        width: Int,
        height: Int,
        sillHeight: Int,
        facing: CompassFacing? = nil,
        swing: DoorSwing? = nil
    ) {
        self.id = id
        self.type = type
        self.wallId = wallId
        self.offset = max(0, offset)
        self.width = max(1, width)
        self.height = max(1, height)
        self.sillHeight = max(0, sillHeight)
        self.facing = facing
        self.swing = swing
    }

    /// Always emits `swing` (including explicit `null`) and `facing` to satisfy room.schema.json required keys.
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(wallId, forKey: .wallId)
        try c.encode(offset, forKey: .offset)
        try c.encode(width, forKey: .width)
        try c.encode(height, forKey: .height)
        try c.encode(sillHeight, forKey: .sillHeight)
        try c.encode(facing, forKey: .facing)
        try c.encode(swing, forKey: .swing)
    }
}

public struct RoomFixture: Identifiable, Codable, Sendable, Hashable {
    public var id: String
    public var type: FixtureType
    public var footprint: [RoomPoint2]?
    public var height: Int?
    public var position: RoomPoint3?
    public var direction: RoomPoint2?

    public init(
        id: String,
        type: FixtureType,
        footprint: [RoomPoint2]? = nil,
        height: Int? = nil,
        position: RoomPoint3? = nil,
        direction: RoomPoint2? = nil
    ) {
        self.id = id
        self.type = type
        self.footprint = footprint
        self.height = height
        self.position = position
        self.direction = direction
    }
}

public struct ExistingFurnitureItem: Identifiable, Codable, Sendable, Hashable {
    public var id: String { instanceId }
    public var instanceId: String
    public var category: FurnitureCategory
    public var catalogItemId: String?
    public var label: String?
    public var dimensions: RoomDimensions
    public var position: RoomPoint2
    public var rotationDeg: Int
    public var movable: Bool
    public var detectedBy: DetectedBy?
    public var confidence: ConfidenceLevel?

    public init(
        instanceId: String,
        category: FurnitureCategory,
        catalogItemId: String? = nil,
        label: String? = nil,
        dimensions: RoomDimensions,
        position: RoomPoint2,
        rotationDeg: Int,
        movable: Bool = true,
        detectedBy: DetectedBy? = .roomplan,
        confidence: ConfidenceLevel? = .high
    ) {
        self.instanceId = instanceId
        self.category = category
        self.catalogItemId = catalogItemId
        self.label = label
        self.dimensions = dimensions
        self.position = position
        self.rotationDeg = rotationDeg
        self.movable = movable
        self.detectedBy = detectedBy
        self.confidence = confidence
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(instanceId, forKey: .instanceId)
        try c.encode(category, forKey: .category)
        try c.encode(catalogItemId, forKey: .catalogItemId)
        try c.encodeIfPresent(label, forKey: .label)
        try c.encode(dimensions, forKey: .dimensions)
        try c.encode(position, forKey: .position)
        try c.encode(rotationDeg, forKey: .rotationDeg)
        try c.encode(movable, forKey: .movable)
        try c.encodeIfPresent(detectedBy, forKey: .detectedBy)
        try c.encodeIfPresent(confidence, forKey: .confidence)
    }
}

// MARK: - Root RoomData Document

public struct RoomData: Identifiable, Codable, Sendable, Hashable {
    public var id: String { roomId }
    public var schemaVersion: String
    public var roomId: String
    public var ownerId: String
    public var name: String
    public var source: RoomSource
    public var sourceMeta: RoomSourceMeta?
    public var unit: String
    public var ceilingHeight: Int
    public var floorPolygon: [RoomPoint2]
    public var walls: [RoomWall]
    public var openings: [RoomOpening]
    public var fixtures: [RoomFixture]
    public var existingFurniture: [ExistingFurnitureItem]
    public var createdAt: String
    public var updatedAt: String

    public init(
        schemaVersion: String = "1.0",
        roomId: String = "room_\(ULIDGenerator.generate())",
        ownerId: String = "user_local",
        name: String,
        source: RoomSource = .lidar,
        sourceMeta: RoomSourceMeta? = nil,
        unit: String = "mm",
        ceilingHeight: Int = 2400,
        floorPolygon: [RoomPoint2],
        walls: [RoomWall],
        openings: [RoomOpening] = [],
        fixtures: [RoomFixture] = [],
        existingFurniture: [ExistingFurnitureItem] = [],
        createdAt: String = RoomData.iso8601UTCNow(),
        updatedAt: String = RoomData.iso8601UTCNow()
    ) {
        self.schemaVersion = schemaVersion
        self.roomId = roomId
        self.ownerId = ownerId
        self.name = String(name.prefix(40))
        self.source = source
        self.sourceMeta = sourceMeta
        self.unit = unit
        self.ceilingHeight = max(2000, min(5000, ceilingHeight))
        self.floorPolygon = floorPolygon
        self.walls = walls
        self.openings = openings
        self.fixtures = fixtures
        self.existingFurniture = existingFurniture
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public static func iso8601UTCNow(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    /// Floor area in square meters using the shoelace formula on `floorPolygon` (mm -> m²).
    public var floorAreaSquareMeters: Double {
        guard floorPolygon.count >= 3 else { return 0 }
        var sum: Double = 0
        for i in 0..<floorPolygon.count {
            let p0 = floorPolygon[i]
            let p1 = floorPolygon[(i + 1) % floorPolygon.count]
            sum += Double(p0.x) * Double(p1.z) - Double(p1.x) * Double(p0.z)
        }
        return abs(sum) * 0.5 / 1_000_000.0
    }

    /// Korean pyeong (1평 ≈ 3.3058㎡).
    public var floorAreaPyeong: Double {
        floorAreaSquareMeters / 3.3058
    }

    /// Bounding box width (X) and depth (Z) in mm.
    public var boundsMm: (minX: Int, maxX: Int, minZ: Int, maxZ: Int) {
        let pts = floorPolygon.isEmpty ? walls.flatMap { [$0.start, $0.end] } : floorPolygon
        guard let first = pts.first else { return (0, 0, 0, 0) }
        var minX = first.x, maxX = first.x, minZ = first.z, maxZ = first.z
        for p in pts.dropFirst() {
            minX = min(minX, p.x)
            maxX = max(maxX, p.x)
            minZ = min(minZ, p.z)
            maxZ = max(maxZ, p.z)
        }
        return (minX, maxX, minZ, maxZ)
    }

    public func toPrettyJSON() throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(self)
        return String(decoding: data, as: UTF8.self)
    }

    /// Request body for `POST /rooms` (omits `roomId`, `ownerId`, `createdAt`, `updatedAt` per OpenAPI v1.0).
    public func toCreatePayload() -> RoomCreatePayload {
        RoomCreatePayload(
            schemaVersion: schemaVersion,
            name: String(name.prefix(40)),
            source: source,
            sourceMeta: sourceMeta,
            unit: unit,
            ceilingHeight: ceilingHeight,
            floorPolygon: floorPolygon,
            walls: walls,
            openings: openings,
            fixtures: fixtures,
            existingFurniture: existingFurniture
        )
    }
}

public struct RoomCreatePayload: Codable, Sendable, Hashable {
    public var schemaVersion: String
    public var name: String
    public var source: RoomSource
    public var sourceMeta: RoomSourceMeta?
    public var unit: String
    public var ceilingHeight: Int
    public var floorPolygon: [RoomPoint2]
    public var walls: [RoomWall]
    public var openings: [RoomOpening]
    public var fixtures: [RoomFixture]
    public var existingFurniture: [ExistingFurnitureItem]
}

// MARK: - Crockford Base32 ULID Generator

public enum ULIDGenerator {
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    public static func generate(date: Date = Date()) -> String {
        var timestamp = UInt64(max(0, date.timeIntervalSince1970 * 1000.0))
        var timeChars = Array(repeating: Character("0"), count: 10)
        for i in stride(from: 9, through: 0, by: -1) {
            timeChars[i] = alphabet[Int(timestamp % 32)]
            timestamp /= 32
        }
        var randChars = Array(repeating: Character("0"), count: 16)
        for i in 0..<16 {
            randChars[i] = alphabet[Int.random(in: 0..<32)]
        }
        return String(timeChars + randChars)
    }
}

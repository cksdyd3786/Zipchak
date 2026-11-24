import Foundation

// MARK: - Platform-Independent RoomPlan Capture Input (meters, Y-up XZ floor)

public struct RawPoint2M: Sendable, Hashable {
    public var x: Float
    public var z: Float

    public init(x: Float, z: Float) {
        self.x = x
        self.z = z
    }
}

public enum RawSurfaceKind: Sendable, Hashable {
    case wall
    case door
    case window
    case opening
}

public struct RawSurfaceM: Sendable, Hashable {
    public var id: UUID
    public var kind: RawSurfaceKind
    public var centerX: Float
    public var centerZ: Float
    /// Bottom elevation from floor plane (meters).
    public var baseY: Float
    /// Span along surface local X axis (meters).
    public var length: Float
    /// Vertical height along Y axis (meters).
    public var height: Float
    /// Depth/thickness along local Z axis (meters).
    public var thickness: Float
    /// Yaw around +Y (radians): localRight = (cos(yaw), -sin(yaw)), localForward = (sin(yaw), cos(yaw)).
    public var yaw: Float
    public var parentWallID: UUID?
    public var confidence: ConfidenceLevel

    public init(
        id: UUID = UUID(),
        kind: RawSurfaceKind,
        centerX: Float,
        centerZ: Float,
        baseY: Float = 0,
        length: Float,
        height: Float,
        thickness: Float = 0.12,
        yaw: Float,
        parentWallID: UUID? = nil,
        confidence: ConfidenceLevel = .high
    ) {
        self.id = id
        self.kind = kind
        self.centerX = centerX
        self.centerZ = centerZ
        self.baseY = baseY
        self.length = length
        self.height = height
        self.thickness = thickness
        self.yaw = yaw
        self.parentWallID = parentWallID
        self.confidence = confidence
    }

    public var startPointM: RawPoint2M {
        let tx = cos(yaw)
        let tz = -sin(yaw)
        return RawPoint2M(x: centerX - tx * (length * 0.5), z: centerZ - tz * (length * 0.5))
    }

    public var endPointM: RawPoint2M {
        let tx = cos(yaw)
        let tz = -sin(yaw)
        return RawPoint2M(x: centerX + tx * (length * 0.5), z: centerZ + tz * (length * 0.5))
    }
}

public enum RawObjectCategory: String, Sendable, Hashable {
    case bed
    case table
    case chair
    case sofa
    case storage
    case television
    case fireplace
    case sink
    case toilet
    case bathtub
    case refrigerator
    case stove
    case washerDryer
    case stairs
    case other

    /// Mapping per apps/ios/CLAUDE.md:
    /// bed->bed, table->table, chair->chair, sofa->sofa, storage->storage, (rest)->etc
    public var schemaCategory: FurnitureCategory {
        switch self {
        case .bed: return .bed
        case .table: return .table
        case .chair: return .chair
        case .sofa: return .sofa
        case .storage: return .storage
        case .television, .fireplace, .sink, .toilet, .bathtub,
             .refrigerator, .stove, .washerDryer, .stairs, .other:
            return .etc
        }
    }

    public var koreanLabel: String {
        switch self {
        case .bed: return "기존 침대"
        case .table: return "기존 테이블"
        case .chair: return "기존 의자"
        case .sofa: return "기존 소파"
        case .storage: return "기존 수납장"
        case .television: return "기존 TV"
        case .fireplace: return "벽난로"
        case .sink: return "싱크대"
        case .toilet: return "변기"
        case .bathtub: return "욕조"
        case .refrigerator: return "냉장고"
        case .stove: return "가스/인덕션"
        case .washerDryer: return "세탁기"
        case .stairs: return "계단"
        case .other: return "기존 가구"
        }
    }
}

public struct RawObjectM: Sendable, Hashable {
    public var id: UUID
    public var category: RawObjectCategory
    public var centerX: Float
    public var centerZ: Float
    public var width: Float
    public var depth: Float
    public var height: Float
    public var yaw: Float
    public var confidence: ConfidenceLevel

    public init(
        id: UUID = UUID(),
        category: RawObjectCategory,
        centerX: Float,
        centerZ: Float,
        width: Float,
        depth: Float,
        height: Float,
        yaw: Float,
        confidence: ConfidenceLevel = .high
    ) {
        self.id = id
        self.category = category
        self.centerX = centerX
        self.centerZ = centerZ
        self.width = width
        self.depth = depth
        self.height = height
        self.yaw = yaw
        self.confidence = confidence
    }
}

public struct RawCapturedRoom: Sendable {
    public var identifier: UUID
    public var name: String
    public var floorPolygonM: [RawPoint2M]
    public var surfaces: [RawSurfaceM]
    public var objects: [RawObjectM]
    public var ceilingHeightM: Float
    public var deviceModel: String
    public var roomPlanVersion: String?
    public var capturedAt: Date

    public init(
        identifier: UUID = UUID(),
        name: String = "LiDAR 스캔 방",
        floorPolygonM: [RawPoint2M] = [],
        surfaces: [RawSurfaceM],
        objects: [RawObjectM] = [],
        ceilingHeightM: Float = 2.4,
        deviceModel: String = "iPhone Pro",
        roomPlanVersion: String? = "iOS 17+",
        capturedAt: Date = Date()
    ) {
        self.identifier = identifier
        self.name = name
        self.floorPolygonM = floorPolygonM
        self.surfaces = surfaces
        self.objects = objects
        self.ceilingHeightM = ceilingHeightM
        self.deviceModel = deviceModel
        self.roomPlanVersion = roomPlanVersion
        self.capturedAt = capturedAt
    }
}

// MARK: - Conversion Diagnostics & Errors

public enum ConversionWarning: String, Sendable, Hashable, CaseIterable, Identifiable {
    case estimatedRoom
    case estimatedFloorFromWalls
    case synthesizedWallsFromFloor
    case lowConfidenceSurfaces

    public var id: String { rawValue }

    public var koreanMessage: String {
        switch self {
        case .estimatedRoom:
            return "일부 구조가 누락되어 추정된 방으로 변환되었습니다. 치수를 확인하거나 재스캔을 권장합니다."
        case .estimatedFloorFromWalls:
            return "바닥 면이 감지되지 않아 벽 끝점으로 바닥 윤곽을 추정했습니다."
        case .synthesizedWallsFromFloor:
            return "벽이 3개 미만으로 감지되어 바닥 윤곽에서 벽을 추정했습니다."
        case .lowConfidenceSurfaces:
            return "일부 벽·개구부의 인식 신뢰도가 낮아 ±3cm 이상 오차가 있을 수 있습니다."
        }
    }
}

public enum RoomConversionError: LocalizedError, Sendable, Equatable {
    case insufficientScanData

    public var errorDescription: String? {
        switch self {
        case .insufficientScanData:
            return "방 구조를 구성할 벽(3개 이상) 또는 바닥 윤곽이 충분히 스캔되지 않았습니다. 벽 모서리와 바닥 경계를 천천히 다시 스캔해 주세요."
        }
    }
}

public struct ConversionResult: Sendable, Hashable {
    public let room: RoomData
    public let warnings: [ConversionWarning]

    public init(room: RoomData, warnings: [ConversionWarning]) {
        self.room = room
        self.warnings = warnings
    }
}

// MARK: - Pure RoomDataConverter (RoomPlan meters -> Zipchak RoomData mm + origin shift)

public enum RoomDataConverter {
    /// Converts meters (Float) to integer millimeters using standard half-away-from-zero rounding.
    public static func metersToMm(_ meters: Float) -> Int {
        Int((Double(meters) * 1000.0).rounded())
    }

    /// Snaps Y-axis counter-clockwise yaw (radians) to one of {0, 90, 180, 270}.
    /// Apple RoomPlan `CapturedRoom.Object.transform` uses local +Z (`columns.2`) as forward,
    /// matching `docs/conventions.md` (+Z front at `rotationDeg = 0`).
    /// `facingOffsetDeg` allows an explicit 90/180° calibration if physical testing requires adjustment.
    public static func snapRotationDeg(yawRadians: Float, facingOffsetDeg: Int = 0) -> Int {
        let deg = Double(yawRadians) * 180.0 / .pi + Double(facingOffsetDeg)
        let normalized = ((deg.truncatingRemainder(dividingBy: 360.0)) + 360.0).truncatingRemainder(dividingBy: 360.0)
        let quadrant = Int((normalized / 90.0).rounded()) % 4
        return quadrant * 90
    }

    /// Converts a `RawCapturedRoom` (meters) into a schema-valid `RoomData` (mm, origin at min X/Z = 0,0)
    /// along with any diagnostic warnings. Throws `RoomConversionError.insufficientScanData` rather than
    /// fabricating a fake default room when scan geometry is missing.
    public static func convertWithDiagnostics(
        _ raw: RawCapturedRoom,
        ownerId: String = "user_local",
        roomId: String? = nil,
        refineOrthogonalWalls: Bool = true,
        furnitureFacingOffsetDeg: Int = 0
    ) throws -> ConversionResult {
        var warnings: [ConversionWarning] = []

        // 1. Separate walls vs openings and optionally refine collinear / slightly tilted walls
        var rawWalls = raw.surfaces.filter { $0.kind == .wall && $0.length >= 0.20 }
        let rawOpenings = raw.surfaces.filter { $0.kind != .wall && $0.length >= 0.15 }

        let hasValidExplicitFloor = raw.floorPolygonM.count >= 3 && polygonAreaM(raw.floorPolygonM) > 0.25
        guard rawWalls.count >= 3 || hasValidExplicitFloor else {
            throw RoomConversionError.insufficientScanData
        }

        if refineOrthogonalWalls && rawWalls.count >= 3 {
            rawWalls = refineWalls(rawWalls)
        }

        // 2. Build raw floor polygon in meters (prefer native floor polygon; else derive from walls and warn)
        let polygonM: [RawPoint2M]
        if hasValidExplicitFloor {
            polygonM = raw.floorPolygonM
        } else {
            guard let derived = deriveFloorPolygonM(from: rawWalls) else {
                throw RoomConversionError.insufficientScanData
            }
            polygonM = derived
            warnings.append(.estimatedRoom)
            warnings.append(.estimatedFloorFromWalls)
        }

        // Synthesize walls from floor polygon if fewer than 3 walls were captured, and emit warning
        if rawWalls.count < 3 {
            rawWalls = synthesizeWallsFromPolygon(polygonM, heightM: raw.ceilingHeightM)
            guard rawWalls.count >= 3 else {
                throw RoomConversionError.insufficientScanData
            }
            if !warnings.contains(.estimatedRoom) {
                warnings.append(.estimatedRoom)
            }
            warnings.append(.synthesizedWallsFromFloor)
        }

        // Low-confidence surface check
        let allScannedSurfaces = raw.surfaces
        if !allScannedSurfaces.isEmpty {
            let lowCount = allScannedSurfaces.filter { $0.confidence == .low }.count
            if Double(lowCount) / Double(allScannedSurfaces.count) > 0.4 {
                warnings.append(.lowConfidenceSurfaces)
            }
        }

        // 3. Compute bounding box min (minX, minZ) in meters across floor polygon and walls so origin shifts to (0, 0)
        let allPointsM: [RawPoint2M] = polygonM + rawWalls.flatMap { [$0.startPointM, $0.endPointM] }
        let minXM = allPointsM.map(\.x).min() ?? 0
        let minZM = allPointsM.map(\.z).min() ?? 0

        func shiftedPointMm(x: Float, z: Float) -> RoomPoint2 {
            RoomPoint2(
                x: metersToMm(x - minXM),
                z: metersToMm(z - minZM)
            )
        }

        // 4. Convert floorPolygon (closed ring without repeating first vertex)
        var floorPolygonMm = deduplicateConsecutive(polygonM.map { shiftedPointMm(x: $0.x, z: $0.z) })
        if floorPolygonMm.count >= 2 && floorPolygonMm.first == floorPolygonMm.last {
            floorPolygonMm.removeLast()
        }
        guard floorPolygonMm.count >= 3 else {
            throw RoomConversionError.insufficientScanData
        }

        // Guarantee exact (0, 0) bounding box minimum in mm even after rounding
        let polyMinX = floorPolygonMm.map(\.x).min() ?? 0
        let polyMinZ = floorPolygonMm.map(\.z).min() ?? 0
        if polyMinX != 0 || polyMinZ != 0 {
            floorPolygonMm = floorPolygonMm.map { RoomPoint2(x: $0.x - polyMinX, z: $0.z - polyMinZ) }
        }

        func toSchemaPoint(x: Float, z: Float) -> RoomPoint2 {
            let p = shiftedPointMm(x: x, z: z)
            return RoomPoint2(x: p.x - polyMinX, z: p.z - polyMinZ)
        }

        // 5. Convert walls with stable IDs and map raw UUID -> wallId
        var wallIdByUUID: [UUID: String] = [:]
        var walls: [RoomWall] = []
        walls.reserveCapacity(rawWalls.count)

        for (index, w) in rawWalls.enumerated() {
            let wallId = "wall_\(index + 1)"
            wallIdByUUID[w.id] = wallId
            let start = toSchemaPoint(x: w.startPointM.x, z: w.startPointM.z)
            let end = toSchemaPoint(x: w.endPointM.x, z: w.endPointM.z)
            let heightMm = max(1800, metersToMm(w.height))
            let rawThickMm = metersToMm(w.thickness)
            // RoomPlan often reports thin/zero wall depth; default to 120mm per apps/ios/CLAUDE.md
            let thicknessMm = rawThickMm >= 60 ? rawThickMm : 120
            walls.append(RoomWall(id: wallId, start: start, end: end, height: heightMm, thickness: thicknessMm))
        }

        // 6. Convert doors / windows / openings with host wall matching & offset from wall.start
        var openings: [RoomOpening] = []
        openings.reserveCapacity(rawOpenings.count)

        for (idx, op) in rawOpenings.enumerated() {
            let opCenterMm = toSchemaPoint(x: op.centerX, z: op.centerZ)
            let hostWall = resolveHostWall(
                for: op,
                centerMm: opCenterMm,
                wallIdByUUID: wallIdByUUID,
                walls: walls
            )
            guard let hostWall else { continue }

            let wallLenMm = hostWall.lengthMm
            guard wallLenMm > 10 else { continue }

            let ux = Double(hostWall.end.x - hostWall.start.x) / wallLenMm
            let uz = Double(hostWall.end.z - hostWall.start.z) / wallLenMm
            let alongCenterMm = Double(opCenterMm.x - hostWall.start.x) * ux + Double(opCenterMm.z - hostWall.start.z) * uz

            let widthMm = max(100, min(Int(wallLenMm.rounded()), metersToMm(op.length)))
            let rawOffset = Int((alongCenterMm - Double(widthMm) * 0.5).rounded())
            let maxOffset = max(0, Int(wallLenMm.rounded()) - widthMm)
            let offsetMm = max(0, min(maxOffset, rawOffset))

            let heightMm = max(100, metersToMm(op.height))
            let type: OpeningType
            let idPrefix: String
            let sillHeightMm: Int
            let swing: DoorSwing?

            switch op.kind {
            case .door:
                type = .door
                idPrefix = "door"
                sillHeightMm = 0
                swing = .defaultHinged
            case .window:
                type = .window
                idPrefix = "win"
                sillHeightMm = max(0, metersToMm(op.baseY))
                swing = nil
            case .opening:
                type = .opening
                idPrefix = "open"
                sillHeightMm = max(0, metersToMm(op.baseY))
                swing = nil
            case .wall:
                continue
            }

            openings.append(
                RoomOpening(
                    id: "\(idPrefix)_\(idx + 1)",
                    type: type,
                    wallId: hostWall.id,
                    offset: offsetMm,
                    width: widthMm,
                    height: heightMm,
                    sillHeight: sillHeightMm,
                    facing: nil,
                    swing: swing
                )
            )
        }

        // 7. Convert existing furniture objects
        let existingFurniture: [ExistingFurnitureItem] = raw.objects.enumerated().map { idx, obj in
            let pos = toSchemaPoint(x: obj.centerX, z: obj.centerZ)
            let dims = RoomDimensions(
                width: max(100, metersToMm(obj.width)),
                depth: max(100, metersToMm(obj.depth)),
                height: max(100, metersToMm(obj.height))
            )
            let cat = obj.category.schemaCategory
            return ExistingFurnitureItem(
                instanceId: "inst_\(cat.rawValue)_\(String(format: "%02d", idx + 1))",
                category: cat,
                catalogItemId: nil,
                label: obj.category.koreanLabel,
                dimensions: dims,
                position: pos,
                rotationDeg: snapRotationDeg(yawRadians: obj.yaw, facingOffsetDeg: furnitureFacingOffsetDeg),
                movable: true,
                detectedBy: .roomplan,
                confidence: obj.confidence
            )
        }

        let maxWallH = walls.map(\.height).max() ?? 2400
        let ceilingMm = max(2000, min(5000, max(metersToMm(raw.ceilingHeightM), maxWallH)))
        let isoNow = RoomData.iso8601UTCNow(raw.capturedAt)

        let room = RoomData(
            schemaVersion: "1.0",
            roomId: roomId ?? "room_\(ULIDGenerator.generate(date: raw.capturedAt))",
            ownerId: ownerId,
            name: String(raw.name.prefix(40)),
            source: .lidar,
            sourceMeta: RoomSourceMeta(
                device: raw.deviceModel,
                roomPlanVersion: raw.roomPlanVersion,
                rawAssetUrl: nil,
                templateId: nil,
                floorplanImageUrl: nil
            ),
            unit: "mm",
            ceilingHeight: ceilingMm,
            floorPolygon: floorPolygonMm,
            walls: walls,
            openings: openings,
            fixtures: [],
            existingFurniture: existingFurniture,
            createdAt: isoNow,
            updatedAt: isoNow
        )

        return ConversionResult(room: room, warnings: warnings)
    }

    /// Convenience wrapper returning only `RoomData` when callers don't inspect warnings.
    public static func convert(
        _ raw: RawCapturedRoom,
        ownerId: String = "user_local",
        roomId: String? = nil,
        refineOrthogonalWalls: Bool = true,
        furnitureFacingOffsetDeg: Int = 0
    ) throws -> RoomData {
        try convertWithDiagnostics(
            raw,
            ownerId: ownerId,
            roomId: roomId,
            refineOrthogonalWalls: refineOrthogonalWalls,
            furnitureFacingOffsetDeg: furnitureFacingOffsetDeg
        ).room
    }

    // MARK: - Private Geometry & Refinement Helpers

    private static func resolveHostWall(
        for opening: RawSurfaceM,
        centerMm: RoomPoint2,
        wallIdByUUID: [UUID: String],
        walls: [RoomWall]
    ) -> RoomWall? {
        if let parentUUID = opening.parentWallID,
           let wallId = wallIdByUUID[parentUUID],
           let exact = walls.first(where: { $0.id == wallId }) {
            return exact
        }
        return walls.min { a, b in
            pointToSegmentDistance(point: centerMm, segStart: a.start, segEnd: a.end)
                < pointToSegmentDistance(point: centerMm, segStart: b.start, segEnd: b.end)
        }
    }

    private static func pointToSegmentDistance(point: RoomPoint2, segStart: RoomPoint2, segEnd: RoomPoint2) -> Double {
        let px = Double(point.x), pz = Double(point.z)
        let ax = Double(segStart.x), az = Double(segStart.z)
        let bx = Double(segEnd.x), bz = Double(segEnd.z)
        let dx = bx - ax, dz = bz - az
        let lenSq = dx * dx + dz * dz
        guard lenSq > 1e-6 else { return hypot(px - ax, pz - az) }
        let t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq))
        let projX = ax + t * dx
        let projZ = az + t * dz
        return hypot(px - projX, pz - projZ)
    }

    private static func deriveFloorPolygonM(from walls: [RawSurfaceM]) -> [RawPoint2M]? {
        guard walls.count >= 3 else { return nil }
        let rawPts = walls.flatMap { [$0.startPointM, $0.endPointM] }
        let dedup = deduplicatePointsM(rawPts, threshold: 0.22)
        if dedup.count >= 3 {
            let cx = dedup.reduce(Float(0)) { $0 + $1.x } / Float(dedup.count)
            let cz = dedup.reduce(Float(0)) { $0 + $1.z } / Float(dedup.count)
            let ordered = dedup.sorted { atan2($0.z - cz, $0.x - cx) < atan2($1.z - cz, $1.x - cx) }
            if polygonAreaM(ordered) > 0.25 {
                return ordered
            }
        }
        guard let minX = rawPts.map(\.x).min(),
              let maxX = rawPts.map(\.x).max(),
              let minZ = rawPts.map(\.z).min(),
              let maxZ = rawPts.map(\.z).max(),
              (maxX - minX) > 0.4, (maxZ - minZ) > 0.4 else {
            return nil
        }
        return [
            RawPoint2M(x: minX, z: minZ),
            RawPoint2M(x: maxX, z: minZ),
            RawPoint2M(x: maxX, z: maxZ),
            RawPoint2M(x: minX, z: maxZ)
        ]
    }

    private static func synthesizeWallsFromPolygon(_ polygon: [RawPoint2M], heightM: Float) -> [RawSurfaceM] {
        var result: [RawSurfaceM] = []
        for i in 0..<polygon.count {
            let a = polygon[i]
            let b = polygon[(i + 1) % polygon.count]
            let dx = b.x - a.x
            let dz = b.z - a.z
            let len = hypot(dx, dz)
            guard len > 0.1 else { continue }
            let yaw = atan2(-dz, dx)
            result.append(RawSurfaceM(
                kind: .wall,
                centerX: (a.x + b.x) * 0.5,
                centerZ: (a.z + b.z) * 0.5,
                length: len,
                height: max(2.2, heightM),
                thickness: 0.12,
                yaw: yaw
            ))
        }
        return result
    }

    /// Snaps minor (< 6°) LiDAR drift to the room's dominant orthogonal axes (adapted from RoomScanRefiner).
    private static func refineWalls(_ walls: [RawSurfaceM]) -> [RawSurfaceM] {
        var sumCos: Float = 0
        var sumSin: Float = 0
        for w in walls {
            let weight = max(0.2, w.length)
            let a4 = w.yaw * 4.0
            sumCos += cos(a4) * weight
            sumSin += sin(a4) * weight
        }
        let dominantYaw = atan2(sumSin, sumCos) / 4.0
        let snapThresholdRad: Float = 6.0 * .pi / 180.0

        return walls.map { w in
            var copy = w
            let diff = normalizeAngle(w.yaw - dominantYaw)
            let snappedQuarter = round(diff / (.pi * 0.5)) * (.pi * 0.5)
            if abs(diff - snappedQuarter) <= snapThresholdRad {
                copy.yaw = normalizeAngle(dominantYaw + snappedQuarter)
            }
            return copy
        }
    }

    private static func normalizeAngle(_ radians: Float) -> Float {
        var a = radians.truncatingRemainder(dividingBy: .pi * 2)
        if a > .pi { a -= .pi * 2 }
        if a < -.pi { a += .pi * 2 }
        return a
    }

    private static func polygonAreaM(_ pts: [RawPoint2M]) -> Float {
        guard pts.count >= 3 else { return 0 }
        var sum: Float = 0
        for i in 0..<pts.count {
            let a = pts[i]
            let b = pts[(i + 1) % pts.count]
            sum += (a.x * b.z - b.x * a.z)
        }
        return abs(sum) * 0.5
    }

    private static func deduplicatePointsM(_ pts: [RawPoint2M], threshold: Float) -> [RawPoint2M] {
        var out: [RawPoint2M] = []
        for p in pts {
            if !out.contains(where: { hypot($0.x - p.x, $0.z - p.z) < threshold }) {
                out.append(p)
            }
        }
        return out
    }

    private static func deduplicateConsecutive(_ pts: [RoomPoint2]) -> [RoomPoint2] {
        var out: [RoomPoint2] = []
        for p in pts {
            if out.last != p {
                out.append(p)
            }
        }
        return out
    }
}

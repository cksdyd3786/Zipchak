import Foundation
import RealityKit
import UIKit
import ZipChakCore
import simd

/// Builds full-height opaque 3D architectural room models with true door/window cutouts,
/// smart camera-blocking wall culling (`스마트 벽 숨김`), PBR materials, and existing furniture
/// directly from `ZipChakCore.RoomData` (mm integers -> meters `/ 1000.0`).
@MainActor
enum RealityKitRoomSceneBuilder {
    enum WallDisplayMode: String, CaseIterable, Identifiable {
        case smartCutaway = "스마트 벽 숨김"
        case fullHeight = "전체 벽 표시"
        case lowCutaway = "낮은 벽"

        var id: String { rawValue }
    }

    struct WallMetrics {
        let index: Int
        let wall: RoomWall
        let startM: SIMD2<Float>
        let endM: SIMD2<Float>
        let centerM: SIMD2<Float>
        let lengthM: Float
        let tangent: SIMD2<Float>
        let inwardNormal: SIMD2<Float>
        let yaw: Float
    }

    static func roomCentroidM(for room: RoomData) -> SIMD2<Float> {
        let pts = room.floorPolygon.isEmpty ? room.walls.flatMap { [$0.start, $0.end] } : room.floorPolygon
        guard !pts.isEmpty else { return .zero }
        var sx: Float = 0
        var sz: Float = 0
        for p in pts {
            sx += Float(p.x) / 1000.0
            sz += Float(p.z) / 1000.0
        }
        return SIMD2<Float>(sx / Float(pts.count), sz / Float(pts.count))
    }

    static func analyzeWalls(for room: RoomData) -> [WallMetrics] {
        let polygonM = room.floorPolygon.map { SIMD2<Float>(Float($0.x) / 1000.0, Float($0.z) / 1000.0) }
        let centroid = roomCentroidM(for: room)

        return room.walls.enumerated().compactMap { idx, wall in
            let s = SIMD2<Float>(Float(wall.start.x) / 1000.0, Float(wall.start.z) / 1000.0)
            let e = SIMD2<Float>(Float(wall.end.x) / 1000.0, Float(wall.end.z) / 1000.0)
            let diff = e - s
            let len = simd_length(diff)
            guard len > 0.05 else { return nil }
            let tangent = diff / len
            let center = (s + e) * 0.5
            let yaw = atan2(-tangent.y, tangent.x)

            // Candidate normals perpendicular to tangent
            let n1 = SIMD2<Float>(-tangent.y, tangent.x)
            let n2 = -n1
            let probe1 = center + n1 * 0.25
            let probe2 = center + n2 * 0.25
            let in1 = pointInPolygon(probe1, polygon: polygonM)
            let in2 = pointInPolygon(probe2, polygon: polygonM)
            let inward: SIMD2<Float>
            if in1 && !in2 {
                inward = n1
            } else if in2 && !in1 {
                inward = n2
            } else {
                inward = simd_dot(centroid - center, n1) >= 0 ? n1 : n2
            }

            return WallMetrics(
                index: idx,
                wall: wall,
                startM: s,
                endM: e,
                centerM: center,
                lengthM: len,
                tangent: tangent,
                inwardNormal: inward,
                yaw: yaw
            )
        }
    }

    static func buildRoomEntity(room: RoomData, wallDisplayMode: WallDisplayMode = .smartCutaway) -> Entity {
        let root = Entity()
        let centroid = roomCentroidM(for: room)
        // Center room around (0, 0, 0) so orbit camera feels natural
        root.position = SIMD3<Float>(-centroid.x, 0, -centroid.y)

        let polygonM = room.floorPolygon.map { SIMD2<Float>(Float($0.x) / 1000.0, Float($0.z) / 1000.0) }
        if let floorMesh = makeFloorPolygonMesh(polygon: polygonM) {
            let floorMat = pbrMaterial(color: UIColor(red: 0.91, green: 0.87, blue: 0.80, alpha: 1.0), roughness: 0.68)
            let floorEntity = ModelEntity(mesh: floorMesh, materials: [floorMat])
            floorEntity.position = SIMD3<Float>(0, -0.015, 0)
            root.addChild(floorEntity)
        }

        let wallMat = pbrMaterial(color: UIColor(red: 0.92, green: 0.91, blue: 0.89, alpha: 1.0), roughness: 0.84)
        let baseboardMat = pbrMaterial(color: UIColor(red: 0.62, green: 0.48, blue: 0.35, alpha: 1.0), roughness: 0.56)
        let capMat = pbrMaterial(color: UIColor(red: 0.78, green: 0.78, blue: 0.80, alpha: 1.0), roughness: 0.62)

        let walls = analyzeWalls(for: room)
        var upperByWallID: [String: Entity] = [:]

        for wm in walls {
            let wallH = Float(wm.wall.height) / 1000.0
            let wallT = max(0.08, Float(wm.wall.thickness) / 1000.0)
            let displayH: Float = wallDisplayMode == .lowCutaway ? min(0.45, wallH) : wallH
            let wallOri = simd_quatf(angle: wm.yaw, axis: SIMD3<Float>(0, 1, 0))

            let wallUpper = Entity()
            wallUpper.name = "wall_upper_\(wm.index)"
            root.addChild(wallUpper)
            upperByWallID[wm.wall.id] = wallUpper

            // Always-visible slim floor perimeter line so hidden front walls keep a crisp floor edge
            let floorRim = ModelEntity(
                mesh: MeshResource.generateBox(width: wm.lengthM, height: 0.024, depth: wallT + 0.008, cornerRadius: 0.002),
                materials: [baseboardMat]
            )
            floorRim.position = SIMD3<Float>(wm.centerM.x, 0.012, wm.centerM.y)
            floorRim.orientation = wallOri
            root.addChild(floorRim)

            if wallDisplayMode == .lowCutaway {
                let lowBox = ModelEntity(
                    mesh: MeshResource.generateBox(width: wm.lengthM, height: displayH, depth: wallT, cornerRadius: 0.004),
                    materials: [wallMat]
                )
                lowBox.position = SIMD3<Float>(wm.centerM.x, displayH * 0.5, wm.centerM.y)
                lowBox.orientation = wallOri
                wallUpper.addChild(lowBox)
            } else {
                let hostOpenings = room.openings
                    .filter { $0.wallId == wm.wall.id }
                    .sorted { $0.offset < $1.offset }

                appendSegmentedWall(
                    to: wallUpper,
                    metrics: wm,
                    wallHeight: displayH,
                    wallDepth: wallT,
                    openings: hostOpenings,
                    wallMat: wallMat,
                    baseboardMat: baseboardMat,
                    capMat: capMat
                )
            }
        }

        // Openings (Windows & Doors attached to host wall_upper so smart hide hides them together)
        appendOpenings(to: root, upperByWallID: upperByWallID, walls: walls, openings: room.openings, wallDisplayMode: wallDisplayMode)

        // Fixtures (builtin closet, radiator, aircon, etc.)
        appendFixtures(to: root, fixtures: room.fixtures)

        // Existing Furniture (multi-part 3D silhouettes)
        appendExistingFurniture(to: root, items: room.existingFurniture)

        return root
    }

    static func updateSmartWallVisibility(
        in shellRoot: Entity,
        room: RoomData,
        cameraOffsetFromCentroid: SIMD3<Float>,
        wallDisplayMode: WallDisplayMode
    ) {
        let walls = analyzeWalls(for: room)
        let centroid = roomCentroidM(for: room)
        let horizDist = hypot(cameraOffsetFromCentroid.x, cameraOffsetFromCentroid.z)
        let isTopDown = horizDist < cameraOffsetFromCentroid.y * 0.30

        for wm in walls {
            guard let upper = shellRoot.findEntity(named: "wall_upper_\(wm.index)") else { continue }
            guard wallDisplayMode == .smartCutaway, !isTopDown else {
                upper.isEnabled = true
                continue
            }
            let relWall = wm.centerM - centroid
            let toCam = SIMD2<Float>(cameraOffsetFromCentroid.x - relWall.x, cameraOffsetFromCentroid.z - relWall.y)
            let len = simd_length(toCam)
            guard len > 1e-4 else {
                upper.isEnabled = true
                continue
            }
            upper.isEnabled = simd_dot(wm.inwardNormal, toCam / len) > 0.08
        }
    }

    // MARK: - Segmented Wall with Real Door/Window Cutouts

    private static func appendSegmentedWall(
        to wallUpper: Entity,
        metrics: WallMetrics,
        wallHeight: Float,
        wallDepth: Float,
        openings: [RoomOpening],
        wallMat: PhysicallyBasedMaterial,
        baseboardMat: PhysicallyBasedMaterial,
        capMat: PhysicallyBasedMaterial
    ) {
        let ori = simd_quatf(angle: metrics.yaw, axis: SIMD3<Float>(0, 1, 0))
        let baseH: Float = 0.065

        func addSeg(alongStart: Float, alongEnd: Float, yBot: Float, yTop: Float, depth: Float, mat: PhysicallyBasedMaterial) {
            let w = alongEnd - alongStart
            let h = yTop - yBot
            guard w > 0.015 && h > 0.015 else { return }
            let midAlong = (alongStart + alongEnd) * 0.5
            let pt = metrics.startM + metrics.tangent * midAlong
            let box = ModelEntity(
                mesh: MeshResource.generateBox(width: w, height: h, depth: depth, cornerRadius: 0.003),
                materials: [mat]
            )
            box.position = SIMD3<Float>(pt.x, (yBot + yTop) * 0.5, pt.y)
            box.orientation = ori
            wallUpper.addChild(box)
        }

        var cursor: Float = 0
        for op in openings {
            let opStart = max(cursor, Float(op.offset) / 1000.0)
            let opEnd = min(metrics.lengthM, opStart + Float(op.width) / 1000.0)
            if opStart - cursor > 0.02 {
                addSeg(alongStart: cursor, alongEnd: opStart, yBot: 0, yTop: wallHeight, depth: wallDepth, mat: wallMat)
                addSeg(alongStart: cursor, alongEnd: opStart, yBot: 0, yTop: baseH, depth: wallDepth + 0.014, mat: baseboardMat)
            }
            if opEnd - opStart > 0.02 {
                let sillY = max(0, min(wallHeight - 0.1, Float(op.sillHeight) / 1000.0))
                let topY = min(wallHeight, sillY + Float(op.height) / 1000.0)
                if sillY > 0.03 {
                    addSeg(alongStart: opStart, alongEnd: opEnd, yBot: 0, yTop: sillY, depth: wallDepth, mat: wallMat)
                    addSeg(alongStart: opStart, alongEnd: opEnd, yBot: 0, yTop: baseH, depth: wallDepth + 0.014, mat: baseboardMat)
                }
                if wallHeight - topY > 0.03 {
                    addSeg(alongStart: opStart, alongEnd: opEnd, yBot: topY, yTop: wallHeight, depth: wallDepth, mat: wallMat)
                }
            }
            cursor = max(cursor, opEnd)
        }

        if metrics.lengthM - cursor > 0.02 {
            addSeg(alongStart: cursor, alongEnd: metrics.lengthM, yBot: 0, yTop: wallHeight, depth: wallDepth, mat: wallMat)
            addSeg(alongStart: cursor, alongEnd: metrics.lengthM, yBot: 0, yTop: baseH, depth: wallDepth + 0.014, mat: baseboardMat)
        }

        // Top architectural cap rail
        addSeg(alongStart: 0, alongEnd: metrics.lengthM, yBot: wallHeight, yTop: wallHeight + 0.022, depth: wallDepth + 0.012, mat: capMat)
    }

    // MARK: - Windows & Doors

    private static func appendOpenings(
        to root: Entity,
        upperByWallID: [String: Entity],
        walls: [WallMetrics],
        openings: [RoomOpening],
        wallDisplayMode: WallDisplayMode
    ) {
        let wallMap = Dictionary(uniqueKeysWithValues: walls.map { ($0.wall.id, $0) })
        let frameWhite = pbrMaterial(color: UIColor(white: 0.96, alpha: 1.0), roughness: 0.40)
        let mullionMat = pbrMaterial(color: UIColor(white: 0.28, alpha: 1.0), roughness: 0.35, metallic: 0.55)
        let glassMat = pbrMaterial(color: UIColor.systemCyan.withAlphaComponent(0.36), roughness: 0.08, metallic: 0.05, alpha: 0.36)
        let sillOrange = pbrMaterial(color: UIColor.systemOrange.withAlphaComponent(0.75), roughness: 0.45, alpha: 0.75)
        let doorWood = pbrMaterial(color: UIColor(red: 0.56, green: 0.41, blue: 0.27, alpha: 1.0), roughness: 0.52)
        let frameWood = pbrMaterial(color: UIColor(red: 0.34, green: 0.25, blue: 0.17, alpha: 1.0), roughness: 0.50)
        let handleMetal = pbrMaterial(color: UIColor(white: 0.78, alpha: 1.0), roughness: 0.22, metallic: 0.90)

        for op in openings {
            guard let wm = wallMap[op.wallId] else { continue }
            let opW = Float(op.width) / 1000.0
            let opOffset = Float(op.offset) / 1000.0
            let midAlong = opOffset + opW * 0.5
            let center = wm.startM + wm.tangent * midAlong
            let wallT = max(0.08, Float(wm.wall.thickness) / 1000.0)
            let ori = simd_quatf(angle: wm.yaw, axis: SIMD3<Float>(0, 1, 0))
            let host = upperByWallID[wm.wall.id] ?? root

            switch op.type {
            case .window:
                let h = wallDisplayMode == .lowCutaway ? min(0.26, Float(op.height) / 1000.0) : Float(op.height) / 1000.0
                let yBase = wallDisplayMode == .lowCutaway ? Float(0.14) : Float(op.sillHeight) / 1000.0
                let holder = Entity()
                holder.position = SIMD3<Float>(center.x, yBase + h * 0.5, center.y)
                holder.orientation = ori

                let glass = ModelEntity(
                    mesh: MeshResource.generateBox(width: max(0.1, opW - 0.07), height: max(0.08, h - 0.07), depth: 0.016),
                    materials: [glassMat]
                )
                holder.addChild(glass)

                let barT: Float = 0.042
                let d = wallT + 0.025
                let sill = ModelEntity(mesh: MeshResource.generateBox(width: opW + 0.04, height: barT, depth: d + 0.04, cornerRadius: 0.004), materials: [frameWhite])
                sill.position = SIMD3<Float>(0, -h * 0.5 + barT * 0.5, 0)
                holder.addChild(sill)

                let head = ModelEntity(mesh: MeshResource.generateBox(width: opW + 0.02, height: barT, depth: d, cornerRadius: 0.004), materials: [frameWhite])
                head.position = SIMD3<Float>(0, h * 0.5 - barT * 0.5, 0)
                holder.addChild(head)

                for side: Float in [-1, 1] {
                    let stile = ModelEntity(mesh: MeshResource.generateBox(width: barT, height: h, depth: d, cornerRadius: 0.004), materials: [frameWhite])
                    stile.position = SIMD3<Float>(side * (opW * 0.5 - barT * 0.5), 0, 0)
                    holder.addChild(stile)
                }
                if opW > 0.8 {
                    let mul = ModelEntity(mesh: MeshResource.generateBox(width: 0.028, height: h - barT * 2, depth: 0.036), materials: [mullionMat])
                    holder.addChild(mul)
                }
                host.addChild(holder)

            case .door, .opening:
                // Permanent floor threshold marker
                let threshold = ModelEntity(
                    mesh: MeshResource.generateBox(width: opW, height: 0.018, depth: wallT + 0.02),
                    materials: [sillOrange]
                )
                threshold.position = SIMD3<Float>(center.x, 0.009, center.y)
                threshold.orientation = ori
                root.addChild(threshold)

                let doorH = wallDisplayMode == .lowCutaway ? min(0.45, Float(op.height) / 1000.0) : Float(op.height) / 1000.0
                let jambW: Float = 0.045
                let jambD = wallT + 0.025
                for side: Float in [-1, 1] {
                    let pt = center + wm.tangent * (side * (opW * 0.5 - jambW * 0.5))
                    let jamb = ModelEntity(mesh: MeshResource.generateBox(width: jambW, height: doorH, depth: jambD, cornerRadius: 0.004), materials: [frameWood])
                    jamb.position = SIMD3<Float>(pt.x, doorH * 0.5, pt.y)
                    jamb.orientation = ori
                    host.addChild(jamb)
                }
                if wallDisplayMode != .lowCutaway {
                    let lintel = ModelEntity(mesh: MeshResource.generateBox(width: opW, height: 0.05, depth: jambD), materials: [frameWood])
                    lintel.position = SIMD3<Float>(center.x, doorH - 0.025, center.y)
                    lintel.orientation = ori
                    host.addChild(lintel)
                }

                if op.type == .door {
                    let leafLen = max(0.35, opW - jambW * 2)
                    let swingRad: Float = 0.48
                    let hinge = wm.startM + wm.tangent * (opOffset + jambW)
                    let inward = (op.swing?.opensInward ?? true) ? wm.inwardNormal : -wm.inwardNormal
                    let dir = simd_normalize(wm.tangent * cos(swingRad) + inward * sin(swingRad))
                    let leafCenter = hinge + dir * (leafLen * 0.5)
                    let leafYaw = atan2(-dir.y, dir.x)

                    let leafHolder = Entity()
                    leafHolder.position = SIMD3<Float>(leafCenter.x, 0.02, leafCenter.y)
                    leafHolder.orientation = simd_quatf(angle: leafYaw, axis: SIMD3<Float>(0, 1, 0))

                    let leafH = max(0.25, doorH - 0.03)
                    let leaf = ModelEntity(mesh: MeshResource.generateBox(width: leafLen, height: leafH, depth: 0.04, cornerRadius: 0.005), materials: [doorWood])
                    leaf.position = SIMD3<Float>(0, leafH * 0.5, 0)
                    leafHolder.addChild(leaf)

                    for zSide: Float in [-1, 1] {
                        let grip = ModelEntity(mesh: MeshResource.generateBox(width: 0.11, height: 0.022, depth: 0.035, cornerRadius: 0.006), materials: [handleMetal])
                        grip.position = SIMD3<Float>(leafLen * 0.36, min(0.95, leafH * 0.5), zSide * 0.032)
                        leafHolder.addChild(grip)
                    }
                    host.addChild(leafHolder)
                }
            }
        }
    }

    // MARK: - Fixtures & Existing Furniture

    private static func appendFixtures(to root: Entity, fixtures: [RoomFixture]) {
        let closetMat = pbrMaterial(color: UIColor(red: 0.80, green: 0.75, blue: 0.68, alpha: 1.0), roughness: 0.65)
        let radiatorMat = pbrMaterial(color: UIColor(white: 0.85, alpha: 1.0), roughness: 0.35, metallic: 0.6)
        let airconMat = pbrMaterial(color: UIColor(white: 0.96, alpha: 1.0), roughness: 0.3)

        for f in fixtures {
            if let fp = f.footprint, fp.count >= 3 {
                let xs = fp.map { Float($0.x) / 1000.0 }
                let zs = fp.map { Float($0.z) / 1000.0 }
                let w = max(0.06, (xs.max() ?? 0) - (xs.min() ?? 0))
                let d = max(0.06, (zs.max() ?? 0) - (zs.min() ?? 0))
                let h = max(0.2, Float(f.height ?? 800) / 1000.0)
                let cx = ((xs.min() ?? 0) + (xs.max() ?? 0)) * 0.5
                let cz = ((zs.min() ?? 0) + (zs.max() ?? 0)) * 0.5
                let mat = f.type == .radiator ? radiatorMat : closetMat
                let box = ModelEntity(mesh: MeshResource.generateBox(width: w, height: h, depth: d, cornerRadius: 0.01), materials: [mat])
                box.position = SIMD3<Float>(cx, h * 0.5, cz)
                root.addChild(box)
            } else if let pos = f.position, f.type == .aircon {
                let unit = ModelEntity(mesh: MeshResource.generateBox(width: 0.78, height: 0.26, depth: 0.20, cornerRadius: 0.025), materials: [airconMat])
                unit.position = SIMD3<Float>(Float(pos.x) / 1000.0, Float(pos.y) / 1000.0, Float(pos.z) / 1000.0)
                root.addChild(unit)
            }
        }
    }

    private static func appendExistingFurniture(to root: Entity, items: [ExistingFurnitureItem]) {
        let oakMat = pbrMaterial(color: UIColor(red: 0.66, green: 0.50, blue: 0.34, alpha: 1.0), roughness: 0.60)
        let fabricBlue = pbrMaterial(color: UIColor(red: 0.36, green: 0.49, blue: 0.60, alpha: 1.0), roughness: 0.85)
        let fabricSage = pbrMaterial(color: UIColor(red: 0.43, green: 0.55, blue: 0.45, alpha: 1.0), roughness: 0.85)
        let whiteMat = pbrMaterial(color: UIColor(red: 0.96, green: 0.95, blue: 0.92, alpha: 1.0), roughness: 0.82)
        let darkMetal = pbrMaterial(color: UIColor(white: 0.18, alpha: 1.0), roughness: 0.25, metallic: 0.80)

        for item in items {
            let holder = Entity()
            let w = Float(item.dimensions.width) / 1000.0
            let d = Float(item.dimensions.depth) / 1000.0
            let h = Float(item.dimensions.height) / 1000.0
            let yaw = Float(item.rotationDeg) * .pi / 180.0

            holder.position = SIMD3<Float>(Float(item.position.x) / 1000.0, 0, Float(item.position.z) / 1000.0)
            holder.orientation = simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0))

            switch item.category {
            case .bed:
                let baseH = min(0.22, h * 0.42)
                let frame = ModelEntity(mesh: MeshResource.generateBox(width: w, height: baseH, depth: d, cornerRadius: 0.015), materials: [oakMat])
                frame.position = SIMD3<Float>(0, baseH * 0.5, 0)
                holder.addChild(frame)
                let mattress = ModelEntity(mesh: MeshResource.generateBox(width: w * 0.94, height: min(0.22, h * 0.40), depth: d * 0.92, cornerRadius: 0.03), materials: [whiteMat])
                mattress.position = SIMD3<Float>(0, baseH + min(0.22, h * 0.40) * 0.5, 0.02)
                holder.addChild(mattress)
                let duvet = ModelEntity(mesh: MeshResource.generateBox(width: w * 0.96, height: 0.08, depth: d * 0.60, cornerRadius: 0.02), materials: [fabricBlue])
                duvet.position = SIMD3<Float>(0, baseH + min(0.22, h * 0.40) * 0.95, d * 0.16)
                holder.addChild(duvet)
                let head = ModelEntity(mesh: MeshResource.generateBox(width: w, height: max(h, 0.85), depth: 0.07, cornerRadius: 0.015), materials: [oakMat])
                head.position = SIMD3<Float>(0, max(h, 0.85) * 0.5, -d * 0.5 + 0.035)
                holder.addChild(head)

            case .sofa:
                let armW = min(0.15, w * 0.12)
                let backT = min(0.18, d * 0.22)
                let seat = ModelEntity(mesh: MeshResource.generateBox(width: w - armW * 2, height: h * 0.45, depth: d - backT, cornerRadius: 0.03), materials: [fabricSage])
                seat.position = SIMD3<Float>(0, h * 0.225, backT * 0.5)
                holder.addChild(seat)
                let back = ModelEntity(mesh: MeshResource.generateBox(width: w, height: h, depth: backT, cornerRadius: 0.03), materials: [fabricSage])
                back.position = SIMD3<Float>(0, h * 0.5, -d * 0.5 + backT * 0.5)
                holder.addChild(back)
                for s: Float in [-1, 1] {
                    let arm = ModelEntity(mesh: MeshResource.generateBox(width: armW, height: h * 0.70, depth: d, cornerRadius: 0.03), materials: [fabricSage])
                    arm.position = SIMD3<Float>(s * (w * 0.5 - armW * 0.5), h * 0.35, 0)
                    holder.addChild(arm)
                }

            case .table, .desk:
                let top = ModelEntity(mesh: MeshResource.generateBox(width: w, height: 0.04, depth: d, cornerRadius: 0.012), materials: [oakMat])
                top.position = SIMD3<Float>(0, h - 0.02, 0)
                holder.addChild(top)
                for sx: Float in [-1, 1] {
                    for sz: Float in [-1, 1] {
                        let leg = ModelEntity(mesh: MeshResource.generateBox(width: 0.045, height: h - 0.04, depth: 0.045, cornerRadius: 0.008), materials: [darkMetal])
                        leg.position = SIMD3<Float>(sx * (w * 0.5 - 0.05), (h - 0.04) * 0.5, sz * (d * 0.5 - 0.05))
                        holder.addChild(leg)
                    }
                }

            default:
                let mat = item.category == .storage || item.category == .wardrobe || item.category == .shelf ? oakMat : fabricBlue
                let box = ModelEntity(mesh: MeshResource.generateBox(width: w, height: h, depth: d, cornerRadius: 0.02), materials: [mat])
                box.position = SIMD3<Float>(0, h * 0.5, 0)
                holder.addChild(box)
            }

            root.addChild(holder)
        }
    }

    // MARK: - Helpers

    private static func pbrMaterial(color: UIColor, roughness: Float, metallic: Float = 0, alpha: CGFloat = 1.0) -> PhysicallyBasedMaterial {
        var mat = PhysicallyBasedMaterial()
        mat.baseColor = .init(tint: color)
        mat.roughness = .init(floatLiteral: roughness)
        mat.metallic = .init(floatLiteral: metallic)
        if alpha < 0.99 {
            mat.blending = .transparent(opacity: .init(floatLiteral: Float(alpha)))
        }
        return mat
    }

    private static func makeFloorPolygonMesh(polygon: [SIMD2<Float>]) -> MeshResource? {
        guard polygon.count >= 3 else { return nil }
        let indices = earClipTriangulate(polygon)
        guard !indices.isEmpty else { return nil }
        let positions = polygon.map { SIMD3<Float>($0.x, 0, $0.y) }
        let normals = Array(repeating: SIMD3<Float>(0, 1, 0), count: positions.count)
        var desc = MeshDescriptor(name: "ZipChakFloor")
        desc.positions = MeshBuffer(positions)
        desc.normals = MeshBuffer(normals)
        desc.primitives = .triangles(indices)
        return try? MeshResource.generate(from: [desc])
    }

    private static func earClipTriangulate(_ polygon: [SIMD2<Float>]) -> [UInt32] {
        var verts = Array(0..<polygon.count)
        var signedArea: Float = 0
        for i in 0..<polygon.count {
            let p0 = polygon[i], p1 = polygon[(i + 1) % polygon.count]
            signedArea += (p0.x * p1.y - p1.x * p0.y)
        }
        if signedArea > 0 { verts.reverse() }

        var tris: [UInt32] = []
        var guardCount = 0
        while verts.count > 3 && guardCount < 400 {
            guardCount += 1
            var clipped = false
            for i in 0..<verts.count {
                let prev = verts[(i - 1 + verts.count) % verts.count]
                let curr = verts[i]
                let next = verts[(i + 1) % verts.count]
                let a = polygon[prev], b = polygon[curr], c = polygon[next]
                let crossY = -((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
                guard crossY > 1e-5 else { continue }
                var hasInside = false
                for v in verts where v != prev && v != curr && v != next {
                    if pointInTri(polygon[v], a, b, c) { hasInside = true; break }
                }
                guard !hasInside else { continue }
                tris.append(contentsOf: [UInt32(prev), UInt32(curr), UInt32(next)])
                verts.remove(at: i)
                clipped = true
                break
            }
            if !clipped { break }
        }
        if verts.count == 3 {
            tris.append(contentsOf: [UInt32(verts[0]), UInt32(verts[1]), UInt32(verts[2])])
        }
        return tris
    }

    private static func pointInTri(_ p: SIMD2<Float>, _ a: SIMD2<Float>, _ b: SIMD2<Float>, _ c: SIMD2<Float>) -> Bool {
        func s(_ p1: SIMD2<Float>, _ p2: SIMD2<Float>, _ p3: SIMD2<Float>) -> Float {
            (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
        }
        let d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a)
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
    }

    private static func pointInPolygon(_ p: SIMD2<Float>, polygon: [SIMD2<Float>]) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let pi = polygon[i], pj = polygon[j]
            if ((pi.y > p.y) != (pj.y > p.y)) &&
                (p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y + 1e-6) + pi.x) {
                inside.toggle()
            }
            j = i
        }
        return inside
    }
}

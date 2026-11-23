import SwiftUI
import ZipChakCore

/// 2D architectural floorplan preview rendering `ZipChakCore.RoomData` (mm coordinates).
struct RoomFloorPlan2DView: View {
    let room: RoomData

    var body: some View {
        GeometryReader { geo in
            let b = room.boundsMm
            let spanX = max(1000.0, Double(b.maxX - b.minX))
            let spanZ = max(1000.0, Double(b.maxZ - b.minZ))
            let pad: CGFloat = 38
            let scale = min(
                Double(max(60, geo.size.width - pad * 2)) / spanX,
                Double(max(60, geo.size.height - pad * 2)) / spanZ
            )
            let centerMmX = Double(b.minX + b.maxX) * 0.5
            let centerMmZ = Double(b.minZ + b.maxZ) * 0.5
            let viewCX = Double(geo.size.width) * 0.5
            let viewCY = Double(geo.size.height) * 0.5

            ZStack(alignment: .topLeading) {
                Canvas { context, size in
                    func pt(_ xMm: Double, _ zMm: Double) -> CGPoint {
                        CGPoint(
                            x: viewCX + (xMm - centerMmX) * scale,
                            y: viewCY + (zMm - centerMmZ) * scale
                        )
                    }

                    // 1. 500mm Grid
                    let step = 500.0
                    let gxStart = floor((Double(b.minX) - 1000) / step) * step
                    let gxEnd = ceil((Double(b.maxX) + 1000) / step) * step
                    let gzStart = floor((Double(b.minZ) - 1000) / step) * step
                    let gzEnd = ceil((Double(b.maxZ) + 1000) / step) * step

                    var gx = gxStart
                    while gx <= gxEnd {
                        let sp = pt(gx, 0)
                        var p = Path()
                        p.move(to: CGPoint(x: sp.x, y: 0))
                        p.addLine(to: CGPoint(x: sp.x, y: size.height))
                        let major = abs(gx.truncatingRemainder(dividingBy: 1000)) < 1
                        context.stroke(p, with: .color(.secondary.opacity(major ? 0.16 : 0.07)), lineWidth: major ? 1.0 : 0.5)
                        gx += step
                    }
                    var gz = gzStart
                    while gz <= gzEnd {
                        let sp = pt(0, gz)
                        var p = Path()
                        p.move(to: CGPoint(x: 0, y: sp.y))
                        p.addLine(to: CGPoint(x: size.width, y: sp.y))
                        let major = abs(gz.truncatingRemainder(dividingBy: 1000)) < 1
                        context.stroke(p, with: .color(.secondary.opacity(major ? 0.16 : 0.07)), lineWidth: major ? 1.0 : 0.5)
                        gz += step
                    }

                    // 2. Floor polygon
                    if room.floorPolygon.count >= 3 {
                        var floor = Path()
                        for (i, v) in room.floorPolygon.enumerated() {
                            let sp = pt(Double(v.x), Double(v.z))
                            if i == 0 { floor.move(to: sp) } else { floor.addLine(to: sp) }
                        }
                        floor.closeSubpath()
                        context.fill(floor, with: .color(Color(.systemBackground)))
                    }

                    // 3. Fixtures
                    for f in room.fixtures {
                        if let fp = f.footprint, fp.count >= 3 {
                            var p = Path()
                            for (i, v) in fp.enumerated() {
                                let sp = pt(Double(v.x), Double(v.z))
                                if i == 0 { p.move(to: sp) } else { p.addLine(to: sp) }
                            }
                            p.closeSubpath()
                            context.fill(p, with: .color(.orange.opacity(0.18)))
                            context.stroke(p, with: .color(.orange.opacity(0.75)), lineWidth: 1.2)
                        }
                    }

                    // 4. Existing furniture
                    for item in room.existingFurniture {
                        let cx = Double(item.position.x)
                        let cz = Double(item.position.z)
                        let hw = Double(item.dimensions.width) * 0.5
                        let hd = Double(item.dimensions.depth) * 0.5
                        let rad = Double(item.rotationDeg) * .pi / 180.0
                        let rx = cos(rad), rz = -sin(rad)
                        let fx = sin(rad), fz = cos(rad)
                        let corners = [
                            pt(cx - rx * hw - fx * hd, cz - rz * hw - fz * hd),
                            pt(cx + rx * hw - fx * hd, cz + rz * hw - fz * hd),
                            pt(cx + rx * hw + fx * hd, cz + rz * hw + fz * hd),
                            pt(cx - rx * hw + fx * hd, cz - rz * hw + fz * hd)
                        ]
                        var p = Path()
                        p.move(to: corners[0])
                        for c in corners.dropFirst() { p.addLine(to: c) }
                        p.closeSubpath()
                        context.fill(p, with: .color(Color.indigo.opacity(0.28)))
                        context.stroke(p, with: .color(Color.indigo.opacity(0.85)), lineWidth: 1.4)

                        let label = Text(item.label ?? item.category.koreanName)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.primary)
                        context.draw(label, at: pt(cx, cz))
                    }

                    // 5. Walls + mm dimensions
                    let wallMap = Dictionary(uniqueKeysWithValues: room.walls.map { ($0.id, $0) })
                    for wall in room.walls {
                        let p1 = pt(Double(wall.start.x), Double(wall.start.z))
                        let p2 = pt(Double(wall.end.x), Double(wall.end.z))
                        var wp = Path()
                        wp.move(to: p1)
                        wp.addLine(to: p2)
                        let thick = max(4.5, CGFloat(Double(wall.thickness) * scale))
                        context.stroke(wp, with: .color(Color(.label).opacity(0.86)), style: StrokeStyle(lineWidth: thick, lineCap: .square))

                        // Dimension label outside midpoint
                        let midX = Double(wall.start.x + wall.end.x) * 0.5
                        let midZ = Double(wall.start.z + wall.end.z) * 0.5
                        let dx = Double(wall.end.x - wall.start.x)
                        let dz = Double(wall.end.z - wall.start.z)
                        let len = max(1, hypot(dx, dz))
                        let nx = -dz / len
                        let nz = dx / len
                        let toCenterX = centerMmX - midX
                        let toCenterZ = centerMmZ - midZ
                        let sign: Double = (toCenterX * nx + toCenterZ * nz) > 0 ? -1 : 1
                        let labelPos = pt(midX + nx * sign * 240, midZ + nz * sign * 240)
                        let dim = Text("\(Int(len.rounded()))mm")
                            .font(.system(size: 9.5, weight: .semibold))
                            .foregroundStyle(.secondary)
                        context.draw(dim, at: labelPos)
                    }

                    // 6. Openings (windows & doors with swing arc)
                    for op in room.openings {
                        guard let wall = wallMap[op.wallId] else { continue }
                        let dx = Double(wall.end.x - wall.start.x)
                        let dz = Double(wall.end.z - wall.start.z)
                        let len = max(1, hypot(dx, dz))
                        let ux = dx / len, uz = dz / len
                        let sX = Double(wall.start.x) + ux * Double(op.offset)
                        let sZ = Double(wall.start.z) + uz * Double(op.offset)
                        let eX = sX + ux * Double(op.width)
                        let eZ = sZ + uz * Double(op.width)

                        let sp1 = pt(sX, sZ)
                        let sp2 = pt(eX, eZ)
                        var line = Path()
                        line.move(to: sp1)
                        line.addLine(to: sp2)

                        switch op.type {
                        case .window:
                            context.stroke(line, with: .color(.cyan), style: StrokeStyle(lineWidth: 6.5, lineCap: .butt))
                            context.stroke(line, with: .color(.white), style: StrokeStyle(lineWidth: 2, lineCap: .butt))
                        case .door, .opening:
                            context.stroke(line, with: .color(Color(.systemBackground)), style: StrokeStyle(lineWidth: 7.5, lineCap: .butt))
                            if op.type == .door {
                                // Inward normal
                                let n1x = -uz, n1z = ux
                                let midX = (sX + eX) * 0.5, midZ = (sZ + eZ) * 0.5
                                let sign: Double = ((centerMmX - midX) * n1x + (centerMmZ - midZ) * n1z) >= 0 ? 1 : -1
                                let tip = pt(sX + n1x * sign * Double(op.width), sZ + n1z * sign * Double(op.width))
                                var leaf = Path()
                                leaf.move(to: sp1)
                                leaf.addLine(to: tip)
                                context.stroke(leaf, with: .color(.orange), lineWidth: 2.0)

                                let r = hypot(sp2.x - sp1.x, sp2.y - sp1.y)
                                let a0 = Angle(radians: atan2(sp2.y - sp1.y, sp2.x - sp1.x))
                                let a1 = Angle(radians: atan2(tip.y - sp1.y, tip.x - sp1.x))
                                var delta = a1.radians - a0.radians
                                while delta > .pi { delta -= .pi * 2 }
                                while delta < -.pi { delta += .pi * 2 }
                                var arc = Path()
                                arc.addArc(center: sp1, radius: r, startAngle: a0, endAngle: a1, clockwise: delta < 0)
                                context.stroke(arc, with: .color(.orange.opacity(0.75)), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
                            }
                        }
                    }
                }
                .background(Color(.systemGroupedBackground))

                // Area & unit badge
                HStack(spacing: 8) {
                    Text(String(format: "%.1f㎡ (%.1f평)", room.floorAreaSquareMeters, room.floorAreaPyeong))
                        .font(.caption.weight(.semibold))
                    Text("·")
                    Text("천장 \(room.ceilingHeight)mm")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("·")
                    Text("원점 (0, 0)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(12)
            }
        }
    }
}

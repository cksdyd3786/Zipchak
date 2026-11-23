import SwiftUI
import RealityKit
import ZipChakCore

/// iOS 17+ compatible 3D room preview using non-AR `ARView`, 3-point studio lighting,
/// full-height opaque walls, and real-time smart camera-blocking wall culling (`스마트 벽 숨김`).
struct Room3DPreviewView: View {
    let room: RoomData

    enum CameraPreset: String, CaseIterable {
        case isometric = "입체 뷰"
        case topDown = "탑 뷰"
        case sideAngle = "측면 뷰"
    }

    @State private var cameraPreset: CameraPreset = .isometric
    @State private var wallDisplayMode: RealityKitRoomSceneBuilder.WallDisplayMode = .smartCutaway
    @State private var orbitYaw: Float = 0.68
    @State private var orbitPitch: Float = 0.48
    @State private var orbitDistance: Float
    @State private var dragStartAngles: (yaw: Float, pitch: Float)?
    @State private var pinchStartDistance: Float?

    init(room: RoomData) {
        self.room = room
        let b = room.boundsMm
        let spanM = max(3.0, Float(max(b.maxX - b.minX, b.maxZ - b.minZ)) / 1000.0)
        self._orbitDistance = State(initialValue: spanM * 1.40)
    }

    var body: some View {
        ZStack(alignment: .top) {
            NonARRealityRepresentable(
                room: room,
                wallDisplayMode: wallDisplayMode,
                orbitYaw: orbitYaw,
                orbitPitch: orbitPitch,
                orbitDistance: orbitDistance
            )
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if dragStartAngles == nil {
                            dragStartAngles = (orbitYaw, orbitPitch)
                        }
                        guard let start = dragStartAngles else { return }
                        let sensitivity: Float = 0.0065
                        orbitYaw = normalizeAngle(start.yaw - Float(value.translation.width) * sensitivity)
                        orbitPitch = max(0.16, min(1.44, start.pitch + Float(value.translation.height) * sensitivity))
                    }
                    .onEnded { _ in
                        dragStartAngles = nil
                    }
            )
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { value in
                        if pinchStartDistance == nil {
                            pinchStartDistance = orbitDistance
                        }
                        if let startDist = pinchStartDistance {
                            orbitDistance = max(2.2, min(12.0, startDist / Float(value.magnification)))
                        }
                    }
                    .onEnded { _ in
                        pinchStartDistance = nil
                    }
            )

            // Top HUD controls
            HStack(spacing: 6) {
                ForEach(CameraPreset.allCases, id: \.self) { preset in
                    Button(preset.rawValue) {
                        cameraPreset = preset
                        applyPreset(preset)
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        cameraPreset == preset ? Color.accentColor : Color(.systemBackground).opacity(0.9),
                        in: Capsule()
                    )
                    .foregroundStyle(cameraPreset == preset ? .white : .primary)
                }

                Spacer()

                Menu {
                    ForEach(RealityKitRoomSceneBuilder.WallDisplayMode.allCases) { mode in
                        Button {
                            wallDisplayMode = mode
                        } label: {
                            if wallDisplayMode == mode {
                                Label(mode.rawValue, systemImage: "checkmark")
                            } else {
                                Text(mode.rawValue)
                            }
                        }
                    }
                } label: {
                    Label(wallDisplayMode.rawValue, systemImage: "square.3.layers.3d.down.right")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.ultraThickMaterial, in: Capsule())
                }
            }
            .padding(12)

            VStack {
                Spacer()
                Text("드래그로 회전 · 두 손가락 확대/축소 · 앞벽 자동 숨김")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 10)
            }
            .allowsHitTesting(false)
        }
    }

    private func applyPreset(_ preset: CameraPreset) {
        let b = room.boundsMm
        let spanM = max(3.0, Float(max(b.maxX - b.minX, b.maxZ - b.minZ)) / 1000.0)
        switch preset {
        case .isometric:
            orbitYaw = 0.68
            orbitPitch = 0.48
            orbitDistance = spanM * 1.40
        case .topDown:
            orbitYaw = 0.0
            orbitPitch = 1.42
            orbitDistance = spanM * 1.48
        case .sideAngle:
            orbitYaw = 0.0
            orbitPitch = 0.28
            orbitDistance = spanM * 1.28
        }
    }

    private func normalizeAngle(_ a: Float) -> Float {
        var r = a.truncatingRemainder(dividingBy: .pi * 2)
        if r > .pi { r -= .pi * 2 }
        if r < -.pi { r += .pi * 2 }
        return r
    }
}

private struct NonARRealityRepresentable: UIViewRepresentable {
    let room: RoomData
    let wallDisplayMode: RealityKitRoomSceneBuilder.WallDisplayMode
    let orbitYaw: Float
    let orbitPitch: Float
    let orbitDistance: Float

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero, cameraMode: .nonAR, automaticallyConfigureSession: false)
        arView.environment.background = .color(UIColor.secondarySystemBackground)

        let anchor = AnchorEntity(world: .zero)

        let keyLight = DirectionalLight()
        keyLight.light.intensity = 1950
        keyLight.light.color = UIColor(red: 1.0, green: 0.98, blue: 0.95, alpha: 1.0)
        keyLight.look(at: .zero, from: SIMD3<Float>(3.8, 6.2, 4.5), relativeTo: nil)

        let fillLight = DirectionalLight()
        fillLight.light.intensity = 920
        fillLight.light.color = UIColor(red: 0.90, green: 0.95, blue: 1.0, alpha: 1.0)
        fillLight.look(at: .zero, from: SIMD3<Float>(-4.2, 4.0, -3.5), relativeTo: nil)

        let rimLight = DirectionalLight()
        rimLight.light.intensity = 650
        rimLight.look(at: .zero, from: SIMD3<Float>(-2.5, 5.0, 4.5), relativeTo: nil)

        anchor.addChild(keyLight)
        anchor.addChild(fillLight)
        anchor.addChild(rimLight)
        anchor.addChild(context.coordinator.shellHolder)
        anchor.addChild(context.coordinator.cameraEntity)

        arView.scene.addAnchor(anchor)
        context.coordinator.rebuildIfNeeded(room: room, wallDisplayMode: wallDisplayMode)
        context.coordinator.updateCamera(
            room: room,
            wallDisplayMode: wallDisplayMode,
            yaw: orbitYaw,
            pitch: orbitPitch,
            distance: orbitDistance
        )
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        context.coordinator.rebuildIfNeeded(room: room, wallDisplayMode: wallDisplayMode)
        context.coordinator.updateCamera(
            room: room,
            wallDisplayMode: wallDisplayMode,
            yaw: orbitYaw,
            pitch: orbitPitch,
            distance: orbitDistance
        )
    }

    @MainActor
    final class Coordinator {
        let shellHolder = Entity()
        let cameraEntity = PerspectiveCamera()
        private var lastRoom: RoomData?
        private var lastWallMode: RealityKitRoomSceneBuilder.WallDisplayMode?

        func rebuildIfNeeded(room: RoomData, wallDisplayMode: RealityKitRoomSceneBuilder.WallDisplayMode) {
            guard lastRoom != room || lastWallMode != wallDisplayMode else { return }
            lastRoom = room
            lastWallMode = wallDisplayMode
            shellHolder.children.removeAll()
            let entity = RealityKitRoomSceneBuilder.buildRoomEntity(room: room, wallDisplayMode: wallDisplayMode)
            shellHolder.addChild(entity)
        }

        func updateCamera(
            room: RoomData,
            wallDisplayMode: RealityKitRoomSceneBuilder.WallDisplayMode,
            yaw: Float,
            pitch: Float,
            distance: Float
        ) {
            let target = SIMD3<Float>(0, 0.55, 0)
            let offset = SIMD3<Float>(
                sin(yaw) * cos(pitch),
                sin(pitch),
                cos(yaw) * cos(pitch)
            ) * distance
            let cameraPos = target + offset
            cameraEntity.look(at: target, from: cameraPos, relativeTo: nil)

            RealityKitRoomSceneBuilder.updateSmartWallVisibility(
                in: shellHolder,
                room: room,
                cameraOffsetFromCentroid: cameraPos,
                wallDisplayMode: wallDisplayMode
            )
        }
    }
}

import AVFoundation
import SwiftUI
@preconcurrency import RoomPlan
import ZipChakCore

/// Screen 2: LiDAR RoomPlan live scanning screen with Korean coaching instructions,
/// real-time wall/opening/object counters, flashlight toggle, and non-LiDAR web fallback.
struct RoomScanView: View {
    let webFreeModeURL: URL?
    let onCancel: () -> Void
    let onScanCompleted: (RoomPlanBridge.CaptureOutput) -> Void

    @State private var isScanning = true
    @State private var isProcessing = false
    @State private var shouldStopSession = false
    @State private var coachingMessage = "천천히 방 전체 벽면과 바닥 모서리를 비춰주세요"
    @State private var detectedWallCount = 0
    @State private var detectedOpeningCount = 0
    @State private var detectedObjectCount = 0
    @State private var hasDetectedFloor = false
    @State private var highConfidenceRatio: Float = 0
    @State private var scanCompletenessPercent: Int = 0
    @State private var isTorchOn = false
    @State private var scanError: String?

    var body: some View {
        ZStack {
            if RoomCaptureSession.isSupported {
                RoomCaptureRepresentable(
                    shouldStopSession: $shouldStopSession,
                    onLiveMetrics: { metrics in
                        detectedWallCount = metrics.wallCount
                        detectedOpeningCount = metrics.openingCount
                        detectedObjectCount = metrics.objectCount
                        hasDetectedFloor = metrics.hasFloor
                        highConfidenceRatio = metrics.highConfidenceRatio
                        scanCompletenessPercent = metrics.completenessPercent
                        if let hint = metrics.smartHint, !isProcessing {
                            coachingMessage = hint
                        }
                    },
                    onInstruction: { text in
                        coachingMessage = text
                    },
                    onCompleted: { output in
                        setTorch(enabled: false)
                        isProcessing = false
                        onScanCompleted(output)
                    },
                    onError: { message in
                        setTorch(enabled: false)
                        isProcessing = false
                        isScanning = false
                        scanError = message
                    }
                )
                .ignoresSafeArea()
            } else {
                unsupportedDeviceView
            }

            // Top HUD Overlay
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Button {
                        setTorch(enabled: false)
                        onCancel()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(.black.opacity(0.60), in: Circle())
                    }

                    Spacer()

                    if RoomCaptureSession.isSupported {
                        HStack(spacing: 10) {
                            Label("\(detectedWallCount)", systemImage: "square.split.1x2")
                            Label("\(detectedOpeningCount)", systemImage: "door.left.hand.open")
                            Label("\(detectedObjectCount)", systemImage: "sofa")
                            Text(hasDetectedFloor ? "바닥 ✓" : "바닥 탐색")
                                .foregroundStyle(hasDetectedFloor ? .green : .orange)
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.60), in: Capsule())

                        Button {
                            setTorch(enabled: !isTorchOn)
                        } label: {
                            Image(systemName: isTorchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(isTorchOn ? .yellow : .white)
                                .frame(width: 40, height: 40)
                                .background(.black.opacity(0.60), in: Circle())
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                if RoomCaptureSession.isSupported {
                    VStack(spacing: 6) {
                        HStack {
                            Text("정밀 스캔 완성도")
                                .font(.caption2.weight(.semibold))
                            Spacer()
                            Text("\(scanCompletenessPercent)% · 고신뢰도 \(Int(round(highConfidenceRatio * 100)))%")
                                .font(.caption2.monospacedDigit())
                        }
                        .foregroundStyle(.white.opacity(0.92))

                        ProgressView(value: Double(scanCompletenessPercent), total: 100)
                            .tint(scanCompletenessPercent >= 75 ? .green : .cyan)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)

                    Text(coachingMessage)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(.ultraThinMaterial.opacity(0.9), in: Capsule())
                        .environment(\.colorScheme, .dark)
                }

                Spacer()

                if let scanError {
                    VStack(spacing: 10) {
                        Text(scanError)
                            .font(.subheadline)
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                        Button("돌아가기") {
                            onCancel()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                    .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 16))
                    .padding()
                } else if RoomCaptureSession.isSupported {
                    VStack(spacing: 8) {
                        if scanCompletenessPercent < 65 && detectedWallCount > 0 {
                            Text("팁: 벽 모서리와 문틀·창틀을 1~2초 더 비추면 ±3cm 이내 정확도로 인식됩니다.")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.88))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 5)
                                .background(.black.opacity(0.52), in: Capsule())
                        }

                        Button {
                            setTorch(enabled: false)
                            isProcessing = true
                            isScanning = false
                            shouldStopSession = true
                        } label: {
                            HStack(spacing: 8) {
                                if isProcessing {
                                    ProgressView().tint(.black)
                                } else {
                                    Image(systemName: "checkmark.circle.fill")
                                }
                                Text(isProcessing ? "RoomData(mm) 정밀 변환 중..." : "스캔 완료 및 미리보기")
                                    .fontWeight(.semibold)
                            }
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(.white, in: RoundedRectangle(cornerRadius: 16))
                        }
                        .disabled(isProcessing || !isScanning)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
            }
        }
    }

    private var unsupportedDeviceView: some View {
        VStack(spacing: 16) {
            Image(systemName: "sensor.tag.radiowaves.forward.fill")
                .font(.system(size: 50))
                .foregroundStyle(.secondary)
            Text("LiDAR 센서를 지원하지 않는 기기입니다")
                .font(.title3.bold())
            Text("정밀 스캔은 LiDAR가 탑재된 iPhone Pro / iPad Pro에서 동작합니다.\n웹의 자유 모드에서 치수 입력이나 원룸 템플릿으로 바로 방을 만들 수 있습니다.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)

            if let webFreeModeURL {
                Link(destination: webFreeModeURL) {
                    Label("웹에서 자유 모드로 만들기", systemImage: "safari.fill")
                        .fontWeight(.semibold)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.white)
                }
            }

            Button("시작 화면으로 돌아가기") {
                onCancel()
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }

    private func setTorch(enabled: Bool) {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
            isTorchOn = false
            return
        }
        do {
            try device.lockForConfiguration()
            device.torchMode = enabled ? .on : .off
            device.unlockForConfiguration()
            isTorchOn = enabled
        } catch {
            isTorchOn = false
        }
    }
}

private struct LiveScanMetrics: Sendable {
    let wallCount: Int
    let openingCount: Int
    let objectCount: Int
    let hasFloor: Bool
    let highConfidenceRatio: Float
    let completenessPercent: Int
    let smartHint: String?
}

private struct RoomCaptureRepresentable: UIViewRepresentable {
    @Binding var shouldStopSession: Bool
    let onLiveMetrics: @MainActor @Sendable (LiveScanMetrics) -> Void
    let onInstruction: @MainActor @Sendable (String) -> Void
    let onCompleted: @MainActor @Sendable (RoomPlanBridge.CaptureOutput) -> Void
    let onError: @MainActor @Sendable (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onLiveMetrics: onLiveMetrics,
            onInstruction: onInstruction,
            onCompleted: onCompleted,
            onError: onError
        )
    }

    func makeUIView(context: Context) -> RoomCaptureView {
        let captureView = RoomCaptureView(frame: .zero)
        captureView.delegate = context.coordinator
        captureView.captureSession.delegate = context.coordinator

        var config = RoomCaptureSession.Configuration()
        config.isCoachingEnabled = true
        captureView.captureSession.run(configuration: config)
        return captureView
    }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {
        if shouldStopSession && !context.coordinator.didRequestStop {
            context.coordinator.didRequestStop = true
            uiView.captureSession.stop()
        }
    }

    @objc(ZipChakRoomCaptureCoordinator)
    final class Coordinator: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
        var didRequestStop = false

        private let onLiveMetrics: @MainActor @Sendable (LiveScanMetrics) -> Void
        private let onInstruction: @MainActor @Sendable (String) -> Void
        private let onCompleted: @MainActor @Sendable (RoomPlanBridge.CaptureOutput) -> Void
        private let onError: @MainActor @Sendable (String) -> Void

        init(
            onLiveMetrics: @escaping @MainActor @Sendable (LiveScanMetrics) -> Void,
            onInstruction: @escaping @MainActor @Sendable (String) -> Void,
            onCompleted: @escaping @MainActor @Sendable (RoomPlanBridge.CaptureOutput) -> Void,
            onError: @escaping @MainActor @Sendable (String) -> Void
        ) {
            self.onLiveMetrics = onLiveMetrics
            self.onInstruction = onInstruction
            self.onCompleted = onCompleted
            self.onError = onError
            super.init()
        }

        required init?(coder: NSCoder) { nil }
        func encode(with coder: NSCoder) {}

        nonisolated func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
            true
        }

        nonisolated func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
            if let error {
                let msg = error.localizedDescription
                let handler = onError
                Task { @MainActor in
                    handler("스캔 처리에 실패했습니다: \(msg)")
                }
                return
            }
            let handler = onCompleted
            Task { @MainActor in
                let output = RoomPlanBridge.convert(processedResult)
                handler(output)
            }
        }

        nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
            let walls = room.walls.count
            let openings = room.doors.count + room.windows.count + room.openings.count
            let objects = room.objects.count
            let hasFloor = !room.floors.isEmpty

            let allSurfaces = room.walls + room.doors + room.windows + room.openings
            let highCount = allSurfaces.filter { $0.confidence == .high }.count
            let highRatio: Float = allSurfaces.isEmpty ? 0 : Float(highCount) / Float(allSurfaces.count)

            let totalPercent = min(100, min(45, walls * 12) + Int(round(highRatio * 25.0)) + (hasFloor ? 15 : 0) + min(15, openings * 8))

            let smartHint: String?
            if walls >= 3 && !hasFloor {
                smartHint = "바닥 경계 인식을 위해 벽-바닥 모서리를 비춰주세요"
            } else if walls >= 4 && openings == 0 {
                smartHint = "출입문과 창문 틀을 정면으로 비춰주세요"
            } else if totalPercent >= 85 {
                smartHint = "인식률이 매우 좋습니다! 아래 완료 버튼을 눌러 미리보기를 확인하세요"
            } else {
                smartHint = nil
            }

            let metrics = LiveScanMetrics(
                wallCount: walls,
                openingCount: openings,
                objectCount: objects,
                hasFloor: hasFloor,
                highConfidenceRatio: highRatio,
                completenessPercent: totalPercent,
                smartHint: smartHint
            )
            let handler = onLiveMetrics
            Task { @MainActor in
                handler(metrics)
            }
        }

        nonisolated func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
            let text: String = switch instruction {
            case .moveCloseToWall: "벽에 조금 더 가까이 다가가 스캔해 주세요"
            case .moveAwayFromWall: "벽에서 약간 뒤로 물러나 주세요"
            case .slowDown: "카메라를 조금 더 천천히 움직여 주세요"
            case .turnOnLight: "조명이 부족합니다. 불을 켜거나 우측 상단 플래시를 켜주세요"
            case .lowTexture: "무늬가 있는 바닥·가구 쪽을 함께 비춰주세요"
            case .normal: "좋습니다! 벽 모서리와 바닥 경계를 이어서 스캔하세요"
            @unknown default: "천천히 방 구조를 스캔해 주세요"
            }
            let handler = onInstruction
            Task { @MainActor in
                handler(text)
            }
        }
    }
}

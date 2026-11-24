import SwiftUI
import ZipChakCore

/// Screen 1: Start screen with LiDAR scan entry, non-LiDAR web fallback,
/// pending local uploads (retry queue), and built-in M1-3 templates preview.
struct StartView: View {
    @Bindable var viewModel: ZipChakScanViewModel
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    heroCard

                    if !viewModel.isLiDARSupported, let webURL = viewModel.webFreeModeURL {
                        Link(destination: webURL) {
                            HStack(spacing: 12) {
                                Image(systemName: "safari.fill")
                                    .font(.title3)
                                    .foregroundStyle(.blue)
                                    .frame(width: 40, height: 40)
                                    .background(Color.blue.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("LiDAR 미지원 기기인가요?")
                                        .font(.subheadline.bold())
                                        .foregroundStyle(.primary)
                                    Text("웹에서 자유 모드로 방 만들기 (치수 입력 · 템플릿)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                            }
                            .padding(14)
                            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                    }

                    if !viewModel.pendingScans.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("임시 저장된 스캔 (재시도 · JSON 내보내기)")
                                    .font(.headline)
                                Spacer()
                                Text("\(viewModel.pendingScans.count)건")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 4)

                            ForEach(viewModel.pendingScans) { stored in
                                pendingRow(stored)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("원룸 템플릿 3종 미리보기 (M1-3)")
                            .font(.headline)
                            .padding(.horizontal, 4)

                        ForEach(viewModel.bundledTemplates) { template in
                            Button {
                                viewModel.openTemplateForPreview(template)
                            } label: {
                                roomCardRow(room: template, badge: "템플릿")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("집착 스캔")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                serverSettingsSheet
            }
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label(
                    viewModel.isLiDARSupported ? "LiDAR 정밀 모드 준비 완료" : "시뮬레이터 / 미리보기 모드",
                    systemImage: viewModel.isLiDARSupported ? "sensor.tag.radiowaves.forward.fill" : "cube.transparent.fill"
                )
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.white.opacity(0.20), in: Capsule())

                Spacer()

                Text("RoomData v1.0")
                    .font(.caption2.bold().monospaced())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.black.opacity(0.24), in: Capsule())
            }

            Text("내 방을 LiDAR로 스캔하고\n집착(Zipchak) 웹으로 보내세요")
                .font(.title2.bold())
                .lineSpacing(3)

            Text("RoomPlan으로 벽·문·창문·기존 가구를 ±3cm 정밀도로 인식해 mm 정수 RoomData JSON으로 변환하고, 2D·3D로 확인 후 API 서버에 바로 업로드합니다.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.90))

            Button {
                viewModel.startScan()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "camera.viewfinder")
                    Text("LiDAR 방 스캔 시작")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(.white, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(Color(red: 0.08, green: 0.22, blue: 0.38))
            }
        }
        .foregroundStyle(.white)
        .padding(20)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.08, green: 0.24, blue: 0.42),
                    Color(red: 0.14, green: 0.44, blue: 0.56)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22)
        )
    }

    private func pendingRow(_ stored: PendingUploadStore.StoredScan) -> some View {
        HStack(spacing: 12) {
            Button {
                viewModel.openPendingScan(stored)
            } label: {
                roomCardRow(room: stored.room, badge: "미전송")
            }
            .buttonStyle(.plain)

            Button(role: .destructive) {
                viewModel.deletePendingScan(roomId: stored.room.roomId)
            } label: {
                Image(systemName: "trash")
                    .padding(12)
                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func roomCardRow(room: RoomData, badge: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "house.fill")
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 44, height: 44)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(room.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(badge)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.14), in: Capsule())
                        .foregroundStyle(Color.accentColor)
                }

                Text(String(format: "%.1f㎡ (%.1f평) · 벽 %d · 개구부 %d · 가구 %d",
                            room.floorAreaSquareMeters,
                            room.floorAreaPyeong,
                            room.walls.count,
                            room.openings.count,
                            room.existingFurniture.count))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private var serverSettingsSheet: some View {
        NavigationStack {
            Form {
                Section("집착 API · 웹 서버 연결") {
                    TextField("API Base URL (예: http://192.168.0.10:4000)", text: $viewModel.apiBaseURLString)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Web App URL (예: http://192.168.0.10:5173)", text: $viewModel.webBaseURLString)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section {
                    SecureField("JWT Access Token (선택)", text: $viewModel.accessToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("인증 토큰 (M0-1)")
                } footer: {
                    Text("토큰은 기기 내부에만 저장되며 코드나 저장소에 포함되지 않습니다. 백엔드 서버가 꺼져 있어도 스캔 후 RoomData JSON을 로컬 저장·공유할 수 있습니다.")
                }
            }
            .navigationTitle("서버 설정")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("완료") { showSettings = false }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

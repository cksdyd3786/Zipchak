import SwiftUI
import ZipChakCore

/// Screen 3: 2D/3D preview of the converted `RoomData`, room name editor,
/// schema summary, API upload (`POST /rooms`), and offline JSON share/save.
struct RoomPreviewScreen: View {
    @Bindable var viewModel: ZipChakScanViewModel

    enum PreviewMode: String, CaseIterable, Identifiable {
        case preview3D = "3D 미리보기"
        case plan2D = "2D 치수 평면도"
        var id: String { rawValue }
    }

    @State private var previewMode: PreviewMode = .preview3D
    @State private var roomNameInput: String = ""

    var body: some View {
        if let room = viewModel.activeRoom {
            NavigationStack {
                VStack(spacing: 0) {
                    Picker("미리보기", selection: $previewMode) {
                        ForEach(PreviewMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)

                    if !viewModel.activeWarnings.isEmpty {
                        conversionWarningBanner
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                    }

                    Group {
                        switch previewMode {
                        case .preview3D:
                            Room3DPreviewView(room: room)
                        case .plan2D:
                            RoomFloorPlan2DView(room: room)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                    Divider()

                    bottomSummaryAndUploadPanel(room: room)
                }
                .navigationTitle("스캔 결과 미리보기")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("처음으로") {
                            viewModel.returnToStart()
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if let jsonURL = viewModel.pendingStore.exportTemporaryJSONFile(for: room) {
                            ShareLink(item: jsonURL) {
                                Label("JSON 공유", systemImage: "square.and.arrow.up")
                            }
                        }
                    }
                }
                .onAppear {
                    roomNameInput = room.name
                }
            }
        }
    }

    private func bottomSummaryAndUploadPanel(room: RoomData) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    TextField("방 이름 (최대 40자)", text: $roomNameInput)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: roomNameInput) { _, newValue in
                            viewModel.updateActiveRoomName(newValue)
                        }
                }

                // Compact metrics badges
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        statBadge("면적", String(format: "%.1f㎡ (%.1f평)", room.floorAreaSquareMeters, room.floorAreaPyeong))
                        statBadge("천장고", "\(room.ceilingHeight)mm")
                        statBadge("벽", "\(room.walls.count)개")
                        statBadge("문/창문", "\(room.openings.count)개")
                        statBadge("기존 가구", "\(room.existingFurniture.count)개")
                    }
                }

                if let err = viewModel.uploadErrorMessage {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("업로드 실패 · 로컬 임시 저장 완료", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.bold())
                            .foregroundStyle(.orange)
                        Text(err)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                }

                HStack(spacing: 10) {
                    Button {
                        Task { await viewModel.uploadActiveRoom() }
                    } label: {
                        HStack(spacing: 6) {
                            if viewModel.isUploading {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: viewModel.uploadErrorMessage == nil ? "icloud.and.arrow.up.fill" : "arrow.clockwise")
                            }
                            Text(viewModel.isUploading ? "업로드 중..." : (viewModel.uploadErrorMessage == nil ? "집착 서버로 업로드" : "업로드 재시도"))
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.white)
                    }
                    .disabled(viewModel.isUploading)

                    Button {
                        viewModel.saveActiveRoomLocallyOnly()
                    } label: {
                        Label("로컬 저장", systemImage: "tray.and.arrow.down.fill")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 13)
                            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
            }
            .padding(16)
        }
        .frame(maxHeight: 245)
        .background(Color(.systemBackground))
    }

    private var conversionWarningBanner: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 8) {
                Label("스캔 품질 확인 필요", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)

                Spacer()

                Button {
                    viewModel.startScan()
                } label: {
                    Label("다시 스캔", systemImage: "arrow.counterclockwise")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.orange.opacity(0.18), in: Capsule())
                        .foregroundStyle(.orange)
                }
            }

            ForEach(viewModel.activeWarnings) { warning in
                Text("• \(warning.koreanMessage)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
    }

    private func statBadge(_ label: String, _ value: String) -> some View {
        HStack(spacing: 4) {
            Text(label).foregroundStyle(.secondary)
            Text(value).fontWeight(.semibold)
        }
        .font(.caption2)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Color(.secondarySystemBackground), in: Capsule())
    }
}

import SwiftUI
import UIKit
import ZipChakCore

/// Screen 4: Upload complete screen with direct web editor link, copy link, and JSON share.
struct UploadCompleteView: View {
    let result: APIUploadResult
    @Bindable var viewModel: ZipChakScanViewModel

    @State private var copiedLink = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()

                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.green)

                VStack(spacing: 6) {
                    Text("방 스캔 업로드 완료!")
                        .font(.title2.bold())
                    Text("\(result.uploadedRoom.name) (\(result.uploadedRoom.roomId))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if let webURL = result.webRoomURL {
                    VStack(spacing: 10) {
                        Link(destination: webURL) {
                            Label("웹 3D 에디터에서 열기", systemImage: "safari.fill")
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                                .foregroundStyle(.white)
                        }

                        Button {
                            UIPasteboard.general.string = webURL.absoluteString
                            copiedLink = true
                        } label: {
                            Label(copiedLink ? "웹 링크 복사됨!" : "웹 링크 복사하기", systemImage: copiedLink ? "checkmark" : "doc.on.doc")
                                .fontWeight(.medium)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 13)
                                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                        }
                    }
                    .padding(.horizontal, 24)
                }

                if let jsonURL = viewModel.pendingStore.exportTemporaryJSONFile(for: result.uploadedRoom) {
                    ShareLink(item: jsonURL) {
                        Label("RoomData JSON 내보내기", systemImage: "square.and.arrow.up")
                            .font(.subheadline.weight(.medium))
                    }
                    .padding(.top, 4)
                }

                Spacer()

                Button {
                    viewModel.returnToStart()
                } label: {
                    Text("새 방 스캔하기")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 20)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("업로드 완료")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

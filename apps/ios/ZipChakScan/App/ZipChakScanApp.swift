import SwiftUI

@main
struct ZipChakScanApp: App {
    @State private var viewModel = ZipChakScanViewModel()

    var body: some Scene {
        WindowGroup {
            switch viewModel.currentScreen {
            case .start:
                StartView(viewModel: viewModel)
            case .scanning:
                RoomScanView(
                    webFreeModeURL: viewModel.webFreeModeURL,
                    onCancel: {
                        viewModel.returnToStart()
                    },
                    onScanCompleted: { output in
                        viewModel.handleScanCompleted(output)
                    }
                )
            case .preview:
                RoomPreviewScreen(viewModel: viewModel)
            case .uploadComplete(let result):
                UploadCompleteView(result: result, viewModel: viewModel)
            }
        }
    }
}

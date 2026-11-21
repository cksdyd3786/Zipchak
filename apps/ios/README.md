# apps/ios — 정밀 모드 스캔 앱 (`ZipChakScan`, 담당 A)

LiDAR가 탑재된 iPhone Pro / iPad Pro(iOS 17+)에서 Apple `RoomPlan`으로 방을 스캔하고, 공통 스키마(`packages/schema/room.schema.json`)의 **mm 정수·원점 (0, 0)** 규격 `RoomData` JSON으로 변환해 `services/api`에 업로드하는 네이티브 iOS 앱입니다.

## 폴더 구조

```
apps/ios/
├── ZipChakCore/                         # 플랫폼 독립 Swift Package (macOS/iOS 단위 테스트 가능)
│   ├── Sources/ZipChakCore/
│   │   ├── Models/RoomData.swift        # room.schema.json 1:1 Codable 모델 + ULID 생성기
│   │   ├── Convert/RoomDataConverter.swift  # m→mm 변환, 원점 (0,0) 이동, 직교 보정, 개구부/가구 매핑
│   │   └── Samples/RoomTemplates.swift  # M1-3 원룸 템플릿 3종 (4·5·6평)
│   └── Tests/ZipChakCoreTests/
│       └── RoomDataConverterTests.swift # XCTest 단위 테스트
├── ZipChakScan/                         # 4-화면 iOS 스캔 앱 (시작 → 스캔 → 미리보기 → 업로드 완료)
│   ├── App/                             # 앱 진입점, StartView, RoomPreviewScreen, UploadCompleteView
│   ├── Scan/RoomScanView.swift          # RoomCaptureView 래퍼, 한국어 코칭 안내, 플래시, 미지원 기기 웹 안내
│   ├── Convert/RoomPlanBridge.swift     # CapturedRoom → RawCapturedRoom 브리지 + .usdz 로컬 내보내기
│   ├── Preview/                         # 2D mm 치수 평면도 + 3D 실제 벽 높이/스마트 앞벽 숨김 미리보기
│   ├── Network/APIClient.swift          # POST /rooms & POST /rooms/:roomId/scan-asset
│   └── Storage/PendingUploadStore.swift # 업로드 실패 시 JSON 임시 저장, 재시도, ShareLink 내보내기
└── ZipChakScan.xcodeproj                # Xcode 프로젝트 (iOS 17.0+, Swift 6)
```

## 빌드 및 테스트

### 1) `RoomDataConverter` 단위 테스트 (macOS CLI)

```bash
cd apps/ios/ZipChakCore
swift test
```

### 2) iOS 앱 실행 (Xcode)

1. `apps/ios/ZipChakScan.xcodeproj` 열기
2. `ZipChakScan` 타깃 → **Signing & Capabilities** → 본인 Apple ID(Team) 선택
3. LiDAR 탑재 실기기(iPhone Pro / iPad Pro) 연결 후 `Cmd + R` 실행
   - 시뮬레이터에서도 시작 화면의 **원룸 템플릿 3종(4·5·6평)**으로 2D/3D 미리보기와 JSON 내보내기를 확인할 수 있습니다.

### 3) 실측 스캔 JSON 제출 (`packages/schema/fixtures/rooms/`)

- API 서버가 아직 꺼져 있어도 스캔 후 **로컬 저장** 또는 우측 상단 **JSON 공유**로 `room_*.json`을 추출할 수 있습니다.
- 추출한 JSON을 `packages/schema/fixtures/rooms/`에 넣고 `cd packages/schema && npm run validate`로 스키마 검증 후 PR을 올립니다.

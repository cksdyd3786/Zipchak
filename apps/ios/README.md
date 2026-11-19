# apps/ios — 정밀 모드 스캔 앱 (담당 A)

## 준비물

- Mac + Xcode 15 이상
- LiDAR가 있는 iPhone Pro / iPad Pro (iOS 17+)
- Apple 개발자 계정 (무료 계정이면 기기 직접 설치, 7일마다 재서명)

## 시작하기

1. Xcode → New Project → iOS App, 이름 `ZipChakScan`, 이 폴더(`apps/ios/`)에 생성.
2. Info.plist에 `NSCameraUsageDescription` 추가 ("방을 스캔하기 위해 카메라를 사용합니다").
3. `RoomCaptureView`로 스캔 → `CapturedRoom` → `RoomDataConverter`로 변환 → `POST /rooms`.

## 권장 파일 구조

```
ZipChakScan/
  App/            앱 진입점, 화면 라우팅
  Scan/           RoomCaptureView 래퍼, 안내 문구
  Convert/        RoomDataConverter (순수 함수, 테스트 대상)
  Network/        APIClient (URLSession)
  Models/         RoomData Codable 구조체 (스키마와 필드명 동일)
ZipChakScanTests/
```

## Claude 프롬프트 예시

> apps/ios/CLAUDE.md의 변환 규칙대로 CapturedRoom을 RoomData로 바꾸는 RoomDataConverter를 만들어줘. 출력은 packages/schema/room.schema.json을 따르고, XCTest로 단위 변환·원점 이동 테스트를 먼저 작성해줘.

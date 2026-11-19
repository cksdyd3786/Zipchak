#!/usr/bin/env bash
# 기능 ID별 GitHub 이슈와 라벨을 한 번에 만든다. 저장소 루트에서 한 번만 실행.
# 준비: GitHub CLI 설치 후 `gh auth login`
# 사용: bash scripts/create-issues.sh            (현재 폴더의 저장소)
#       bash scripts/create-issues.sh cksdyd3786/Zipchak
set -euo pipefail
REPO_ARGS=()
[[ $# -ge 1 ]] && REPO_ARGS=(--repo "$1")

label() { gh label create "$1" --color "$2" --description "$3" --force "${REPO_ARGS[@]}" >/dev/null; }
label "part:A" "1d76db" "iOS 스캔"
label "part:B" "0e8a16" "3D 웹 뷰어"
label "part:C" "fbca04" "소셜·실시간"
label "part:D" "d93f0b" "AI 엔진"
label "part:E" "5319e7" "백엔드·통합"
label "Must" "b60205" "MVP 필수"
label "Should" "e99695" "권장"
label "Could" "c5def5" "여유 시"
label "schema-change" "000000" "스키마·API 변경"

# ID|파트|우선순위|제목|완료 기준
while IFS='|' read -r id part prio title accept; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  labels="part:${part%%+*},${prio}"
  body=$(printf '## 기능 ID\n%s\n\n## 완료 기준\n%s\n\n상세: docs/features.md' "$id" "$accept")
  gh issue create "${REPO_ARGS[@]}" --title "[$id] $title" --label "$labels" --body "$body" >/dev/null
  echo "created [$id] $title"
done <<'EOF'
M1-1|A|Must|정밀 모드: RoomPlan 스캔 → RoomData 변환·업로드|실측 대비 벽 길이 오차 ±3cm (팀원 방 3곳)
M1-2|B|Must|자유 모드: 치수 입력|입력 후 3초 내 3D 생성
M1-3|A+B|Must|자유 모드: 원룸 템플릿 3종|선택 후 치수 수정 가능
M1-4|B|Should|자유 모드: 다각형 꼭짓점 편집|꼭짓점 8개
M1-5|B|Could|자유 모드: 평면도 이미지 따라 그리기|기준선 1개로 스케일 보정
M1-6|D|Could|평면도 자동 벽 인식|단순 원룸 인식률 70%
M2-1|D+B|Must|질문형 맞춤 배치안 3개|답이 다르면 결과가 다름, 5초 내 3개, 충돌 0
M2-2|D|Must|하드 제약 (문 반경·창문·벽·가구 간섭·동선 600mm)|단위 테스트 20케이스
M2-3|D|Must|소프트 점수 6항목|항목별 점수 + 사유 문장
M2-4|D|Must|AI 설명 + 내 방 유형 (LLM)|2~3문장 + 유형 이름
M2-5|B+D|Should|점수 가중치 직접 조절|바꾸면 재추천
M2-6|C|Should|내 방 유형 공유 카드|카드에서 초대 링크로 이동
M3-1|A+D|Must|큐레이션 카탈로그 25종|7개 카테고리, 필드 누락 0, GLB 확보 방법 1주차 결정
M3-2|D|Must|부족 가구 탐지|업무형인데 책상 없으면 missing:desk
M3-3|D|Must|데드 스페이스 탐지|300×300mm 이상 빈 영역
M3-4|D|Must|들어감 판정 (정밀 20mm / 자유 50mm)|추천 상품 배치 시 충돌 0
M3-5|B|Must|3D 프리뷰 + 구매 링크|클릭 시 purchase_click 이벤트
M3-6|B|Should|예산 필터·합계 금액|합계 실시간 갱신
M3-8|D|Should|인테리어 소품 추천|방 스타일에 맞는 3개
M4-1|B|Must|RoomData → 3D 렌더|iPhone Safari·Android Chrome·PC 30fps
M4-2|B|Must|가구 직접 편집·충돌 표시|옮기면 AI 점수 재계산
M4-3|B|Must|쿼터뷰/탑뷰, 문 반경 표시|
M4-4|C|Could|카메라 둘러보기|
M4-5|B|Could|채광 시뮬레이션|창문 facing 있을 때만
M5-1|C|Must|초대 링크·QR|5초 내 방 로드
M5-2|C|Must|3D 포스트잇 (방명록 + 제안)|새로고침 후 위치 유지, 제안 클릭 시 AI 검사
M5-4|C|Must|실시간 동시 방문|동시 5명, 지연 300ms 이하
M0-1|E|Must|로그인|JWT 발급
M0-2|E|Must|방·배치안 저장/불러오기|
M0-3|E|Should|퍼널 이벤트 로깅|이벤트 테이블 1개
EOF
echo "완료. 공동 담당(E+B 등)은 첫 파트 라벨만 붙었으니 필요하면 라벨을 더 붙이세요."

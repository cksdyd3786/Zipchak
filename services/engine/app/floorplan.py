"""평면도 이미지 → 바닥 다각형 후보 (M1-6, 실험). OpenCV 필요: pip install -e ".[floorplan]"

순서
1. 이진화: 회색조 → Otsu (어두운 선 = 1)
2. 굵은 선(벽)만 남기기: 거리 변환으로 선 굵기를 재고, 굵기 상위(벽) 기준 40% 미만의 얇은 선
   (문 호, 글자, 치수선, 가구 윤곽)을 지운 뒤 원래 굵기로 되돌린다
3. 방 안쪽 찾기: 문·창 때문에 벽이 끊겨 있으므로 벽 방향(가로·세로) 닫힘 연산 길이를 키워 가며
   테두리에 닿지 않는 가장 큰 빈 영역이 생길 때까지 반복
4. 윤곽 → 다각형 단순화 → **직교 보정** (모든 변을 가로·세로로 맞추고, 기울어진 도면은 먼저 회전 보정)
5. 좌표: 바운딩 박스 최소점이 (0,0), mm_per_px 를 주면 mm 정수 (RoomData.floorPolygon 형식)

결과는 M1-5 편집기(웹)에서 꼭짓점을 고칠 수 있는 '후보'다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

try:  # OpenCV 는 선택 의존성
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None


@dataclass
class FloorplanResult:
    polygon_px: list[tuple[float, float]]
    floor_polygon: list[dict[str, int]]
    wall_thickness_px: float
    skew_deg: float
    close_px: int


def _require_cv2():
    if cv2 is None:
        raise RuntimeError('OpenCV 가 없습니다: pip install -e ".[floorplan]"')


def binarize(img: np.ndarray) -> np.ndarray:
    gray = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _t, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return (bw > 0).astype(np.uint8)


def thick_lines(bw: np.ndarray) -> tuple[np.ndarray, float]:
    """굵은 선(벽)만 남긴 마스크와 추정 벽 두께(px)."""
    dist = cv2.distanceTransform(bw, cv2.DIST_L2, 3)
    ridge = dist[dist > 0]
    if ridge.size == 0:
        return bw, 0.0
    wall_half = float(np.percentile(ridge, 99))  # 가장 굵은 선 반폭 ≈ 벽 반폭
    keep = (dist >= max(1.5, wall_half * 0.4)).astype(np.uint8)
    r = int(math.ceil(wall_half))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    walls = cv2.dilate(keep, kernel) & bw
    return walls, wall_half * 2


def estimate_skew(walls: np.ndarray) -> float:
    """벽 선분 각도의 중앙값으로 도면 기울기(도)를 추정. ±10° 안에서만 보정."""
    edges = cv2.Canny(walls * 255, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 720, threshold=40, minLineLength=max(20, walls.shape[1] // 10), maxLineGap=5)
    if lines is None:
        return 0.0
    angles = []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):  # OpenCV 4 (N,1,4) · 5 (N,4) 모두
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        a = (a + 45) % 90 - 45  # 가로·세로 모두 0° 근처로
        angles.append(a)
    skew = float(np.median(angles))
    return skew if abs(skew) <= 10 else 0.0


def room_interior(walls: np.ndarray, start: int, step: int, limit: int) -> tuple[np.ndarray | None, int]:
    h, w = walls.shape
    for k in range(start, limit + 1, step):
        # 벽 방향으로만 닫는다: 가로 k×1 · 세로 1×k. 창·문 구멍(벽 방향)은 메우고 방 안쪽(두 방향 모두 넓음)은 안 메운다
        horiz = cv2.morphologyEx(walls, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, 1)))
        vert = cv2.morphologyEx(walls, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, k)))
        closed = horiz | vert
        free = (closed == 0).astype(np.uint8)
        n, labels, stats, _c = cv2.connectedComponentsWithStats(free, connectivity=4)
        best = None
        for i in range(1, n):
            x, y, bw_, bh, area = stats[i]
            touches = x == 0 or y == 0 or x + bw_ >= w or y + bh >= h
            if not touches and area > 0.03 * h * w and (best is None or area > stats[best][4]):
                best = i
        if best is not None:
            return (labels == best).astype(np.uint8), k
    return None, limit


def rectilinear(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """단순화된 다각형의 변을 가로·세로로 맞춘다 (직교 보정)."""
    n = len(points)
    if n < 4:
        return points
    edges = []
    for i in range(n):
        (x1, y1), (x2, y2) = points[i], points[(i + 1) % n]
        horizontal = abs(x2 - x1) >= abs(y2 - y1)
        edges.append(("h", (y1 + y2) / 2) if horizontal else ("v", (x1 + x2) / 2))
    merged: list[list] = []
    for axis, value in edges:  # 같은 방향 변이 이어지면 하나로
        if merged and merged[-1][0] == axis:
            merged[-1][1].append(value)
        else:
            merged.append([axis, [value]])
    if len(merged) > 1 and merged[0][0] == merged[-1][0]:
        merged[0][1] += merged.pop()[1]
    if len(merged) % 2 == 1 or len(merged) < 4:
        return points
    lines = [(axis, float(np.mean(vals))) for axis, vals in merged]
    out = []
    for i in range(len(lines)):
        (a1, v1), (a2, v2) = lines[i - 1], lines[i]
        out.append((v2, v1) if a1 == "h" else (v1, v2))  # 가로선 y=v1 과 세로선 x=v2 의 교점
    return out


def detect_floor_polygon(img: np.ndarray, mm_per_px: float | None = None) -> FloorplanResult:
    _require_cv2()
    bw = binarize(img)
    walls, thick = thick_lines(bw)
    skew = estimate_skew(walls)
    h, w = walls.shape
    center = (w / 2, h / 2)
    if abs(skew) > 0.2:
        M = cv2.getRotationMatrix2D(center, skew, 1.0)
        walls = cv2.warpAffine(walls, M, (w, h), flags=cv2.INTER_NEAREST)
    interior, k = room_interior(walls, start=max(3, int(thick)), step=max(2, int(thick // 2) or 2), limit=max(h, w) // 2)
    if interior is None:
        raise ValueError("방 안쪽을 찾지 못했어요 (닫힌 벽이 없음)")
    contours, _ = cv2.findContours(interior, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(contour, 0.01 * cv2.arcLength(contour, True), True)[:, 0, :].astype(float)
    poly = rectilinear([(float(x), float(y)) for x, y in approx])
    # 닫힘 연산 때문에 안쪽 경계는 벽 안쪽 면 그대로다 (closing 은 벽 바깥쪽만 메운다)
    if abs(skew) > 0.2:  # 원래 도면 좌표로 되돌리기
        Minv = cv2.getRotationMatrix2D(center, -skew, 1.0)
        pts = np.hstack([np.array(poly), np.ones((len(poly), 1))]) @ Minv.T
        poly_img = [(float(x), float(y)) for x, y in pts]
    else:
        poly_img = poly
    xs, ys = zip(*poly)
    scale = mm_per_px or 1.0
    floor = [{"x": int(round((x - min(xs)) * scale)), "z": int(round((y - min(ys)) * scale))} for x, y in poly]
    return FloorplanResult(poly_img, floor, thick, skew, k)

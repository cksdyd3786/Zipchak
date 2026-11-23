"""M1-6 평면도 자동 벽 인식 (실험). OpenCV 가 없으면 건너뛴다."""
import importlib.util
from pathlib import Path

import pytest

from app.floorplan import rectilinear

cv2 = pytest.importorskip("cv2")

spec = importlib.util.spec_from_file_location("floorplan_eval", Path(__file__).resolve().parent.parent / "scripts" / "floorplan_eval.py")
fe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fe)

from app.floorplan import detect_floor_polygon  # noqa: E402


def test_rectilinear_snaps_wobbly_square():
    # 살짝 비뚤어진 사각형 → 가로·세로 변만 남고 좌표는 양 끝 평균
    pts = [(0, 1), (100, -1), (101, 200), (-1, 198)]
    assert rectilinear(pts) == [(-0.5, 0.0), (100.5, 0.0), (100.5, 199.0), (-0.5, 199.0)]


def test_recognition_rate_at_least_70_percent():
    report = fe.evaluate()
    assert report["rate"] >= 0.7, report


def test_rect_plan_to_mm_floor_polygon():
    # 합성 도면 1번: 안쪽 320×480px, 1px = 10mm → 3200×4800mm (±2%)
    name, img, _truth = fe.make_samples()[0]
    floor = detect_floor_polygon(img, mm_per_px=10).floor_polygon
    xs, zs = [p["x"] for p in floor], [p["z"] for p in floor]
    assert min(xs) == 0 and min(zs) == 0  # 원점 = 바운딩 박스 최소점
    assert abs(max(xs) - 3200) <= 64 and abs(max(zs) - 4800) <= 96
    assert len(floor) == 4


def test_l_shape_keeps_six_corners():
    _name, img, truth = fe.make_samples()[1]
    res = detect_floor_polygon(img)
    assert len(res.polygon_px) == 6 and fe.iou(res.polygon_px, truth) >= 0.9


def test_skewed_scan_is_corrected():
    _name, img, truth = fe.make_samples()[3]
    res = detect_floor_polygon(img)
    assert 2.0 <= abs(res.skew_deg) <= 4.0  # 3° 로 기울여 그림
    assert fe.iou(res.polygon_px, truth) >= 0.9


def test_blank_image_raises():
    import numpy as np

    with pytest.raises(ValueError):
        detect_floor_polygon(np.full((200, 200), 255, dtype=np.uint8))

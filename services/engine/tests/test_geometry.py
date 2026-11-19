"""기하 함수 예시 테스트. M2-2 완료 기준은 이런 케이스 20개 이상."""
from app.geometry import Rect, fits, footprint, margin_for_source


def test_footprint_rotation_swaps_axes():
    assert footprint(1000, 1000, 1200, 600, 0) == Rect(400, 700, 1600, 1300)
    assert footprint(1000, 1000, 1200, 600, 90) == Rect(700, 400, 1300, 1600)


def test_touching_is_not_overlap():
    wall_side = Rect(0, 0, 600, 600)
    neighbor = Rect(600, 0, 1200, 600)
    assert not wall_side.intersects(neighbor)
    assert wall_side.intersects(Rect(599, 0, 1200, 600))


def test_fits_with_margin_and_rotation():
    # 폭 1200 책상, 슬롯 1240 → 정밀 여유 20 OK, 자유 여유 50 실패
    assert fits(1200, 600, 1240, 700, margin_for_source("lidar"))
    assert not fits(1200, 600, 1240, 700, margin_for_source("manual"))
    # 회전하면 들어가는 경우
    assert fits(2000, 400, 500, 2100, 20)

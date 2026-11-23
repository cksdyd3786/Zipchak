"""M1-6 평면도 자동 벽 인식 — 인식률 측정.

  python scripts/floorplan_eval.py                 # 합성 샘플 도면 5장으로 측정 (out/ 에 그림 저장)
  python scripts/floorplan_eval.py --image 도면.png --mm-per-px 10   # 실제 도면 1장 → floorPolygon 후보 출력

합성 샘플은 정답 다각형을 알고 그린 단순 원룸 도면이다 (직사각형, ㄱ자, 가구·글자·치수선, 3° 기울기+잡음,
흐린 회색 벽+JPEG). '인식 성공' = 예측 다각형과 정답의 IoU ≥ 0.9 이고 꼭짓점 수가 같음.
⚠️ 실제 부동산 도면은 더 복잡하므로 실제 샘플로 다시 재야 한다 (이슈 #38 댓글 참고).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.floorplan import cv2, detect_floor_polygon  # noqa: E402

PX_MM = 10  # 합성 도면: 1px = 10mm
WALL_PX = 12  # 벽 두께 120mm
MARGIN = 60
IOU_OK = 0.9


def _canvas(w: int, h: int) -> np.ndarray:
    return np.full((h + 2 * MARGIN, w + 2 * MARGIN), 255, dtype=np.uint8)


def _shift(poly):
    return [(x + MARGIN, y + MARGIN) for x, y in poly]


def _draw_room(img: np.ndarray, inner: list[tuple[int, int]], color: int = 0) -> None:
    outer = Polygon(inner).buffer(WALL_PX, join_style=2)
    cv2.fillPoly(img, [np.array(outer.exterior.coords, dtype=np.int32)], color)
    cv2.fillPoly(img, [np.array(inner, dtype=np.int32)], 255)


def _door(img, x0: int, y: int, width: int, inward: int = -1) -> None:
    """가로 벽 (y) 에 x0…x0+width 문 구멍 + 얇은 문 호."""
    cv2.rectangle(img, (x0, y - 1), (x0 + width, y + WALL_PX + 1), 255, -1)
    cv2.ellipse(img, (x0 + width, y), (width, width), 0, 180, 270 if inward < 0 else 90, 0, 1)
    cv2.line(img, (x0 + width, y), (x0 + width, y + inward * width), 0, 1)


def _window(img, x0: int, y: int, width: int) -> None:
    """가로 벽 (y…y−WALL) 의 창: 벽을 지우고 얇은 선 3줄."""
    cv2.rectangle(img, (x0, y - WALL_PX), (x0 + width, y), 255, -1)
    for dy in (0, WALL_PX // 2, WALL_PX):
        cv2.line(img, (x0, y - dy), (x0 + width, y - dy), 0, 1)


def make_samples() -> list[tuple[str, np.ndarray, list[tuple[float, float]]]]:
    samples = []
    # 1. 직사각형 3200×4800 + 문 + 창
    inner = _shift([(0, 0), (320, 0), (320, 480), (0, 480)])
    img = _canvas(320, 480)
    _draw_room(img, inner)
    _door(img, MARGIN + 200, MARGIN + 480, 90)
    _window(img, MARGIN + 80, MARGIN, 160)
    samples.append(("1_rect", img, inner))

    # 2. ㄱ자 (6평 템플릿 모양)
    inner = _shift([(0, 0), (320, 0), (320, 160), (460, 160), (460, 480), (0, 480)])
    img = _canvas(460, 480)
    _draw_room(img, inner)
    _door(img, MARGIN + 40, MARGIN + 480, 90)
    _window(img, MARGIN + 60, MARGIN, 180)
    samples.append(("2_lshape", img, inner))

    # 3. 가구 윤곽·글자·치수선
    inner = _shift([(0, 0), (340, 0), (340, 490), (0, 490)])
    img = _canvas(340, 490)
    _draw_room(img, inner)
    _door(img, MARGIN + 220, MARGIN + 490, 90)
    cv2.rectangle(img, (MARGIN + 10, MARGIN + 250), (MARGIN + 120, MARGIN + 460), 0, 1)  # 침대
    cv2.rectangle(img, (MARGIN + 200, MARGIN + 10), (MARGIN + 320, MARGIN + 70), 0, 1)  # 책상
    cv2.putText(img, "ROOM 1", (MARGIN + 120, MARGIN + 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, 0, 2)
    cv2.putText(img, "3400", (MARGIN + 150, MARGIN - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 1)
    cv2.arrowedLine(img, (MARGIN, MARGIN - 20), (MARGIN + 340, MARGIN - 20), 0, 1, tipLength=0.03)
    samples.append(("3_furniture_text", img, inner))

    # 4. 3° 기울어진 스캔 + 잡음
    base = samples[0][1].copy()
    h, w = base.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), 3.0, 1.0)
    img = cv2.warpAffine(base, M, (w, h), borderValue=255)
    rng = np.random.default_rng(38)
    img = np.clip(img.astype(int) + rng.normal(0, 18, img.shape), 0, 255).astype(np.uint8)
    truth = samples[0][2]
    pts = np.hstack([np.array(truth, float), np.ones((len(truth), 1))]) @ M.T
    samples.append(("4_skew_noise", img, [(float(x), float(y)) for x, y in pts]))

    # 5. 흐린 회색 벽 + JPEG 압축
    inner = _shift([(0, 0), (300, 0), (300, 440), (0, 440)])
    img = _canvas(300, 440)
    _draw_room(img, inner, color=110)
    _door(img, MARGIN + 180, MARGIN + 440, 85)
    ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 35])
    img = cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE)
    samples.append(("5_gray_jpeg", img, inner))
    return samples


def iou(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> float:
    pa, pb = Polygon(a).buffer(0), Polygon(b).buffer(0)
    return pa.intersection(pb).area / pa.union(pb).area


def evaluate(out_dir: Path | None = None) -> dict:
    rows = []
    for name, img, truth in make_samples():
        try:
            res = detect_floor_polygon(img, mm_per_px=PX_MM)
            score = iou(res.polygon_px, truth)
            ok = score >= IOU_OK and len(res.polygon_px) == len(truth)
            rows.append({"sample": name, "iou": round(score, 3), "vertices": len(res.polygon_px), "truthVertices": len(truth),
                         "ok": ok, "floorPolygon": res.floor_polygon, "skewDeg": round(res.skew_deg, 2)})
            if out_dir:
                vis = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
                cv2.polylines(vis, [np.array(res.polygon_px, np.int32)], True, (0, 0, 255), 2)
                cv2.imwrite(str(out_dir / f"{name}.png"), vis)
        except ValueError as e:
            rows.append({"sample": name, "iou": 0.0, "ok": False, "error": str(e)})
    rate = sum(r["ok"] for r in rows) / len(rows)
    return {"rate": rate, "samples": rows}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", help="실제 도면 이미지 → floorPolygon 후보 출력")
    ap.add_argument("--mm-per-px", type=float, default=None, help="스케일 (없으면 px 단위)")
    ap.add_argument("--out", default=None, help="결과 그림 저장 폴더")
    args = ap.parse_args(argv)
    if args.image:
        img = cv2.imread(args.image, cv2.IMREAD_GRAYSCALE)
        res = detect_floor_polygon(img, args.mm_per_px)
        print(json.dumps({"floorPolygon": res.floor_polygon, "skewDeg": res.skew_deg, "wallThicknessPx": res.wall_thickness_px}, ensure_ascii=False))
        return 0
    out = Path(args.out) if args.out else None
    if out:
        out.mkdir(parents=True, exist_ok=True)
    report = evaluate(out)
    for r in report["samples"]:
        print(f"{r['sample']:<18} IoU {r['iou']:.3f}  꼭짓점 {r.get('vertices', '-')}/{r.get('truthVertices', '-')}  {'성공' if r['ok'] else '실패'}")
    print(f"인식률 {report['rate'] * 100:.0f}% (기준 70%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

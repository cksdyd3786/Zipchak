"""바닥 50mm 그리드와 통로 탐색 (알고리즘 1번, M2-2 동선 600mm).

- 칸 (i, j) 는 x ∈ [x0 + i·50, x0 + (i+1)·50), z ∈ [z0 + j·50, …) 를 덮는다.
- **막힌 칸** = 방 밖이거나 장애물(가구·고정물)과 조금이라도 겹치는 칸 (보수적).
- 통로 폭 600mm 판정은 "600×600 몸통 정사각형(12×12칸)이 막힌 칸 없이 들어가는 자리(앵커)"끼리
  상하좌우로 이어지는지 BFS 로 본다. 몸통을 칸 경계에 맞춰 두므로 50mm 배수 좌표에서는 정확하다
  (폭 600 통로는 통과, 550 은 실패).
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np
from shapely import contains_xy
from shapely.geometry import Polygon
from shapely.prepared import prep

from app.geometry import Rect

CELL_MM = 50
PASSAGE_MM = 600


@dataclass
class Grid:
    x0: int
    z0: int
    nx: int
    nz: int
    blocked: np.ndarray  # shape (nz, nx) bool

    @classmethod
    def for_polygon(cls, polygon: Polygon) -> "Grid":
        minx, minz, maxx, maxz = polygon.bounds
        x0, z0 = int(minx) // CELL_MM * CELL_MM, int(minz) // CELL_MM * CELL_MM
        nx = int(np.ceil((maxx - x0) / CELL_MM))
        nz = int(np.ceil((maxz - z0) / CELL_MM))
        blocked = np.ones((nz, nx), dtype=bool)
        # 칸이 방 안에 완전히 들어가야 쓸 수 있다: 네 모서리와 중심이 모두 다각형 안(경계 포함)
        xs = x0 + np.arange(nx + 1) * CELL_MM
        zs = z0 + np.arange(nz + 1) * CELL_MM
        X, Z = np.meshgrid(xs, zs)
        shrunk = polygon.buffer(1e-6)
        corner_in = contains_xy(shrunk, X, Z)
        cx, cz = np.meshgrid(xs[:-1] + CELL_MM / 2, zs[:-1] + CELL_MM / 2)
        center_in = contains_xy(polygon, cx, cz)
        inside = corner_in[:-1, :-1] & corner_in[1:, :-1] & corner_in[:-1, 1:] & corner_in[1:, 1:] & center_in
        blocked[inside] = False
        return cls(x0, z0, nx, nz, blocked)

    def copy(self) -> "Grid":
        return Grid(self.x0, self.z0, self.nx, self.nz, self.blocked.copy())

    # ---- 좌표 변환 -------------------------------------------------------
    def cell_range(self, r: Rect) -> tuple[slice, slice]:
        """사각형과 (면적이 있게) 겹치는 칸 범위 (zs, xs)."""
        i0 = max(0, (r.min_x - self.x0) // CELL_MM)
        i1 = min(self.nx, -(-(r.max_x - self.x0) // CELL_MM))
        j0 = max(0, (r.min_z - self.z0) // CELL_MM)
        j1 = min(self.nz, -(-(r.max_z - self.z0) // CELL_MM))
        return slice(j0, max(j0, j1)), slice(i0, max(i0, i1))

    def block_rect(self, r: Rect) -> None:
        zs, xs = self.cell_range(r)
        self.blocked[zs, xs] = True

    def block_polygon(self, poly: Polygon) -> None:
        minx, minz, maxx, maxz = poly.bounds
        zs, xs = self.cell_range(Rect(int(minx), int(minz), int(np.ceil(maxx)), int(np.ceil(maxz))))
        p = prep(poly)
        from shapely.geometry import box

        for j in range(zs.start, zs.stop):
            for i in range(xs.start, xs.stop):
                cell = box(self.x0 + i * CELL_MM, self.z0 + j * CELL_MM, self.x0 + (i + 1) * CELL_MM, self.z0 + (j + 1) * CELL_MM)
                if p.intersects(cell) and poly.intersection(cell).area > 0:
                    self.blocked[j, i] = True

    def cell_rect(self, i: int, j: int, w: int = 1, h: int = 1) -> Rect:
        return Rect(self.x0 + i * CELL_MM, self.z0 + j * CELL_MM, self.x0 + (i + w) * CELL_MM, self.z0 + (j + h) * CELL_MM)

    # ---- 통로 ------------------------------------------------------------
    def free_anchors(self, size_cells: int) -> np.ndarray:
        """앵커 (j, i) 에서 size×size 칸이 모두 비어 있으면 True. shape (nz−s+1, nx−s+1)."""
        s = size_cells
        if self.nx < s or self.nz < s:
            return np.zeros((0, 0), dtype=bool)
        ii = np.zeros((self.nz + 1, self.nx + 1), dtype=np.int32)
        ii[1:, 1:] = np.cumsum(np.cumsum(self.blocked.astype(np.int32), axis=0), axis=1)
        sums = ii[s:, s:] - ii[:-s, s:] - ii[s:, :-s] + ii[:-s, :-s]
        return sums == 0


def anchors_touching(grid: Grid, free: np.ndarray, s: int, target: Rect) -> list[tuple[int, int]]:
    """몸통 사각형이 target 과 겹치는(면적 > 0) 빈 앵커 목록."""
    if free.size == 0:
        return []
    zs, xs = grid.cell_range(target)
    # 몸통 [i, i+s) 가 [xs.start, xs.stop) 와 겹치려면 i ∈ (xs.start − s, xs.stop)
    i_lo, i_hi = max(0, xs.start - s + 1), min(free.shape[1], xs.stop)
    j_lo, j_hi = max(0, zs.start - s + 1), min(free.shape[0], zs.stop)
    if i_lo >= i_hi or j_lo >= j_hi:
        return []
    sub = free[j_lo:j_hi, i_lo:i_hi]
    js, is_ = np.nonzero(sub)
    return [(int(j + j_lo), int(i + i_lo)) for j, i in zip(js, is_)]


def reachable(free: np.ndarray, starts: list[tuple[int, int]]) -> np.ndarray:
    seen = np.zeros_like(free, dtype=bool)
    q = deque()
    for st in starts:
        if free[st] and not seen[st]:
            seen[st] = True
            q.append(st)
    H, W = free.shape
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nj, ni = j + dj, i + di
            if 0 <= nj < H and 0 <= ni < W and free[nj, ni] and not seen[nj, ni]:
                seen[nj, ni] = True
                q.append((nj, ni))
    return seen

"""카탈로그 규격 → 로우폴리 박스(proxy) .glb 일괄 생성 (#7, #52).

규약 (docs/conventions.md):
  - m 단위, 바닥면 중심이 원점, 정면 +Z, Y축 위
  - 카탈로그 dimensions: width = X, depth = Z, height = Y (mm 정수)
  - 색상은 item.color (#RRGGBB), 없으면 카테고리 기본색

실행 방법 두 가지 (결과 파일은 같은 규격):

  1) Blender (bpy) — 정면 표시용 얇은 판을 더 붙일 수 있고 나중에 모양을 다듬기 쉽다
     blender --background --python scripts/make_proxy_glb.py -- \
         --catalog ../../packages/schema/fixtures/catalog.json --out build/proxy_glb

  2) Blender 없이 순수 파이썬 (CI·Windows 팀원용, 의존성 없음)
     python scripts/make_proxy_glb.py --catalog ../../packages/schema/fixtures/catalog.json --out build/proxy_glb

--catalog 를 생략하면 packages/schema/fixtures/catalog*.json 을 모두 읽는다.
각 상품마다 <out>/<itemId>.glb 와 목록 파일 <out>/manifest.json 을 만든다.

#52 (IKEA 링크 → proxy 교체) 용 옵션 — 원본은 건드리지 않고 새 파일로 쓴다:
  --rewrite-catalog OUT.json   카탈로그의 asset.glbUrl = <url-prefix><itemId>.glb, assetFidelity = proxy, thumbnailUrl = null
  --rewrite-csv IN.csv OUT.csv 원본 시트(catalog-sheet.csv)의 glbUrl·thumbnailUrl·assetFidelity 열을 같은 값으로
"""
from __future__ import annotations

import argparse
import csv
import glob
import io
import json
import struct
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = ENGINE_DIR.parent.parent
DEFAULT_CATALOG_GLOB = str(REPO_ROOT / "packages" / "schema" / "fixtures" / "catalog*.json")

CATEGORY_COLORS = {
    "bed": "#D7B98E",
    "desk": "#F2F0EB",
    "chair": "#5A5A5E",
    "storage": "#E8E4DC",
    "shelf": "#C8A67A",
    "table": "#BFA27E",
    "wardrobe": "#E6E1D8",
    "sofa": "#8A9BA8",
    "lamp": "#2E2E30",
    "decor": "#C8A882",
    "etc": "#B0B0B0",
}

# 정면(+Z) 표시: 정면 쪽 아래 모서리에 두께 FRONT_MARK_MM 의 어두운 띠를 붙여 3D 뷰어에서 방향이 보이게 한다.
FRONT_MARK_MM = 10


# ---------------------------------------------------------------------------
# 공통: 카탈로그 읽기
# ---------------------------------------------------------------------------
def load_items(catalog_paths: list[str]) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    for path in catalog_paths:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        for item in data if isinstance(data, list) else [data]:
            if item["itemId"] in seen:
                continue
            seen.add(item["itemId"])
            items.append(item)
    return items


def hex_to_rgb(color: str | None, category: str) -> tuple[float, float, float]:
    color = color or CATEGORY_COLORS.get(category, CATEGORY_COLORS["etc"])
    color = color.lstrip("#")
    r, g, b = (int(color[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (r, g, b)


def box_size_m(item: dict) -> tuple[float, float, float]:
    d = item["dimensions"]
    return (d["width"] / 1000, d["height"] / 1000, d["depth"] / 1000)


# ---------------------------------------------------------------------------
# 순수 파이썬 GLB 작성기 (glTF 2.0, 박스 2개: 본체 + 정면 띠)
# ---------------------------------------------------------------------------
_FACES = [
    # (법선, 네 꼭짓점의 부호 (sx, sy, sz)) — 반시계(바깥에서 볼 때) 순서
    ((1, 0, 0), [(1, 0, 1), (1, 0, -1), (1, 1, -1), (1, 1, 1)]),
    ((-1, 0, 0), [(-1, 0, -1), (-1, 0, 1), (-1, 1, 1), (-1, 1, -1)]),
    ((0, 1, 0), [(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)]),
    ((0, -1, 0), [(-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1)]),
    ((0, 0, 1), [(-1, 0, 1), (1, 0, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(1, 0, -1), (-1, 0, -1), (-1, 1, -1), (1, 1, -1)]),
]


def box_mesh(w: float, h: float, d: float, cx: float = 0.0, cz: float = 0.0, y0: float = 0.0):
    """바닥 중심 (cx, y0, cz), 크기 w×h×d 박스의 (positions, normals, indices)."""
    positions: list[tuple[float, float, float]] = []
    normals: list[tuple[float, float, float]] = []
    indices: list[int] = []
    for normal, corners in _FACES:
        base = len(positions)
        for sx, sy, sz in corners:
            positions.append((cx + sx * w / 2, y0 + sy * h, cz + sz * d / 2))
            normals.append(normal)
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]
    return positions, normals, indices


def build_glb(item: dict) -> bytes:
    w, h, d = box_size_m(item)
    rgb = hex_to_rgb(item.get("color"), item["category"])
    mark = FRONT_MARK_MM / 1000
    meshes = [
        box_mesh(w, h, d),
        # 정면(+Z) 띠: 본체 앞면에 붙은 높이 min(h, 0.05m)·두께 1cm 판 (바닥면 범위를 넘지 않게 안쪽으로)
        box_mesh(w * 0.9, min(h, 0.05), mark, cz=d / 2 - mark / 2, y0=0.0),
    ]
    colors = [rgb, tuple(c * 0.35 for c in rgb)]

    bin_chunk = bytearray()
    buffer_views, accessors, gltf_meshes, nodes, materials = [], [], [], [], []

    def add_view(data: bytes, target: int) -> int:
        while len(bin_chunk) % 4:
            bin_chunk.append(0)
        buffer_views.append({"buffer": 0, "byteOffset": len(bin_chunk), "byteLength": len(data), "target": target})
        bin_chunk.extend(data)
        return len(buffer_views) - 1

    for i, ((pos, nrm, idx), rgb_i) in enumerate(zip(meshes, colors)):
        pv = add_view(b"".join(struct.pack("<3f", *p) for p in pos), 34962)
        nv = add_view(b"".join(struct.pack("<3f", *n) for n in nrm), 34962)
        iv = add_view(b"".join(struct.pack("<H", k) for k in idx), 34963)
        xs, ys, zs = zip(*pos)
        accessors += [
            {"bufferView": pv, "componentType": 5126, "count": len(pos), "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": nv, "componentType": 5126, "count": len(nrm), "type": "VEC3"},
            {"bufferView": iv, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ]
        a = len(accessors) - 3
        materials.append({
            "name": "body" if i == 0 else "front_mark",
            "pbrMetallicRoughness": {"baseColorFactor": [*rgb_i, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.8},
        })
        gltf_meshes.append({"primitives": [{"attributes": {"POSITION": a, "NORMAL": a + 1}, "indices": a + 2, "material": i}]})
        nodes.append({"name": f"{item['itemId']}_{'body' if i == 0 else 'front'}", "mesh": i})

    gltf = {
        "asset": {"version": "2.0", "generator": "zipchak make_proxy_glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [len(nodes)]}],
        "nodes": nodes + [{
            "name": item["itemId"],
            "children": list(range(len(nodes))),
            "extras": {
                "itemId": item["itemId"],
                "assetFidelity": "proxy",
                "dimensionsMm": item["dimensions"],
                "originAtFootprintCenter": True,
                "front": "+Z",
            },
        }],
        "meshes": gltf_meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_chunk)}],
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    bin_bytes = bytes(bin_chunk) + b"\x00" * (-len(bin_chunk) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    return (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
        + struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes
    )


def write_pure(items: list[dict], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for item in items:
        path = out_dir / f"{item['itemId']}.glb"
        path.write_bytes(build_glb(item))
        paths.append(path)
    return paths


# ---------------------------------------------------------------------------
# Blender (bpy) 백엔드
# ---------------------------------------------------------------------------
def write_blender(items: list[dict], out_dir: Path) -> list[Path]:  # pragma: no cover - Blender 안에서만 실행
    import bpy  # type: ignore

    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for item in items:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        w, h, d = box_size_m(item)
        rgb = hex_to_rgb(item.get("color"), item["category"])

        def make_box(name: str, size: tuple[float, float, float], center: tuple[float, float, float], color):
            # Blender는 Z가 위다. glTF 내보내기(+Y up 변환)가 Blender (x, y, z) → glTF (x, z, -y) 로 바꾼다.
            # 그래서 glTF +Z(정면) = Blender −Y 방향이다.
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
            obj = bpy.context.active_object
            obj.name = name
            obj.scale = size
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            mat = bpy.data.materials.new(name=f"{name}_mat")
            mat.use_nodes = True
            mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1.0)
            obj.data.materials.append(mat)
            return obj

        # Blender 좌표: 가로 X = w, 깊이 Y = d, 높이 Z = h. 바닥 중심이 원점이 되도록 Z = h/2 에 둔다.
        make_box(item["itemId"], (w, d, h), (0, 0, h / 2), rgb)
        mark = FRONT_MARK_MM / 1000
        mh = min(h, 0.05)
        make_box(f"{item['itemId']}_front", (w * 0.9, mark, mh), (0, -(d / 2 - mark / 2), mh / 2),
                 tuple(c * 0.35 for c in rgb))

        path = out_dir / f"{item['itemId']}.glb"
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_yup=True, export_apply=True)
        paths.append(path)
    return paths


# ---------------------------------------------------------------------------
# #52: 카탈로그·원본 시트의 에셋 열을 proxy 로 바꾸기
# ---------------------------------------------------------------------------
def proxy_asset(item_id: str, url_prefix: str) -> dict:
    return {"glbUrl": f"{url_prefix}{item_id}.glb", "thumbnailUrl": None, "assetFidelity": "proxy", "originAtFootprintCenter": True}


def rewrite_catalog(items: list[dict], url_prefix: str) -> list[dict]:
    out = []
    for item in items:
        new = dict(item)
        new["asset"] = proxy_asset(item["itemId"], url_prefix)
        out.append(new)
    return out


def rewrite_csv(text: str, url_prefix: str) -> str:
    rows = list(csv.reader(io.StringIO(text)))
    header = [h.strip() for h in rows[0]]
    idx = {name: header.index(name) for name in ("itemId", "glbUrl", "thumbnailUrl", "assetFidelity")}
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(rows[0])
    for row in rows[1:]:
        if not row or not row[idx["itemId"]].strip():
            writer.writerow(row)
            continue
        row = row + [""] * (len(header) - len(row))
        row[idx["glbUrl"]] = f"{url_prefix}{row[idx['itemId']].strip()}.glb"
        row[idx["thumbnailUrl"]] = ""
        row[idx["assetFidelity"]] = "proxy"
        writer.writerow(row)
    return buf.getvalue()


# ---------------------------------------------------------------------------
def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--catalog", action="append", help="카탈로그 JSON 경로 (여러 번 가능). 기본: fixtures/catalog*.json")
    parser.add_argument("--out", default=str(ENGINE_DIR / "build" / "proxy_glb"), help="출력 폴더")
    parser.add_argument("--url-prefix", default="/assets/proxy/", help="manifest.json 의 glbUrl 접두어")
    parser.add_argument("--rewrite-catalog", metavar="OUT", help="glbUrl 을 proxy 경로로 바꾼 카탈로그 JSON 을 OUT 에 쓴다")
    parser.add_argument("--rewrite-csv", nargs=2, metavar=("IN", "OUT"), help="원본 시트 CSV 의 에셋 열을 바꿔 OUT 에 쓴다")
    args = parser.parse_args(argv)

    catalog_paths = args.catalog or sorted(glob.glob(DEFAULT_CATALOG_GLOB))
    if not catalog_paths:
        print("카탈로그 파일이 없습니다:", DEFAULT_CATALOG_GLOB, file=sys.stderr)
        return 1
    items = load_items(catalog_paths)
    out_dir = Path(args.out)

    try:
        import bpy  # type: ignore  # noqa: F401

        paths = write_blender(items, out_dir)
        backend = "blender"
    except ImportError:
        paths = write_pure(items, out_dir)
        backend = "pure-python"

    manifest = {
        item["itemId"]: {"glbUrl": f"{args.url_prefix}{item['itemId']}.glb", "assetFidelity": "proxy"} for item in items
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[{backend}] {len(paths)}개 생성 → {out_dir}")
    if args.rewrite_catalog:
        text = json.dumps(rewrite_catalog(items, args.url_prefix), ensure_ascii=False, indent=2) + "\n"
        Path(args.rewrite_catalog).write_text(text, encoding="utf-8")
        print(f"카탈로그 {len(items)}개 glbUrl → {args.url_prefix}<itemId>.glb : {args.rewrite_catalog}")
    if args.rewrite_csv:
        src, dst = args.rewrite_csv
        Path(dst).write_text(rewrite_csv(Path(src).read_text(encoding="utf-8-sig"), args.url_prefix), encoding="utf-8")
        print(f"시트 에셋 열 교체: {dst}")
    return 0


if __name__ == "__main__":
    # Blender로 실행하면 '--' 뒤의 인자만 스크립트 인자다.
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))

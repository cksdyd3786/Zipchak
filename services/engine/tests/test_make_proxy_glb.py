"""#7 proxy GLB 생성기: m 단위·바닥면 중심 원점·정면 +Z 규약 검사 (Blender 없이)."""
import importlib.util
import json
import struct
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "make_proxy_glb.py"
spec = importlib.util.spec_from_file_location("make_proxy_glb", SCRIPT)
mpg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mpg)

DESK = {
    "itemId": "cat_desk_1200_a",
    "category": "desk",
    "color": "#F2F0EB",
    "dimensions": {"width": 1200, "depth": 600, "height": 730},
}


def _parse(glb: bytes) -> dict:
    magic, version, total = struct.unpack_from("<III", glb, 0)
    assert magic == 0x46546C67 and version == 2 and total == len(glb)
    json_len, json_type = struct.unpack_from("<II", glb, 12)
    assert json_type == 0x4E4F534A
    return json.loads(glb[20 : 20 + json_len])


def test_glb_header_and_body_bounds_in_meters():
    gltf = _parse(mpg.build_glb(DESK))
    body = gltf["accessors"][0]  # 첫 메시 POSITION = 본체
    # 1200×730×600mm → x ±0.6m, y 0~0.73m (바닥이 원점), z ±0.3m
    assert body["min"] == [-0.6, 0.0, -0.3]
    assert [round(v, 6) for v in body["max"]] == [0.6, 0.73, 0.3]


def test_front_mark_is_on_plus_z_side_and_inside_footprint():
    gltf = _parse(mpg.build_glb(DESK))
    mark = gltf["accessors"][3]  # 두 번째 메시 POSITION = 정면 띠
    # 띠는 z = 0.29~0.30 (정면 +Z 쪽 1cm), 본체 바닥면(±0.3) 밖으로 나가지 않는다
    assert round(mark["min"][2], 6) == 0.29 and round(mark["max"][2], 6) == 0.3
    assert mark["min"][1] == 0.0


def test_extras_and_triangle_budget():
    gltf = _parse(mpg.build_glb(DESK))
    root = gltf["nodes"][gltf["scenes"][0]["nodes"][0]]
    assert root["extras"]["assetFidelity"] == "proxy"
    assert root["extras"]["originAtFootprintCenter"] is True
    triangles = sum(gltf["accessors"][m["primitives"][0]["indices"]]["count"] for m in gltf["meshes"]) // 3
    assert triangles <= 5000  # .glb 하나당 5k 삼각형 이하 (conventions.md)


def test_default_color_when_missing():
    item = {**DESK, "color": None}
    assert mpg.hex_to_rgb(item["color"], "desk") == mpg.hex_to_rgb(mpg.CATEGORY_COLORS["desk"], "desk")


def test_cli_writes_files_and_manifest(tmp_path):
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps([DESK, {**DESK, "itemId": "cat_other", "category": "shelf"}]), encoding="utf-8")
    out = tmp_path / "out"
    assert mpg.main(["--catalog", str(catalog), "--out", str(out)]) == 0
    assert (out / "cat_desk_1200_a.glb").stat().st_size > 0
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["cat_other"] == {"glbUrl": "/assets/proxy/cat_other.glb", "assetFidelity": "proxy"}


def test_reads_repo_catalog_sample():
    sample = Path(mpg.REPO_ROOT) / "packages" / "schema" / "fixtures" / "catalog.sample.json"
    items = mpg.load_items([str(sample)])
    assert items and all(mpg.build_glb(i)[:4] == b"glTF" for i in items)


# ---------------------------------------------------------------- #52 IKEA 링크 → proxy
IKEA = {**DESK, "asset": {"glbUrl": "https://web-api.ikea.com/dimma/x.glb", "thumbnailUrl": "https://www.ikea.com/x.jpg",
                          "assetFidelity": "official", "originAtFootprintCenter": True}}


def test_rewrite_catalog_replaces_ikea_links():
    out = mpg.rewrite_catalog([IKEA], "/assets/proxy/")
    assert out[0]["asset"] == {"glbUrl": "/assets/proxy/cat_desk_1200_a.glb", "thumbnailUrl": None,
                               "assetFidelity": "proxy", "originAtFootprintCenter": True}
    assert IKEA["asset"]["assetFidelity"] == "official"  # 원본 객체는 그대로
    assert "ikea.com" not in json.dumps(out)


def test_rewrite_csv_columns():
    header = "itemId,category,glbUrl,thumbnailUrl,assetFidelity,status"
    src = header + "\ncat_a,desk,https://web-api.ikea.com/dimma/a.glb,https://www.ikea.com/a.jpg,official,available\n"
    out = mpg.rewrite_csv(src, "/assets/proxy/")
    assert out.splitlines() == [header, "cat_a,desk,/assets/proxy/cat_a.glb,,proxy,available"]


def test_cli_rewrite_outputs(tmp_path):
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps([IKEA]), encoding="utf-8")
    sheet = tmp_path / "sheet.csv"
    sheet.write_text("itemId,glbUrl,thumbnailUrl,assetFidelity\ncat_desk_1200_a,https://web-api.ikea.com/a.glb,x,official\n", encoding="utf-8")
    assert mpg.main(["--catalog", str(catalog), "--out", str(tmp_path / "glb"),
                     "--rewrite-catalog", str(tmp_path / "new.json"), "--rewrite-csv", str(sheet), str(tmp_path / "new.csv")]) == 0
    assert json.loads((tmp_path / "new.json").read_text(encoding="utf-8"))[0]["asset"]["glbUrl"] == "/assets/proxy/cat_desk_1200_a.glb"
    assert "ikea" not in (tmp_path / "new.csv").read_text(encoding="utf-8")
    assert "ikea" in catalog.read_text(encoding="utf-8")  # 원본 파일은 안 바뀜

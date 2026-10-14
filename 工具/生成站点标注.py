# -*- coding: utf-8 -*-
"""生成站点标注数据（生活区 / 林场 / 大样地 / 白桦林样地）

来源：
  - 生活区、林场：金总给的 Google 地球图钉（经纬度 + 海拔）
  - 大样地 20 ha、白桦林样地：金总确认的边界（见「展板设计」会话算出的方框）

输出两份（同一份内容、两套坐标）：
  js/sites.js    —— 二维地图用，WGS-84 经纬度
  3d/sites.json  —— 三维页用，UTM 50N（E, N）；高程在页面里按地形取，
                    因为这几处都在样地 DEM 覆盖之外，得用周边全球高程。

边界按 10 m 加密，三维里画线时才能贴着地形起伏。

用法：python 工具/生成站点标注.py
"""
import json
import math
from pathlib import Path

from rasterio.warp import transform as rio_transform

ROOT = Path(__file__).resolve().parent.parent
STEP = 10.0          # 边界加密间距（米）

# (名称中文, 名称英文, 纬度, 经度, 海拔或 None)
POINTS = [
    ("定位站生活区", "Station living area", 39.968047, 115.431417, 1164.86),
    ("林场",         "Forestry farm",       39.964775, 115.434950, 1122.57),
]

# (名称中文, 名称英文, [(纬度, 经度), ...])
AREAS = [
    ("大样地（20 ha）", "20 ha dynamics plot", [
        (39.951699, 115.422918), (39.951699, 115.427605),
        (39.956222, 115.427605), (39.956222, 115.422918)]),
    ("白桦林样地", "Birch plot", [
        (39.951454, 115.427552), (39.951740, 115.427288),
        (39.951944, 115.427658), (39.951658, 115.427922)]),
]


def densify(pts, step=STEP):
    """沿每条边等分加密，闭合环（首点重复一次）"""
    out = []
    n = len(pts)
    for i in range(n):
        la0, lo0 = pts[i]
        la1, lo1 = pts[(i + 1) % n]
        kx = 111320.0 * math.cos(math.radians((la0 + la1) / 2))
        d = math.hypot((la1 - la0) * 110540.0, (lo1 - lo0) * kx)
        m = max(1, int(math.ceil(d / step)))
        for j in range(m):
            f = j / m
            out.append((la0 + (la1 - la0) * f, lo0 + (lo1 - lo0) * f))
    out.append(out[0])
    return out


def area_ha(pts):
    la = sum(p[0] for p in pts) / len(pts)
    kx = 111320.0 * math.cos(math.radians(la))
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += (a[1] * kx) * (b[0] * 110540.0) - (b[1] * kx) * (a[0] * 110540.0)
    return abs(s) / 2 / 10000.0


def to_utm(pts):
    los = [p[1] for p in pts]
    las = [p[0] for p in pts]
    es, ns = rio_transform("EPSG:4326", "EPSG:32650", los, las)
    return [[round(e, 2), round(n, 2)] for e, n in zip(es, ns)]


def main():
    js_points, js_areas = [], []
    j3_points, j3_areas = [], []

    for name_zh, name_en, lat, lon, alt in POINTS:
        e, n = to_utm([(lat, lon)])[0]
        js_points.append({"id": name_en.split()[0].lower(), "nameZh": name_zh, "name": name_en,
                          "lat": round(lat, 6), "lon": round(lon, 6), "alt": alt})
        j3_points.append({"id": name_en.split()[0].lower(), "nameZh": name_zh, "name": name_en,
                          "E": e, "N": n, "alt": alt})
        print("点 %-8s lat %.6f lon %.6f  ->  E %.0f N %.0f  海拔 %s m" % (name_zh, lat, lon, e, n, alt))

    for name_zh, name_en, pts in AREAS:
        ring = densify(pts)
        js_areas.append({"id": name_en.split()[0].lower(), "nameZh": name_zh, "name": name_en,
                         "pts": [[round(a, 6), round(b, 6)] for a, b in ring]})
        j3_areas.append({"id": name_en.split()[0].lower(), "nameZh": name_zh, "name": name_en,
                         "pts": to_utm(ring)})
        print("区 %-14s 面积 %.3f ha  加密 %d 点" % (name_zh, area_ha(pts), len(ring)))

    (ROOT / "js" / "sites.js").write_text(
        "/* 站点标注：定位站生活区 / 林场 / 大样地 / 白桦林样地\n"
        " * 经纬度 WGS-84，由 工具/生成站点标注.py 生成，勿手改。 */\n"
        "var SITES = " + json.dumps({"points": js_points, "areas": js_areas},
                                    ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "sites.json").write_text(
        json.dumps({"points": j3_points, "areas": j3_areas},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print("写出 js/sites.js 与 3d/sites.json")


if __name__ == "__main__":
    main()

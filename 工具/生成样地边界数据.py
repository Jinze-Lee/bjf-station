# -*- coding: utf-8 -*-
"""
生成样地边界 / 网格 / 水系数据 —— 供二维地图与三维场景共用。

输入：原始数据\\bounds\\*.shp（微信收到，已拷入项目）
      G:\\Forlijinze\\DEM_0228.tif（三维顶点采样地面高程）
输出：
  ../js/bounds.js      二维：{ boundaries, grid20, grid40, drainage }（WGS84）
  ../3d/bounds.json    三维：同几何（UTM 50N）+ 每顶点 DEM 高程

坐标：zhl / 20m / 40m / Drainage 是 UTM 50N；yousong / luoyesong 是 WGS84。
统一算出两套坐标（WGS84 与 UTM 50N）。

复现：python 生成样地边界数据.py
"""
import math, json
from pathlib import Path
import numpy as np, shapefile, rasterio

BND = Path(__file__).resolve().parent.parent / "原始数据" / "bounds"
DEM = Path(r"G:\Forlijinze\DEM_0228.tif")
ROOT = Path(__file__).resolve().parent.parent

FILES = {
    "boundaries": [("zhl_bound_polygonnew_50N.shp", "综合林"),
                   ("yousong_bound_polygon.shp", "油松"),
                   ("luoyesong_bound_polygon.shp", "落叶松")],
    "grid20": [("20m_grid_fall.shp", None)],
    "grid40": [("40m_grid_everngreen.shp", None)],
    "drainage": [("Drainage Line Layer.shp", None)],
}


def wgs84_to_utm(lat, lon):
    a, f = 6378137.0, 1 / 298.257223563
    e2 = 2 * f - f * f
    k0, lon0 = 0.9996, math.radians(117.0)
    lat, lon = math.radians(lat), math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    T, C = math.tan(lat) ** 2, e2 / (1 - e2) * math.cos(lat) ** 2
    A = (lon - lon0) * math.cos(lat)
    e4, e6 = e2 * e2, e2 ** 3
    M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
             - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * lat)
             + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * lat)
             - (35 * e6 / 3072) * math.sin(6 * lat))
    E = k0 * N * (A + (1 - T + C) * A ** 3 / 6
                  + (5 - 18 * T + T * T + 72 * C - 58 * (e2 / (1 - e2))) * A ** 5 / 120) + 500000.0
    Nn = k0 * (M + N * math.tan(lat) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
              + (61 - 58 * T + T * T + 600 * C - 330 * (e2 / (1 - e2))) * A ** 6 / 720))
    return E, Nn


def utm_to_wgs84(E, N):
    a, f = 6378137.0, 1 / 298.257223563
    e2 = 2 * f - f * f
    k0 = 0.9996
    x, y = E - 500000.0, N
    ep2 = e2 / (1 - e2)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    C1 = ep2 * math.cos(phi1) ** 2
    T1 = math.tan(phi1) ** 2
    N1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    D = x / (N1 * k0)
    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
    lon = math.radians(117.0) + (
        D - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def is_utm(prj):
    return "PROJCS" in prj.upper()


def parts_of(shape):
    """把 shapefile 的 points 按 parts 切成多段（环/线）。"""
    pts = list(shape.points)
    parts = list(shape.parts) + [len(pts)]
    return [pts[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]


def read_geom(shp):
    """返回 [(ring_wgs84, ring_utm), ...]"""
    prj = (shp[:-4] + ".prj")
    utm = is_utm(Path(prj).read_text(encoding="utf-8", errors="ignore")) if Path(prj).exists() else True
    r = shapefile.Reader(shp, encoding="utf-8")
    out = []
    for sr in r.shapeRecords():
        for ring in parts_of(sr.shape):
            wgs, utm_ring = [], []
            for x, y in ring:
                if utm:
                    la, lo = utm_to_wgs84(x, y); e, n = x, y
                else:
                    la, lo = y, x; e, n = wgs84_to_utm(y, x)
                wgs.append([round(la, 7), round(lo, 7)])
                utm_ring.append([round(e, 3), round(n, 3)])
            out.append((wgs, utm_ring, sr.record))
    return out


def main():
    with rasterio.open(DEM) as ds:
        def z_of(E, N):
            rr, cc = ds.index(E, N)
            a = ds.read(1, window=rasterio.windows.Window(cc - 2, rr - 2, 5, 5))
            a = a[a > -100]
            return round(float(np.median(a)), 2) if a.size else None

        js = {"boundaries": [], "grid20": [], "grid40": [], "drainage": []}
        j3 = {"boundaries": [], "grid20": [], "grid40": [], "drainage": []}
        for key, items in FILES.items():
            for fname, label in items:
                for wgs, utm_ring, rec in read_geom(str(BND / fname)):
                    j3_ring = [[e, n, z_of(e, n)] for e, n in utm_ring]
                    if key == "boundaries":
                        js["boundaries"].append({"name": label, "pts": wgs})
                        j3["boundaries"].append({"name": label, "pts": j3_ring})
                    elif key == "drainage":
                        js["drainage"].append(wgs)
                        j3["drainage"].append(j3_ring)
                    else:
                        gid = int(rec[0]) if rec and rec[0] is not None else 0
                        js[key].append({"id": gid, "pts": wgs})
                        j3[key].append({"id": gid, "pts": j3_ring})
                print("  %-32s -> %s" % (fname, key))

    (ROOT / "js" / "bounds.js").write_text(
        "/* 样地边界/网格/水系 —— 由 工具/生成样地边界数据.py 生成，请勿手改。\n"
        " * 源：原始数据/bounds/*.shp。坐标为 WGS-84。 */\n"
        "var BOUNDS = " + json.dumps(js, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "bounds.json").write_text(
        json.dumps(j3, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("边界 %d / 20m %d / 40m %d / 水系 %d"
          % (len(js["boundaries"]), len(js["grid20"]), len(js["grid40"]), len(js["drainage"])))
    print("写出 js/bounds.js 与 3d/bounds.json")


if __name__ == "__main__":
    main()

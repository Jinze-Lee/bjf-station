# -*- coding: utf-8 -*-
"""
生成 ../3d/annotations.json —— 三维点云页的标注数据

三类点，坐标统一为 UTM 50N（EPSG:32650，与点云一致）：
  · trees      20 棵被监测树（js/trees.js，WGS84）
  · plots       3 台数采（js/trees.js 的 PLOTS，WGS84）
  · maintrees  RTK 实测主树（js/survey-points.js，WGS84）
  · plotTrees  RTK 实测样方内树（js/survey-points.js，WGS84）
高程 Z：用同区域 DEM_0228.tif 采样地面高程（RTK 的 H 与 LiDAR 基准不一致，不能用）。

校验：WGS84->UTM 用 工具/生成实测点数据.py 同款公式，并与手簿 UTM 字段比对。

复现：python 生成三维标注.py
"""

import re, json, math
from pathlib import Path
import numpy as np, rasterio, shapefile

ROOT = Path(__file__).resolve().parent.parent
TREES_JS = ROOT / "js" / "trees.js"
SURVEY_JS = ROOT / "js" / "survey-points.js"
OUT = ROOT / "3d" / "annotations.json"
DEM = Path(r"G:\Forlijinze\DEM_0228.tif")
SURVEY_SHP = Path(r"G:\Forlijinze\DLS_RTK0613_maintree.shp")


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


def verify():
    sr = shapefile.Reader(str(SURVEY_SHP), encoding="latin1")
    errs = []
    for rec in list(sr.records())[:20]:
        lat, lon, e_ref, n_ref = rec[1], rec[2], rec[5], rec[4]
        if lat == 0:
            continue
        e, n = wgs84_to_utm(lat, lon)
        errs.append((abs(e - e_ref), abs(n - n_ref)))
    if errs:
        print("WGS84->UTM 校验: 最大偏差 E=%.3f m N=%.3f m"
              % (max(e for e, _ in errs), max(n for _, n in errs)))


def parse_trees():
    src = TREES_JS.read_text(encoding="utf-8")
    trees = []
    for blk in src.split("{ id:")[1:]:
        g = lambda p: (re.search(p, blk).group(1) if re.search(p, blk) else None)
        trees.append(dict(id=g(r"'([^']+)'"), lat=float(g(r"lat:\s*([0-9.]+)")),
                          lon=float(g(r"lon:\s*([0-9.]+)")),
                          speciesZh=g(r"speciesZh:\s*'([^']*)'") or "",
                          species=g(r"species:\s*'([^']*)'") or "",
                          dbh=float(g(r"dbh:\s*([0-9.]+)") or 0)))
    plots = []
    for blk in src.split("PLOTS")[1].split("TREES")[0].split("{ name:")[1:]:
        g = lambda p: (re.search(p, blk).group(1) if re.search(p, blk) else None)
        plots.append(dict(nameZh=g(r"nameZh:\s*'([^']*)'") or "", name=g(r"name:\s*'([^']*)'") or "",
                          lat=float(g(r"lat:\s*([0-9.]+)")), lon=float(g(r"lon:\s*([0-9.]+)"))))
    return trees, plots


def parse_survey():
    src = SURVEY_JS.read_text(encoding="utf-8")
    def block(tag):
        m = re.search(tag + r":\s*\[(.*?)\]", src, re.S)
        out = []
        for mm in re.finditer(r"name:\s*'([^']*)',\s*lat:\s*([0-9.]+),\s*lon:\s*([0-9.]+).*?species:\s*'([^']*)'", m.group(1)):
            out.append(dict(name=mm.group(1), lat=float(mm.group(2)), lon=float(mm.group(3)), species=mm.group(4)))
        return out
    return block("maintrees"), block("plotTrees")


def main():
    verify()
    trees, plots = parse_trees()
    maintrees, plotTrees = parse_survey()
    print("解析: %d 树, %d 数采, %d 主树, %d 样方内树"
          % (len(trees), len(plots), len(maintrees), len(plotTrees)))

    with rasterio.open(DEM) as ds:
        def ground(lat, lon):
            e, n = wgs84_to_utm(lat, lon)
            r, c = ds.index(e, n)
            a = ds.read(1, window=rasterio.windows.Window(c - 3, r - 3, 6, 6))
            a = a[a > -100]
            if a.size == 0:
                return e, n, None
            return e, n, float(np.median(a))
        def tag(x):
            e, n, z = ground(x["lat"], x["lon"])
            x["E"], x["N"] = round(e, 3), round(n, 3)
            x["Z"] = round(z, 2) if z is not None else None
            return x
        trees = [tag(t) for t in trees]
        plots = [tag(p) for p in plots]
        maintrees = [tag(m) for m in maintrees]
        plotTrees = [tag(p) for p in plotTrees]

    OUT.write_text(json.dumps({"trees": trees, "plots": plots,
                               "maintrees": maintrees, "plotTrees": plotTrees},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print("写出:", OUT)


if __name__ == "__main__":
    main()

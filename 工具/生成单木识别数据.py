# -*- coding: utf-8 -*-
"""
生成单木识别（树冠多边形）数据 —— 供二维地图与三维场景共用。

输入：G:\\DJIvideo\\treesclusters_0501_50N_SpeID.shp
      （3779 个树冠多边形，POLYGON，UTM 50N，字段 spe_name / Spe_ID）
      G:\\Forlijinze\\DEM_0228.tif（三维顶点采样地面高程）
输出：
  ../js/treestems.js      二维：{ species, crowns:[[Spe_ID,[[lat,lon],...]], ...] }
  ../3d/treestems.json    三维：{ species, crowns:[[Spe_ID,cE,cN,cZ,[[E,N,Z],...]], ...] }

树冠顶点太多（平均 79/冠），用 Douglas-Peucker 抽稀（EPS_M）后再输出，
否则二维要画 30 万点、三维每帧也要投影 30 万点，都会卡。

复现：python 生成单木识别数据.py
"""
import math, json
from pathlib import Path
import numpy as np, shapefile, rasterio

SHP = Path(r"G:\DJIvideo\treesclusters_0501_50N_SpeID.shp")
DEM = Path(r"G:\Forlijinze\DEM_0228.tif")
ROOT = Path(__file__).resolve().parent.parent
EPS_M = 0.35          # DP 抽稀容差（米，UTM）

COLORS = {
    6: "#4f7a52", 12: "#7fae54", 5: "#b3903a", 2: "#8a6a45", 10: "#c06a3c",
    11: "#9ab36a", 21: "#8f9a4e", 1: "#5a6b70", 4: "#c2a24a", 3: "#5a8f8f",
    20: "#a05c6a", 13: "#7a6bb0",
}


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


def dp(pts, eps):
    """Douglas-Peucker（开放折线）。pts: [(x,y),...]"""
    if len(pts) < 3:
        return pts
    x1, y1 = pts[0]; x2, y2 = pts[-1]
    dx, dy = x2 - x1, y2 - y1
    denom = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = dp(pts[:idx + 1], eps)
        right = dp(pts[idx:], eps)
        return left[:-1] + right
    return [pts[0], pts[-1]]


def main():
    r = shapefile.Reader(str(SHP), encoding="utf-8")
    fields = [f[0] for f in r.fields[1:]]
    i_sp, i_nm = fields.index("Spe_ID"), fields.index("spe_name")
    sp_name = {}
    for rec in r.records():
        sp_name[int(rec[i_sp])] = rec[i_nm]
    species = {str(k): {"zh": sp_name[k], "color": COLORS.get(k, "#888888")} for k in sp_name}

    crowns2d, crowns3d = [], []
    n_before = n_after = 0
    with rasterio.open(DEM) as ds:
        def z_of(E, N):
            rr, cc = ds.index(E, N)
            a = ds.read(1, window=rasterio.windows.Window(cc - 2, rr - 2, 5, 5))
            a = a[a > -100]
            return round(float(np.median(a)), 2) if a.size else None
        for sr in r.shapeRecords():
            sid = int(sr.record[i_sp])
            pts = list(sr.shape.points)
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            n_before += len(pts)
            simp = dp(pts, EPS_M)
            n_after += len(simp)
            b = sr.shape.bbox
            cE, cN = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
            ring2d = []
            ring3d = []
            for x, y in simp:
                la, lo = utm_to_wgs84(x, y)
                ring2d.append([round(la, 7), round(lo, 7)])
                ring3d.append([round(x, 2), round(y, 2), z_of(x, y)])
            crowns2d.append([sid, ring2d])
            crowns3d.append([sid, round(cE, 2), round(cN, 2), z_of(cE, cN), ring3d])

    print("树冠 %d，顶点 %d -> %d（抽稀后，%.0f%%）"
          % (len(crowns2d), n_before, n_after, 100.0 * n_after / n_before))
    (ROOT / "js" / "treestems.js").write_text(
        "/* 单木识别树冠 —— 由 工具/生成单木识别数据.py 生成，请勿手改。\n"
        " * 源：G:\\DJIvideo\\treesclusters_0501_50N_SpeID.shp（3779 个树冠，已 DP 抽稀）。\n"
        " * crowns: [Spe_ID, [[lat,lon],...]]，坐标为 WGS-84。 */\n"
        "var TREESTEMS = " + json.dumps({"species": species, "crowns": crowns2d},
                                       ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "treestems.json").write_text(
        json.dumps({"species": species, "crowns": crowns3d}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print("写出 js/treestems.js 与 3d/treestems.json")


if __name__ == "__main__":
    main()

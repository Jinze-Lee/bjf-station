# -*- coding: utf-8 -*-
"""
生成单木识别（树冠）数据 —— 供二维地图与三维场景共用。

输入：G:\\DJIvideo\\treesclusters_0501_50N_SpeID.shp
      （3779 个树冠多边形，POLYGON，UTM 50N，字段 spe_name / Spe_ID）
      G:\\Forlijinze\\DEM_0228.tif   （采样地面高程，供三维用）
校验：UTM->WGS84 反算用 G:\\Forlijinze\\DLS_RTK0613_maintree.shp 的
      WGS84 与 UTM 双字段比对。
输出：
  ../js/treestems.js        二维地图用：{ species, pts:[[lat,lon,sp],...] }
  ../3d/treestems.json     三维场景用：{ species, pts:[[E,N,Z,sp],...] }

复现：python 生成单木识别数据.py
"""
import math, json
from pathlib import Path
import numpy as np, shapefile, rasterio

SHP = Path(r"G:\DJIvideo\treesclusters_0501_50N_SpeID.shp")
DEM = Path(r"G:\Forlijinze\DEM_0228.tif")
CHK = Path(r"G:\Forlijinze\DLS_RTK0613_maintree.shp")
ROOT = Path(__file__).resolve().parent.parent

# Spe_ID -> 颜色（12 类，低饱和、区分度够，深色底上可读）
COLORS = {
    6: "#4f7a52", 12: "#7fae54", 5: "#b3903a", 2: "#8a6a45", 10: "#c06a3c",
    11: "#9ab36a", 21: "#8f9a4e", 1: "#5a6b70", 4: "#c2a24a", 3: "#5a8f8f",
    20: "#a05c6a", 13: "#7a6bb0",
}


def utm_to_wgs84(E, N, lon0=117.0):
    a = 6378137.0
    f = 1 / 298.257223563
    e2 = 2 * f - f * f
    k0 = 0.9996
    x = E - 500000.0
    y = N  # northern hemisphere
    ep2 = e2 / (1 - e2)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    C1 = ep2 * math.cos(phi1) ** 2
    T1 = math.tan(phi1) ** 2
    N1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    D = x / (N1 * k0)
    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
    lon = math.radians(lon0) + (
        D - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def verify():
    sr = shapefile.Reader(str(CHK), encoding="latin1")
    err = []
    for rec in list(sr.records())[:30]:
        lat, lon, e, n = rec[1], rec[2], rec[5], rec[4]
        if lat == 0:
            continue
        la, lo = utm_to_wgs84(e, n)
        err.append((abs(la - lat), abs(lo - lon)))
    if err:
        print("UTM->WGS84 反算校验: 最大偏差 lat=%.2e lon=%.2e 度（约 %.3f / %.3f m）"
              % (max(x for x, _ in err), max(y for _, y in err),
                 max(x for x, _ in err) * 111000, max(y for _, y in err) * 85000))


def main():
    verify()
    r = shapefile.Reader(str(SHP), encoding="utf-8")
    fields = [f[0] for f in r.fields[1:]]
    i_sp, i_nm = fields.index("Spe_ID"), fields.index("spe_name")
    sp_name = {}
    for rec in r.records():
        sp_name[int(rec[i_sp])] = rec[i_nm]
    print("物种:", {k: sp_name[k] for k in sorted(sp_name)})

    # 树冠中心（bbox 中心）
    pts = []
    for sr in r.shapeRecords():
        sid = int(sr.record[i_sp])
        b = sr.shape.bbox
        E = (b[0] + b[2]) / 2.0
        N = (b[1] + b[3]) / 2.0
        pts.append((E, N, sid))
    print("树冠数:", len(pts))

    # DEM 采样高程
    with rasterio.open(DEM) as ds:
        def z_of(E, N):
            rr, cc = ds.index(E, N)
            a = ds.read(1, window=rasterio.windows.Window(cc - 2, rr - 2, 5, 5))
            a = a[a > -100]
            return float(np.median(a)) if a.size else None

        species = {str(k): {"zh": sp_name[k], "color": COLORS.get(k, "#888888")} for k in sp_name}
        pts2d = []
        pts3d = []
        for E, N, sid in pts:
            la, lo = utm_to_wgs84(E, N)
            pts2d.append([round(la, 7), round(lo, 7), sid])
            z = z_of(E, N)
            pts3d.append([round(E, 3), round(N, 3), (round(z, 2) if z is not None else None), sid])

    (ROOT / "js" / "treestems.js").write_text(
        "/* 单木识别（树冠）—— 由 工具/生成单木识别数据.py 生成，请勿手改。\n"
        " * 源：G:\\DJIvideo\\treesclusters_0501_50N_SpeID.shp（3779 个树冠，UTM 50N）\n"
        " * pts: [lat, lon, Spe_ID]，坐标为 WGS-84。 */\n"
        "var TREESTEMS = " + json.dumps({"species": species, "pts": pts2d}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "treestems.json").write_text(
        json.dumps({"species": species, "pts": pts3d}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print("写出 js/treestems.js 与 3d/treestems.json")


if __name__ == "__main__":
    main()

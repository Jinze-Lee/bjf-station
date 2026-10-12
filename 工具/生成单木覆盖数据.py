# -*- coding: utf-8 -*-
"""
生成「单木覆盖」（Voronoi / 泰森多边形）数据 —— 整片区域按最近的树填色。

输入：G:\\DJIvideo\\treesclusters_0501_50N_SpeID.shp（3779 棵树冠，取中心 + Spe_ID）
      G:\\Forlijinze\\DEM_0228.tif（三维顶点采样地面高程）
输出：
  ../js/voronoi.js     二维：{ species, cells:[[Spe_ID,[[lat,lon],...]], ...] }
  ../3d/voronoi.json   三维：{ species, cells:[[Spe_ID,[[E,N,Z],...]], ...] }

做法：scipy.spatial.Voronoi -> 转有限多边形 -> 裁剪到树的外接矩形（外扩 15 m）。
复现：python 生成单木覆盖数据.py
"""
import math, json
from pathlib import Path
import numpy as np, shapefile, rasterio
from scipy.spatial import Voronoi

SHP = Path(r"G:\DJIvideo\treesclusters_0501_50N_SpeID.shp")
DEM = Path(r"G:\Forlijinze\DEM_0228.tif")
ROOT = Path(__file__).resolve().parent.parent
MARGIN = 15.0

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


def voronoi_finite_polygons_2d(vor, radius=None):
    """把 Voronoi 的无限区域转成有限多边形（经典实现）。返回 regions, vertices。"""
    new_regions, new_vertices = [], vor.vertices.tolist()
    center = vor.points.mean(axis=0)
    if radius is None:
        radius = (np.ptp(vor.points[:, 0]) + np.ptp(vor.points[:, 1])) * 2
    all_ridges = {}
    for (p1, p2), (v1, v2) in zip(vor.ridge_points, vor.ridge_vertices):
        all_ridges.setdefault(p1, []).append((p2, v1, v2))
        all_ridges.setdefault(p2, []).append((p1, v1, v2))
    for p1, region in enumerate(vor.point_region):
        vertices = vor.regions[region]
        if all(v >= 0 for v in vertices):
            new_regions.append(vertices); continue
        ridges = all_ridges[p1]
        new_region = [v for v in vertices if v >= 0]
        for p2, v1, v2 in ridges:
            if v2 < 0:
                v1, v2 = v2, v1
            if v1 >= 0:
                continue
            t = vor.points[p2] - vor.points[p1]
            t /= np.linalg.norm(t)
            n = np.array([-t[1], t[0]])
            midpoint = vor.points[[p1, p2]].mean(axis=0)
            direction = np.sign(np.dot(midpoint - center, n)) * n
            far_point = vor.vertices[v2] + direction * radius
            new_region.append(len(new_vertices))
            new_vertices.append(far_point.tolist())
        vs = np.asarray([new_vertices[v] for v in new_region])
        c = vs.mean(axis=0)
        angles = np.arctan2(vs[:, 1] - c[1], vs[:, 0] - c[0])
        new_region = np.array(new_region)[np.argsort(angles)]
        new_regions.append(new_region.tolist())
    return new_regions, np.asarray(new_vertices)


def _seg_int(p, q, a, b):
    """线段 pq 与直线 ab 的交点。"""
    x1, y1 = p; x2, y2 = q; x3, y3 = a; x4, y4 = b
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-12:
        return q
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def clip_convex(poly, clip):
    """Sutherland-Hodgman：把凸多边形裁到凸裁剪多边形（clip 需 CCW）。"""
    def inside(p, a, b):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
    out = [(float(p[0]), float(p[1])) for p in poly]
    n = len(clip)
    for i in range(n):
        a, b = clip[i], clip[(i + 1) % n]
        inp, out = out, []
        if not inp:
            return []
        for j in range(len(inp)):
            cur, prv = inp[j], inp[j - 1]
            ic, ip = inside(cur, a, b), inside(prv, a, b)
            if ic:
                if not ip:
                    out.append(_seg_int(prv, cur, a, b))
                out.append(cur)
            elif ip:
                out.append(_seg_int(prv, cur, a, b))
    return out


def convex_hull(points):
    """Andrew 单调链，返回 CCW 凸包。"""
    pts = sorted(set((float(x), float(y)) for x, y in points))
    if len(pts) < 3:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def main():
    r = shapefile.Reader(str(SHP), encoding="utf-8")
    fields = [f[0] for f in r.fields[1:]]
    i_sp, i_nm = fields.index("Spe_ID"), fields.index("spe_name")
    sp_name = {}
    for rec in r.records():
        sp_name[int(rec[i_sp])] = rec[i_nm]
    species = {str(k): {"zh": sp_name[k], "color": COLORS.get(k, "#888888")} for k in sp_name}

    pts, sps = [], []
    for sr in r.shapeRecords():
        b = sr.shape.bbox
        pts.append([(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0])
        sps.append(int(sr.record[i_sp]))
    P = np.array(pts)
    print("树:", len(P))
    vor = Voronoi(P)
    regions, verts = voronoi_finite_polygons_2d(vor)
    # 裁到树的凸包（外扩 MARGIN），贴合树的分布，避免矩形四角跑出点云
    hull = convex_hull(P)
    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)
    clip = []
    for x, y in hull:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy) or 1.0
        clip.append((x + dx / d * MARGIN, y + dy / d * MARGIN))

    cells2d, cells3d = [], []
    nv = 0
    with rasterio.open(DEM) as ds:
        def z_of(E, N):
            rr, cc = ds.index(E, N)
            a = ds.read(1, window=rasterio.windows.Window(cc - 2, rr - 2, 5, 5))
            a = a[a > -100]
            return round(float(np.median(a)), 2) if a.size else None
        for seed, reg in enumerate(regions):
            poly = clip_convex([verts[i] for i in reg], clip)
            if len(poly) < 3:
                continue
            sid = sps[seed]
            ring2d, ring3d = [], []
            for x, y in poly:
                la, lo = utm_to_wgs84(x, y)
                ring2d.append([round(la, 7), round(lo, 7)])
                ring3d.append([round(x, 2), round(y, 2), z_of(x, y)])
            cells2d.append([sid, ring2d])
            cells3d.append([sid, ring3d])
            nv += len(poly)

    # DEM 采不到的顶点（多为边界）用全局中位高程补上，避免 null 投影成 NaN 画飞
    allz = [v[2] for _, r in cells3d for v in r if v[2] is not None]
    gmed = sorted(allz)[len(allz) // 2] if allz else 1200.0
    nfix = 0
    for _, r in cells3d:
        for v in r:
            if v[2] is None:
                v[2] = round(gmed, 2); nfix += 1
    if nfix:
        print("  补 null 高程 %d 个（用全局中位 %.1f m）" % (nfix, gmed))

    print("Voronoi 单元 %d，顶点 %d" % (len(cells2d), nv))
    (ROOT / "js" / "voronoi.js").write_text(
        "/* 单木覆盖（Voronoi）—— 由 工具/生成单木覆盖数据.py 生成，请勿手改。\n"
        " * 整片区域按最近的树（单木识别）填色。cells:[Spe_ID,[[lat,lon],...]]，WGS-84。 */\n"
        "var VORONOI = " + json.dumps({"species": species, "cells": cells2d},
                                      ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "voronoi.json").write_text(
        json.dumps({"species": species, "cells": cells3d}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print("写出 js/voronoi.js 与 3d/voronoi.json")


if __name__ == "__main__":
    main()

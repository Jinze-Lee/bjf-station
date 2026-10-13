# -*- coding: utf-8 -*-
"""用实测点云算「有数据的地方」，判定设备点是否落在点云覆盖内。

之前只用包围盒过滤，但航测覆盖是不规则的一块，盒内也有大片没数据的地方，
所以仍有设备点看着飘在外面。这里从 decimated.las（0.30 m 抽稀）建 5 m 占据格，
再判每个设备点 8 m 邻域内有没有点。
"""
import json, math, sys
from pathlib import Path
import numpy as np
import laspy

LAS = Path(r"E:\lidar_3d_build\decimated.las")
DEV = Path(r"E:\网页制作\js\devices.js")

CELL = 5.0          # 占据格边长 m
NEIGH = 8.0         # 设备点周边这个半径内有数据就算在覆盖内


def main():
    with laspy.open(str(LAS)) as f:
        h = f.header
        x0, y0 = h.mins[0], h.mins[1]
        W = int((h.maxs[0] - x0) / CELL) + 2
        H = int((h.maxs[1] - y0) / CELL) + 2
        occ = np.zeros((H, W), bool)
        n = 0
        for ch in f.chunk_iterator(4_000_000):
            x = np.asarray(ch.x); y = np.asarray(ch.y)
            ix = ((x - x0) / CELL).astype(np.int32)
            iy = ((y - y0) / CELL).astype(np.int32)
            ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
            occ[iy[ok], ix[ok]] = True
            n += len(x)
    print("点云 %d 点，占据格 %d x %d，有数据格 %.1f%%"
          % (n, W, H, 100.0 * occ.sum() / occ.size))

    # 邻域膨胀（用行/列前缀和做近似方框膨胀）
    r = int(round(NEIGH / CELL))
    ii = np.arange(-r, r + 1)
    off = [(a, b) for a in ii for b in ii if a * a + b * b <= r * r]
    grown = np.zeros_like(occ)
    for a, b in off:
        ys = slice(max(0, a), H + min(0, a)); xs = slice(max(0, b), W + min(0, b))
        ys2 = slice(max(0, -a), H + min(0, -a)); xs2 = slice(max(0, -b), W + min(0, -b))
        grown[ys2, xs2] |= occ[ys, xs]

    def inside(lat, lon):
        E, N = ll2utm(lat, lon)
        ix = int((E - x0) / CELL); iy = int((N - y0) / CELL)
        if ix < 0 or ix >= W or iy < 0 or iy >= H:
            return False
        return bool(grown[iy, ix])

    s = DEV.read_text(encoding="utf-8")
    D = json.loads(s[s.index("{"):s.rindex("}") + 1])
    dropped = []
    kept = 0
    for k in D:
        new = []
        for p in D[k]:
            if inside(p["lat"], p["lon"]):
                new.append(p); kept += 1
            else:
                dropped.append((k, p["id"], p["name"]))
        D[k] = new
    print("保留 %d 个，剔除 %d 个：" % (kept, len(dropped)))
    for d in dropped:
        print("   ", d)

    body = json.dumps(D, ensure_ascii=False, separators=(",", ":"))
    DEV.write_text(
        "/* 设备点（径向生长仪 / 液流 / LAI）—— 由 工具/生成设备点数据.py 生成，请勿手改。\n"
        " * 源：dendrometer-sapflow-LAI.xlsx（金总 2026-08 提供）。坐标 WGS-84，z 为海拔(m)。\n"
        " * 已按实测点云覆盖剔除落在覆盖外的错坐标点（见 工具/清理越界设备点.py）。 */\n"
        "var DEVICES = " + body + ";\n", encoding="utf-8")
    print("写出", DEV)


def ll2utm(lat, lon, zone=50):
    a = 6378137.0; f = 1 / 298.257223563; e2 = f * (2 - f); k0 = 0.9996
    lat = math.radians(lat); lon = math.radians(lon); lon0 = math.radians(zone * 6 - 183)
    N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    T = math.tan(lat) ** 2; C = e2 / (1 - e2) * math.cos(lat) ** 2
    A = math.cos(lat) * (lon - lon0)
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * lat)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * lat)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * lat))
    E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * e2 / (1 - e2)) * A ** 5 / 120) + 500000
    Nn = k0 * (M + N * math.tan(lat) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
              + (61 - 58 * T + T * T + 600 * C - 330 * e2 / (1 - e2)) * A ** 6 / 720))
    return E, Nn


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""把抽稀点云按空间切成 N×N 块，供 PotreeConverter 分别转八叉树。

起因：0.30 m 那版整块八叉树 274 MB，超过 GitHub 单文件 100 MB 上限。
切成 4 块后每块约 70 MB，页面同时加载 4 个点云，观感不变。

用法：python 工具/切分点云.py [输入las] [输出目录] [每边块数]
"""
import sys
from pathlib import Path

import numpy as np
import laspy

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"E:\lidar_3d_build\decimated.las")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(r"E:\lidar_3d_build\split")
N = int(sys.argv[3]) if len(sys.argv) > 3 else 2      # 每边块数，2 -> 4 块


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with laspy.open(str(SRC)) as f:
        h = f.header
        x0, y0 = h.mins[0], h.mins[1]
        x1, y1 = h.maxs[0], h.maxs[1]
    print("范围 X %.0f~%.0f  Y %.0f~%.0f  切 %d x %d 块" % (x0, x1, y0, y1, N, N))

    buckets = [[[] for _ in range(6)] for _ in range(N * N)]   # x,y,z,r,g,b
    with laspy.open(str(SRC)) as f:
        for ch in f.chunk_iterator(4_000_000):
            x = np.asarray(ch.x); y = np.asarray(ch.y); z = np.asarray(ch.z)
            ix = np.clip(((x - x0) / (x1 - x0 + 1e-9) * N).astype(np.int32), 0, N - 1)
            iy = np.clip(((y - y0) / (y1 - y0 + 1e-9) * N).astype(np.int32), 0, N - 1)
            key = iy * N + ix
            cols = [x, y, z, np.asarray(ch.red), np.asarray(ch.green), np.asarray(ch.blue)]
            for k in range(N * N):
                m = key == k
                if not m.any():
                    continue
                for i in range(6):
                    buckets[k][i].append(cols[i][m])

    total = 0
    for k in range(N * N):
        arrs = [np.concatenate(a) if a else np.zeros(0) for a in buckets[k]]
        n = len(arrs[0]); total += n
        if n == 0:
            continue
        hd = laspy.LasHeader(point_format=7, version="1.4")
        hd.offsets = [float(arrs[0].min()), float(arrs[1].min()), float(arrs[2].min())]
        hd.scales = [0.0001, 0.0001, 0.0001]
        las = laspy.LasData(hd)
        las.x, las.y, las.z = arrs[0], arrs[1], arrs[2]
        las.red, las.green, las.blue = arrs[3], arrs[4], arrs[5]
        p = OUT / ("tile%d.las" % k)
        las.write(str(p))
        print("  %s  %d 点  %.1f MB" % (p.name, n, p.stat().st_size / 1e6))
    print("合计 %d 点" % total)


if __name__ == "__main__":
    main()

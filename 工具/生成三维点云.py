# -*- coding: utf-8 -*-
"""
生成三维点云页用的抽稀点云

输入：G:\\Forlijinze\\laser_1_2025-02-28-03-19-27_color_重采样_去噪_CutResult_10_47_47_转换为Las.las
      （8.19 亿点，LAS 1.4 / point format 7，含 RGB，EPSG:32650 UTM 50N，约 28 GB）
输出：构建目录里的抽稀 .las（不进仓库）

做法：分块顺序读取 + 体素下采样（每个体素留一个点，保留真彩）。
目标：约 800 万点，兼顾观感与八叉树体积（GitHub Pages 仓库 1 GB）。

用法：python 生成三维点云.py [体素边长m] [输出路径]
      默认体素 0.30 m，输出到 E:\\lidar_3d_build\\decimated.las
"""

import sys
import time
from pathlib import Path

import numpy as np
import laspy

SRC = Path(r"G:\Forlijinze\laser_1_2025-02-28-03-19-27_color_重采样_去噪_CutResult_10_47_47_转换为Las.las")
OUT_DIR = Path(r"E:\lidar_3d_build")
CHUNK = 4_000_000
B = 1 << 12          # 体素索引混合基数：单轴索引 < 4096 即足够（实测各轴 < 2500）


def main():
    v = float(sys.argv[1]) if len(sys.argv) > 1 else 0.30
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else (OUT_DIR / "decimated.las")
    out.parent.mkdir(parents=True, exist_ok=True)

    print("体素边长 = %.3f m" % v)
    print("输入 = %s" % SRC)
    print("输出 = %s\n" % out)

    seen = set()
    xs, ys, zs, rs, gs, bs = [], [], [], [], [], []
    t0 = time.time()
    n_read = 0

    with laspy.open(str(SRC)) as f:
        total = f.header.point_count
        for ci, chunk in enumerate(f.chunk_iterator(CHUNK)):
            x = np.asarray(chunk.x, dtype=np.float64)
            y = np.asarray(chunk.y, dtype=np.float64)
            z = np.asarray(chunk.z, dtype=np.float64)
            if ci == 0:
                x0, y0, z0 = x.min(), y.min(), z.min()
            ix = np.floor((x - x0) / v).astype(np.int64)
            iy = np.floor((y - y0) / v).astype(np.int64)
            iz = np.floor((z - z0) / v).astype(np.int64)
            keys = (ix * B + iy) * B + iz

            uk, first = np.unique(keys, return_index=True)
            uk_list = uk.tolist()
            new = [k for k in uk_list if k not in seen]
            if new:
                seen.update(new)
                newset = set(new)
                mask = np.fromiter((k in newset for k in uk_list), dtype=bool, count=len(uk_list))
                idx = first[mask]
                xs.append(x[idx]); ys.append(y[idx]); zs.append(z[idx])
                rs.append(np.asarray(chunk.red)[idx])
                gs.append(np.asarray(chunk.green)[idx])
                bs.append(np.asarray(chunk.blue)[idx])

            n_read += len(x)
            if ci % 20 == 0 or n_read >= total:
                kept = sum(len(a) for a in xs)
                el = time.time() - t0
                print("  读到 %d/%d (%.0f%%)  保留 %d 点  用时 %.0fs"
                      % (n_read, total, 100.0 * n_read / total, kept, el), flush=True)

    xs = np.concatenate(xs); ys = np.concatenate(ys); zs = np.concatenate(zs)
    rs = np.concatenate(rs); gs = np.concatenate(gs); bs = np.concatenate(bs)
    n = len(xs)
    print("\n抽稀完成：%d 点（原始 %.0f 万，保留 %.2f%%）"
          % (n, n_read / 1e4, 100.0 * n / n_read))

    header = laspy.LasHeader(point_format=7, version="1.4")
    header.offsets = [float(xs.min()), float(ys.min()), float(zs.min())]
    header.scales = [0.0001, 0.0001, 0.0001]
    las = laspy.LasData(header)
    las.x = xs; las.y = ys; las.z = zs
    las.red = rs; las.green = gs; las.blue = bs
    las.write(str(out))
    print("写出：%s（%.1f MB）" % (out, out.stat().st_size / 1e6))
    print("范围：X %.1f~%.1f  Y %.1f~%.1f  Z %.1f~%.1f"
          % (xs.min(), xs.max(), ys.min(), ys.max(), zs.min(), zs.max()))


if __name__ == "__main__":
    main()

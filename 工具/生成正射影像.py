# -*- coding: utf-8 -*-
"""
生成 LiDAR 真彩正射影像（高分辨率，供网页切瓦片用）

输入：G:\\Forlijinze\\laser_1_2025-02-28-03-19-27_color_重采样_去噪_CutResult_10_47_47_转换为Las.las
      （8.19 亿点，LAS 1.4 / point format 7，含 8 位真彩存于 uint16，EPSG:32650，约 28 GB）
输出：构建目录里的 GeoTIFF（不进仓库）

做法：单遍分块顺序读取。每个像素**只保留最高的那个点**（冠层顶面），取其真彩。
      不能对所有点取平均 —— 那会把地面点混进来，冠层就糊了。

每像素取最高点：块内先按 (像素索引, Z) 字典序排序，每组最后一个就是该像素最高的点，
再与全局的 topZ 比较、只在新点更高时覆盖。

用法：python 生成正射影像.py [分辨率m] [输出tif]
      默认 0.10 m/px，输出到 E:\\lidar_3d_build\\ortho_010.tif
"""

import sys
import time
from pathlib import Path

import numpy as np
import laspy
import rasterio
from rasterio.transform import from_origin

SRC = Path(r"G:\Forlijinze\laser_1_2025-02-28-03-19-27_color_重采样_去噪_CutResult_10_47_47_转换为Las.las")
OUT_DIR = Path(r"E:\lidar_3d_build")
CHUNK = 4_000_000


def main():
    res = float(sys.argv[1]) if len(sys.argv) > 1 else 0.10
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else (OUT_DIR / ("ortho_%03d.tif" % round(res * 100)))
    out.parent.mkdir(parents=True, exist_ok=True)

    with laspy.open(str(SRC)) as f:
        h = f.header
        xmin, ymin, _ = h.mins
        xmax, ymax, _ = h.maxs
        total = h.point_count
        W = int(np.ceil((xmax - xmin) / res))
        H = int(np.ceil((ymax - ymin) / res))
        N = W * H
        print("分辨率 %.3f m/px  ->  %d x %d = %.1f M px" % (res, W, H, N / 1e6), flush=True)
        print("范围 X %.1f~%.1f  Y %.1f~%.1f  共 %.0f 万点" % (xmin, xmax, ymin, ymax, total / 1e4), flush=True)

        topZ = np.full(N, -1e9, np.float32)
        topR = np.zeros(N, np.uint8)
        topG = np.zeros(N, np.uint8)
        topB = np.zeros(N, np.uint8)
        # 另算一路「全点均值」：平滑、无颗粒感，两路都出图，择优选
        sumR = np.zeros(N, np.float32)
        sumG = np.zeros(N, np.float32)
        sumB = np.zeros(N, np.float32)
        cnt = np.zeros(N, np.float32)

        n_read = 0
        t0 = time.time()
        for ci, ch in enumerate(f.chunk_iterator(CHUNK)):
            x = np.asarray(ch.x, np.float64)
            y = np.asarray(ch.y, np.float64)
            z = np.asarray(ch.z, np.float32)
            ix = ((x - xmin) / res).astype(np.int32)
            iy = ((ymax - y) / res).astype(np.int32)      # 行 0 在北（与 GeoTIFF 一致）
            ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
            if ok.any():
                idx = iy[ok].astype(np.int64) * W + ix[ok]
                zz = z[ok]
                rr = np.asarray(ch.red)[ok]
                gg = np.asarray(ch.green)[ok]
                bb = np.asarray(ch.blue)[ok]

                order = np.lexsort((zz, idx))             # 先按像素、再按 Z
                idx_s = idx[order]
                grp = np.flatnonzero(np.r_[True, idx_s[1:] != idx_s[:-1]])
                last = np.r_[grp[1:] - 1, len(idx_s) - 1]  # 每组（即每像素）最高的那个

                pix = idx_s[last]
                ztop = zz[order][last]
                better = ztop > topZ[pix]
                if better.any():
                    p = pix[better]
                    topZ[p] = ztop[better]
                    topR[p] = rr[order][last][better]
                    topG[p] = gg[order][last][better]
                    topB[p] = bb[order][last][better]

                rf = rr.astype(np.float32); gf = gg.astype(np.float32); bf = bb.astype(np.float32)
                sumR += np.bincount(idx, weights=rf, minlength=N)
                sumG += np.bincount(idx, weights=gf, minlength=N)
                sumB += np.bincount(idx, weights=bf, minlength=N)
                cnt += np.bincount(idx, minlength=N)

            n_read += len(x)
            if ci % 20 == 0 or n_read >= total:
                print("  读到 %d/%d (%.0f%%)  用时 %.0fs"
                      % (n_read, total, 100.0 * n_read / total, time.time() - t0), flush=True)

    has = (topZ > -1e8).reshape(H, W)
    rgb = np.zeros((H, W, 4), np.uint8)
    rgb[..., 0] = topR.reshape(H, W)
    rgb[..., 1] = topG.reshape(H, W)
    rgb[..., 2] = topB.reshape(H, W)
    rgb[..., 3] = np.where(has, 255, 0).astype(np.uint8)

    transform = from_origin(xmin, ymax, res, res)
    with rasterio.open(str(out), "w", driver="GTiff", width=W, height=H, count=4,
                       dtype="uint8", crs="EPSG:32650", transform=transform,
                       compress="deflate", photometric="RGB") as dst:
        for i in range(4):
            dst.write(rgb[..., i], i + 1)

    # 全点均值那一版
    hasc = (cnt > 0).reshape(H, W)
    rgbm = np.zeros((H, W, 4), np.uint8)
    for i, s in enumerate((sumR, sumG, sumB)):
        v = np.zeros(N, np.float32)
        v[cnt > 0] = s[cnt > 0] / cnt[cnt > 0]
        rgbm[..., i] = np.clip(v, 0, 255).astype(np.uint8).reshape(H, W)
    rgbm[..., 3] = np.where(hasc, 255, 0).astype(np.uint8)
    outm = out.with_name(out.stem + "_mean.tif")
    with rasterio.open(str(outm), "w", driver="GTiff", width=W, height=H, count=4,
                       dtype="uint8", crs="EPSG:32650", transform=transform,
                       compress="deflate", photometric="RGB") as dst:
        for i in range(4):
            dst.write(rgbm[..., i], i + 1)

    fill = 100.0 * has.sum() / N
    print("\n写出 %s（%.1f MB）  有值像素 %.1f%%" % (out, out.stat().st_size / 1e6, fill))
    print("写出 %s（%.1f MB）" % (outm, outm.stat().st_size / 1e6))


if __name__ == "__main__":
    main()

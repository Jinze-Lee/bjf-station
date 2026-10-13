# -*- coding: utf-8 -*-
"""
把正射影像切成网页瓦片（XYZ / EPSG:3857），供 Leaflet 深度缩放

输入：E:\\lidar_3d_build\\ortho_010.tif（EPSG:32650 的真彩正射影像）
输出：E:\\网页制作\\ortho_tiles\\{z}\\{x}\\{y}.webp（带 alpha，空洞透明）

先重投影到 EPSG:3857（Web Mercator，Leaflet 的坐标系），再按标准 XYZ 瓦片切。
用法：python 生成正射瓦片.py [zmin] [zmax]
"""

import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from scipy import ndimage
from PIL import Image

SRC = Path(r"E:\lidar_3d_build\ortho_010_mean.tif")
OUT = Path(r"E:\网页制作\ortho_tiles")
TILE = 256
R = 6378137.0
ORIGIN = math.pi * R          # 20037508.342789244
WORLD = 2 * ORIGIN


def fill_small_holes(arr, max_px=3):
    """补掉小空洞：点云在 0.10 m 下约 22 点/像素，但仍有零星空像素，直接出图是「抖」的。
    用最近的有效像素补 3px 以内的洞，外面成片的空白保持透明。"""
    valid = arr[3] > 0
    if valid.all() or not valid.any():
        return arr
    dist, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
    fill = (~valid) & (dist <= max_px)
    n = int(fill.sum())
    if n:
        for i in range(3):
            arr[i][fill] = arr[i][iy[fill], ix[fill]]
        arr[3][fill] = 255
    print("  补洞 %d 像素（%.2f%%）" % (n, 100.0 * n / arr[0].size), flush=True)
    return arr


def reproject_to_mercator(src, arr):
    dst_crs = "EPSG:3857"
    transform, width, height = calculate_default_transform(
        src.crs, dst_crs, src.width, src.height, *src.bounds)
    dst = np.zeros((4, height, width), np.uint8)
    for i in range(4):
        reproject(
            source=arr[i], destination=dst[i],
            src_transform=src.transform, src_crs=src.crs,
            dst_transform=transform, dst_crs=dst_crs,
            resampling=Resampling.bilinear, dst_nodata=0)
    return dst, transform, width, height


def main():
    zmin = int(sys.argv[1]) if len(sys.argv) > 1 else 14
    zmax = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    OUT.mkdir(parents=True, exist_ok=True)

    with rasterio.open(str(SRC)) as src:
        arr = src.read()
        arr = fill_small_holes(arr)
        arr, transform, W, H = reproject_to_mercator(src, arr)
        print("mercator %d x %d" % (W, H), flush=True)

    # 影像四角在 mercator 里的范围
    def px2mx(px, py):
        return transform.c + px * transform.a, transform.f + py * transform.e
    x0, y1 = px2mx(0, 0)          # 左上
    x1, y0 = px2mx(W, H)          # 右下
    print("mercator bounds X %.1f~%.1f  Y %.1f~%.1f" % (x0, x1, y0, y1), flush=True)

    n = 0
    for z in range(zmin, zmax + 1):
        res = WORLD / (TILE * (2 ** z))          # mercator m / px
        tx0 = int((x0 + ORIGIN) // (TILE * res))
        tx1 = int((x1 + ORIGIN) // (TILE * res))
        ty0 = int((ORIGIN - y1) // (TILE * res))
        ty1 = int((ORIGIN - y0) // (TILE * res))
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                # 该瓦片的 mercator 范围
                mx0 = tx * TILE * res - ORIGIN
                mx1 = (tx + 1) * TILE * res - ORIGIN
                my1 = ORIGIN - ty * TILE * res
                my0 = ORIGIN - (ty + 1) * TILE * res
                # 映射到影像像素窗口
                c0 = (mx0 - transform.c) / transform.a
                c1 = (mx1 - transform.c) / transform.a
                r0 = (my1 - transform.f) / transform.e
                r1 = (my0 - transform.f) / transform.e
                cc0, cc1 = max(0, int(math.floor(c0))), min(W, int(math.ceil(c1)))
                rr0, rr1 = max(0, int(math.floor(r0))), min(H, int(math.ceil(r1)))
                if cc1 <= cc0 or rr1 <= rr0:
                    continue
                sub = arr[:, rr0:rr1, cc0:cc1]
                if sub.shape[1] == 0 or sub.shape[2] == 0:
                    continue
                if not sub[3].any():
                    continue                       # 全透明，跳过
                img = Image.fromarray(np.transpose(sub, (1, 2, 0)), "RGBA")
                # 放到整块瓦片里的正确位置（边缘瓦片会留透明）
                canvas = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                ox = int(round(c0 - cc0)) + 0
                oy = int(round(r0 - rr0)) + 0
                canvas.paste(img, (ox, oy))
                d = OUT / str(z) / str(tx)
                d.mkdir(parents=True, exist_ok=True)
                canvas.save(d / ("%d.webp" % ty), "WEBP", quality=82, method=5)
                n += 1
        print("  z=%d 完成（累计 %d 块）" % (z, n), flush=True)

    total = sum(f.stat().st_size for f in OUT.rglob("*.webp"))
    print("\n共 %d 块，%.1f MB" % (n, total / 1e6))


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""把样地 DEM 导出成三维页用的小高程网格 3d/dem.json

用途：三维页的「影像地面」要按真实地形起伏铺，不能是一块平板。
      DEM_0228.tif 只覆盖样地（652x768 m），周边用全球高程瓦片（terrarium）补，
      样地内则用这张高精 DEM 覆盖。

输出：{ bounds:[E0,N0,E1,N1], nx, ny, z:[...] }（行主序，行 0 = 北边；nodata 已插补）

用法：python 工具/生成地面高程.py
"""
from pathlib import Path

import numpy as np
import rasterio

DEM = Path(r"G:\Forlijinze\DEM_0228.tif")
OUT = Path(__file__).resolve().parent.parent / "3d" / "dem.json"
N = 200          # 采样格数（样地 650 m -> 约 3.3 m/点，够用）


def main():
    with rasterio.open(DEM) as s:
        a = s.read(1).astype(np.float64)
        b = s.bounds
        nodata = s.nodata
    if nodata is not None:
        a[a == nodata] = np.nan
    a[a < -1000] = np.nan
    # 空洞用最近有效值填（简单的前后向填充）
    if np.isnan(a).any():
        idx = np.where(~np.isnan(a))
        if len(idx[0]) == 0:
            raise SystemExit("DEM 全为空")
        from scipy import ndimage
        ind = ndimage.distance_transform_edt(np.isnan(a), return_distances=False, return_indices=True)
        a = a[tuple(ind)]

    # 重采样到 N x N（行 0 = 北边）
    yi = np.linspace(0, a.shape[0] - 1, N).astype(int)
    xi = np.linspace(0, a.shape[1] - 1, N).astype(int)
    z = a[np.ix_(yi, xi)]
    z = np.round(z, 2)

    import json
    obj = {"bounds": [round(b.left, 2), round(b.bottom, 2), round(b.right, 2), round(b.top, 2)],
           "nx": N, "ny": N, "z": z.reshape(-1).tolist()}
    OUT.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    print("写出 %s（%.1f KB）" % (OUT, OUT.stat().st_size / 1024))
    print("范围 E %.0f~%.0f  N %.0f~%.0f" % (b.left, b.right, b.bottom, b.top))
    print("高程 %.1f ~ %.1f m" % (z.min(), z.max()))


if __name__ == "__main__":
    main()

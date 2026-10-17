# -*- coding: utf-8 -*-
"""把三维地面/台站地形所需的「全球高程」提前烘焙成本地文件，去掉对 AWS terrarium 的运行期依赖
（国内访问 s3.amazonaws.com 经常失败，之前会导致地面退化成一块平板）。

输出：
  3d/terrain.json      东灵山地面（4.5 km，225x225）
  3d/terrain_xwt.json  小五台局部（4 km，81x81）
  3d/terrain_tl.json   驼梁局部（4 km，81x81）
格式：{ bounds:[E0,N0,E1,N1], n, z:[按行主序，行0=北边] }

用法：python 工具/烘焙地形高程.py
"""
import io
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from rasterio.warp import transform as rio

ROOT = Path(__file__).resolve().parent.parent
PROXY = "http://127.0.0.1:12450"
Z_TILES = 12
op = urllib.request.build_opener(urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
op.addheaders = [("User-Agent", "Mozilla/5.0")]

# 三个区域的中心（UTM50N）与半幅
TARGETS = [
    ("terrain.json",     365600.0, 4424400.0, 2262.5, 224),   # 东灵山地面 4.5 km（面积 2×）
    ("terrain_xwt.json", None, None, 2000.0, 80),             # 小五台（下面按站点填）
    ("terrain_tl.json",  None, None, 2000.0, 80),             # 驼梁
]
STATIONS = json.loads((ROOT / "js" / "stations.js").read_text(encoding="utf-8").split("=", 1)[1].rstrip(";\n")) \
    if False else None

# 站点中心从 stations.js 里取
import re
txt = (ROOT / "js" / "stations.js").read_text(encoding="utf-8")
st = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
for key, fn in (("xiaowutai", "terrain_xwt.json"), ("tuoliang", "terrain_tl.json")):
    e, n = rio("EPSG:4326", "EPSG:32650", [st[key]["lon"]], [st[key]["lat"]])
    for i, t in enumerate(TARGETS):
        if t[0] == fn:
            TARGETS[i] = (fn, float(e[0]), float(n[0]), 2000.0, 80)


def merc(lat, lon):
    r = math.radians(lat)
    return ((lon + 180) / 360, (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2)


def fetch_terrarium(lat_min, lat_max, lon_min, lon_max):
    n = 2 ** Z_TILES
    x0 = int((lon_min + 180) / 360 * n); x1 = int((lon_max + 180) / 360 * n)
    y0 = int(merc(lat_max, 0)[1] * n); y1 = int(merc(lat_min, 0)[1] * n)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    print("   高程瓦片 %dx%d" % (nx, ny))
    from PIL import Image
    big = np.zeros((ny * 256, nx * 256), dtype=np.float32)
    for ix in range(nx):
        for iy in range(ny):
            url = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (Z_TILES, x0 + ix, y0 + iy)
            for attempt in range(4):
                try:
                    b = op.open(url, timeout=40).read()
                    a = np.asarray(Image.open(io.BytesIO(b)).convert("RGB"), dtype=np.float32)
                    z = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
                    big[iy * 256:(iy + 1) * 256, ix * 256:(ix + 1) * 256] = z
                    break
                except Exception as ex:
                    if attempt == 3:
                        raise
                    time.sleep(2)
    return big, (x0, y0, nx, ny, 256)


def main():
    only = set(sys.argv[1:])            # 可选：只烘指定文件，如 python 工具/烘焙地形高程.py terrain.json
    for fn, cx, cy, half, n in TARGETS:
        if only and fn not in only:
            continue
        print("== %s  中心 %.0f,%.0f  半幅 %.0f m  %dx%d" % (fn, cx, cy, half, n + 1, n + 1))
        E0, N0, E1, N1 = cx - half, cy - half, cx + half, cy + half
        lons, lats = rio("EPSG:32650", "EPSG:4326", [E0, E1, E0, E1], [N0, N0, N1, N1])
        big, (tx0, ty0, tnx, tny, ts) = fetch_terrarium(min(lats), max(lats), min(lons), max(lons))
        z = np.zeros((n + 1, n + 1), dtype=np.float32)
        for j in range(n + 1):                      # 行 0 = 北边
            for i in range(n + 1):
                E = E0 + (E1 - E0) * i / n
                N = N1 - (N1 - N0) * j / n
                lo, la = rio("EPSG:32650", "EPSG:4326", [E], [N])
                m = merc(la[0], lo[0])
                px = m[0] * (2 ** Z_TILES) * ts - tx0 * ts
                py = m[1] * (2 ** Z_TILES) * ts - ty0 * ts
                xi = int(max(0, min(big.shape[1] - 1, round(px))))
                yi = int(max(0, min(big.shape[0] - 1, round(py))))
                z[j, i] = big[yi, xi]
        obj = {"bounds": [round(E0, 1), round(N0, 1), round(E1, 1), round(N1, 1)],
               "n": n, "z": np.round(z, 1).reshape(-1).tolist()}
        (ROOT / "3d" / fn).write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
        print("   写出 3d/%s（%.0f KB），高程 %.0f~%.0f m"
              % (fn, (ROOT / "3d" / fn).stat().st_size / 1024, z.min(), z.max()))


if __name__ == "__main__":
    main()

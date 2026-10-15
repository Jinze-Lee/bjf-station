# -*- coding: utf-8 -*-
"""算两个设施点：
① 温室气体：格网里 T08 所在那条「行」从右往左第 9 格，与它正上方那格，两者中心的
   中点（= 上下交界边的中点）。
② 土壤呼吸：综合林六边形朝东、最接近南北向的那条边，从南端往北 3/5 处。
输出到 js/facilities.js 与 3d/facilities.json。"""
import json
import math
from pathlib import Path

import numpy as np
from rasterio.warp import transform as rio

R = Path(r"E:\网页制作")
B = json.loads((R / "3d" / "bounds.json").read_text(encoding="utf-8"))
A = json.loads((R / "3d" / "annotations.json").read_text(encoding="utf-8"))
MT = [(m["name"], m["E"], m["N"]) for m in A["maintrees"] if m.get("E") is not None]


def centre(poly):
    pts = poly[:-1] if len(poly) > 1 and poly[0][:2] == poly[-1][:2] else poly
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


cells = [centre(c["pts"]) for c in B["grid20"]]
# 格网轴：用最近邻向量中位角（取更接近东西向的那条）
C = np.array(cells)
from scipy.spatial import cKDTree
_d, idx = cKDTree(C).query(C, k=2)
vec = C[idx[:, 1]] - C
th = float(np.median(np.mod(np.arctan2(vec[:, 1], vec[:, 0]), math.pi)))
if th > math.pi / 4:
    th -= math.pi / 2                     # 取更接近东西向的轴
c, s = math.cos(th), math.sin(th)
print("格网行方向 %.1f°（相对东西向）" % math.degrees(th))

uv = np.stack([C[:, 0] * c + C[:, 1] * s, -C[:, 0] * s + C[:, 1] * c], 1)

# T08 所在格（最东那格）
i0 = int(np.argmax(C[:, 0]))
print("T08 格: E %.1f N %.1f" % (C[i0][0], C[i0][1]))
# 同行：v 相近
row = [i for i in range(len(uv)) if abs(uv[i, 1] - uv[i0, 1]) < 10]
row.sort(key=lambda i: -uv[i, 0])
print("T08 所在行 %d 格，T08 在行内第 %d 位（1=最右）" % (len(row), row.index(i0) + 1))
tgt = row[8] if len(row) >= 9 else row[-1]
print("从右往左第 9 格: E %.1f N %.1f" % (C[tgt][0], C[tgt][1]))
# 正上方那格：u 相同、v 大约 +20
want = np.array([uv[tgt, 0], uv[tgt, 1] + 20.0])
up = int(np.argmin(((uv - want) ** 2).sum(1)))
print("上方那格: E %.1f N %.1f  （相距 %.1f m）"
      % (C[up][0], C[up][1], np.hypot(C[up][0] - C[tgt][0], C[up][1] - C[tgt][1])))
ghg = ((C[tgt][0] + C[up][0]) / 2, (C[tgt][1] + C[up][1]) / 2)
print("→ 温室气体点 = 两格中心的中点: E %.1f N %.1f" % ghg)

# ② 土壤呼吸：综合林六边形朝东、最接近南北向的边，自南端往北 3/5
zhl = None
for g in B["boundaries"]:
    if g["name"] == "综合林":
        zhl = g["pts"]
best = None
for i in range(len(zhl) - 1):
    e0, n0 = zhl[i][0], zhl[i][1]
    e1, n1 = zhl[i + 1][0], zhl[i + 1][1]
    de, dn = e1 - e0, n1 - n0
    L = math.hypot(de, dn)
    if L < 1:
        continue
    # 与南北方向（0° 为北）的夹角
    bearing = math.degrees(math.atan2(de, dn))          # 0=北, 90=东
    dev = min(abs(bearing), abs(abs(bearing) - 180))
    east = (e0 + e1) / 2 - sum(p[0] for p in zhl) / len(zhl)
    score = dev - east * 0.02                            # 越接近南北向、越靠东越好
    print("  边 %d: (%.0f,%.0f)-(%.0f,%.0f) 长 %.1f 方位 %.0f° 偏离南北 %.0f° 东偏 %.0f m"
          % (i, e0, n0, e1, n1, L, bearing % 360, dev, east))
    if best is None or score < best[0]:
        best = (score, i, (e0, n0), (e1, n1))
_, bi, p0, p1 = best
south, north = (p0, p1) if p0[1] < p1[1] else (p1, p0)
resp = (south[0] + (north[0] - south[0]) * 0.6, south[1] + (north[1] - south[1]) * 0.6)
print("→ 土壤呼吸点（选边 %d，自南往北 3/5）: E %.1f N %.1f" % (bi, resp[0], resp[1]))


def out(name, nameen, E, N):
    lo, la = rio("EPSG:32650", "EPSG:4326", [E], [N])
    print("   %-12s UTM %.0f,%.0f -> %.6f,%.6f" % (name, E, N, la[0], lo[0]))
    return ({"name": name, "nameEn": nameen, "lat": round(la[0], 7), "lon": round(lo[0], 7)},
            {"name": name, "nameEn": nameen, "E": round(E, 2), "N": round(N, 2)})


p2, p3 = out("土壤温室气体分析仪", "Soil GHG analyser", *ghg)
r2, r3 = out("土壤呼吸监测系统", "Soil respiration", *resp)
(R / "js" / "facilities.js").write_text(
    "/* 监测设施点 —— 位置按金总口述定位（工具/生成设施点.py）：\n"
    " * 温室气体 = 20m 格网「T08 所在行从右往左第 9 格」与其正上方格中心的中点；\n"
    " * 土壤呼吸 = 综合林六边形朝东最接近南北向的边、自南端往北 3/5 处。 */\n"
    "var FACILITIES = " + json.dumps({"points": [p2, r2]}, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8")
(R / "3d" / "facilities.json").write_text(
    json.dumps({"points": [p3, r3]}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("写出 js/facilities.js 与 3d/facilities.json")

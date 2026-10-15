# -*- coding: utf-8 -*-
"""生成其他台站的样地数据 js/stations.js（小五台 / 驼梁）

来源与做法与「展板设计」那次完全一致（见 E:\\plot_poster\\脚本\\build_poster_v14.py）：
  - 驼梁：tuoliang.csv 的 7 个实测点 -> 最小面积外接矩形
  - 小五台：xiaowutai.csv 的 8 个实测点 -> 最小面积外接矩形；
            另加一个估计框（图钉=正方形左上角、逆时针转 45° 的菱形，待现场核实）
  - 站心坐标沿用展板里那份

输出 js/stations.js（经纬度 WGS-84）。用法：python 工具/生成台站样地.py
"""
import json
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WX = r"D:\微信聊天记录\xwechat_files\wxid_ifr9g26z6cjk22_ba29\msg\file\2026-10"

STATIONS = {
    "tuoliang": {"zh": "驼梁", "en": "Mt. Tuoliang", "lat": 38.7049, "lon": 113.7310, "color": "#ff8000"},
    "xiaowutai": {"zh": "小五台", "en": "Mt. Xiaowutai", "lat": 39.9616, "lon": 115.0698, "color": "#00aaff"},
}

# 小五台第二个样方（估计框：图钉 = 正方形左上角顶点，逆时针转 45° → 菱形；待现场核实）
XWT2_QUAD = [
    (39.9788060, 115.0748440),   # 西（= 图钉，原左上角）
    (39.9795096, 115.0757555),   # 北
    (39.9788060, 115.0766670),   # 东
    (39.9781024, 115.0757555),   # 南
]


def read_pts(path):
    pts = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = [p for p in re.split(r"[,\t]+", line) if p != ""]
            if len(parts) < 3 or "base" in parts[0].lower():
                continue
            try:
                pts.append((float(parts[1]), float(parts[2])))
            except ValueError:
                pass
    return pts


def min_area_rect_quad(pts_latlon):
    """与展板脚本同一套：0.5° 步长扫角度，取面积最小的外接矩形四角"""
    lat_c = sum(p[0] for p in pts_latlon) / len(pts_latlon)
    lon_c = sum(p[1] for p in pts_latlon) / len(pts_latlon)
    kx = 111320.0 * math.cos(math.radians(lat_c)); ky = 110540.0
    xs = [(lo - lon_c) * kx for _, lo in pts_latlon]
    ys = [(la - lat_c) * ky for la, _ in pts_latlon]
    best = None
    for i in range(0, 181):
        th = math.radians(i * 0.5); c, s = math.cos(th), math.sin(th)
        rx = [x * c + y * s for x, y in zip(xs, ys)]
        ry = [-x * s + y * c for x, y in zip(xs, ys)]
        area = (max(rx) - min(rx)) * (max(ry) - min(ry))
        if best is None or area < best[0]:
            best = (area, th, min(rx), max(rx), min(ry), max(ry))
    _, th, rx0, rx1, ry0, ry1 = best
    c, s = math.cos(th), math.sin(th)
    quad = []
    for xr, yr in [(rx0, ry0), (rx1, ry0), (rx1, ry1), (rx0, ry1)]:
        x = xr * c - yr * s
        y = xr * s + yr * c
        quad.append((lat_c + y / ky, lon_c + x / kx))
    return quad


def area_ha(pts):
    la = sum(p[0] for p in pts) / len(pts)
    kx = 111320.0 * math.cos(math.radians(la))
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += (a[1] * kx) * (b[0] * 110540.0) - (b[1] * kx) * (a[0] * 110540.0)
    return abs(s) / 2 / 10000.0


def main():
    pts_tl = read_pts(os.path.join(WX, "tuoliang.csv"))
    pts_xw = read_pts(os.path.join(WX, "xiaowutai.csv"))
    print("点位：驼梁 %d 个、小五台 %d 个" % (len(pts_tl), len(pts_xw)))

    quad_tl = min_area_rect_quad(pts_tl)
    quad_xw = min_area_rect_quad(pts_xw)

    out = {}
    for key, meta in STATIONS.items():
        plots = []
        if key == "tuoliang":
            plots.append({"nameZh": "驼梁样方", "name": "Tuoliang plot",
                          "pts": [[round(a, 6), round(b, 6)] for a, b in quad_tl], "est": False})
        else:
            plots.append({"nameZh": "小五台样方", "name": "Xiaowutai plot",
                          "pts": [[round(a, 6), round(b, 6)] for a, b in quad_xw], "est": False})
            plots.append({"nameZh": "小五台样方二（估计）", "name": "Xiaowutai plot 2 (estimated)",
                          "pts": [[round(a, 6), round(b, 6)] for a, b in XWT2_QUAD], "est": True})
        out[key] = {"nameZh": meta["zh"], "name": meta["en"], "lat": meta["lat"], "lon": meta["lon"],
                    "color": meta["color"], "plots": plots}
        for p in plots:
            print("  %s %s  面积 %.2f ha" % (meta["zh"], p["nameZh"], area_ha([tuple(q) for q in p["pts"]])))

    (ROOT / "js" / "stations.js").write_text(
        "/* 其他台站的样地（小五台 / 驼梁）—— 由 工具/生成台站样地.py 生成，勿手改。\n"
        " * 做法与「展板设计」一致：实测点拟合的最小外接矩形；小五台第二个样方是估计框。\n"
        " * 经纬度 WGS-84。 */\n"
        "var STATIONS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print("写出 js/stations.js")


if __name__ == "__main__":
    main()

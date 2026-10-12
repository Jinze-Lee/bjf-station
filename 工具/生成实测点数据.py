# -*- coding: utf-8 -*-
"""
生成 ../js/survey-points.js —— RTK 实测点（主树 + 样方内树）

输入：G:\\Forlijinze\\DLS_RTK0613_maintree.shp
      G:\\Forlijinze\\DLS_RTK0613_pin.shp
输出：js/survey-points.js

背景
----
这批点是无人机 LiDAR / 正射影像的野外地面真值：
  · maintree —— 打了号牌的「主树」（每次调查的焦点树）
  · pin      —— 主树旁边样方内逐棵实测的树

坐标本身就是 WGS-84 经纬度（shapefile 的 .prj 声明 GCS_WGS_1984），
和 trees.js 一致，因此本文件只存 WGS-84 原始值；
高德瓦片需要的 GCJ-02 偏移由 map.js 在运行时施加。

数据清洗（2026-10-10 用户确认）
----------------------------
pin 里 619 条只有 318 条是真实测点：
  · 36 条坐标为 (0, 0)         —— 空值，丢弃
  · 265 条坐标全是 (39.96,115.4) —— 明显是没测随手填的占位值，丢弃
maintree 104 条里 1 条为 (0,0)，丢弃，保留 103 条。

复现：python 生成实测点数据.py
"""

import re
import shapefile
from pathlib import Path

SRC_DIR = Path(r"G:\Forlijinze")
OUT = Path(__file__).resolve().parent.parent / "js" / "survey-points.js"

# 样地范围（用来剔除落在范围外的占位值）。取自实测点的真实分布。
LAT_MIN, LAT_MAX = 39.955, 39.966
LON_MIN, LON_MAX = 115.420, 115.432

# 名字后缀里的树种（pinyin -> 中文名），暂只发现这两种
SPECIES_SUFFIX = {
    "wujiaof": "五角枫",
    "hutaoqiu": "胡桃楸",
}


def parse_name(raw):
    """T08_wujiaof -> ('T08', '五角枫')；无后缀的 -> (raw, '')"""
    m = re.match(r"^(.*)_([a-z]+)$", raw)
    if m and m.group(2) in SPECIES_SUFFIX:
        return m.group(1), SPECIES_SUFFIX[m.group(2)]
    return raw, ""


def valid(lat, lon):
    """真实测点：落在样地范围内（同时排除 (0,0) 与 (39.96,115.4) 占位值）"""
    return (lat != 0.0 and lon != 0.0
            and LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX)


def load(shp):
    r = shapefile.Reader(str(shp), encoding="latin1")
    out = []
    for rec in r.records():
        name, lat, lon, h = rec[0], rec[1], rec[2], rec[3]
        if not valid(lat, lon):
            continue
        clean, species = parse_name(name)
        out.append({"name": clean, "raw": name, "lat": round(lat, 7),
                    "lon": round(lon, 7), "h": round(h, 1), "species": species})
    return out


def js_pt(p, indent="        "):
    return ("%s{ name: %r, lat: %.7f, lon: %.7f, h: %.1f, species: %r },"
            % (indent, p["name"], p["lat"], p["lon"], p["h"], p["species"]))


def main():
    mt_raw = shapefile.Reader(str(SRC_DIR / "DLS_RTK0613_maintree.shp"), encoding="latin1")
    pin_raw = shapefile.Reader(str(SRC_DIR / "DLS_RTK0613_pin.shp"), encoding="latin1")
    n_mt = len(mt_raw.records())
    n_pin = len(pin_raw.records())

    maintrees = load(SRC_DIR / "DLS_RTK0613_maintree.shp")
    plot_trees = load(SRC_DIR / "DLS_RTK0613_pin.shp")

    # 由 pin 点推「样方框」：按主树分组，取凸包（Andrew 单调链，保证不自交）
    def hull(points):
        pts = sorted(set(points))
        if len(pts) < 3:
            return []
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

    groups = {}
    for p in plot_trees:
        base = re.sub(r"(?i)pin\d+$", "", p["name"])
        groups.setdefault(base, []).append((p["lat"], p["lon"]))
    quadrats = []
    for base, pts in groups.items():
        h = hull(pts)
        if len(h) >= 3:
            quadrats.append({"name": base, "pts": [[round(a, 7), round(b, 7)] for a, b in h]})
    print("  样方框（由 pin 凸包）: %d 个，共 %d 个 pin 点"
          % (len(quadrats), sum(len(v) for v in groups.values())))

    print("=== 数据清洗 ===")
    print("  maintree: %d -> 保留 %d（丢弃 %d）" % (n_mt, len(maintrees), n_mt - len(maintrees)))
    print("  pin     : %d -> 保留 %d（丢弃 %d）" % (n_pin, len(plot_trees), n_pin - len(plot_trees)))

    # 一致性自检：清洗后不应再有落在范围外的点
    for tag, arr in (("maintree", maintrees), ("pin", plot_trees)):
        bad = [p for p in arr if not valid(p["lat"], p["lon"])]
        if bad:
            raise SystemExit("!! %s 清洗后仍有 %d 个越界点" % (tag, len(bad)))
    if not maintrees or not plot_trees:
        raise SystemExit("!! 清洗后为空，请检查源文件路径")

    lines = []
    lines.append("""/* RTK 实测点 —— 由 工具/生成实测点数据.py 生成，请勿手工编辑。
 *
 * 来源：G:\\Forlijinze\\DLS_RTK0613_maintree.shp（主树）
 *       G:\\Forlijinze\\DLS_RTK0613_pin.shp（样方内树）
 * 坐标即 WGS-84 经纬度；GCJ-02 偏移由 map.js 运行时施加。
 *
 * 已丢弃空值 / 占位值点（详见生成脚本说明）。
 */

var SURVEY = {
    source: 'RTK survey (DLS_RTK0613)',
    maintrees: [""")
    for p in maintrees:
        lines.append(js_pt(p))
    lines.append("    ],\n    plotTrees: [")
    for p in plot_trees:
        lines.append(js_pt(p))
    lines.append("    ],\n    quadrats: [")
    for q in quadrats:
        lines.append("        { name: %r, pts: %r }," % (q["name"], q["pts"]))
    lines.append("    ]\n};\n")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("\n写出: %s" % OUT)
    print("  主树 %d 个，样方内树 %d 个" % (len(maintrees), len(plot_trees)))

    def rng(arr):
        las = [p["lat"] for p in arr]; los = [p["lon"] for p in arr]
        return "%.5f~%.5f N, %.5f~%.5f E" % (min(las), max(las), min(los), max(los))
    print("  主树范围: %s" % rng(maintrees))
    print("  样方范围: %s" % rng(plot_trees))


if __name__ == "__main__":
    main()

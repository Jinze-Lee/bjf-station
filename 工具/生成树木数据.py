# -*- coding: utf-8 -*-
"""
生成 ../js/trees.js —— 20 棵被监测树木的元数据（含坐标转换）

输入：本文件内嵌的实测表（数采编号、投影坐标、树种、周长、胸径）
输出：js/trees.js

坐标转换说明
------------
原始坐标来自 datataker 手簿，坐标系设置为：
    名称        China CGCS 2000
    投影模型     高斯投影 (Gauss-Kruger)
    中央子午线   117°00'00"E
    长度比       1.0            <- 关键：不是 UTM 的 0.9996
    东向加常数   500000.0 m
    北向加常数   0.0 m

因此使用 EPSG:4548 (CGCS2000 / 3-degree Gauss-Kruger CM 117E)。
注意：3 度带与 6 度带在中央子午线、长度比、加常数都相同时，数学结果完全一致，
      所以这里用哪个 EPSG 标签不影响换算值。

若误按 UTM 50N (长度比 0.9996) 换算，北坐标会偏 1771 m —— 已实测确认。

数据更正记录（用户 2026-07-27 核对原始记录本后提供）
--------------------------------------------------
    DT1-LDL1-1155  周长 89.51 -> 69.51
    DT2-MD1-1131   周长 71.03 -> 77.03
    DT3-SY1-1152   周长 115.34 -> 80.49, 胸径 36.89 -> 25.55
更正后 20 棵全部满足 胸径 ≈ 周长/π（最大偏差 2.5%）。

复现：python 生成树木数据.py
"""

import math
from pathlib import Path
from pyproj import Transformer

OUT = Path(__file__).resolve().parent.parent / "js" / "trees.js"
EPSG_SRC = "EPSG:4548"      # CGCS2000 / Gauss-Kruger CM 117E, k=1.0

# 样点说明（数采 -> 中英文名称）
#
# color 要同时满足两个场合，两边都不能妥协：
#   ① 地图标记 —— 压在高德卫星影像上。影像本身是绿褐色调，所以样点绿不能太深，
#      否则整个点糊进植被里看不见（#3d5a45 实测就是这个下场）。
#   ② 正文里的 .key 色标 —— 白底上的实心小徽标，配白字，对比度要够。
#      #4a7c59 配白字实测 4.86:1，达标。
# 与 css/style.css 里的 --dt1/--dt2/--dt3 保持一致，改一处要同步改另一处。
PLOTS = {
    "DT1": {"zh": "综合林样地",        "en": "Mixed forest plot",                  "color": "#4a7c59"},
    "DT2": {"zh": "落叶松样地",        "en": "Larch plot",                         "color": "#2c6e8f"},
    "DT3": {"zh": "气象站下方样地",    "en": "Plot below the meteorological station", "color": "#c2703d"},
}

# 树种：中文名 -> (拉丁名, 英文名, 木材解剖类型)
SPECIES = {
    "白桦":   ("Betula platyphylla",                      "Asian white birch",   "diffuse-porous"),
    "黑桦":   ("Betula dahurica",                         "Dahurian birch",      "diffuse-porous"),
    "辽东栎": ("Quercus wutaishanica",                    "Liaodong oak",        "ring-porous"),
    "蒙椴":   ("Tilia mongolica",                         "Mongolian lime",      "diffuse-porous"),
    "五角枫": ("Acer pictum subsp. mono",                 "Painted maple",       "diffuse-porous"),
    "胡桃楸": ("Juglans mandshurica",                     "Manchurian walnut",   "semi-ring-porous"),
    "落叶松": ("Larix gmelinii var. principis-rupprechtii", "Prince Rupprecht larch", "coniferous"),
    "山杨":   ("Populus davidiana",                       "David poplar",        "diffuse-porous"),
}

# id, 北(m), 东(m), 数采, 探头编号, 网关id, 树种中文, 周长(cm), 胸径(cm)
TREES = [
    ("DT1-BH1-1137",  4426002.61262, 365452.67750, "DT1", "BH1",  1137, "白桦",   45.65, 14.58),
    ("DT1-BH2-1132",  4426014.83121, 365445.69431, "DT1", "BH2",  1132, "白桦",   58.46, 18.59),
    ("DT1-HH1-1140",  4426007.44819, 365451.24713, "DT1", "HH1",  1140, "黑桦",   44.93, 14.32),
    ("DT1-LDL1-1155", 4425999.62847, 365447.18554, "DT1", "LDL1", 1155, "辽东栎", 69.51, 22.08),
    ("DT1-LDL2-1134", 4425993.98940, 365448.97585, "DT1", "LDL2", 1134, "辽东栎", 96.31, 31.05),
    ("DT1-MD1-1149",  4426013.43720, 365444.32482, "DT1", "MD1",  1149, "蒙椴",   71.10, 22.34),
    ("DT1-WJF1-1135", 4426001.39780, 365447.77158, "DT1", "WJF1", 1135, "五角枫", 89.91, 28.62),

    ("DT2-HTQ1-1248", 4426115.65242, 365498.18538, "DT2", "HTQ1", 1248, "胡桃楸", 74.55, 24.32),
    ("DT2-HTQ2-1157", 4426102.30256, 365511.77931, "DT2", "HTQ2", 1157, "胡桃楸", 90.03, 28.64),
    ("DT2-LYS1-1144", 4426106.20663, 365510.68498, "DT2", "LYS1", 1144, "落叶松", 48.15, 15.27),
    ("DT2-LYS2-1151", 4426110.96033, 365503.31696, "DT2", "LYS2", 1151, "落叶松", 60.78, 19.34),
    ("DT2-MD1-1131",  4426108.48086, 365511.74804, "DT2", "MD1",  1131, "蒙椴",   77.03, 24.46),
    ("DT2-MD2-1249",  4426117.40439, 365497.32599, "DT2", "MD2",  1249, "蒙椴",   74.82, 23.73),
    ("DT2-WJF1-1141", 4426101.65979, 365517.06643, "DT2", "WJF1", 1141, "五角枫", 43.12, 13.72),

    ("DT3-HH1-1142",  4426258.79027, 365717.14626, "DT3", "HH1",  1142, "黑桦",   43.88, 13.64),
    ("DT3-HTQ1-1153", 4426274.05695, 365733.21175, "DT3", "HTQ1", 1153, "胡桃楸", 61.49, 19.75),
    ("DT3-HTQ2-1139", 4426264.13242, 365734.56554, "DT3", "HTQ2", 1139, "胡桃楸", 79.44, 25.26),
    ("DT3-LYS1-1150", 4426255.26951, 365718.82965, "DT3", "LYS1", 1150, "落叶松", 50.82, 16.17),
    ("DT3-SY1-1152",  4426264.73558, 365727.17788, "DT3", "SY1",  1152, "山杨",   80.49, 25.55),
    ("DT3-SY2-1138",  4426268.38789, 365725.83198, "DT3", "SY2",  1138, "山杨",  115.34, 36.89),
]

# 数采本体位置
LOGGERS = [
    ("DT1", 4426003.95244, 365442.52341),
    ("DT2", 4426105.19634, 365504.49016),
    ("DT3", 4426269.93710, 365733.10018),
]

tr = Transformer.from_crs(EPSG_SRC, "EPSG:4326", always_xy=True)


def to_wgs84(north, east):
    lon, lat = tr.transform(east, north)
    return round(lat, 7), round(lon, 7)


# 坐标保留 7 位小数。
#
# 曾经想降到 5 位（≈1.1 m）当作"少暴露一点仪器位置"的措施，实测否掉了：
#   · DT1-LDL1-1155 与 DT1-WJF1-1135 实际相距 1.86 m，5 位小数把它算成 1.11 m
#     —— 误差 0.75 m。地图专门缩到 z20 就是为了分开这些相邻的树，降精度会破坏它。
#   · 更要紧的是这根本不构成保护：能走到样地的人，坐标是 1 cm 还是 1.1 m
#     都一样找得到仪器。代价真实，收益为零。
# 真要限制，只能是不公开单树坐标（只给样点级），但那等于砍掉地图这个功能。


# ---- 一致性自检：胸径应 ≈ 周长/π -------------------------------------------
print("=== 胸径 / 周长 一致性自检 ===")
worst = 0.0
for t in TREES:
    c, d = t[7], t[8]
    calc = c / math.pi
    pct = abs(d - calc) / calc * 100
    worst = max(worst, pct)
    if pct > 5:
        raise SystemExit("!! %s 偏差 %.1f%%，请先核对数据" % (t[0], pct))
print("  20 棵全部通过，最大偏差 %.2f%%\n" % worst)

# ---- 生成 JS --------------------------------------------------------------
lines = []
lines.append("""/* 被监测树木元数据 —— 由 工具/生成树木数据.py 生成，请勿手工编辑。
 *
 * 坐标转换：原始为 CGCS2000 高斯-克吕格投影（中央子午线 117°E，长度比 1.0，
 * 东向加常数 500000），经 EPSG:4548 转为 WGS-84 经纬度。
 * 注意：若误按 UTM 50N（长度比 0.9996）换算，位置会北偏 1771 m。
 *
 * 地图上显示 GCJ-02 偏移由 map.js 在运行时完成，本文件只存 WGS-84 原始值。
 */
""")

lines.append("var PLOTS = {")
for k, v in PLOTS.items():
    lat, lon = to_wgs84(*[x for x in LOGGERS if x[0] == k][0][1:])
    lines.append("    %s: { name: %r, nameZh: %r, color: %r, lat: %.7f, lon: %.7f }," %
                 (k, v["en"], v["zh"], v["color"], lat, lon))
lines.append("};\n")

lines.append("var TREES = [")
for tid, n, e, plot, probe, gw, sp_zh, circ, dbh in TREES:
    lat, lon = to_wgs84(n, e)
    latin, en, wood = SPECIES[sp_zh]
    lines.append(
        "    { id: %r, plot: %r, probe: %r, gateway: %d,\n"
        "      species: %r, speciesZh: %r, commonName: %r, wood: %r,\n"
        "      circumference: %.2f, dbh: %.2f, lat: %.7f, lon: %.7f },"
        % (tid, plot, probe, gw, latin, sp_zh, en, wood, circ, dbh, lat, lon))
lines.append("];\n")

OUT.write_text("\n".join(lines), encoding="utf-8")

print("写出: %s" % OUT)
print("\n=== 换算后坐标（WGS-84）===")
for name, n, e in LOGGERS:
    lat, lon = to_wgs84(n, e)
    print("  %s 数采  %.6f N, %.6f E" % (name, lat, lon))
lats = [to_wgs84(t[1], t[2])[0] for t in TREES]
lons = [to_wgs84(t[1], t[2])[1] for t in TREES]
print("  20 棵树范围: %.6f–%.6f N, %.6f–%.6f E" % (min(lats), max(lats), min(lons), max(lons)))
print("  中心点: %.6f N, %.6f E" % ((min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2))

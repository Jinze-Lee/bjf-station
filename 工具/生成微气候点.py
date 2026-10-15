# -*- coding: utf-8 -*-
"""生成微气候点数据 —— 供二维地图与三维场景共用

输入：D:\\微信聊天记录\\...\\2026-10\\treesclusters_0501_50N_SpeID\\microclimate_location_CGCS2000.shp
      （9 个点 wqh1~wqh9，字段 名称/N/E/Z，投影 CGCS2000 3° 高斯 CM117E —— 不是 UTM，必须换算）

注意：形状文件里的 Z（1049~1105 m）与 LiDAR/点云基准不一致（和当初 RTK 的 H 同一个毛病，
差约 250 m），所以三维里只拿它当参考显示，落点高程仍按地形取。

输出：
  js/microclimate.js      二维：{ points:[{name, lat, lon, z}] }
  3d/microclimate.json    三维：{ points:[{name, E, N, z}] }   （E/N 为 UTM 50N）

用法：python 工具/生成微气候点.py
"""
import json
import re
from pathlib import Path

import shapefile
from rasterio.crs import CRS
from rasterio.warp import transform as rio_transform

W = Path(r"D:\微信聊天记录\xwechat_files\wxid_ifr9g26z6cjk22_ba29\msg\file\2026-10")
D = W / "treesclusters_0501_50N_SpeID"
SHP = D / "microclimate_location_CGCS2000.shp"
ROOT = Path(__file__).resolve().parent.parent


def main():
    src = CRS.from_wkt((D / "microclimate_location_CGCS2000.prj").read_text(encoding="utf-8"))
    print("源投影:", src.to_string()[:70])
    r = shapefile.Reader(str(SHP))
    fields = [f[0] for f in r.fields[1:]]
    name_i = fields.index("名称")
    pts2, pts3 = [], []
    for rec, sh in zip(r.records(), r.shapes()):
        E, N = sh.points[0]
        lon, lat = rio_transform(src, CRS.from_epsg(4326), [E], [N])
        uE, uN = rio_transform(src, CRS.from_epsg(32650), [E], [N])
        nm = str(rec[name_i]).strip()
        # wqh3 -> 微气候3（英文 Microclimate 3）：金总要求不显示 wqh 这种内部代号
        num = re.sub(r"^[^0-9]*", "", nm) or nm
        zh = "微气候" + num
        en = "Microclimate " + num
        z = round(float(rec[fields.index("Z")]), 2)
        pts2.append({"name": zh, "nameEn": en, "lat": round(lat[0], 7), "lon": round(lon[0], 7), "z": z})
        pts3.append({"name": zh, "nameEn": en, "E": round(uE[0], 2), "N": round(uN[0], 2), "z": z})
        print("  %-6s -> %-8s 原 %8.1f, %9.1f  ->  %.6f, %.6f   UTM %.0f, %.0f   原Z %.1f"
              % (nm, zh, E, N, lat[0], lon[0], uE[0], uN[0], z))

    (ROOT / "js" / "microclimate.js").write_text(
        "/* 微气候观测点（wqh1~wqh9）—— 由 工具/生成微气候点.py 生成，勿手改。\n"
        " * 源：microclimate_location_CGCS2000.shp（CGCS2000 3° 高斯 CM117E），已换算到 WGS-84。 */\n"
        "var MICROCLIMATE = " + json.dumps({"points": pts2}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "microclimate.json").write_text(
        json.dumps({"points": pts3}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("写出 js/microclimate.js 与 3d/microclimate.json")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""生成冠层 P（磷）反演数据 —— 供二维地图与三维场景做图层

输入：D:\\微信聊天记录\\...\\2026-10\\canopyP\\canopyP.shp
      （3779 个树冠多边形，与 treesclusters 同一套几何；每株 21 个日期的冠层 P 均值）
      D:\\...\\treesclusters_0501_50N_SpeID\\*.shp（取 Tree_IDnew 顺序，保证与树冠数据一一对应）

输出：
  js/canopyP.js     二维：{ dates:[...], unit:'', values:[[v,...] per 树冠] }
  3d/canopyP.json   三维：同上（索引与 3d/treestems.json 的 crowns 顺序一致）

用法：python 工具/生成冠层P数据.py
"""
import json
import re
from pathlib import Path

import shapefile

W = Path(r"D:\微信聊天记录\xwechat_files\wxid_ifr9g26z6cjk22_ba29\msg\file\2026-10")
TREES = W / "treesclusters_0501_50N_SpeID" / "treesclusters_0501_50N_SpeID.shp"
CANOPY = W / "canopyP" / "canopyP.shp"
ROOT = Path(__file__).resolve().parent.parent


def main():
    # 1) 树冠顺序（与 生成单木识别数据.py 的输出顺序一致：就是 shapefile 记录顺序）
    tr = shapefile.Reader(str(TREES))
    order = [int(r[0]) for r in tr.iterRecords()]        # Tree_IDnew
    print("树冠 %d 个，Tree_IDnew %d ~ %d" % (len(order), min(order), max(order)))

    # 2) 冠层 P：按 Tree_IDnew 取值
    cp = shapefile.Reader(str(CANOPY))
    fields = [f[0] for f in cp.fields[1:]]
    date_fields = [f for f in fields if re.match(r"^\d{4}_Mean$", f)]
    dates = ["%s-%s" % (f[0:2], f[2:4]) for f in date_fields]
    print("日期 %d 个：%s ... %s" % (len(dates), dates[0], dates[-1]))
    idx = {f: i for i, f in enumerate(fields)}
    by_id = {}
    for rec in cp.iterRecords():
        tid = int(rec[idx["Tree_IDnew"]])
        by_id[tid] = [round(float(rec[idx[f]]), 4) for f in date_fields]

    values = [by_id.get(t) for t in order]
    miss = sum(1 for v in values if v is None)
    print("对齐到树冠：命中 %d，缺 %d" % (len(values) - miss, miss))
    allv = [v for row in values if row for v in row]
    print("取值 %.4f ~ %.4f，中位 %.4f" % (min(allv), max(allv), sorted(allv)[len(allv) // 2]))

    obj = {"dates": dates, "values": values}
    (ROOT / "js" / "canopyP.js").write_text(
        "/* 冠层 P（磷）反演：每株树冠 21 个日期的均值 —— 由 工具/生成冠层P数据.py 生成，勿手改。\n"
        " * 索引与 js/treestems.js 的 crowns 一一对应（同为 Tree_IDnew 顺序）。 */\n"
        "var CANOPYP = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    (ROOT / "3d" / "canopyP.json").write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for f in ("js/canopyP.js", "3d/canopyP.json"):
        print("写出 %s（%.0f KB）" % (f, (ROOT / f).stat().st_size / 1024))


if __name__ == "__main__":
    main()

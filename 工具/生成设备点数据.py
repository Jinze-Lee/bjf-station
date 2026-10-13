# -*- coding: utf-8 -*-
"""
生成设备点数据 js/devices.js

源：金总提供的 dendrometer-sapflow-LAI.xlsx（2026-08 微信），三个 sheet：
  dendrometer 径向生长仪 78 个、sapflow 液流 26 个、LAI 叶面积 8 个，
  每个点都带 经度/纬度/海拔(m)。

输出：js/devices.js -> var DEVICES = { dendrometer: [...], sapflow: [...], lai: [...] }
     每项 { id, name, lat, lon, z, plot }。坐标 WGS-84，与 trees.js 一致。

用法：python 工具/生成设备点数据.py [xlsx路径]
"""

import sys
from pathlib import Path

import openpyxl

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    r"D:\微信聊天记录\xwechat_files\wxid_ifr9g26z6cjk22_ba29\msg\file\2026-08\dendrometer-sapflow-LAI.xlsx")
OUT = Path(__file__).resolve().parent.parent / "js" / "devices.js"


def rows(ws):
    it = ws.iter_rows(values_only=True)
    head = [str(h).strip() if h is not None else "" for h in next(it)]
    for r in it:
        if r is None or all(v is None for v in r):
            continue
        yield dict(zip(head, r))


def num(v):
    try:
        return round(float(v), 7)
    except (TypeError, ValueError):
        return None


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    out = {}

    ws = wb["dendrometer"]
    out["dendrometer"] = [
        {"id": r["记录ID"], "name": r["RTK记录名称"], "plot": r.get("样地") or "",
         "lon": num(r["经度"]), "lat": num(r["纬度"]), "z": num(r["海拔(m)"])}
        for r in rows(ws)]

    ws = wb["sapflow"]
    out["sapflow"] = [
        {"id": r["ID"], "name": r["名称"], "plot": r.get("样点") or "",
         "dev": r.get("安装设备") or "",
         "lon": num(r["经度"]), "lat": num(r["纬度"]), "z": num(r["海拔(m)"])}
        for r in rows(ws)]

    ws = wb["LAI"]
    out["lai"] = [
        {"id": r["ID"], "name": r["原始名称"], "plot": r.get("样点标记") or "",
         "lon": num(r["经度"]), "lat": num(r["纬度"]), "z": num(r["高度"])}
        for r in rows(ws)]

    import json
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "/* 设备点（径向生长仪 / 液流 / LAI）—— 由 工具/生成设备点数据.py 生成，请勿手改。\n"
        " * 源：dendrometer-sapflow-LAI.xlsx（金总 2026-08 提供）。坐标 WGS-84，z 为海拔(m)。 */\n"
        "var DEVICES = " + body + ";\n", encoding="utf-8")
    print("写出 %s" % OUT)
    for k, v in out.items():
        print("  %s: %d 个" % (k, len(v)))


if __name__ == "__main__":
    main()

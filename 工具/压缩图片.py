# -*- coding: utf-8 -*-
"""
压缩站点图片：按实际显示尺寸重采样 + 转 WebP。

背景
----
实测线上首屏传输 2.18 MB，其中图片约 1.6 MB（73%）。而且普遍过大：
台标 320x320 却只显示 52x52（6.2 倍），三个机构 logo 都是 4~5 倍，
画廊缩略图 460x345 只显示 110x129（4.2 倍）。

目标尺寸一律取「实际显示宽度 x 2」，兼顾高分屏；再大就是纯浪费。

net-bg.jpg 特殊：它在 style.css 里带 blur(2.5px) 滤镜，本来就是糊的背景，
所以砍到 1000px 宽肉眼看不出差别，省下的却最多。

WebP 兼容性
-----------
不做 <picture> 回退。本站已经在用 CSS 自定义属性、flex gap、Highcharts，
在不支持 WebP 的浏览器（IE11 及更早）上早就是全线崩的，加回退没有意义。
Chromium 系（含国内 QQ / UC / 360 / 搜狗浏览器）、Firefox、Safari 14+ 全部支持。

输入：images/*.jpg, *.png
输出：images/*.webp（原文件保留在 images/_原图/ 里，随时可回退）

用法：python 工具\\压缩图片.py [--apply]
      不加 --apply 只试算，不落盘。
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "images"
KEEP = IMG / "_原图"

# (文件名, 目标宽度, 质量)
# 目标宽度 = 页面实际显示宽度 x 2；None 表示不缩放，只换格式
PLAN = [
    # --- 首屏就要下的 ---
    ("logo-bfers.png",  128, 90),   # 显示 52x52，兼作 favicon
    ("logo-cas.png",    140, 90),   # 显示 68x42
    ("logo-ibcas.png",  130, 90),   # 显示 63x42
    ("logo-cern.png",   150, 90),   # 显示 75x42
    ("station.jpg",     600, 84),   # 实测只显示 300x225，原图 1400x1050 是 4.7 倍浪费
    ("net-bg.jpg",     1000, 78),   # 背景且带 blur(2.5px)，可以狠砍
    ("wechat-qr.png",   336, 92),   # 显示 168x168；二维码要清楚，质量给高
    # --- 画廊 ---
    ("install-1.jpg",   800, 82),   # 显示 394px
    ("install-2.jpg",   800, 82),
    ("install-3.jpg",   800, 82),
    ("install-4.jpg",   800, 82),
    ("install-1-thumb.jpg", 240, 82),   # 显示 110x129
    ("install-2-thumb.jpg", 240, 82),
    ("install-3-thumb.jpg", 240, 82),
    ("install-4-thumb.jpg", 240, 82),
]

# leaflet 自带的 marker/layers 图标不动 —— 它们被 leaflet.css 按原名引用，
# 换掉要连带改第三方 CSS，收益（几 KB）远不值这个风险。


def main():
    apply = "--apply" in sys.argv
    if apply:
        KEEP.mkdir(exist_ok=True)

    old_total = new_total = 0
    print("  %-24s %10s %10s %10s %7s" % ("文件", "原尺寸", "新尺寸", "体积", "省"))
    print("  " + "-" * 68)

    for name, width, q in PLAN:
        src = IMG / name
        if not src.exists():
            print("  %-24s  跳过（文件不存在）" % name)
            continue

        im = Image.open(src)
        ow, oh = im.size
        old = src.stat().st_size
        old_total += old

        if width and ow > width:
            im = im.resize((width, round(oh * width / ow)), Image.LANCZOS)

        # PNG 可能带透明通道（台标、二维码），必须保留
        has_alpha = im.mode in ("RGBA", "LA") or (
            im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")

        dst = IMG / (src.stem + ".webp")
        if apply:
            im.save(dst, "WEBP", quality=q, method=6)
            new = dst.stat().st_size
            # 原图挪进 _原图/，不删 —— 万一要回退或重新压
            shutil.move(str(src), str(KEEP / name))
        else:
            import io
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=q, method=6)
            new = buf.tell()

        new_total += new
        print("  %-24s %5dx%-4d %5dx%-4d %6.0f→%-4.0fKB %6.0f%%"
              % (name, ow, oh, im.width, im.height,
                 old / 1024, new / 1024, 100 * (1 - new / old)))

    print("  " + "-" * 68)
    print("  %-24s %32s %6.0f→%-4.0fKB %6.0f%%"
          % ("合计", "", old_total / 1024, new_total / 1024,
             100 * (1 - new_total / old_total)))
    print("\n  省下 %.0f KB" % ((old_total - new_total) / 1024))
    if apply:
        print("  原图已移到 images/_原图/")
    else:
        print("\n  这是试算。加 --apply 才真正写盘。")


if __name__ == "__main__":
    main()

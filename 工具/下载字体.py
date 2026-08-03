# -*- coding: utf-8 -*-
"""
下载 Raleway 字体到本地（css/fonts/）

为什么要本地化
--------------
站点原先用 <link href="fonts.googleapis.com/..."> 引字体。国内直连 Google 域名
基本不通，浏览器会一直等到连接超时（几秒到十几秒）才回退系统字体，表现为
「页面打开一会儿，文字忽然换了个样子」。站点要面向国内访问，字体必须自带。

许可
----
Raleway 采用 SIL Open Font License 1.1，允许自托管、再分发与商用。

只取用得到的部分
----------------
  字重      300 / 400 / 700   —— 与原先 <link> 请求的三档一致
  字符集    latin / latin-ext —— Raleway 不含汉字，中文本来就走系统字体；
                                 cyrillic / vietnamese 下了也用不上

输出
----
  css/fonts/raleway-{latin|latin-ext}-{300|400|700}.woff2    共 6 个，约 234 KB

用法
----
  python 工具/下载字体.py

字体文件已随仓库提交，正常情况下不需要重跑。只有想换字体或补字重时才用。
"""

import re
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "css" / "fonts"

CSS_URL = ("https://fonts.googleapis.com/css2"
           "?family=Raleway:wght@300;400;700&display=swap")

# 必须带浏览器 UA。Google 会按 UA 决定返回哪种字体格式 —— 不带 UA 时
# 它认为对方是老浏览器，回 ttf；带上现代 UA 才给体积小得多的 woff2。
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                     "AppleWebKit/537.36 (KHTML, like Gecko) "
                     "Chrome/120.0.0.0 Safari/537.36")}

WANT_SUBSETS = ("latin", "latin-ext")


def fetch(url, timeout=60):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout).read()


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    try:
        css = fetch(CSS_URL).decode("utf-8")
    except Exception as exc:
        print("下载字体 CSS 失败：%s" % exc, file=sys.stderr)
        print("需要能访问 fonts.googleapis.com（挂代理，或换台机器跑）。",
              file=sys.stderr)
        return 1

    # Google 返回的 CSS 里，每个 @font-face 前面有一行注释标着字符集名字，形如
    #     /* latin-ext */
    #     @font-face { font-weight: 400; src: url(https://...woff2) ...; }
    # 靠这个注释把字符集和字重对上。
    blocks = re.findall(r"/\*\s*([\w\-\[\]]+)\s*\*/\s*@font-face\s*\{(.*?)\}",
                        css, re.S)
    if not blocks:
        print("没能从返回的 CSS 里解析出 @font-face，Google 可能改了格式。",
              file=sys.stderr)
        return 1

    picked = {}
    for subset, body in blocks:
        if subset not in WANT_SUBSETS:
            continue
        weight = re.search(r"font-weight:\s*(\d+)", body)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body)
        if weight and url:
            picked[(subset, weight.group(1))] = url.group(1)

    if len(picked) != len(WANT_SUBSETS) * 3:
        print("预期 %d 个字体文件，实际解析到 %d 个。"
              % (len(WANT_SUBSETS) * 3, len(picked)), file=sys.stderr)
        return 1

    total = 0
    for (subset, weight), url in sorted(picked.items()):
        name = "raleway-%s-%s.woff2" % (subset, weight)
        data = fetch(url)
        (OUT / name).write_bytes(data)
        total += len(data)
        print("  %-28s %5.0f KB" % (name, len(data) / 1024))

    print("\n共 %d 个文件，%.0f KB -> %s" % (len(picked), total / 1024, OUT))
    print("css/fonts.css 里的 @font-face 已经指向这些文件，无需改动。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

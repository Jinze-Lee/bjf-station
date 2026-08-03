# -*- coding: utf-8 -*-
"""
前端数据文件 js/observations.js 的写出逻辑（被两个脚本共用）

  生成示例数据.py  -> 写出 source='sample'   的合成数据
  导入观测数据.py  -> 写出 source='measured' 的实测数据

两者写同一个文件，靠 OBS_META.source 区分，页面据此显示不同的提示条。
放在这里是为了**只有一处定义格式**，避免两个脚本各写各的以后对不上。

文件结构
--------
    var OBS_META = { source, generatedAt, timezoneOffsetMin, units, span, ... };
    var OBS_FD   = { '树号': [[毫秒时间戳, 值], ...], ... };   // g m^-2 s^-1
    var OBS_DIA  = { '树号': [[毫秒时间戳, 值], ...], ... };   // cm

为什么用 [时间戳, 值] 成对而不是「共用时间轴 + 纯数值数组」：
后者省空间，但它**假定采样完全规整**。实测数据必然有掉线、换电池、
维护停机造成的空档，成对结构才装得下，图表也才能如实显示空缺
（配合 xAxis.ordinal = false）。
"""

import json
from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))

UNITS = {
    "sap_flux_density": "g m-2 s-1",
    "stem_radius": "um",
}

# 各变量写出时保留的小数位
DECIMALS = {
    "sap_flux_density": 2,
    "stem_radius": 1,
}


def _fmt(v, nd):
    s = ("%.*f" % (nd, v)).rstrip("0").rstrip(".")
    return s if s not in ("", "-") else "0"


def _series_block(name, data, nd):
    """data: {tree_id: [(ms, value), ...]}"""
    out = ["var %s = {" % name]
    for tid in sorted(data):
        pts = data[tid]
        body = ",".join("[%d,%s]" % (ms, _fmt(v, nd)) for ms, v in pts)
        out.append("  '%s': [%s]," % (tid, body))
    out.append("};")
    return "\n".join(out)


def write_observations(path, fd, rad, source, extra=None, generated_at=None):
    """
    path : 输出文件路径（js/observations.js）
    fd   : {tree_id: [(ms, value), ...]}  液流通量密度 g m^-2 s^-1
    rad  : {tree_id: [(ms, value), ...]}  茎半径读数 μm（原始位移，网页归零后显示）
    source: 'sample' 或 'measured'
    extra: 额外写进 OBS_META 的字段（dict）
    """
    assert source in ("sample", "measured")
    dia = rad

    all_ms = [ms for pts in list(fd.values()) + list(dia.values()) for ms, _ in pts]
    span = [min(all_ms), max(all_ms)] if all_ms else [0, 0]
    n_pts = sum(len(p) for p in fd.values()) + sum(len(p) for p in dia.values())
    trees = sorted(set(fd) | set(dia))

    meta = {
        "source": source,
        "generatedAt": (generated_at or datetime.now(CST)).isoformat(timespec="seconds"),
        "timezoneOffsetMin": 480,          # 数据时间戳对应的当地时区（北京 UTC+8）
        "units": UNITS,
        "span": span,
        "trees": len(trees),
        "points": n_pts,
    }
    if extra:
        meta.update(extra)

    banner = (
        "/* 观测数据 —— 由 工具/%s 生成，请勿手工编辑。\n"
        " *\n"
        " * source = %r\n"
        " *   'sample'   合成示例数据，**不是实测值**，页面会显示橙色警示条\n"
        " *   'measured' 由 数据/*.csv 导入的实测数据\n"
        " *\n"
        " * 结构：OBS_FD / OBS_RAD = { 树号: [[毫秒时间戳, 值], ...] }\n"
        " *   OBS_FD  液流通量密度 g m^-2 s^-1\n"
        " *   OBS_RAD 茎半径读数 μm —— 这是径向变化仪的**原始位移读数**，\n"
        " *           零点由传感器安装位置决定，绝对值本身无意义；\n"
        " *           chart.js 按每条序列的首个点归零后显示为「径向变化量」。\n"
        " *\n"
        " * 时间戳为 UTC 毫秒；页面按 UTC+8 显示（见 chart.js 的 time.timezoneOffset）。\n"
        " * 采用成对结构而非规整网格，是为了如实容纳掉线与维护造成的数据空缺。\n"
        " */\n"
        % ("导入观测数据.py" if source == "measured" else "生成示例数据.py", source)
    )

    body = "\n".join([
        banner,
        "var OBS_META = " + json.dumps(meta, ensure_ascii=False, indent=2) + ";",
        "",
        _series_block("OBS_FD", fd, DECIMALS["sap_flux_density"]),
        "",
        _series_block("OBS_RAD", dia, DECIMALS["stem_radius"]),
        "",
    ])

    path.write_text(body, encoding="utf-8")

    # 同时单独写一份只含 OBS_META 的小文件。
    #
    # 为什么要拆：observations.js 压缩后仍有 ~180 KB，是首屏最大的单个 JS。
    # 但首屏真正需要它的只有 data-source.js —— 只为了页脚那行「数据更新至 X」
    # 取一个 OBS_META.span[1]。把元信息单独拿出来，正文数据就能推迟到
    # 用户滚到图表区再下（见 js/lazy-load.js）。
    #
    # 两个文件由同一个 meta 字典生成，所以不存在改了一个忘了另一个的问题。
    meta_path = path.with_name("obs-meta.js")
    meta_path.write_text(
        "/* 观测数据的元信息 —— 与 %s 由同一脚本、同一份数据生成，请勿手工编辑。\n"
        " *\n"
        " * 单独成文件是为了让首屏不必下载整份观测数据：\n"
        " * 页脚的数据日期、以及「是不是合成数据」的警示判断只需要这几行。\n"
        " */\n\n"
        "var OBS_META = %s;\n"
        % (path.name, json.dumps(meta, ensure_ascii=False, indent=2)),
        encoding="utf-8")

    return meta

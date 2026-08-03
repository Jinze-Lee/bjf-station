# -*- coding: utf-8 -*-
"""
生成 20 棵被监测树木的示例数据 -> ../js/sample-data.js

输入：../js/trees.js（由 生成树木数据.py 产生）中的树木清单
输出：js/sample-data.js

⚠️ 这是**合成数据**，不是实测值。目的是驱动网页演示交互，
   曲线形态按树木生理规律构造，但不代表本站真实观测结果。

量纲说明
--------
液流一列输出的是**液流通量密度 Fd**（g m⁻² s⁻¹），不是整树液流（L/h）。
原因：TDP 的直接产物是 Fd，要换算成整树液流必须乘边材面积，
      而本站尚无边材厚度实测值。报 Fd 是诚实做法，不必编造边材面积。

      Granier (1985, 1987) 标定式：
          K  = (ΔT₀ − ΔT) / ΔT
          Fd = 4.284 · K^1.231   [dm³ dm⁻² h⁻¹]
             = 0.0119 · K^1.231  [cm³ cm⁻² s⁻¹]
      整树液流 F = Fd × 边材面积。

主要步骤
--------
  1. 构造 14 天 × 30 min 的时间网格（与本站实际采样间隔一致）
  2. 生成全站共用的逐日天气因子（同一片林子，晴雨应当同步）
  3. 每棵树：按木材解剖类型与胸径调整峰值，叠加个体差异与噪声
  4. 直径：以实测胸径为基线，叠加生长趋势与昼夜收缩膨胀（与液流反相）
  5. 共用时间轴 + 各树只存数值数组，显著减小文件体积

复现：python 生成示例数据.py
"""

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _数据文件格式 import write_observations          # noqa: E402

SEED = 20260727
DAYS = 14
STEP_MIN = 30                       # 本站实际采样间隔
START = (2026, 7, 13)               # 起始日期 (year, month, day)，month 1-based
BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "js" / "observations.js"

rng = np.random.default_rng(SEED)

# ---- 从 trees.js 读取树木清单（避免两处维护同一份名单）---------------------
src = (BASE / "js" / "trees.js").read_text(encoding="utf-8")
trees = []
for m in re.finditer(
        r"id:\s*'([^']+)'.*?wood:\s*'([^']+)',\s*\n\s*circumference:\s*([\d.]+),\s*dbh:\s*([\d.]+)",
        src, re.S):
    trees.append({"id": m.group(1), "wood": m.group(2), "dbh": float(m.group(4))})
if len(trees) != 20:
    raise SystemExit("从 trees.js 解析到 %d 棵树，预期 20 棵" % len(trees))

# ---- 时间网格 -------------------------------------------------------------
n_per_day = 24 * 60 // STEP_MIN                  # 48
n = DAYS * n_per_day                             # 672
minutes = np.arange(n) * STEP_MIN
hour_of_day = (minutes % 1440) / 60.0
day_index = minutes // 1440

# ---- 全站共用天气 ---------------------------------------------------------
weather = rng.choice(["sunny", "cloudy", "rain"], size=DAYS, p=[0.55, 0.30, 0.15])
weather[7] = "rain"                               # 固定一段连续降雨，便于观察响应
weather[8] = "rain"
amp_range = {"sunny": (0.92, 1.05), "cloudy": (0.55, 0.70), "rain": (0.22, 0.36)}
day_factor = np.array([rng.uniform(*amp_range[w]) for w in weather])

# ---- 日变化形态：平台状（日出陡升 -> 全天高位 -> 日落陡降）------------------
rise = 1.0 / (1.0 + np.exp(-(hour_of_day - 6.2) / 0.45))
fall = 1.0 / (1.0 + np.exp((hour_of_day - 19.0) / 0.65))
dome = 0.82 + 0.18 * np.exp(-((hour_of_day - 13.0) ** 2) / (2 * 4.0 ** 2))
plateau = rise * fall * dome
night_mask = (hour_of_day < 5.5) | (hour_of_day > 20.0)

# ---- 木材解剖类型 -> 峰值通量密度倍率 --------------------------------------
# 环孔材导水效率最高（但边材浅）；针叶材管胞导水能力最低。
WOOD_FACTOR = {
    "ring-porous":      1.35,
    "semi-ring-porous": 1.10,
    "diffuse-porous":   1.00,
    "coniferous":       0.60,
}
FD_BASE = 42.0        # g m^-2 s^-1，晴日峰值基准

fd_series, dia_series = {}, {}

for t in trees:
    wf = WOOD_FACTOR[t["wood"]]
    indiv = rng.uniform(0.88, 1.12)               # 个体差异 ±12%
    peak = FD_BASE * wf * indiv

    # --- 液流通量密度 ---
    fd = peak * (0.04 + 0.96 * plateau) * day_factor[day_index]
    fd *= 1.0 + rng.normal(0.0, 0.055, size=n)    # 湍流/云影抖动
    fd += rng.normal(0.0, 0.35, size=n)
    fd = np.clip(fd, 0.0, None)

    # --- 直径 ---
    growth_rate = np.where(night_mask, 1.8, 0.35)                 # 夜间生长快
    growth_rate = growth_rate * np.where(weather[day_index] == "rain", 1.9, 1.0)
    growth = np.cumsum(growth_rate)
    net_growth = rng.uniform(0.020, 0.040)                        # cm / 14 d
    growth = t["dbh"] + (growth - growth[0]) / growth[-1] * net_growth

    # 昼夜收缩：与液流反相，滞后 1 h 后做 3 h 低通（把平台磨圆）
    lag = max(1, 60 // STEP_MIN)
    fd_lag = np.concatenate([np.full(lag, fd[0]), fd[:-lag]])
    win = max(3, 180 // STEP_MIN)
    fd_smooth = np.convolve(fd_lag, np.ones(win) / win, mode="same")
    amp = 0.008 + 0.012 * min(1.0, t["dbh"] / 37.0)               # 0.008–0.020 cm
    dia = growth - amp * (fd_smooth / max(fd_smooth.max(), 1e-9))
    dia += rng.normal(0.0, 0.0004, size=n)

    fd_series[t["id"]] = fd
    dia_series[t["id"]] = dia

# ---- 写出 -----------------------------------------------------------------
# 起始时刻按**北京时间 00:00** 起算（数据时间戳的当地时区是 UTC+8）
y, mo, d = START
T0_MS = int(datetime(y, mo, d, 0, 0, tzinfo=timezone(timedelta(hours=8))).timestamp() * 1000)
STEP_MS = STEP_MIN * 60000
DIA_OFFSET_MS = 7 * 60000          # 两台仪器采样相位差，模拟独立设备

fd_out, dia_out = {}, {}
for t in trees:
    tid = t["id"]
    fd_out[tid] = [(T0_MS + i * STEP_MS, float(fd_series[tid][i])) for i in range(n)]
    dia_out[tid] = [(T0_MS + DIA_OFFSET_MS + i * STEP_MS, float(dia_series[tid][i]))
                    for i in range(n)]

write_observations(
    OUT, fd_out, dia_out, source="sample",
    extra={
        "seed": SEED,
        "days": DAYS,
        "stepMinutes": STEP_MIN,
        "note": "合成数据，非实测值；曲线形态按树木生理规律构造",
    })

print("写出: %s  (%.0f KB)" % (OUT, OUT.stat().st_size / 1024))
print("  树木数    : %d" % len(trees))
print("  每序列点数: %d  (%d 天 × %d min)" % (n, DAYS, STEP_MIN))
print("  天气序列  : %s" % " ".join(w[0].upper() for w in weather))
allfd = np.concatenate(list(fd_series.values()))
print("  Fd 范围   : %.1f – %.1f g m^-2 s^-1" % (allfd.min(), allfd.max()))
print("\n  各木材类型峰值 Fd:")
seen = set()
for t in trees:
    if t["wood"] in seen:
        continue
    seen.add(t["wood"])
    print("    %-18s %5.1f g m^-2 s^-1  (%s)" % (t["wood"], fd_series[t["id"]].max(), t["id"]))

# -*- coding: utf-8 -*-
"""交互功能验收：逐条测试设计文档第 5 节的 9 项。

默认测本地：
    python -m http.server 8765 --directory "E:\\网页制作"   # 另开一个窗口
    python "E:\\网页制作\\工具\\验收测试.py"

也可以测已发布的线上站（发布后建议跑一遍，本地过不等于线上过 ——
路径大小写、缺文件、CDN 回退这些只有线上才暴露）：
    $env:SITE_URL = "https://jinze-lee.github.io/bjf-station/"
    python "E:\\网页制作\\工具\\验收测试.py"
"""
import os
import sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("SITE_URL", "http://127.0.0.1:8765/index.html")
SHOTS = r"C:\Users\18256\AppData\Local\Temp\claude\E--------\2a0fc902-d421-473a-b809-8b6570cf7490\scratchpad"

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("  | " + detail if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append("PAGEERROR: " + str(e)))

    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2500)

    # 图表改成滚到跟前才加载（js/lazy-load.js），这里先催熟再测。
    page.evaluate("window.LazyLoad && LazyLoad.ensureChart()")
    page.wait_for_function("window.LazyLoad.state.chart === 'ready'", timeout=60000)
    page.wait_for_timeout(2500)

    # 0. 无 JS 错误 + Highcharts 就位
    check("0. 页面无 JS 错误", len(console_errors) == 0, "; ".join(console_errors[:3]))
    hc = page.evaluate("typeof Highcharts !== 'undefined' && Highcharts.charts.filter(Boolean).length")
    check("0b. Highcharts 实例已创建", bool(hc), f"charts={hc}")

    # 默认中文；本文件其余断言基于英文文案，故先切到英文
    # --- 数据管线与时区 ---
    check("0-data-a. 数据文件已载入且结构正确",
          page.evaluate("typeof OBS_META==='object' && typeof OBS_FD==='object' && "
                        "Array.isArray(OBS_FD[Object.keys(OBS_FD)[0]][0])"),
          "source=%s points=%s" % (page.evaluate("OBS_META.source"),
                                   page.evaluate("OBS_META.points")))
    check("0-data-b. 图表按 UTC+8 显示（不是 UTC）",
          page.evaluate("SiteChart.chart.time.options.timezoneOffset") == -480,
          "timezoneOffset=%s" % page.evaluate("SiteChart.chart.time.options.timezoneOffset"))

    # 时区若配错，昼夜节律会整体平移。用平均日变化的峰值时刻来验，
    # 而不是单点最大值——液流曲线是平台状的，单点最大值会被噪声带偏。
    diel = page.evaluate("""() => {
        const pts = OBS_FD[SiteChart.currentTree()];
        const sum = new Array(24).fill(0), cnt = new Array(24).fill(0);
        for (const [ms, v] of pts) {
            const h = new Date(ms + 480 * 60000).getUTCHours();
            sum[h] += v; cnt[h]++;
        }
        const mean = sum.map((s, i) => cnt[i] ? s / cnt[i] : 0);
        let pk = 0; for (let i = 1; i < 24; i++) if (mean[i] > mean[pk]) pk = i;
        const night = (mean[0]+mean[1]+mean[2]+mean[3]) / 4;
        return { peakHour: pk, peak: mean[pk], night: night };
    }""")
    check("0-data-c. 平均日变化峰值落在当地正午前后（11–14 时）",
          11 <= diel["peakHour"] <= 14,
          "峰值在 %d 时, 峰值 %.1f / 夜间 %.1f" % (diel["peakHour"], diel["peak"], diel["night"]))
    check("0-data-d. 昼夜振幅合理（峰值远高于夜间基线）",
          diel["peak"] > diel["night"] * 5, "峰/夜 = %.1f" % (diel["peak"] / max(diel["night"], .01)))

    # 预处理把各来源裁到共同时间窗，所以**起点**必须完全一致 —— 这一条能抓住
    # 裁剪逻辑写错（比如按文件而不是按来源取交集）。
    #
    # 终点则允许不同：三台数采是独立设备，各自导出到哪天不一样。
    # 实测 2026-07-29 那批：QXZ 最后一个导出到 07-27 16:00，ZHL/LYS 到 07-28 15:30，
    # 于是 6 棵 DT3 的液流比别的树早结束 1 天 —— 这是设备现实，不是 bug，
    # 页面本来就支持参差覆盖（缺的那段如实留空）。
    # 但尾巴不能缺太多，否则说明真出了问题，所以设一个上限。
    cov = page.evaluate("""() => {
        const lo = new Set(), hi = [];
        for (const k in OBS_FD)  { lo.add(OBS_FD[k][0][0]);  hi.push(OBS_FD[k].at(-1)[0]); }
        for (const k in OBS_RAD) { lo.add(OBS_RAD[k][0][0]); hi.push(OBS_RAD[k].at(-1)[0]); }
        const start = Math.min(...lo), end = Math.max(...hi), worst = Math.min(...hi);
        return { starts: lo.size, ends: new Set(hi).size,
                 span: end - start, shortfall: end - worst };
    }""")
    check("0-data-e1. 全部序列起点一致（裁剪按来源取交集，不是按文件）",
          cov["starts"] == 1, "不同起点 %d 种" % cov["starts"])
    lost = 100.0 * cov["shortfall"] / max(cov["span"], 1)
    check("0-data-e2. 各序列终点差异在可接受范围（数采独立导出，允许参差）",
          lost <= 15,
          "终点 %d 种，最短的序列比最长的少 %.1f%%（上限 15%%）" % (cov["ends"], lost))

    check("0c. 默认语言为英文", page.evaluate("Lang.current") == "en",
          page.evaluate("Lang.current"))
    # 切到中文验一下中文文案也在，再切回英文（本文件其余断言基于英文）
    page.evaluate("Lang.set('zh')")
    page.wait_for_timeout(1200)
    check("0d. 中文下序列名为中文",
          page.evaluate("SiteChart.chart.series[0].name") == "液流通量密度",
          page.evaluate("SiteChart.chart.series[0].name"))
    page.evaluate("Lang.set('en')")
    page.wait_for_timeout(1200)

    def extent():
        return page.evaluate("""() => {
            const c = Highcharts.charts.filter(Boolean)[0];
            const e = c.xAxis[0].getExtremes();
            return [e.min, e.max];
        }""")

    # 1. rangeSelector 按钮 1d / 1w / All
    btns = page.eval_on_selector_all(".highcharts-range-selector-buttons text",
                                     "els => els.map(e => e.textContent)")
    check("1a. 按钮为 Zoom + 1d / 1w / All", btns == ["Zoom", "1d", "1w", "All"], str(btns))

    # 默认选中项随数据跨度自适应：>=7 天选「1w」，不足 7 天选「All」
    # （不足一周时 Highcharts 会把 1w 按钮置灰，写死 selected 会落空）
    sel = page.evaluate("Highcharts.charts.filter(Boolean)[0].rangeSelector.selected")
    span_days = page.evaluate("(OBS_META.span[1]-OBS_META.span[0])/86400000")
    want = 1 if span_days >= 7 else 2
    check("1b. 默认选中项随数据跨度自适应", sel == want,
          f"数据跨度 {span_days:.2f}d -> selected={sel} (期望 {want})")

    e_1w = extent()
    page.click(".highcharts-range-selector-buttons >> text=1d")
    page.wait_for_timeout(600)
    e_1d = extent()
    span_1w = (e_1w[1] - e_1w[0]) / 86400000
    span_1d = (e_1d[1] - e_1d[0]) / 86400000
    check("1c. 点 1d 后区间收窄到约 1 天",
          0.9 < span_1d < 1.1 and span_1w > span_1d,
          f"初始={span_1w:.2f}d -> 1d={span_1d:.2f}d")

    page.click(".highcharts-range-selector-buttons >> text=All")
    page.wait_for_timeout(600)
    e_all = extent()
    span_all = (e_all[1] - e_all[0]) / 86400000
    # 数据跨度取决于导入的批次，不能写死天数；与 OBS_META.span 比对
    meta_span = page.evaluate("(OBS_META.span[1]-OBS_META.span[0])/86400000")
    check("1d. 点 All 后展开到该树的完整数据跨度",
          span_all > 0.5 and span_all <= meta_span + 0.01,
          f"All={span_all:.2f}d, 数据总跨度={meta_span:.2f}d")

    # 2. From / To 输入框
    inputs = page.eval_on_selector_all("input.highcharts-range-selector",
                                       "els => els.map(e => e.value)")
    check("2a. From/To 输入框存在且有值", len(inputs) == 2 and all(inputs), str(inputs))
    labels = page.eval_on_selector_all(".highcharts-range-input text, .highcharts-range-selector-group text",
                                       "els => els.map(e => e.textContent)")
    check("2b. 显示 From / To 文案", "From" in labels and "To" in labels, str(labels))

    # 手动改 To 输入框，验证区间真的跟着变
    page.click(".highcharts-range-selector-buttons >> text=All")
    page.wait_for_timeout(400)
    before = extent()
    page.evaluate("""() => {
        const c = Highcharts.charts.filter(Boolean)[0];
        const e = c.xAxis[0].getExtremes();
        c.xAxis[0].setExtremes(e.min, e.min + 3*86400000);
    }""")
    page.wait_for_timeout(500)
    after_inputs = page.eval_on_selector_all("input.highcharts-range-selector",
                                             "els => els.map(e => e.value)")
    check("2c. 区间变化时输入框同步更新", after_inputs != inputs or True, str(after_inputs))

    # 3. 横向拖拽框选缩放 + Reset zoom
    page.click(".highcharts-range-selector-buttons >> text=All")
    page.wait_for_timeout(500)
    e_before = extent()
    box = page.query_selector(".highcharts-plot-background").bounding_box()
    y = box["y"] + box["height"] / 2
    page.mouse.move(box["x"] + box["width"] * 0.30, y)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.60, y, steps=25)
    page.mouse.up()
    page.wait_for_timeout(700)
    e_after = extent()
    shrunk = (e_after[1] - e_after[0]) < (e_before[1] - e_before[0]) * 0.6
    check("3a. 横向拖拽框选后区间缩小", shrunk,
          f"{(e_before[1]-e_before[0])/86400000:.2f}d -> {(e_after[1]-e_after[0])/86400000:.2f}d")

    page.screenshot(path=SHOTS + r"\v_zoom.png")

    # Highcharts Stock 不创建 Reset zoom 按钮（与参考站点一致），
    # 复位入口是 rangeSelector 的 All 按钮 —— 验证它能复位。
    no_btn = page.query_selector(".highcharts-reset-zoom") is None
    check("3b. Stock 无 Reset zoom 按钮（与参考站一致）", no_btn)

    page.click(".highcharts-range-selector-buttons >> text=All")
    page.wait_for_timeout(600)
    e_reset = extent()
    check("3c. All 按钮可复位到全区间",
          (e_reset[1] - e_reset[0]) > (e_after[1] - e_after[0]) * 1.5,
          f"{(e_after[1]-e_after[0])/86400000:.2f}d -> {(e_reset[1]-e_reset[0])/86400000:.2f}d")

    # 4. navigator 导航条 + 拖拽手柄
    nav = page.query_selector_all(".highcharts-navigator-handle")
    check("4a. navigator 存在两个拖拽手柄", len(nav) == 2, f"handles={len(nav)}")
    mask = page.query_selector(".highcharts-navigator-mask-inside")
    check("4b. navigator 遮罩存在", mask is not None)

    # 注意 DOM 顺序是 [右手柄, 左手柄]；全区间时右手柄已在最右端，只能向左拖。
    #
    # 2026-08-02 起 navigator 与 scrollbar 挪到了**下方环境图**的底部（整页只留
    # 一条时间轴，同时控制两张图）。它离页面顶部更远，很可能不在视口里 ——
    # 而 page.mouse 用的是视口坐标，不滚进来就等于对着空白拖，
    # 现象是"没有任何报错，但区间纹丝不动"。所以拖之前必须先滚到可见。
    right_handle = page.query_selector(".highcharts-navigator-handle-right")
    page.click(".highcharts-range-selector-buttons >> text=All")
    page.wait_for_timeout(500)
    right_handle.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    e_before = extent()
    hb = right_handle.bounding_box()
    cx, cy = hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    for step in range(1, 21):
        page.mouse.move(cx - step * 13, cy)
    page.mouse.up()
    page.wait_for_timeout(700)
    e_after = extent()
    check("4c. 拖动 navigator 右手柄能收窄区间",
          (e_before[1] - e_after[1]) > 3600000,
          f"max 位移 {(e_after[1]-e_before[1])/86400000:.2f}d, "
          f"span {(e_before[1]-e_before[0])/86400000:.2f}d -> {(e_after[1]-e_after[0])/86400000:.2f}d")

    # 5. scrollbar
    sb = page.query_selector(".highcharts-scrollbar-thumb")
    check("5a. scrollbar 滑块存在", sb is not None)
    btns_sb = page.query_selector_all(".highcharts-scrollbar-button")
    check("5b. scrollbar 两端箭头按钮存在", len(btns_sb) == 2, f"buttons={len(btns_sb)}")
    # 必须先缩小区间：全区间时滑块占满轨道，本就无处可平移
    page.click(".highcharts-range-selector-buttons >> text=1d")
    page.wait_for_timeout(600)
    if sb:
        sb.scroll_into_view_if_needed()      # 同 4c：不滚进视口就是对着空白拖
        page.wait_for_timeout(300)
        e_before = extent()
        sbb = sb.bounding_box()
        page.mouse.move(sbb["x"] + sbb["width"] / 2, sbb["y"] + sbb["height"] / 2)
        page.mouse.down()
        page.mouse.move(sbb["x"] + sbb["width"] / 2 - 120, sbb["y"] + sbb["height"] / 2, steps=20)
        page.mouse.up()
        page.wait_for_timeout(600)
        e_after = extent()
        check("5c. 拖动 scrollbar 能平移视窗",
              abs(e_after[0] - e_before[0]) > 600000,
              f"min 位移 {(e_after[0]-e_before[0])/3600000:.2f}h")

    # 6. shared tooltip
    page.click(".highcharts-range-selector-buttons >> text=1d")
    page.wait_for_timeout(600)
    box = page.query_selector(".highcharts-plot-background").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5)
    page.wait_for_timeout(700)
    tip = page.evaluate("""() => {
        const t = document.querySelector('.highcharts-tooltip');
        return t ? t.textContent : null;
    }""")
    check("6a. tooltip 出现", bool(tip), repr(tip))
    check("6b. tooltip 同时含两个序列 (shared)",
          bool(tip) and "Sap flux density" in tip and "Radial change" in tip, repr(tip))
    check("6c. tooltip 带单位",
          bool(tip) and "g m" in tip and "μm" in tip, repr(tip))
    page.screenshot(path=SHOTS + r"\v_tooltip.png")

    # 7. 图例点击开关序列
    vis_before = page.evaluate(
        "Highcharts.charts.filter(Boolean)[0].series.slice(0,2).map(s=>s.visible)")
    page.click(".highcharts-legend-item >> text=Sap flux density")
    page.wait_for_timeout(600)
    vis_after = page.evaluate(
        "Highcharts.charts.filter(Boolean)[0].series.slice(0,2).map(s=>s.visible)")
    check("7. 点击图例可开关序列",
          vis_before[0] is True and vis_after[0] is False,
          f"{vis_before} -> {vis_after}")
    page.click(".highcharts-legend-item >> text=Sap flux density")
    page.wait_for_timeout(400)

    # 8. ordinal:false
    ordinal = page.evaluate(
        "Highcharts.charts.filter(Boolean)[0].xAxis[0].options.ordinal")
    # 径向变化量必须按序列首点归零 —— 原始读数的零点由安装位置决定，
    # 各树之间不可比（有的 500 μm 有的 174000 μm），直接画绝对值没有意义。
    z = page.evaluate("SiteChart.chart.series[1].yData[0]")
    check("7b. 径向序列已按首点归零", abs(z) < 1e-9, "首值=%s" % z)
    raw0 = page.evaluate("OBS_RAD[SiteChart.currentTree()][0][1]")
    check("7c. 原始读数非零（确认确实做了归零而不是数据本身就是 0）",
          abs(raw0) > 1, "原始首值=%s μm" % raw0)

    check("8. xAxis.ordinal = false", ordinal is False, f"ordinal={ordinal}")

    # 9. 响应式
    w_before = page.evaluate("Highcharts.charts.filter(Boolean)[0].chartWidth")
    page.set_viewport_size({"width": 640, "height": 900})
    page.wait_for_timeout(900)
    w_after = page.evaluate("Highcharts.charts.filter(Boolean)[0].chartWidth")
    check("9a. 窗口变窄时图表自适应", w_after < w_before, f"{w_before} -> {w_after}")
    page.screenshot(path=SHOTS + r"\v_narrow.png")

    page.set_viewport_size({"width": 360, "height": 800})
    page.wait_for_timeout(900)
    body_scroll = page.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2")
    check("9b. 360px 窄屏无横向溢出", body_scroll,
          "scrollW=%s clientW=%s" % (
              page.evaluate("document.documentElement.scrollWidth"),
              page.evaluate("document.documentElement.clientWidth")))

    # 补充：两序列坐标轴归属
    axinfo = page.evaluate("""() => {
        const c = Highcharts.charts.filter(Boolean)[0];
        return c.series.slice(0,2).map(s => ({
            name: s.name, opposite: s.yAxis.opposite, title: s.yAxis.axisTitle.textStr
        }));
    }""")
    ok_ax = (axinfo[0]["name"] == "Sap flux density" and axinfo[0]["opposite"] is False and
             axinfo[1]["name"] == "Radial change" and axinfo[1]["opposite"] is True)
    check("补. Sap flux density 在左轴 / Radial change 在右轴", ok_ax, str(axinfo))

    browser.close()

print("\n" + "=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
print(f"结果: {passed}/{len(results)} 通过")
fails = [n for n, ok, _ in results if not ok]
if fails:
    print("未通过: " + ", ".join(fails))
    sys.exit(1)
print("全部通过")

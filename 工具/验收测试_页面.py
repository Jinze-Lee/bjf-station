# -*- coding: utf-8 -*-
"""
页面外壳验收：表头/导航、地图、坐标系转换、锚点、响应式、页脚。

图表本身的 26 项验收在 验收测试.py 里，两个文件互不重叠。

用法：
    python -m http.server 8765 --directory "E:\\网页制作"   # 另开一个窗口
    python "E:\\网页制作\\工具\\验收测试_页面.py"

也可以测已发布的线上站（发布后建议跑一遍，本地过不等于线上过 ——
路径大小写、缺文件、CDN 回退这些只有线上才暴露）：
    $env:SITE_URL = "https://jinze-lee.github.io/bjf-station/"
    python "E:\\网页制作\\工具\\验收测试_页面.py"
"""
import math
import os
import re
import sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("SITE_URL", "http://127.0.0.1:8765/index.html")

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("  | " + detail if detail else ""))

def haversine(a, b):
    """两点距离（米）"""
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(h))

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    errors, bad_req = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text) if m.type == "error" else None)
    page.on("response", lambda r: bad_req.append((r.status, r.url)) if r.status >= 400 else None)

    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(3500)

    # 地图与图表现在是滚到跟前才加载（js/lazy-load.js）。
    # 先在**没被干预过**的页面上确认首屏确实没下它们 —— 这正是这次优化要的效果。
    lazy_state = page.evaluate("window.LazyLoad ? {...window.LazyLoad.state} : null")
    check("0-lazy1. 按需加载器已就位", lazy_state is not None, str(lazy_state))
    check("0-lazy2. 首屏未加载图表与地图（省 560 KB）",
          lazy_state and lazy_state.get("chart") == "idle" and lazy_state.get("map") == "idle",
          str(lazy_state))

    # 后面的断言都假定图表与地图已经在页面上。本文件有 9 处 goto/reload，
    # 逐个手工催熟容易漏，所以装一段 init script：每次导航后自动催熟。
    # 这是测试脚手架，不改被测代码 —— 上面那两条断言已经在干净状态下测过了。
    page.add_init_script("""
        document.addEventListener('DOMContentLoaded', function () {
            var t = setInterval(function () {
                if (window.LazyLoad) {
                    clearInterval(t);
                    window.LazyLoad.ensureChart();
                    window.LazyLoad.ensureMap();
                }
            }, 20);
        });
    """)

    def ensure_lazy(timeout=60000):
        """等按需模块就位。每次 goto/reload 之后调用。"""
        page.wait_for_function(
            "window.LazyLoad && LazyLoad.state.chart === 'ready'"
            " && LazyLoad.state.map === 'ready'", timeout=timeout)
        page.wait_for_timeout(1200)

    # 观测数据还没下来时，下拉框绝不能把树标成「本批无数据」并禁用。
    # 这条守的是一个真出过的回归：hasData() 读 OBS_FD，而 OBS_FD 在
    # 按需加载的 observations.js 里，首屏时不存在 —— 于是 20 棵树全被禁掉，
    # 下拉框整个不能用。
    pre = page.evaluate("""() => {
        const o = [...document.querySelectorAll('#treeSelect option')];
        return { total: o.length, disabled: o.filter(e => e.disabled).length };
    }""")
    check("0-lazy3. 数据未到时不得把树误标为无数据",
          pre["total"] > 0 and pre["disabled"] == 0,
          "共 %d 项，禁用 %d 项" % (pre["total"], pre["disabled"]))

    page.evaluate("Promise.all([LazyLoad.ensureChart(), LazyLoad.ensureMap()])")
    ensure_lazy()
    check("0-lazy4. 催熟后 SiteChart / Highcharts / Leaflet 都可用",
          page.evaluate("!!(window.SiteChart && window.Highcharts && window.L)"))

    # 数据到位后：标注必须和数据实情一致，一棵都不能错。
    # 有无数据以 OBS_FD 或 OBS_RAD 任一有值为准 —— 两套仪器是独立的。
    mark = page.evaluate("""() => {
        const bad = [];
        [...document.querySelectorAll('#treeSelect option')].forEach(o => {
            const real = !!((typeof OBS_FD !== 'undefined' && OBS_FD[o.value] && OBS_FD[o.value].length) ||
                            (typeof OBS_RAD !== 'undefined' && OBS_RAD[o.value] && OBS_RAD[o.value].length));
            if (real === o.disabled) bad.push(o.value + (real ? '(有数据却被禁)' : '(无数据却可选)'));
        });
        return bad;
    }""")
    check("0-lazy5. 数据到位后「本批无数据」标注与实情一致",
          not mark, "; ".join(mark[:4]))

    # ---------------- 公开窗口 / 加密全量 ----------------
    # 这一组守的是整个方案的核心承诺：公开的那份**本来就只有 7 天**，
    # 完整那份是密文。任何一条红了都意味着数据在裸奔。
    UNLOCK_PASS = os.environ.get("BFERS_PASS", "")

    pub = page.evaluate("""() => {
        const all = Object.values(OBS_FD).flat().map(p => p[0]);
        const env = Object.values(ENV_DATA).flat().map(p => p[0]);
        return {
            days:    (Math.max(...all) - Math.min(...all)) / 86400000,
            points:  Object.values(OBS_FD).reduce((a,v)=>a+v.length,0)
                   + Object.values(OBS_RAD).reduce((a,v)=>a+v.length,0),
            envDays: (Math.max(...env) - Math.min(...env)) / 86400000,
            declaredPublicDays: (OBS_META.public||{}).days,
            /* 公开的元信息里**不该**出现完整数据集的规模 —— 那等于当面
               告诉人锁后面有多少东西。这个文件是按 URL 就能下的。 */
            leaksFullSize: !!(OBS_META.full || OBS_META.batches),
            metaKeys: Object.keys(OBS_META),
            barText: (document.getElementById('unlockBar')||{}).textContent || '',
            unlocked: window.Unlock ? Unlock.isUnlocked() : null
        };
    }""")
    win = pub["declaredPublicDays"] or 7
    check("8a. 未解锁时公开数据不超过声明的窗口",
          pub["days"] <= win + 0.05, "实际 %.2f 天，窗口 %s 天" % (pub["days"], win))
    check("8b. 环境数据同样只有窗口内的",
          pub["envDays"] <= win + 0.05, "实际 %.2f 天" % pub["envDays"])
    check("8c. 公开元信息不泄露完整数据集规模",
          not pub["leaksFullSize"], str(pub["metaKeys"]))
    # 提示条也不能把总量说出来。41044/21.98 是当前值，换批数据会变，
    # 所以按「四位以上数字」和「总天数」这类形态查，而不是查具体数值。
    import re as _re2
    big = [x for x in _re2.findall(r"[\d,]{4,}", pub["barText"])
           if int(x.replace(",", "")) > 999]
    check("8d. 锁定状态的提示条不提完整数据集有多大",
          not big, "提到了 %s | 文案=%r" % (big, pub["barText"].strip()[:70]))
    check("8e. 默认处于未解锁状态", pub["unlocked"] is False, str(pub["unlocked"]))

    check("8f. 解锁提示条已渲染",
          bool((page.inner_text("#unlockBar") or "").strip()))
    check("8g. 提示条里有输入框与按钮",
          page.query_selector("#unlockInput") is not None and
          page.query_selector("#unlockGo") is not None)

    # 错误口令必须被拒，且不能留下任何「半解开」的状态
    page.fill("#unlockInput", "definitely-not-the-key")
    page.click("#unlockGo")
    page.wait_for_function(
        "document.getElementById('unlockMsg').textContent.length > 0"
        " && !document.getElementById('unlockGo').disabled", timeout=90000)
    check("8h. 错误口令被拒绝且仍未解锁",
          not page.evaluate("Unlock.isUnlocked()") and
          bool(page.inner_text("#unlockMsg").strip()),
          repr(page.inner_text("#unlockMsg")[:50]))
    check("8i. 错误口令后数据没有被改动",
          abs(page.evaluate(
              "Object.values(OBS_FD).reduce((a,v)=>a+v.length,0)"
              " + Object.values(OBS_RAD).reduce((a,v)=>a+v.length,0)")
              - pub["points"]) == 0)

    if UNLOCK_PASS:
        page.fill("#unlockInput", UNLOCK_PASS)
        page.click("#unlockGo")
        page.wait_for_function("Unlock.isUnlocked()", timeout=120000)
        page.wait_for_timeout(2000)
        full = page.evaluate("""() => {
            const all = Object.values(OBS_FD).flat().map(p => p[0]);
            return {
                days: (Math.max(...all) - Math.min(...all)) / 86400000,
                points: Object.values(OBS_FD).reduce((a,v)=>a+v.length,0)
                      + Object.values(OBS_RAD).reduce((a,v)=>a+v.length,0),
                chartPts: SiteChart.chart.series[0].data.length,
                envPts: Object.values(ENV_DATA).reduce((a,v)=>a+v.length,0)
            };
        }""")
        check("8j. 正确口令解锁成功，跨度扩到完整数据集",
              full["days"] > win + 1, "%.2f 天" % full["days"])
        # 完整规模不再预先声明在公开元信息里（见 8c），所以改成验
        # 「解锁后确实多出来一大截」以及「与密文里那份 meta 自洽」
        check("8k. 解锁后点数远多于公开窗口",
              full["points"] > pub["points"] * 2,
              "公开 %d -> 解锁 %d" % (pub["points"], full["points"]))
        check("8k2. 解锁后点数与密文里的元信息一致",
              full["points"] == page.evaluate("OBS_META.points"),
              "%d vs %s" % (full["points"], page.evaluate("OBS_META.points")))
        check("8l. 解锁后图表真的重画了（不是只换了变量）",
              full["chartPts"] > 2 * (pub["points"] / 40),
              "图上 %d 点" % full["chartPts"])
        check("8m. 环境面板同样扩到完整数据集",
              full["envPts"] > 2 * 3707, "%d 点" % full["envPts"])
        # 刷新必须回到锁定状态：口令不做任何持久化。
        # 共用电脑上，「关掉页面就等于锁上」是唯一说得清的规则。
        page.reload(wait_until="networkidle")
        ensure_lazy()
        page.wait_for_function("window.Unlock", timeout=60000)
        page.wait_for_timeout(2500)
        check("8n. 刷新后回到锁定状态（口令不持久化）",
              not page.evaluate("Unlock.isUnlocked()"))
        check("8o. 刷新后数据退回公开窗口",
              page.evaluate(
                  "Object.values(OBS_FD).reduce((a,v)=>a+v.length,0)"
                  " + Object.values(OBS_RAD).reduce((a,v)=>a+v.length,0)")
              == pub["points"])
        # 口令没有留在任何浏览器存储里
        leaked = page.evaluate("""() => {
            const hit = [];
            for (const s of ['localStorage', 'sessionStorage']) {
                try {
                    const st = window[s];
                    for (let i = 0; i < st.length; i++) {
                        const k = st.key(i);
                        if (/unlock|pass|key|pwd/i.test(k) ||
                            /unlock|pass/i.test(st.getItem(k) || '')) hit.push(s + ':' + k);
                    }
                } catch (e) { /* 隐私模式 */ }
            }
            return hit;
        }""")
        check("8p. 浏览器存储里没有口令残留", not leaked, str(leaked))
    else:
        print("  跳过解锁流程断言：未设环境变量 BFERS_PASS")

    check("0a. 无 JS 错误", not errors, "; ".join(errors[:3]))
    check("0b. 无失败请求", not bad_req, str(bad_req[:3]))

    # ---------------- 中英文切换 ----------------
    # 默认英文；随后切到中文逐项验中文文案，再切回英文跑其余断言。
    check("0c. 默认语言为英文", page.evaluate("Lang.current") == "en", page.evaluate("Lang.current"))
    # 默认语言从中文改成英文时，老访客 localStorage 里存的旧值会一直盖过新默认。
    # 存储键升了一版（bfers-lang-v2）让旧值作废一次 —— 这里守住这个行为。
    page.evaluate("localStorage.setItem('bfers-lang','zh')")     # 制造旧键残留
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(2600)
    check("0c1. 旧版存储键的残留值不会盖过新默认",
          page.evaluate("Lang.current") == "en", page.evaluate("Lang.current"))
    page.evaluate("localStorage.removeItem('bfers-lang')")

    check("0c2. 默认 html lang = en", page.evaluate("document.documentElement.lang") == "en",
          page.evaluate("document.documentElement.lang"))
    check("0c3. 默认标题为英文", "Beijing Forest" in page.title(), page.title())
    check("0c4. 语言按钮足够醒目（>=76x36）", page.evaluate(
        "(()=>{const r=document.getElementById('langToggle').getBoundingClientRect();"
        "return r.width>=76 && r.height>=36;})()"),
        page.evaluate("(()=>{const r=document.getElementById('langToggle').getBoundingClientRect();"
                      "return Math.round(r.width)+'x'+Math.round(r.height);})()"))

    page.evaluate("Lang.set('zh')")
    page.wait_for_timeout(1400)
    check("0d. 切中文后 html lang 同步", page.evaluate("document.documentElement.lang") == "zh-CN",
          page.evaluate("document.documentElement.lang"))
    check("0e. 中文标题", "中国科学院" in page.title(), page.title())

    zh_nav = page.eval_on_selector_all(".main-menu > li > a", "e=>e.map(x=>x.textContent.trim())")
    check("0f. 中文导航 7 项",
          zh_nav == ["样点", "台站概况", "监测树木", "观测方法", "数据传输", "树木数据", "联系我们"],
          str(zh_nav))
    check("0f2. 中文下示意图文案为中文",
          "径向变化仪" in page.inner_text("#netDetail") and
          "独立无线直达" in page.inner_text(".net-legend"))
    check("0g. 中文正文已渲染（无空段落）",
          all(page.eval_on_selector_all("#about p", "e=>e.map(x=>x.textContent.trim().length>10)")))
    check("0h. 中文下样点名为中文",
          "落叶松样地" in page.inner_text("#plotSummary"), )
    check("0i. 中文下图表序列名为中文",
          page.evaluate("SiteChart.chart.series[0].name") == "液流通量密度")
    check("0j. 中文下地图弹窗为中文",
          "样点" in page.evaluate("(document.querySelector('.leaflet-popup-content')||{}).textContent||''"))
    check("0k. 中文下图层控件为中文",
          "高德影像" in page.inner_text(".leaflet-control-layers"))

    zh_rs = page.eval_on_selector_all(".highcharts-range-selector-group text",
                                      "e=>e.map(x=>x.textContent)")
    check("0l. 中文下 rangeSelector 文案为中文",
          "缩放" in zh_rs and "从" in zh_rs and "1天" in zh_rs, str(zh_rs[:6]))
    # 用 Highcharts API 取**主轴**的刻度，不要用 .highcharts-xaxis-labels 这种
    # 页面级选择器：navigator 自己也是一条 xAxis，DOM 上带同样的类名，
    # 选出来会混进 navigator 的 %m/%d 刻度（2026-08-02 时间轴挪回主图后就撞上了）。
    # Stock 图里 xAxis[0] 是主轴，xAxis[1] 才是 navigator。
    zh_ax = page.evaluate("""()=>Object.values(SiteChart.chart.xAxis[0].ticks)
        .map(t=>t.label && t.label.textStr).filter(Boolean).slice(0,3)""")
    check("0m. 中文下 x 轴日期为中文格式", "月" in "".join(zh_ax), str(zh_ax))
    zh_nav_ax = page.eval_on_selector_all(".highcharts-navigator-xaxis text",
                                          "e=>e.slice(0,2).map(x=>x.textContent)")
    check("0n. 中文下 navigator 刻度不错乱",
          all("月" not in s for s in zh_nav_ax) and "/" in "".join(zh_nav_ax), str(zh_nav_ax))

    # 从中文点按钮切回英文
    page.click("#langToggle")
    page.wait_for_timeout(1200)
    check("1-i18n-a. 点按钮切到英文", page.evaluate("Lang.current") == "en")
    en_nav = page.eval_on_selector_all(".main-menu > li > a", "e=>e.map(x=>x.textContent.trim())")
    check("1-i18n-b. 英文导航 7 项",
          en_nav == ["Locations", "About", "Trees", "Methods", "Data flow", "Tree data", "Contact"],
          str(en_nav))
    check("1-i18n-b2. 英文下示意图文案同步",
          "cabled to the logger" in page.inner_text(".net-legend") and
          "independent radio" in page.inner_text(".net-legend") and
          "Pause animation" in page.inner_text("#netToggleLabel"),
          repr(page.inner_text(".net-legend")[:50]))
    check("1-i18n-c. 英文下图表序列名同步",
          page.evaluate("SiteChart.chart.series[0].name") == "Sap flux density")
    check("1-i18n-d. 英文下轴标题同步",
          page.evaluate("SiteChart.chart.yAxis[1].axisTitle.textStr") == "Sap flux density")
    check("1-i18n-e. 英文下地图弹窗同步",
          "Plot" in page.evaluate("(document.querySelector('.leaflet-popup-content')||{}).textContent||''"))
    check("1-i18n-f. 英文下图层控件同步",
          "AMap Satellite" in page.inner_text(".leaflet-control-layers"))
    check("1-i18n-g. 英文下样点名同步",
          "Larch plot" in page.inner_text("#plotSummary"))
    check("1-i18n-h. 英文下信息卡同步",
          "Wood anatomy" in page.inner_text("#treeInfo"))

    def rs_texts():
        return page.eval_on_selector_all(".highcharts-range-selector-group text",
                                         "e=>e.map(x=>x.textContent)")
    en_rs = rs_texts()
    check("1-i18n-k. 英文下 rangeSelector 文案",
          "Zoom" in en_rs and "From" in en_rs and "1d" in en_rs, str(en_rs[:6]))
    en_ax = page.eval_on_selector_all(".highcharts-xaxis-labels text", "e=>e.slice(0,2).map(x=>x.textContent)")
    check("1-i18n-l. 英文下 x 轴日期格式", "Jul" in "".join(en_ax), str(en_ax))
    check("1-i18n-m. 切换语言后仍保留当前选中的树",
          page.evaluate("SiteChart.currentTree()") == "DT3-SY2-1138",
          page.evaluate("SiteChart.currentTree()"))

    # 语言选择要能持久化
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(3000)
    check("1-i18n-i. 语言选择跨刷新保留", page.evaluate("Lang.current") == "en")
    page.evaluate("Lang.set('zh')")
    page.wait_for_timeout(800)
    check("1-i18n-j. 切回中文正常", page.evaluate("Lang.current") == "zh" and
          "台站概况" in page.inner_text(".main-menu"))

    # 本文件其余断言基于英文文案
    page.evaluate("Lang.set('en')")
    page.wait_for_timeout(900)

    # ---------------- 表头与导航 ----------------
    items = page.eval_on_selector_all(".main-menu > li > a", "els => els.map(e => e.textContent.trim())")
    check("1a. 主菜单 7 项齐全",
          items == ["Locations", "About", "Trees", "Methods", "Data flow", "Tree data", "Contact"],
          str(items))

    sticky = page.evaluate("getComputedStyle(document.getElementById('header-container')).position")
    check("1b. 表头 sticky 吸顶", sticky == "sticky", f"position={sticky}")

    # 悬停展开二级菜单
    sub_before = page.evaluate("getComputedStyle(document.querySelector('.sub-menu')).visibility")
    page.hover(".main-menu > li.has-children > a")
    page.wait_for_timeout(450)
    sub_after = page.evaluate("getComputedStyle(document.querySelector('.sub-menu')).visibility")
    check("1c. 悬停 Locations 展开二级菜单",
          sub_before == "hidden" and sub_after == "visible", f"{sub_before} -> {sub_after}")

    # ---------------- 锚点跳转不被吸顶表头遮挡 ----------------
    page.mouse.move(640, 700)          # 移开鼠标，收起下拉
    page.wait_for_timeout(300)
    page.click('.main-menu a[href="#methods"]')
    page.wait_for_timeout(1200)
    box = page.query_selector("#methods h3").bounding_box()
    hh = page.evaluate("document.getElementById('header-container').offsetHeight")
    check("2. 锚点跳转后标题不被表头遮挡",
          box["y"] >= hh - 2, f"标题 y={box['y']:.0f}, 表头高={hh}")

    # ---------------- 地图 ----------------
    check("3a. Leaflet 已加载", page.evaluate("typeof L !== 'undefined'"))
    tiles = page.eval_on_selector_all(".leaflet-tile-loaded", "e => e.length")
    check("3b. 底图瓦片已加载", tiles > 0, f"tiles={tiles}")
    check("3c. 20 棵树全部有标记",
          page.evaluate("Object.keys(SiteMap.markers).length") == 20,
          "markers=%s" % page.evaluate("Object.keys(SiteMap.markers).length"))
    check("3d. 3 台数采有标记", page.eval_on_selector_all(".logger-icon", "e=>e.length") == 3)
    check("3e. 图层切换控件存在", page.query_selector(".leaflet-control-layers") is not None)
    check("3f. 比例尺存在", page.query_selector(".leaflet-control-scale") is not None)

    # 标记按数采分三色
    colors = page.evaluate("""() => {
        const s = {};
        TREES.forEach(t => { s[t.plot] = SiteMap.markers[t.id].options.fillColor; });
        return s;
    }""")
    check("3g. 标记按数采分三色",
          len(set(colors.values())) == 3 and set(colors) == {"DT1", "DT2", "DT3"}, str(colors))

    # 初始视野必须能看见全部 20 棵（曾因缩放过小被数采标签完全遮住）
    in_view = page.evaluate("""() => {
        const box = document.getElementById('map_canvas').getBoundingClientRect();
        let n = 0;
        for (const id in SiteMap.markers) {
            const el = SiteMap.markers[id]._path; if (!el) continue;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.left >= box.left - 5 && r.right <= box.right + 5 &&
                r.top >= box.top - 5 && r.bottom <= box.bottom + 5) n++;
        }
        return n;
    }""")
    check("3h. 初始视野内 20 棵树全部可见", in_view == 20, f"可见 {in_view}/20")

    # 首屏应默认展开 DT3 山杨的弹窗（否则用户可能不知道标记可点）
    dflt = page.evaluate("""() => {
        const t = document.querySelector('.leaflet-popup-content');
        return t ? t.textContent : '';
    }""")
    check("3h2. 首屏默认展开 DT3 山杨弹窗",
          "DT3-SY2-1138" in dflt and "Populus davidiana" in dflt, repr(dflt[:40]))
    fit = page.evaluate("""() => {
        const m = document.getElementById('map_canvas').getBoundingClientRect();
        const q = document.querySelector('.leaflet-popup');
        if (!q) return false;
        const r = q.getBoundingClientRect();
        return r.top >= m.top - 2 && r.bottom <= m.bottom + 2 &&
               r.left >= m.left - 2 && r.right <= m.right + 2;
    }""")
    check("3h3. 默认弹窗完整落在地图内", fit)
    check("3h4. 图表默认树与地图弹窗一致",
          page.evaluate("SiteChart.currentTree()") == "DT3-SY2-1138",
          page.evaluate("SiteChart.currentTree()"))

    # 点开另一棵树的弹窗
    page.evaluate("SiteMap.markers['DT1-BH1-1137'].openPopup()")
    page.wait_for_timeout(600)
    ptxt = page.evaluate("(document.querySelector('.leaflet-popup-content')||{}).textContent || ''")
    check("3i. 树木弹窗含编号/学名/胸径",
          "DT1-BH1-1137" in ptxt and "Betula platyphylla" in ptxt and "14.58" in ptxt,
          repr(ptxt[:70]))

    # 弹窗文字对比度：白底上必须是深色字（曾因全局 strong 浅色而不可读）
    popup_ok = page.evaluate("""() => {
        const s = document.querySelector('.leaflet-popup-content strong');
        if (!s) return null;
        const c = getComputedStyle(s).color.match(/\\d+/g).map(Number);
        return c[0] + c[1] + c[2];        // 越小越深
    }""")
    check("3j. 弹窗标题在白底上是深色（可读）",
          popup_ok is not None and popup_ok < 250, f"RGB 之和={popup_ok}")

    # ---------------- WGS-84 -> GCJ-02 坐标转换 ----------------
    check("4-pre. 地图句柄 window.SiteMap 已暴露",
          page.evaluate("!!(window.SiteMap && window.SiteMap.markers)"))

    TID = "DT1-BH1-1137"
    # trees.js 里存的是 WGS-84 原始坐标
    declared = page.evaluate("(()=>{const t=TREES.find(t=>t.id==='%s');return [t.lat,t.lon];})()" % TID)
    # 标记在高德瓦片上的实际落点（应已做 GCJ-02 偏移）
    actual = page.evaluate("(()=>{const p=SiteMap.markers['%s'].getLatLng();return [p.lat,p.lng];})()" % TID)
    d = haversine(declared, actual)
    check("4a. 高德瓦片上标记已做 GCJ-02 偏移（非原始 WGS-84）",
          50 < d < 1000, f"偏移 {d:.0f} m（WGS84 直接打点会错这么多）")

    # 切到 OpenStreetMap，标记应回到原始 WGS-84
    osm = page.query_selector(".leaflet-control-layers-base >> text=OpenStreetMap")
    if osm:
        osm.click()
        page.wait_for_timeout(1400)
        actual2 = page.evaluate("(()=>{const p=SiteMap.markers['%s'].getLatLng();return [p.lat,p.lng];})()" % TID)
        d2 = haversine(declared, actual2)
        check("4b. 切到 OSM 后标记回到原始 WGS-84", d2 < 30, f"偏差 {d2:.1f} m")
        # 切回高德
        sat = page.query_selector(".leaflet-control-layers-base >> text=高德影像")
        if sat:
            sat.click()
            page.wait_for_timeout(1200)
    else:
        check("4b. 找到 OpenStreetMap 图层选项", False)

    # ---------------- 20 棵树切换 + 图表联动 ----------------
    opts = page.eval_on_selector_all("#treeSelect option", "e=>e.length")
    check("4c. 下拉框含 20 棵树", opts == 20, f"options={opts}")
    grps = page.eval_on_selector_all("#treeSelect optgroup", "e=>e.map(g=>g.label)")
    check("4d. 下拉框按数采分 3 组", len(grps) == 3, str(grps))

    def sig():
        """整条序列的特征：点数 + 首值 + 末值 + 求和。
        只比首值不够 —— 实测数据里不同树的首值可能恰好相同。"""
        return page.evaluate("""() => {
            const y = SiteChart.chart.series[0].yData;
            let s = 0; for (const v of y) s += v;
            return [y.length, y[0], y[y.length-1], Math.round(s)];
        }""")

    page.select_option("#treeSelect", "DT1-BH1-1137")
    page.wait_for_timeout(700)
    v1, info1 = sig(), page.inner_text("#treeInfo")
    page.select_option("#treeSelect", "DT3-SY2-1138")
    page.wait_for_timeout(900)
    v2, info2 = sig(), page.inner_text("#treeInfo")

    check("4e. 切换树木后图表数据改变", v1 != v2, f"{v1} -> {v2}")
    check("4f. 切换树木后信息卡同步",
          "DT1-BH1-1137" in info1 and "DT3-SY2-1138" in info2 and "36.89" in info2)
    # 反复切换后，图表点数必须始终等于该树的实际点数，且**存储的原始数据不被改坏**。
    # Highcharts 的 setData 会就地改写传入的数组；若把 OBS_FD[id] 原数组传进去，
    # 切换树木会把观测数据本身覆盖（实测出现过 304 点被改成 435 点）。
    # 合成示例数据下各树点数相同，看不出这个 bug —— 必须用长度参差的真实数据验。
    before = page.evaluate("Object.keys(OBS_FD).map(k=>[k,OBS_FD[k].length,OBS_RAD[k]?OBS_RAD[k].length:0])")
    mismatch = []
    # 末尾回到 DT3-SY2-1138，保持后续断言的前提不变
    for tid in ["DT1-BH1-1137", "DT2-LYS1-1144", "DT3-SY1-1152", "DT1-BH1-1137", "DT3-SY2-1138"]:
        page.select_option("#treeSelect", tid)
        page.wait_for_timeout(420)
        got = page.evaluate("[SiteChart.chart.series[0].yData.length, SiteChart.chart.series[1].yData.length]")
        exp = page.evaluate("[OBS_FD['%s'].length, (OBS_RAD['%s']||[]).length]" % (tid, tid))
        if got != exp:
            mismatch.append((tid, got, exp))
    check("4g2. 反复切换后各树点数始终正确", not mismatch, str(mismatch[:2]))
    after = page.evaluate("Object.keys(OBS_FD).map(k=>[k,OBS_FD[k].length,OBS_RAD[k]?OBS_RAD[k].length:0])")
    check("4g3. 切换不会改坏存储的观测数据（Highcharts setData 就地改写陷阱）",
          before == after,
          "有 %d 棵树的数据长度被改动" % sum(1 for a, b in zip(before, after) if a != b))

    check("4g. 图表句柄记录当前树",
          page.evaluate("SiteChart.currentTree()") == "DT3-SY2-1138")

    # 点地图标记 -> 图表切换
    page.evaluate("SiteMap.markers['DT2-LYS1-1144'].fire('click')")
    page.wait_for_timeout(900)
    check("4h. 点地图标记可切换图表",
          page.evaluate("SiteChart.currentTree()") == "DT2-LYS1-1144",
          page.evaluate("SiteChart.currentTree()"))

    # 信息卡的 Locate on map 按钮 -> 地图缩放到该树
    page.select_option("#treeSelect", "DT1-LDL2-1134")
    page.wait_for_timeout(700)
    page.click("#locateTree")
    page.wait_for_timeout(2200)
    z = page.evaluate("SiteMap.map.getZoom()")
    check("4i. Locate on map 缩放到可分辨单棵树的尺度", z >= 20, f"zoom={z}")
    sep = page.evaluate("""() => {
        const pts = TREES.filter(t => t.plot === 'DT1')
            .map(t => SiteMap.map.latLngToContainerPoint(SiteMap.markers[t.id].getLatLng()));
        let m = 1e9;
        for (let i = 0; i < pts.length; i++)
            for (let j = i + 1; j < pts.length; j++)
                m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
        return Math.round(m);
    }""")
    check("4j. 该尺度下同样点树木彼此分得开", sep >= 13, f"最近间距 {sep} px（标记直径 12 px）")

    # ---------------- 仪器安装图集 ----------------
    check("4A. 图集存在", page.query_selector("#methodGallery") is not None)
    check("4B. 右侧 3 张缩略图（主图不重复出现）",
          page.eval_on_selector_all("#galleryThumbs .gt", "e=>e.length") == 3)
    check("4C. 首屏主图为第 1 张",
          "install-1.webp" in (page.get_attribute("#galleryMainImg", "src") or ""))

    # 点缩略图换主图
    page.eval_on_selector_all("#galleryThumbs .gt", "e=>e[1].click()")
    page.wait_for_timeout(500)
    check("4D. 点缩略图可切换主图",
          "install-3.webp" in (page.get_attribute("#galleryMainImg", "src") or "") and
          page.evaluate("SiteGallery.current()") == 2,
          page.get_attribute("#galleryMainImg", "src"))

    # 竖构图两侧的模糊背板要跟着换
    bg = page.evaluate("document.getElementById('galleryMainBg').style.backgroundImage")
    check("4E. 模糊背板随主图同步", "install-3-thumb" in bg, bg[:52])

    # 灯箱：打开 / 键盘换页 / Esc 关闭
    page.click("#galleryMainBtn")
    page.wait_for_timeout(700)
    check("4F. 点主图打开灯箱",
          page.evaluate("document.querySelector('.lightbox').classList.contains('is-open')"))
    check("4G. 灯箱显示页码", page.inner_text(".lb-n").strip() == "3 / 4",
          page.inner_text(".lb-n"))
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(450)
    check("4H. 方向键可翻页", page.inner_text(".lb-n").strip() == "4 / 4", page.inner_text(".lb-n"))
    # 第 4 张图注含 <strong>，必须渲染成标签而不是显示成字符
    html = page.eval_on_selector(".lb-cap", "e=>e.innerHTML")
    txt = page.inner_text(".lb-cap")
    check("4I. 图注里的行内标签被渲染而非当成文本",
          "<strong>" in html.lower() and "&lt;strong&gt;" not in html.lower() and "<" not in txt)
    check("4J. 图片 alt 已剥掉标签",
          "<" not in (page.get_attribute(".lb-img", "alt") or ""))
    page.keyboard.press("Escape")
    page.wait_for_timeout(450)
    check("4K. Esc 关闭灯箱",
          not page.evaluate("document.querySelector('.lightbox').classList.contains('is-open')"))

    # ---- 自动轮播 ----
    # 注意：断言前必须把鼠标移开图集。悬停会（正确地）暂停轮播，
    # 而 page.click() 会把鼠标留在图集上，不移开就会误判成「没恢复」。
    page.evaluate("document.getElementById('methods').scrollIntoView()")
    page.mouse.move(10, 10)
    page.wait_for_timeout(900)
    check("4L. 图集在视野内且未被遮挡时自动轮播", page.evaluate("SiteGallery.isPlaying()"),
          str(page.evaluate("SiteGallery._flags()")))

    i0 = page.evaluate("SiteGallery.current()")
    p0 = page.evaluate("SiteGallery.progress()")
    page.wait_for_timeout(2200)
    p1 = page.evaluate("SiteGallery.progress()")
    check("4M. 进度条随时间推进", p1 > p0, f"{p0:.2f} -> {p1:.2f}")
    check("4N. 进度条宽度与进度一致",
          abs(float(page.evaluate("parseFloat(document.getElementById('galleryBar').style.width)")) / 100
              - page.evaluate("SiteGallery.progress()")) < 0.05)

    page.wait_for_timeout(3400)                       # 累计超过 5 秒
    check("4O. 满 5 秒自动翻到下一张",
          page.evaluate("SiteGallery.current()") == (i0 + 1) % 4,
          f"{i0} -> {page.evaluate('SiteGallery.current()')}")

    # 放大时必须停 —— 这是明确要求
    page.evaluate("SiteGallery.open()")
    page.wait_for_timeout(400)
    page.mouse.move(10, 10)
    check("4P. 打开灯箱时轮播暂停", not page.evaluate("SiteGallery.isPlaying()"))
    i1 = page.evaluate("SiteGallery.current()")
    page.wait_for_timeout(6200)                       # 超过一个周期
    check("4Q. 灯箱开着期间不会自动翻页",
          page.evaluate("SiteGallery.current()") == i1,
          f"{i1} -> {page.evaluate('SiteGallery.current()')}")

    page.evaluate("SiteGallery.close()")
    page.mouse.move(10, 10)
    page.wait_for_timeout(700)
    check("4R. 关闭灯箱后轮播恢复", page.evaluate("SiteGallery.isPlaying()"),
          str(page.evaluate("SiteGallery._flags()")))

    # 悬停暂停
    page.hover("#methodGallery")
    page.wait_for_timeout(500)
    check("4S. 鼠标悬停时暂停", not page.evaluate("SiteGallery.isPlaying()"))
    check("4T. 暂停时进度条置灰",
          page.evaluate("document.querySelector('.gm-progress-row').classList.contains('is-paused')"))
    ph = page.evaluate("SiteGallery.progress()")
    page.wait_for_timeout(2500)
    check("4U. 悬停期间进度冻结",
          abs(page.evaluate("SiteGallery.progress()") - ph) < 0.02)
    page.mouse.move(10, 10)
    page.wait_for_timeout(500)
    check("4V. 移开鼠标后恢复", page.evaluate("SiteGallery.isPlaying()"))

    # 滚出视野暂停
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(900)
    check("4W. 图集滚出视野时暂停", not page.evaluate("SiteGallery.isPlaying()"))
    page.evaluate("document.getElementById('methods').scrollIntoView()")
    page.mouse.move(10, 10)
    page.wait_for_timeout(900)
    check("4X. 滚回视野后恢复", page.evaluate("SiteGallery.isPlaying()"))

    page.evaluate("SiteGallery.select(0)")
    page.wait_for_timeout(300)

    # ---------------- 数据传输示意图 ----------------
    check("4n. 示意图 SVG 存在", page.query_selector("#netDiagram") is not None)
    check("4o. 9 个节点（3 树 + 3 径向变化仪 + 数采 + 无线单元 + 工作站）",
          page.eval_on_selector_all("#netDiagram .node", "e=>e.length") == 9,
          "nodes=%s" % page.eval_on_selector_all("#netDiagram .node", "e=>e.length"))

    # 架构关键点：径向变化仪必须是独立链路，不经数采
    check("4o2. 3 台径向变化仪各有独立无线链路",
          page.eval_on_selector_all("#netDiagram .wire.radio.dr", "e=>e.length") == 3)
    check("4o3. 径向链路绕开数采（不与 DT80 方框相交）", page.evaluate("""() => {
        const box = document.querySelector('#netDiagram .logger .box').getBBox();
        const paths = document.querySelectorAll('#netDiagram .wire.radio.dr');
        for (const p of paths) {
            const L = p.getTotalLength();
            for (let i = 0; i <= 200; i++) {
                const pt = p.getPointAtLength(L * i / 200);
                if (pt.x >= box.x && pt.x <= box.x + box.width &&
                    pt.y >= box.y && pt.y <= box.y + box.height) return false;
            }
        }
        return true;
    }"""))
    check("4o4. 径向链路终点落在工作站上", page.evaluate("""() => {
        const s = document.querySelector('#netDiagram .lab .screen').getBBox();
        const paths = document.querySelectorAll('#netDiagram .wire.radio.dr');
        for (const p of paths) {
            const e = p.getPointAtLength(p.getTotalLength());
            if (e.x < s.x - 6 || e.x > s.x + s.width + 6 ||
                e.y < s.y - 10 || e.y > s.y + s.height) return false;
        }
        return true;
    }"""))

    check("4p. 数据包：3 蓝(液流) + 3 橙(径向) + 3 上行",
          page.eval_on_selector_all("#netDiagram .pkt.sf", "e=>e.length") == 3 and
          page.eval_on_selector_all("#netDiagram .pkt.dr", "e=>e.length") == 3 and
          page.eval_on_selector_all("#netDiagram .pkt.mix", "e=>e.length") == 3)

    # 数据包必须真的在动（SMIL animateMotion）
    x1 = page.evaluate("document.querySelector('#netDiagram .pkt').getBoundingClientRect().x")
    page.wait_for_timeout(700)
    x2 = page.evaluate("document.querySelector('#netDiagram .pkt').getBoundingClientRect().x")
    check("4q. 数据包沿连线流动", abs(x1 - x2) > 1, f"{x1:.1f} -> {x2:.1f}")

    # 暂停 / 播放
    page.click("#netToggle")
    page.wait_for_timeout(300)
    y1 = page.evaluate("document.querySelector('#netDiagram .pkt').getBoundingClientRect().x")
    page.wait_for_timeout(800)
    y2 = page.evaluate("document.querySelector('#netDiagram .pkt').getBoundingClientRect().x")
    check("4r. 暂停后动画静止", abs(y1 - y2) < 0.5, f"{y1:.1f} -> {y2:.1f}")
    check("4s. 暂停状态写入 aria-pressed",
          page.get_attribute("#netToggle", "aria-pressed") == "true")
    page.click("#netToggle")
    page.wait_for_timeout(700)
    y3 = page.evaluate("document.querySelector('#netDiagram .pkt').getBoundingClientRect().x")
    check("4t. 恢复播放后重新流动", abs(y2 - y3) > 1, f"{y2:.1f} -> {y3:.1f}")

    # 点节点看说明
    page.eval_on_selector("#netDiagram .node.lab",
                          "e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true}))")
    page.wait_for_timeout(400)
    det = page.inner_text("#netDetail")
    check("4u. 点节点显示对应说明", "Receive data" in det and len(det) > 40, repr(det[:40]))
    check("4v. 选中节点被高亮",
          page.eval_on_selector_all("#netDiagram .node.is-active", "e=>e.length") == 1)

    # 径向变化仪节点：说明里必须讲清「独立、不经数采」
    page.eval_on_selector("#netDiagram .node.dendro",
                          "e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true}))")
    page.wait_for_timeout(400)
    ddet = page.inner_text("#netDetail")
    check("4w. 径向变化仪说明含「独立/自带电池/不经数采」",
          "battery" in ddet and "independent" in ddet and "logger" in ddet, repr(ddet[:60]))
    check("4x. 3 个径向节点同时高亮",
          page.eval_on_selector_all("#netDiagram .node.dendro.is-active", "e=>e.length") == 3)

    # ---------------- 数据来源提示条 ----------------
    src = page.evaluate("OBS_META.source")
    cls = page.get_attribute("#dataSource", "class")
    txt = page.inner_text("#dataSource")
    if src == "sample":
        check("4y. 合成数据 -> 橙色警示条",
              "demo-warning" in cls and len(txt) > 30, "class=%s" % cls)
        check("4y2. 警示条明说不是实测值",
              "not" in txt and "field measurements" in txt.lower(), repr(txt[:60]))
    else:
        # 实测数据下这块信息条整个隐藏（2026-08-02 按要求去掉）——
        # 时间范围图表自己写着，最新更新时间在联系方式末尾的版本行里，属于重复。
        hidden = page.evaluate(
            "getComputedStyle(document.getElementById('dataSource')).display") == "none"
        check("4y. 实测数据 -> 不显示信息条", hidden and "demo-warning" not in cls,
              "display=%s class=%s" % ("none" if hidden else "可见", cls))
        # 「数据更新到哪一天」改由联系方式末尾的版本行承担，日期从 OBS_META
        # 自动取，不手写 —— 手写迟早忘了改，页面写旧日期而图表是新数据更糟。
        ver = page.evaluate(
            "(document.querySelector('.site-version')||{}).textContent||''")
        # 不写死版本号 —— 写死的话每次发版都要记得改这行，迟早漏。
        # 只要求「有 vX.Y 形式的版本号」加「有 YYYY-MM-DD 形式的日期」。
        # 版本号本身是否与更新日志一致，由后面 6o 那条守。
        import re as _re
        check("4y2. 数据日期改由版本行呈现",
              bool(_re.search(r"v\d+\.\d+", ver)) and
              bool(_re.search(r"\d{4}-\d{2}-\d{2}", ver)),
              repr(ver.strip()[:60]))
    check("4z. 提示条随数据来源自动切换（无需手工改文案）",
          page.evaluate("DataSource.isSample()") == (src == "sample"))

    # ---------------- 内容区块 ----------------
    check("4k. 树种汇总表 8 行",
          page.eval_on_selector_all("#speciesTableBody tr", "e=>e.length") == 8)
    check("4l. 样点卡片 3 张",
          page.eval_on_selector_all(".plot-card", "e=>e.length") == 3)
    # 这条只管**本站自己的**图片（images/ 下的照片、logo、二维码）。
    # 两类要排除，排除的理由不一样：
    #   · Leaflet 瓦片 —— 外部服务器（高德/OSM）的 <img>，掉几张是网络问题，
    #     不是站点缺资源；把它算进来会让这条断言变成网络体检
    #   · loading="lazy" 的图集缩略图 —— 在视口外本来就不该加载，
    #     早先直接断言「所有 img 都 complete」等于把浏览器的按需加载当成 bug
    # 懒加载的那批单独在下一条验：滚进视口后必须真的能加载出来。
    _OWN = """i => !i.closest('.leaflet-container') &&
                   (i.getAttribute('src')||'').indexOf('http') !== 0"""
    eager_bad = page.evaluate("""()=>Array.from(document.images)
        .filter(%s)
        .filter(i=>i.getAttribute('loading')!=='lazy')
        .filter(i=>!(i.complete && i.naturalWidth>0))
        .map(i=>i.getAttribute('src'))""" % _OWN)
    own_n = page.evaluate("Array.from(document.images).filter(%s).length" % _OWN)
    check("4m. 本站图片（非懒加载）全部就绪", not eager_bad,
          "共 %d 张，失败 %s" % (own_n, eager_bad or "无"))

    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)
    lazy_bad = page.evaluate("""()=>Array.from(document.images)
        .filter(%s)
        .filter(i=>!(i.complete && i.naturalWidth>0))
        .map(i=>i.getAttribute('src'))""" % _OWN)
    check("4m2. 懒加载图片滚进视口后也能加载", not lazy_bad, "失败 %s" % (lazy_bad or "无"))
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(400)

    # ---------------- 内容完整性 ----------------
    # 占位符已全部填完，placeholders.js 也已移除。这里反向断言：
    # 正文里不该再出现任何 [TO FILL] 残留。
    left = page.evaluate("(document.body.innerText.match(/\\[TO FILL/g)||[]).length")
    check("5a. 正文无待填占位符残留", left == 0, "残留 %d 处" % left)
    check("5b. 辅助脚本已移除", page.evaluate("typeof window.__todoHelper === 'undefined'"))
    empties = page.evaluate(
        "[...document.querySelectorAll('[data-i18n],[data-i18n-html]')]"
        ".filter(e=>!e.textContent.trim()).length")
    check("5c. 所有 i18n 节点都有文案（无空词条）", empties == 0, "空节点 %d 个" % empties)

    # ---------------- 页脚 ----------------
    check("6a. 页脚存在", page.query_selector("footer .copyright") is not None)
    # 页脚监测规模一行：「20 棵树 · 8 个树种 · 3 个样点」。
    # 数字必须从 trees.js 现算，不能写死在 HTML 里 —— 下面几条就是防止
    # 有人图省事把数字又敲回去，只要和 TREES 对不上就红。
    fc = page.evaluate("""() => {
        const host = document.getElementById('footerComposition');
        return {
            exists:  !!host,
            nums:    [...document.querySelectorAll('#footerComposition .fs-item b')]
                        .map(e => e.textContent.trim()),
            lines:   host ? host.getClientRects().length : 0,
            trueTrees:   TREES.length,
            trueSpecies: new Set(TREES.map(t => t.species)).size,
            truePlots:   new Set(TREES.map(t => t.plot)).size
        };
    }""")
    check("6b. 页脚监测规模一行存在", fc["exists"])
    check("6c. 三个数字：株数 / 树种数 / 样点数",
          fc["nums"] == [str(fc["trueTrees"]), str(fc["trueSpecies"]), str(fc["truePlots"])],
          "页面=%s 实际=%s" % (fc["nums"],
                              [fc["trueTrees"], fc["trueSpecies"], fc["truePlots"]]))
    check("6d. 确实是一行（没折行）", fc["lines"] == 1, "占 %d 行" % fc["lines"])
    hard = page.evaluate(
        "!!document.querySelector('footer .post-count, footer .numbers')")
    check("6e. 页脚不再有写死的数字方块", not hard)

    # ---------------- 更新日志 ----------------
    check("6f. 版本行右侧有更新日志按钮",
          page.evaluate("!!document.querySelector('.site-version #changelogBtn')"))
    check("6g. 按钮有文案（i18n 已接上）",
          bool((page.inner_text("#changelogBtn") or "").strip()),
          repr(page.inner_text("#changelogBtn")))
    check("6h. 未点击时弹层不存在（不占首屏）",
          page.evaluate("!document.querySelector('.changelog')"))

    page.click("#changelogBtn")
    page.wait_for_timeout(500)
    cl = page.evaluate("""() => {
        const vs = [...document.querySelectorAll('.cl-v')].map(e => e.textContent);
        const num = s => s.replace(/^v/, '').split('.').map(Number);
        const desc = vs.every((v, i) => {
            if (!i) return true;
            const a = num(vs[i-1]), b = num(v);
            for (let k = 0; k < 3; k++)
                if ((a[k]||0) !== (b[k]||0)) return (a[k]||0) > (b[k]||0);
            return true;
        });
        return {
            open:    document.querySelector('.changelog').classList.contains('is-open'),
            n:       vs.length,
            versions: vs,
            desc:    desc,
            latest:  vs[0],
            /* 每条都必须有标题和至少一条内容 —— 空条目等于没写 */
            filled:  [...document.querySelectorAll('.cl-entry')].every(e =>
                        e.querySelector('.cl-title').textContent.trim() &&
                        e.querySelectorAll('.cl-items li').length > 0),
            kinds:   [...document.querySelectorAll('.cl-kind')]
                        .every(e => e.textContent.trim()),
            locked:  document.body.style.overflow === 'hidden'
        };
    }""")
    check("6i. 点击后弹层打开", cl["open"])
    check("6j. 条目数 >= 10（覆盖到未发布阶段）", cl["n"] >= 10, "%d 条" % cl["n"])
    check("6k. 版本号从新到旧排列", cl["desc"], str(cl["versions"]))
    check("6l. 每条都有标题与内容", cl["filled"])
    check("6m. 变更类型标签都有译名", cl["kinds"])
    check("6n. 弹层打开时锁住背景滚动", cl["locked"])

    # 版本行写的版本号，必须和日志里最新一条一致 —— 最容易忘同步的就是这里
    ver_line = page.inner_text(".site-version") or ""
    check("6o. 版本行与日志最新版本一致",
          cl["latest"].lstrip("v") in ver_line,
          "版本行=%r 日志最新=%s" % (ver_line.strip()[:40], cl["latest"]))

    # 中英双语：切语言后内容要跟着换
    page.evaluate("Lang.set('zh')")
    page.wait_for_timeout(500)
    zh_title = page.eval_on_selector(".cl-entry .cl-title", "e=>e.textContent")
    page.evaluate("Lang.set('en')")
    page.wait_for_timeout(500)
    en_title = page.eval_on_selector(".cl-entry .cl-title", "e=>e.textContent")
    check("6p. 日志正文随语言切换", zh_title != en_title and zh_title and en_title,
          "zh=%r en=%r" % (zh_title[:24], en_title[:24]))

    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    check("6q. Esc 可关闭且恢复背景滚动",
          page.evaluate("!document.querySelector('.changelog').classList.contains('is-open')"
                        " && document.body.style.overflow === ''"))

    # ---------------- 响应式 ----------------
    for w in (1280, 1024, 768, 414, 360):
        page.set_viewport_size({"width": w, "height": 900})
        page.wait_for_timeout(700)
        ok = page.evaluate(
            "document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2")
        sw = page.evaluate("document.documentElement.scrollWidth")
        check(f"7. {w}px 无横向溢出", ok, f"scrollW={sw}")

    # 示意图在窄屏下不能被压到看不清：应容器内横滚，且标注不低于 9px
    for w in (1280, 414, 360):
        page.set_viewport_size({"width": w, "height": 900})
        page.wait_for_timeout(600)
        cap = page.evaluate(
            "13 * document.getElementById('netDiagram').getBoundingClientRect().width / 1040")
        check(f"7b. {w}px 下示意图标注仍可读", cap >= 8.9, f"约 {cap:.1f}px")
    page.set_viewport_size({"width": 360, "height": 900})
    page.wait_for_timeout(500)
    check("7c. 窄屏显示横向滑动提示",
          page.evaluate("getComputedStyle(document.querySelector('.net-hint')).display") == "block")

    # 窄屏汉堡菜单
    page.set_viewport_size({"width": 414, "height": 900})
    page.wait_for_timeout(600)
    toggle_shown = page.evaluate("getComputedStyle(document.querySelector('.nav-toggle')).display")
    check("8a. 窄屏显示汉堡按钮", toggle_shown != "none", f"display={toggle_shown}")
    page.click(".nav-toggle")
    page.wait_for_timeout(500)
    opened = page.evaluate("document.querySelector('.primary-menu').classList.contains('is-open')")
    menu_h = page.evaluate("document.querySelector('.primary-menu').getBoundingClientRect().height")
    check("8b. 点汉堡展开菜单", opened and menu_h > 50, f"菜单高={menu_h:.0f}px")
    page.click(".main-menu > li.has-children > a")
    page.wait_for_timeout(500)
    sub_open = page.evaluate(
        "document.querySelector('.main-menu > li.has-children').classList.contains('is-open')")
    sub_h = page.evaluate("document.querySelector('.sub-menu').getBoundingClientRect().height")
    check("8c. 窄屏点父项展开二级菜单", sub_open and sub_h > 20, f"子菜单高={sub_h:.0f}px")

    # ==================================================================
    # 9. 暖白主题 + 幽灵光标（2026-07-28 换配色时新增）
    # ==================================================================
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2000)

    def _rgb(s):
        """'#faf8f5' / '#fff' / 'rgb(a,b,c)' / 'rgba(...)' -> (r,g,b)

        只用 \\d+ 抓数字是不够的：十六进制里的字母会被漏掉，
        '#faf8f5' 被解析成黑色，于是所有对比度都算错。"""
        s = (s or "").strip()
        if s.startswith("#"):
            h = s[1:]
            if len(h) == 3:
                h = "".join(c * 2 for c in h)
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
        n = re.findall(r"[\d.]+", s)
        return tuple(int(float(x)) for x in n[:3])

    def _lum(c):
        def f(v):
            v /= 255.0
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])

    def _contrast(a, b):
        la, lb = _lum(a), _lum(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

    check("9a. 默认是深色主题（首访无 data-theme 属性）",
          page.evaluate("document.documentElement.getAttribute('data-theme')") is None)
    body_bg = _rgb(page.evaluate("getComputedStyle(document.body).backgroundColor"))
    check("9a2. body 背景是深色", _lum(body_bg) < 0.1, "亮度 %.3f" % _lum(body_bg))

    # 逐个量文字对比度。两套主题都要过 —— 浅色主题最容易「灰字压浅底」，
    # 深色主题最容易「暗灰字压黑底」，两边的失败方式不一样，必须分别验。
    #
    # 取背景时沿祖先链找第一个不透明的，找不到才回落到 body ——
    # 否则链走到头拿到 transparent，会被当成黑色，把合格的判成不合格。
    _BG_JS = """(s)=>{
        const e=document.querySelector(s); if(!e) return null;
        const opaque = v => v && v!=='transparent' &&
            !/rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*0\\s*\\)/.test(v);
        let bg=null,n=e;
        while(n){const v=getComputedStyle(n).backgroundColor;
                 if(opaque(v)){bg=v;break;} n=n.parentElement;}
        if(!bg) bg=getComputedStyle(document.body).backgroundColor;
        return {c:getComputedStyle(e).color,b:bg,fs:getComputedStyle(e).fontSize};}"""

    _TARGETS = [("h3 标题", "#about h3"), ("导航", ".main-menu > li > a"),
                ("正文", "#about p"), ("脚注", ".footnote"),
                ("表头", ".data-table thead th"), ("图注", ".gallery figcaption"),
                ("示意图说明", ".net-detail"), ("页脚", ".copyright")]

    def check_contrast(tag):
        for label, sel in _TARGETS:
            info = page.evaluate(_BG_JS, sel)
            if not info:
                check("%s %s 对比度" % (tag, label), False, "选择器没匹配到")
                continue
            ratio = _contrast(_rgb(info["c"]), _rgb(info["b"]))
            need = 3.0 if float(info["fs"].replace("px", "")) >= 18 else 4.5
            check("%s %s 对比度 >= %.1f" % (tag, label, need), ratio >= need, "%.1f:1" % ratio)

    check_contrast("9b.[深色]")

    # --- 幽灵光标 ---
    check("9c. 幽灵光标存在", page.query_selector("#netGhost") is not None)
    check("9d. 幽灵光标不拦截点击",
          page.evaluate("getComputedStyle(document.querySelector('#netGhost')).pointerEvents") == "none")

    _POS = ("()=>{const m=new DOMMatrix(getComputedStyle("
            "document.querySelector('#netGhost')).transform);return [m.e,m.f];}")
    p1 = page.evaluate(_POS)
    page.wait_for_timeout(1600)
    p2 = page.evaluate(_POS)
    moved = abs(p1[0] - p2[0]) + abs(p1[1] - p2[1])
    check("9e. 幽灵光标在移动", moved > 5, "1.6s 位移 %.0fpx" % moved)

    # 涟漪必须有实际尺寸。踩过的坑：给 .gh-ring 加了 transform-box: fill-box，
    # 而 circle 的 fill 是 none -> fill-box 是空盒 -> scale() 缩放空盒 = 完全看不见。
    # 动画照跑、getComputedStyle 一切正常，只有量宽高才发现是 0。
    page.evaluate("()=>{document.querySelectorAll('#netGhost, #netGhost .gh-ring')"
                  ".forEach(e=>e.getAnimations().forEach(a=>{a.pause();a.currentTime=1540;}));}")
    page.wait_for_timeout(250)
    ring_w = page.evaluate("document.querySelector('#netGhost .gh-ring').getBoundingClientRect().width")
    check("9f. 点击涟漪有实际尺寸（非空盒）", ring_w > 5, "直径 %.0fpx" % ring_w)

    # 数据包不能滞留在 SVG 原点。踩过的坑：用正的 begin 错开出发时间，
    # 到点之前 SMIL 让元素停在静态位置 (0,0)，开头几秒左上角有几个脏点。
    # 改成负 begin 后从第一帧起就在路径上。
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(800)
    stranded = page.evaluate("""()=>{const s=document.getElementById('netDiagram');
        const sr=s.getBoundingClientRect();
        return [...s.querySelectorAll('.pkt')].filter(e=>{const b=e.getBoundingClientRect();
            return b.width>0 && (b.x-sr.x)<40 && (b.y-sr.y)<40;}).length;}""")
    check("9g. 无数据包滞留在图左上角", stranded == 0, "滞留 %d 个" % stranded)

    # --- 提示在用户上手后收敛 ---
    check("9h. 初始未标记 explored", page.evaluate("SiteNetwork.isExplored()") is False)
    page.eval_on_selector(".node[data-node='logger']",
                          "e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true}))")
    page.wait_for_timeout(400)
    check("9i. 交互后幽灵动画停止",
          page.evaluate("SiteNetwork.isExplored()") is True and
          page.evaluate("getComputedStyle(document.querySelector('#netGhost')).animationName") == "none")
    check("9j. 收敛不影响节点点击功能",
          page.evaluate("SiteNetwork.activeNode()") == "logger")

    # 注：2026-07-31 曾加过两条「正文行长」断言（限制 --measure 到 55ch），
    # 用户看过实际效果后要求回退整套排版改动，故这两条断言一并移除。

    # ==================================================================
    # 11. 环境条件面板（2026-08-02 新增）
    # ==================================================================
    page.set_viewport_size({"width": 1440, "height": 1100})
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2600)

    check("11a. 环境数据已载入",
          page.evaluate("typeof ENV_VARS !== 'undefined' && ENV_VARS.length > 0"),
          "%s 个变量" % page.evaluate("typeof ENV_VARS!=='undefined'?ENV_VARS.length:0"))
    check("11b. 标签数与变量数一致",
          page.eval_on_selector_all("#envTags .env-tag", "e=>e.length")
          == page.evaluate("ENV_VARS.length"))
    check("11c. 默认只开两条（光照 + 气温）",
          page.evaluate("EnvChart.active().join(',')") == "light,airTemp",
          page.evaluate("EnvChart.active().join(',')"))

    # 环境数据的时间窗必须和树木数据一致 —— 否则共用时间轴时会一头到底、
    # 另一头还在滚。导入脚本负责裁剪，这里守住结果。
    same = page.evaluate("""()=>{
        const a=OBS_META.span, b=ENV_META.span;
        return Math.abs(a[0]-b[0])<=1800000 && Math.abs(a[1]-b[1])<=1800000;}""")
    check("11d. 环境数据时间窗与树木数据一致（容差 30 分钟）", same,
          page.evaluate("[new Date(OBS_META.span[0]).toISOString().slice(0,16),"
                        "new Date(ENV_META.span[0]).toISOString().slice(0,16)].join(' vs ')"))

    # --- 共用时间轴：两个方向都要能带动对方 ---
    page.evaluate("""()=>{const a=EnvChart.chart().xAxis[0], e=a.getExtremes();
        a.setExtremes((e.dataMin+e.dataMax)/2, e.dataMax);}""")
    page.wait_for_timeout(800)
    d1 = page.evaluate("Math.abs(SiteChart.chart.xAxis[0].getExtremes().min"
                       " - EnvChart.chart().xAxis[0].getExtremes().min)")
    check("11e. 在环境图缩放 -> 主图跟随", d1 <= 1000, "相差 %.0f ms" % d1)

    page.evaluate("""()=>{const a=SiteChart.chart.xAxis[0], e=a.getExtremes();
        a.setExtremes(e.dataMin, e.dataMin+(e.dataMax-e.dataMin)/4);}""")
    page.wait_for_timeout(800)
    d2 = page.evaluate("Math.abs(SiteChart.chart.xAxis[0].getExtremes().min"
                       " - EnvChart.chart().xAxis[0].getExtremes().min)")
    check("11f. 在主图缩放 -> 环境图跟随", d2 <= 1000, "相差 %.0f ms" % d2)
    # 双向联动最容易写出无限循环（A 通知 B，B 的 setExtremes 又通知回 A）。
    # 页面还能算术就说明 syncing 标志起作用了，没被事件风暴卡死。
    check("11g. 双向联动没有陷入死循环", page.evaluate("1+1") == 2)

    # --- 标签开关 ---
    n0 = len(page.evaluate("EnvChart.active()"))
    page.eval_on_selector("#envTags .env-tag[data-key='rain']", "e=>e.click()")
    page.wait_for_timeout(700)
    check("11h. 点标签可增加曲线",
          len(page.evaluate("EnvChart.active()")) == n0 + 1,
          "%d -> %d" % (n0, len(page.evaluate("EnvChart.active()"))))
    check("11i. 降雨用柱状而非折线（事件量，折线会连出不存在的斜坡）",
          page.evaluate("EnvChart.chart().series.find(s=>s.userOptions.type==='column')!=null"))
    # 三条及以上时纵轴挤不下，改为隐藏并给出「独立缩放」提醒
    check("11j. 三条以上时隐藏纵轴并提示独立缩放",
          page.evaluate("EnvChart.chart().yAxis.every(a=>!a.options.labels.enabled)")
          and page.evaluate("getComputedStyle(document.getElementById('envScaleNote')).display") != "none")

    page.click("#envAll")
    page.wait_for_timeout(1300)
    check("11k. 全选可显示全部变量",
          len(page.evaluate("EnvChart.active()")) == page.evaluate("ENV_VARS.length"))
    page.click("#envNone")
    page.wait_for_timeout(800)
    check("11l. 清空后给出空态提示",
          len(page.evaluate("EnvChart.active()")) == 0 and
          page.evaluate("getComputedStyle(document.getElementById('envEmpty')).display") != "none")

    page.evaluate("EnvChart.toggle('light'); EnvChart.toggle('airTemp')")
    page.wait_for_timeout(800)

    # --- 跟随语言与主题 ---
    en_tags = page.eval_on_selector_all("#envTags .et-name", "e=>e.map(x=>x.textContent)")
    page.click(".lang-toggle")
    page.wait_for_timeout(1500)
    zh_tags = page.eval_on_selector_all("#envTags .et-name", "e=>e.map(x=>x.textContent)")
    check("11m. 标签文案随语言切换",
          en_tags[:2] != zh_tags[:2] and all(zh_tags[:2]),
          "%s -> %s" % (en_tags[:2], zh_tags[:2]))
    page.click(".lang-toggle")
    page.wait_for_timeout(1500)

    page.click("#themeToggle")
    page.wait_for_timeout(1500)
    check("11n. 图表跟随主题重建",
          str(page.evaluate("EnvChart.chart().options.chart.backgroundColor")).lower()
          == page.evaluate("getComputedStyle(document.documentElement)"
                           ".getPropertyValue('--bg').trim()").lower())
    page.click("#themeToggle")
    page.wait_for_timeout(1200)

    # --- 上下叠放 + 底部共用一条时间轴（2026-08-02 改版）---
    # 两张图要贴着看，所以：日期刻度、navigator、scrollbar 全页只出现一次，
    # 都在下方那张图的底部；上方图表只保留 rangeSelector 按钮。
    lay = page.evaluate("""()=>{
        const a=SiteChart.chart, b=EnvChart.chart();
        return {aNav:!!a.navigator, aSb:!!a.scrollbar,
                bNav:!!b.navigator, bSb:!!b.scrollbar,
                aLabels:a.xAxis[0].options.labels.enabled !== false,
                aLeft:Math.round(a.plotLeft), bLeft:Math.round(b.plotLeft),
                aWidth:Math.round(a.plotWidth), bWidth:Math.round(b.plotWidth)};}""")
    # 时间轴只有一条，位置在两张图**中间**（即上图底部）。
    # 曾经放在下方图表底部，后按要求挪到中间；无论放哪，"只有一条"这条不变。
    check("11o. 时间轴只有一条，在两图中间（上图底部）",
          lay["aNav"] and lay["aSb"] and (not lay["bNav"]) and (not lay["bSb"]),
          "上图 nav=%s sb=%s / 下图 nav=%s sb=%s"
          % (lay["aNav"], lay["aSb"], lay["bNav"], lay["bSb"]))
    # 两张图各标一次日期：曾经关掉过上图的刻度（想着"一条时间轴就够"），
    # 但看上图时要低头到下图找日期，实际很别扭。刻度位置本来就一致。
    check("11p. 两张图都标日期刻度", lay["aLabels"])
    # 绘图区左右不对齐的话，同一时刻在两张图上不在同一条竖线上，叠放就失去意义
    check("11q. 两张图绘图区左右对齐",
          lay["aLeft"] == lay["bLeft"] and lay["aWidth"] == lay["bWidth"],
          "上 %d+%d / 下 %d+%d" % (lay["aLeft"], lay["aWidth"], lay["bLeft"], lay["bWidth"]))

    # 首屏就必须一致：主图的 rangeSelector 默认选「1周」，建图时自己缩到最后 7 天，
    # 而环境图是后建的、默认全区间 —— 不主动同步一次，首屏就是两段不同的时间。
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(3000)
    d0 = page.evaluate("Math.abs(SiteChart.chart.xAxis[0].getExtremes().min"
                       " - EnvChart.chart().xAxis[0].getExtremes().min)")
    check("11r. 首屏两张图时间范围就一致（无需先操作）", d0 <= 1000, "相差 %.0f ms" % d0)

    # --- 联动指针：悬停任一张图，两图同时出竖线，一个提示框列出全部变量 ---
    #
    # ⚠️ 必须先把图表滚进视口再动鼠标。page.mouse 用的是**视口坐标**，
    # 图表在页面下方、不滚进来的话坐标落在视口之外，鼠标事件根本到不了
    # Highcharts —— 现象是"不报错，但提示框和竖线都不出现"。
    # 另外 mouse.move 要带 steps：一步跳过去只产生一个 mousemove，
    # Highcharts 的 pointer 可能来不及处理。
    page.evaluate("EnvChart.setAll(false); EnvChart.toggle('light'); EnvChart.toggle('airTemp')")
    page.wait_for_timeout(700)
    page.evaluate("document.querySelector('.chart-stack').scrollIntoView({block:'center'})")
    page.wait_for_timeout(800)

    def hover(which, frac=0.5):
        box = page.evaluate("""(a)=>{
            const c = a[0]==='main' ? SiteChart.chart : EnvChart.chart();
            const r = c.container.getBoundingClientRect();
            return {x:r.left+c.plotLeft+c.plotWidth*a[1], y:r.top+c.plotTop+c.plotHeight/2};}""",
            [which, frac])
        page.mouse.move(box["x"] - 150, box["y"])
        page.mouse.move(box["x"], box["y"], steps=14)
        page.wait_for_timeout(650)
        return page.evaluate("""()=>({
            main: document.querySelectorAll('#chartDIASF .highcharts-crosshair').length,
            env:  document.querySelectorAll('#chartEnv .highcharts-crosshair').length,
            tip:  (()=>{const e=document.querySelector('.highcharts-tooltip');
                        return e ? e.textContent.replace(/\\s+/g,' ').trim() : '';})()})""")

    h1 = hover("main")
    check("11s. 悬停上图：两张图都出现竖线",
          h1["main"] >= 1 and h1["env"] >= 1,
          "上图 %d / 下图 %d" % (h1["main"], h1["env"]))
    check("11t. 提示框同时含树木与环境两类变量",
          ("Sap flux" in h1["tip"] or "液流" in h1["tip"]) and
          ("Light" in h1["tip"] or "光照" in h1["tip"]),
          repr(h1["tip"][:70]))

    h2 = hover("env", 0.35)
    check("11u. 悬停下图：两张图同样都出竖线",
          h2["main"] >= 1 and h2["env"] >= 1,
          "上图 %d / 下图 %d" % (h2["main"], h2["env"]))
    check("11v. 两边悬停给出同一套内容（同一时刻的全部变量）",
          ("Sap flux" in h2["tip"] or "液流" in h2["tip"]) and
          ("Light" in h2["tip"] or "光照" in h2["tip"]),
          repr(h2["tip"][:70]))

    # --- 风向：画成箭头（2026-08-02 从散点改过来）---
    # 角度当数值画是错的：0° 与 360° 同向，折线会在越过正北时拉出贯穿全图的竖线；
    # 散点没有这条竖线，但读者仍要把「210 这个数」在脑子里翻译成「西南风」。
    # （曾经还配过一个风玫瑰图，用户看过后要求去掉，相关断言一并移除。）
    page.evaluate("EnvChart.setAll(false); EnvChart.toggle('windSpeed'); EnvChart.toggle('windDir')")
    page.wait_for_timeout(1300)
    w = page.evaluate("""()=>({
        arrows: document.querySelectorAll('.highcharts-wind-arrows path').length,
        axis: EnvChart.chart().yAxis.some(a=>a.options.labels.enabled &&
                /wind dir|风向/i.test((a.options.title||{}).text||''))})""")
    check("11w. 风向画成箭头而不是曲线/散点", w["arrows"] > 0, "箭头 path %d 条" % w["arrows"])
    # 风向只画箭头、不画线，那条 0–360° 的纵轴留着只会让人以为"有条线没显示"
    check("11x. 风向不占用纵轴刻度", not w["axis"])

    # 箭头疏密要跟着视窗走。写死步长时，风速画满 1056 点而箭头只有 88 个，
    # 并排看像"风向的更新频率比风速低" —— 其实两者时间戳完全一致。
    def arrow_ratio(frac):
        page.evaluate("""(f)=>{const a=EnvChart.chart().xAxis[0];
            a.setExtremes(a.dataMin, a.dataMin+(a.dataMax-a.dataMin)*f);}""", frac)
        page.wait_for_timeout(900)
        n = page.evaluate("document.querySelectorAll('.highcharts-wind-arrows path').length") / 2
        vis = page.evaluate("""()=>{const a=EnvChart.chart().xAxis[0], e=a.getExtremes();
            return ENV_DATA.windDir.filter(p=>p[0]>=e.min&&p[0]<=e.max).length;}""")
        return n / max(vis, 1)

    r_all, r_zoom = arrow_ratio(1.0), arrow_ratio(0.06)
    check("11y. 箭头疏密随缩放自适应（放大后接近逐点）",
          r_zoom > r_all * 2 and r_zoom > 0.3,
          "全区间 %.0f%% -> 放大后 %.0f%% 的采样点有箭头" % (100 * r_all, 100 * r_zoom))

    # --- 图表 / 地图配色取自 CSS 变量 ---
    # 不写死具体色值，直接和 CSS 变量比 —— 这样换主题、调色都不用改测试，
    # 但「图表没跟着主题走」这个真正的回归依然会被抓到。
    _VAR = "(n)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()"
    cols = page.evaluate("SiteChart.chart.series.map(s=>s.color)")
    v_sf = page.evaluate(_VAR, "--sapflow")
    v_rd = page.evaluate(_VAR, "--radial")
    check("9k. 图表序列色 == --sapflow / --radial",
          str(cols[0]).lower() == v_sf.lower() and str(cols[1]).lower() == v_rd.lower(),
          "%s vs %s / %s" % (cols[:2], v_sf, v_rd))
    cbg = page.evaluate("SiteChart.chart.options.chart.backgroundColor")
    check("9l. 图表背景 == --bg", str(cbg).lower() == page.evaluate(_VAR, "--bg").lower(), str(cbg))
    mc = page.evaluate("SiteMap.markers['DT1-BH1-1137'].options.fillColor")
    check("9m. 地图 DT1 标记色 == --dt1",
          str(mc).lower() == page.evaluate(_VAR, "--dt1").lower(), str(mc))

    # ==================================================================
    # 10. 日 / 夜主题切换（2026-07-28 新增）
    # ==================================================================
    page.click("#themeToggle")
    page.wait_for_timeout(1400)
    check("10a. 切到浅色：data-theme=light",
          page.evaluate("document.documentElement.getAttribute('data-theme')") == "light")
    lbg = _rgb(page.evaluate("getComputedStyle(document.body).backgroundColor"))
    check("10b. body 背景变浅", _lum(lbg) > 0.75, "亮度 %.2f" % _lum(lbg))

    check_contrast("10c.[浅色]")

    # 图表和地图的颜色是建对象时烤进 SVG 属性 / divIcon HTML 的，
    # 光换 CSS 变量不会让已经画出来的东西跟着变 —— 必须重建/重设。
    cols2 = page.evaluate("SiteChart.chart.series.map(s=>s.color)")
    check("10d. 图表跟着换主题（重建过）",
          str(cols2[0]).lower() == page.evaluate(_VAR, "--sapflow").lower() and
          str(cols2[0]).lower() != str(cols[0]).lower(), str(cols2[:2]))
    mc2 = page.evaluate("SiteMap.markers['DT1-BH1-1137'].options.fillColor")
    check("10e. 地图标记跟着换主题",
          str(mc2).lower() == page.evaluate(_VAR, "--dt1").lower() and
          str(mc2).lower() != str(mc).lower(), str(mc2))

    # 选择要能记住
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1800)
    check("10f. 刷新后仍是浅色（选择存进了 localStorage）",
          page.evaluate("document.documentElement.getAttribute('data-theme')") == "light")

    # 不能有主题闪屏：首绘之前 data-theme 就得定下来。
    # 靠的是 index.html <head> 里的内联脚本；只在 theme.js 里设置就晚了，
    # 页面会先按默认深色画一帧再跳成浅色。
    # 就用当前这个 page 重新导航，不另开页面：
    # 一来 localStorage 才是同一份（另起 context 是空的，测不到「记住的选择」），
    # 二来 browser.new_page() 建的隐式 context 不允许再 new_page()。
    # wait_until="commit" 在 HTML 刚开始解析时就返回，此时 <head> 里的
    # 内联脚本已执行、<body> 还没渲染完 —— 正是要检查的那一刻。
    page.goto(URL, wait_until="commit")
    early = page.evaluate("document.documentElement.getAttribute('data-theme')")
    check("10g. DOM 刚提交时主题已定（无闪屏）", early == "light", repr(early))
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1800)

    # 切回深色
    page.click("#themeToggle")
    page.wait_for_timeout(1400)
    check("10h. 切回深色：data-theme 被移除",
          page.evaluate("document.documentElement.getAttribute('data-theme')") is None)

    # 按钮文案随语言走，且说的是「点了会变成什么」
    en_title = page.get_attribute("#themeToggle", "title")
    page.click(".lang-toggle")
    page.wait_for_timeout(1400)
    zh_title = page.get_attribute("#themeToggle", "title")
    check("10i. 主题按钮文案随语言切换",
          bool(en_title and zh_title) and en_title != zh_title,
          "%r -> %r" % (en_title, zh_title))
    page.click(".lang-toggle")
    page.wait_for_timeout(1400)

    # 换主题不能把别的功能弄坏
    page.eval_on_selector(".node[data-node='logger']",
                          "e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true}))")
    page.wait_for_timeout(300)
    check("10j. 换过主题后示意图仍可点", page.evaluate("SiteNetwork.activeNode()") == "logger")
    page.evaluate("SiteChart.setTree('DT2-LYS1-1144')")
    page.wait_for_timeout(500)
    check("10k. 换过主题后图表仍可切树",
          page.evaluate("SiteChart.currentTree()") == "DT2-LYS1-1144")

    # ---------------- 手机端 ----------------
    # 用真实设备描述符（含触摸、dpr、UA），不是简单改视口宽度 ——
    # 触摸设备上 Highcharts 走的是另一套指针逻辑。
    for dev_name in ("iPhone SE", "iPhone 12", "Pixel 5"):
        dev = p.devices[dev_name]
        mctx = browser.new_context(**dev)
        mp = mctx.new_page()
        mp.goto(URL, wait_until="networkidle")
        mp.evaluate("LazyLoad.ensureChart(); LazyLoad.ensureMap()")
        mp.wait_for_function(
            "window.SiteChart && window.EnvChart && window.EnvChart.chart()",
            timeout=90000)
        mp.wait_for_timeout(2500)
        tag = dev_name.replace(" ", "")

        m = mp.evaluate("""() => {
            const c = SiteChart.chart, e = EnvChart.chart();
            const tags = [...document.querySelectorAll('.env-tag')];
            const rows = new Set(tags.map(t => Math.round(t.getBoundingClientRect().top)));
            const small = [];
            document.querySelectorAll('a,button,select,input').forEach(el => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                if (!r.width || !r.height) return;
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                /* 量的是**有效点击目标**：单选/复选框包在 <label> 里时，
                   点标签任意位置都生效，所以该按标签的尺寸算，
                   而不是按那个 13x13 的小圆点算。 */
                const lab = el.closest('label');
                const box = (lab && lab !== el) ? lab.getBoundingClientRect() : r;
                /* Leaflet 自己的版权署名（"Leaflet" 那个 12px 小链接）不算 ——
                   它是第三方必须保留的署名，各家地图库都是这个尺寸，
                   放大它反而会挡住地图。 */
                if (el.closest('.leaflet-control-attribution')) return;
                if (box.height < 36) small.push((el.id || el.className || el.tagName) +
                                                ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
            });
            const w = document.querySelector('.env-tags');
            return {
                scrollW: document.documentElement.scrollWidth,
                clientW: document.documentElement.clientWidth,
                mainPlotPct: Math.round(100 * c.plotWidth / c.chartWidth),
                envPlotPct: Math.round(100 * e.plotWidth / e.chartWidth),
                mainLeft: c.plotLeft, envLeft: e.plotLeft,
                mainRight: c.chartWidth - c.plotLeft - c.plotWidth,
                envRight: e.chartWidth - e.plotLeft - e.plotWidth,
                totalH: c.chartHeight + e.chartHeight,
                vh: innerHeight,
                tagRows: rows.size,
                tagsScrollable: w ? w.scrollWidth > w.clientWidth + 2 : false,
                small: small.slice(0, 6),
                smallN: small.length,
                axisTitles: [...document.querySelectorAll('.highcharts-axis-title')]
                              .map(t => t.textContent).filter(Boolean)
            };
        }""")

        check("11a.[%s] 无横向溢出" % tag,
              m["scrollW"] <= m["clientW"] + 1,
              "溢出 %d px" % (m["scrollW"] - m["clientW"]))
        check("11b.[%s] 上图绘图区占比 >= 65%%" % tag,
              m["mainPlotPct"] >= 65, "%d%%" % m["mainPlotPct"])
        check("11c.[%s] 下图绘图区占比 >= 65%%" % tag,
              m["envPlotPct"] >= 65, "%d%%" % m["envPlotPct"])
        # 这条是硬约束：两图边距不等 -> 跨图联动指针错位
        check("11d.[%s] 两图绘图区左右严格对齐" % tag,
              m["mainLeft"] == m["envLeft"] and m["mainRight"] == m["envRight"],
              "上 %s+%s / 下 %s+%s" % (m["mainLeft"], m["mainRight"],
                                       m["envLeft"], m["envRight"]))
        check("11e.[%s] 两图合计高度不超过 1.1 屏" % tag,
              m["totalH"] <= m["vh"] * 1.1,
              "%d px / 视口 %d px" % (m["totalH"], m["vh"]))
        check("11f.[%s] 环境标签收成单行横滑" % tag,
              m["tagRows"] == 1 and m["tagsScrollable"],
              "占 %d 行, 可横滑=%s" % (m["tagRows"], m["tagsScrollable"]))
        check("11g.[%s] 窄屏不显示竖排轴标题" % tag,
              not m["axisTitles"], str(m["axisTitles"]))
        check("11h.[%s] 可点元素高度都不小于 36px" % tag,
              m["smallN"] == 0, "%d 个偏小: %s" % (m["smallN"], m["small"]))

        # 触摸能不能真的操作图表
        cel = mp.query_selector("#chartDIASF")
        cel.scroll_into_view_if_needed()
        mp.wait_for_timeout(400)
        bb = cel.bounding_box()
        mp.touchscreen.tap(bb["x"] + bb["width"] * 0.5, bb["y"] + bb["height"] * 0.5)
        mp.wait_for_timeout(800)
        check("11i.[%s] 触摸点击图表能出提示框" % tag,
              mp.evaluate("!!document.querySelector('.highcharts-tooltip text')"))

        mctx.close()

    browser.close()

print("\n" + "=" * 62)
passed = sum(1 for _, ok, _ in results if ok)
print(f"结果: {passed}/{len(results)} 通过")
fails = [n for n, ok, _ in results if not ok]
if fails:
    print("未通过: " + ", ".join(fails))
    sys.exit(1)
print("全部通过")

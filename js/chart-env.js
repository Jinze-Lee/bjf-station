/* ==========================================================================
 * 环境条件图表
 *
 * 与上方 Tree data 图表的关系：
 *   共用时间轴。任一张图缩放/拖动/按 1d·1w·All，另一张立刻跟着走。
 *   实现见文件末尾的 link()：监听 afterSetExtremes，互相 setExtremes。
 *
 * 为什么不做双轴：环境变量有 11 个，量纲从 klux 到 hPa 到 µg/m³ 全不一样，
 * 两个轴根本不够分。改成「每条曲线各自一个隐藏轴 + 彩色标签」：
 *   · 选中 1–2 个变量时，把轴显示出来（左/右各一个，颜色与曲线一致），
 *     这时能直接从轴上读数
 *   · 选中 3 个及以上时，轴会挤成一团，索性全部隐藏，改用提示框读准确值，
 *     并在图下方明确写出「各曲线为独立缩放，仅可比较形状与时相」
 * 这个取舍是有代价的，所以宁可把话说在明处，不让人误读。
 *
 * 数据：js/environment.js（ENV_VARS / ENV_DATA / ENV_META）
 * 对外句柄：window.EnvChart = { chart, toggle(key), active(), setAll(bool) }
 * ========================================================================== */

(function () {
    'use strict';

    var CONTAINER = 'chartEnv';

    /* 每个变量一个颜色。挑色三条约束：
     *   ① 深浅两套主题下都要看得清（都避开极暗与极亮）
     *   ② 不能和上方图表的液流蓝 / 径向橙撞色，否则两张图对照时会误认
     *   ③ 语义要对得上：光照暖黄、雨水蓝、土壤褐绿、气温橙红 */
    var COLORS = {
        light:        '#e8b33c',   // 光照 —— 暖黄
        airTemp:      '#e2603f',   // 气温 —— 橙红
        rh:           '#3aa8c1',   // 湿度 —— 青
        rain:         '#4a7fd4',   // 降雨 —— 蓝
        soilMoisture: '#7fa05a',   // 土壤水分 —— 草绿
        soilTemp:     '#a074c4',   // 土壤温度 —— 紫
        pressure:     '#9a9a9a',   // 气压 —— 中性灰
        windSpeed:    '#48b3a2',   // 风速 —— 青绿
        windDir:      '#c58ab8',   // 风向 —— 粉紫
        pm25:         '#d4739a',   // PM2.5 —— 品红
        pm10:         '#b07d9e'    // PM10 —— 藕
    };

    /* 与 chart.js 里 chart.marginLeft / marginRight 必须**一致**。
     * 两张图上下叠着看，绘图区左右不对齐的话，同一时刻不在同一条竖线上，
     * 对比就没意义了。改这里要同步改 chart.js。 */
    var PLOT_MARGIN = 92;

    var chart = null;
    var active = {};          // key -> true/false

    function t(k) { return window.Lang ? Lang.t(k) : k; }
    function label(key) { return t('env.' + key); }

    function cssVar(name, fallback) {
        try {
            var v = getComputedStyle(document.documentElement)
                        .getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) { return fallback; }
    }

    function palette() {
        return {
            bg:     cssVar('--bg', '#202020'),
            grid:   cssVar('--grid', '#404040'),
            rule:   cssVar('--rule-strong', '#454545'),
            text:   cssVar('--text', '#c9c9c9'),
            soft:   cssVar('--text-soft', '#9a9a9a'),
            faint:  cssVar('--text-faint', '#8a8a8a'),
            surface: cssVar('--surface', '#262626')
        };
    }

    function activeKeys() {
        return ENV_VARS.filter(function (v) { return active[v.key]; })
                       .map(function (v) { return v.key; });
    }

    /* 传副本给 Highcharts —— 同 chart.js 里的教训：setData 会接管并就地改写
     * 传入的数组，直接递 ENV_DATA[key] 会把源数据改坏。 */
    function copyOf(key) {
        var src = ENV_DATA[key] || [];
        var out = new Array(src.length);
        for (var i = 0; i < src.length; i++) { out[i] = [src[i][0], src[i][1]]; }
        return out;
    }

    function unitOf(key) {
        for (var i = 0; i < ENV_VARS.length; i++) {
            if (ENV_VARS[i].key === key) { return ENV_VARS[i].unit; }
        }
        return '';
    }

    function typeOf(key) {
        for (var i = 0; i < ENV_VARS.length; i++) {
            if (ENV_VARS[i].key === key) { return ENV_VARS[i].type; }
        }
        return 'line';
    }

    /* --- 标签栏 --- */
    function buildTags() {
        var wrap = document.getElementById('envTags');
        if (!wrap) { return; }
        wrap.innerHTML = '';

        ENV_VARS.forEach(function (v) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'env-tag' + (active[v.key] ? ' is-on' : '');
            b.setAttribute('data-key', v.key);
            b.setAttribute('aria-pressed', active[v.key] ? 'true' : 'false');
            /* 色点用内联样式：颜色来自 COLORS 表，写进 CSS 就得维护两份 */
            b.innerHTML = '<i class="et-dot" style="background:' + COLORS[v.key] + '"></i>' +
                          '<span class="et-name">' + label(v.key) + '</span>' +
                          '<span class="et-unit">' + v.unit + '</span>';
            b.addEventListener('click', function () { toggle(v.key); });
            wrap.appendChild(b);
        });
    }

    function paintTags() {
        var nodes = document.querySelectorAll('#envTags .env-tag');
        for (var i = 0; i < nodes.length; i++) {
            var k = nodes[i].getAttribute('data-key');
            nodes[i].classList.toggle('is-on', !!active[k]);
            nodes[i].setAttribute('aria-pressed', active[k] ? 'true' : 'false');
        }
        var note = document.getElementById('envScaleNote');
        if (note) {
            /* 轴藏起来的时候才需要这句提醒 */
            note.style.display = activeKeys().length >= 3 ? '' : 'none';
        }
        var empty = document.getElementById('envEmpty');
        if (empty) { empty.style.display = activeKeys().length ? 'none' : ''; }
    }

    /* --- 建图 --- */
    function build() {
        if (typeof Highcharts === 'undefined' || !Highcharts.stockChart) { return; }
        if (typeof ENV_VARS === 'undefined' || typeof ENV_DATA === 'undefined') { return; }

        var C = palette();
        var keys = activeKeys();
        var showAxes = keys.length > 0 && keys.length <= 2;

        var yAxes = [], series = [];
        keys.forEach(function (key, i) {
            var col = COLORS[key];
            /* 风向不画曲线、只画箭头，所以它的纵轴（0–360°）没有任何东西可读，
             * 留着只会占掉一侧的位置、还让人以为有条线没显示出来。 */
            var isArrow = (key === 'windDir');
            yAxes.push({
                /* 每条曲线一个独立轴，各自缩放 —— 量纲不同，共用轴没有意义 */
                labels: {
                    enabled: showAxes && !isArrow,
                    style: { color: col, fontSize: '11px' },
                    align: i === 0 ? 'left' : 'right',
                    x: i === 0 ? 4 : -4
                },
                title: {
                    text: (showAxes && !isArrow) ? label(key) + ' (' + unitOf(key) + ')' : null,
                    style: { color: col, fontSize: '12px' }
                },
                opposite: i !== 0,
                gridLineColor: i === 0 ? C.grid : 'transparent',
                gridLineWidth: i === 0 ? 1 : 0,
                gridLineDashStyle: 'longdash',
                lineColor: C.rule,
                tickColor: C.rule,
                /* 降雨从 0 起，否则一场雨会把基线抬得看不出"没下雨" */
                min: (key === 'rain' || key === 'light') ? 0 : null,
                showEmpty: false
            });

            var kind = (key === 'windDir') ? 'arrow' : typeOf(key);
            var s = {
                name: label(key),
                color: col,
                yAxis: i,
                envKey: key,          /* 给 windArrows() 认序列用 */
                data: copyOf(key),
                tooltip: {
                    valueSuffix: ' ' + unitOf(key),
                    valueDecimals: (key === 'pm25' || key === 'pm10' || key === 'windDir') ? 0 : 1
                }
            };
            if (kind === 'column') {
                s.type = 'column';
                s.pointWidth = 2;
                s.borderWidth = 0;
            } else if (kind === 'arrow') {
                /* 风向：画成箭头贴在风速曲线上，见 windArrows() 的说明。
                 * 这条 series 只负责提供数值给提示框，本身不画东西。 */
                s.type = 'line';
                s.lineWidth = 0;
                s.marker = { enabled: false };
                s.enableMouseTracking = true;
            } else if (kind === 'scatter') {
                s.type = 'scatter';
                s.marker = { radius: 1.6, symbol: 'circle' };
            } else {
                s.type = 'line';
                s.lineWidth = 1.4;
                s.marker = { enabled: false };
            }
            series.push(s);
        });

        chart = Highcharts.stockChart(CONTAINER, {
            chart: {
                backgroundColor: C.bg,
                plotBorderColor: C.bg,
                style: { fontFamily: 'inherit' },
                zooming: { type: 'x' },
                /* 与上方图表左右对齐，见 PLOT_MARGIN 的说明 */
                marginLeft: PLOT_MARGIN,
                marginRight: PLOT_MARGIN,
                spacingTop: 2,
                /* 时间轴已搬到上方图表底部，这里只留绘图区 + 日期刻度 */
                height: 340
            },
            time: {
                timezoneOffset: -(typeof ENV_META !== 'undefined' &&
                                  ENV_META.timezoneOffsetMin) || -480
            },
            accessibility: { enabled: false },
            credits: { enabled: false },
            exporting: { enabled: false },

            /* 时间轴（rangeSelector 按钮 + navigator + scrollbar）全部在上方图表，
             * 这里一概不重复 —— 两套控件会让人不确定该操作哪一个。 */
            rangeSelector: { enabled: false },
            navigator: { enabled: false },
            scrollbar: { enabled: false },

            xAxis: {
                lineColor: C.rule,
                lineWidth: 1,
                tickColor: C.rule,
                tickWidth: 1,
                ordinal: false,
                crosshair: crosshairOpts(),
                labels: { style: { color: C.soft } },
                dateTimeLabelFormats: {
                    day: t('chart.axisDay'), week: t('chart.axisDay')
                },
                events: {
                    /* 用户在这张图上缩放时，把上方图表同步过去。
                     * 见文件末尾 link() 里的 syncing 标志，防止两图互相触发死循环。 */
                    afterSetExtremes: function (e) { push('env', e); }
                }
            },

            yAxis: yAxes.length ? yAxes : [{ visible: false }],
            series: series,

            tooltip: {
                shared: true,
                split: false,
                backgroundColor: cssVar('--surface', 'rgba(0,0,0,0.85)'),
                borderColor: C.rule,
                borderWidth: 1,
                style: { color: C.text },
                xDateFormat: t('chart.tipDate'),
                /* 与主图共用同一个 formatter：一个框里同时列出两张图的值 */
                formatter: combinedTooltip
            },

            legend: { enabled: false },    // 用上方的彩色标签栏代替
            plotOptions: {
                series: { states: { hover: { lineWidthPlus: 0 } } }
            }
        });

        /* 箭头是用 renderer 直接画的，不属于任何 series —— 缩放、拖动、
         * 改窗口大小之后坐标全变了，必须跟着 redraw 重画一遍。 */
        /* 箭头与玫瑰图都是 renderer 直接画的，不属于任何 series ——
         * 缩放、拖动、改窗口大小后坐标与统计窗口都变了，必须跟着 redraw 重画。 */
        Highcharts.addEvent(chart, 'redraw', windArrows);
        windArrows();

        return chart;
    }

    /* ======================================================================
     * 风向箭头
     *
     * 为什么不能像别的变量那样画折线或散点：
     *   0° 与 360° 是同一个方向，把角度当数值画，风一越过正北就会在图上拉出
     *   一条贯穿全图的竖线——纯属图形假象。散点虽然没有这条竖线，但读者仍要
     *   在脑子里把"210 这个数"翻译成"西南风"，很别扭。
     *
     * 改成箭头：方向就是方向，一眼可读。同时把风速编进去——
     *   箭头长度与不透明度随风速变化，风越大越长越实。
     *
     * 两个实测决定的细节：
     *   · 每隔 12 个点（6 小时）画一个。本站 30 分钟采样，全区间 1056 个点，
     *     绘图区约 916 px，全画的话每个箭头不到 1 px，糊成一片。
     *   · 风速 < 0.2 m/s（气象上的静风）不画。这批数据 16% 的时刻低于此值，
     *     那时风向读数基本是噪声，画出来只会误导。
     *
     * 箭头指向"风吹去的方向"（气象上的风向角是风的来向，所以要 +180°）。
     * ====================================================================== */
    /* 箭头间距按**当前视窗**动态算，不写死。
     *
     * 写死每 12 个点时有个副作用：风速画的是全部 1056 个点，箭头却只有 88 个，
     * 并排看上去像"风向的更新频率比风速低"。其实两者时间戳完全一致、都是
     * 30 分钟一次（实测 1056 vs 1056，各自 98% 的相邻点都在变）。
     *
     * 现在按像素间距倒推步长：目标是相邻箭头至少隔 ARROW_GAP_PX 像素。
     * 于是放大到一两天时，几乎每个采样点都有箭头，和风速曲线的疏密一致；
     * 缩到全区间时自动抽稀，不会糊成一团。 */
    var ARROW_GAP_PX = 18;
    var CALM_MS = 0.2;              // 静风阈值，低于此不画
    var arrowGroup = null;

    function windArrows() {
        if (!chart) { return; }
        if (arrowGroup) { arrowGroup.destroy(); arrowGroup = null; }
        if (!active.windDir) { return; }

        var dirS = null, spdS = null;
        for (var i = 0; i < chart.series.length; i++) {
            var k = chart.series[i].userOptions.envKey;
            if (k === 'windDir') { dirS = chart.series[i]; }
            if (k === 'windSpeed') { spdS = chart.series[i]; }
        }
        if (!dirS || !dirS.visible) { return; }

        var ren = chart.renderer;
        arrowGroup = ren.g('wind-arrows').attr({ zIndex: 6 }).add();

        var ax = chart.xAxis[0];
        var lo = ax.min, hi = ax.max;
        var col = COLORS.windDir;
        var maxSpd = 2.0;           // 本站实测最大 1.92 m/s，用 2 做归一化

        var xd = dirS.xData, yd = dirS.yData;

        /* 按当前视窗宽度倒推步长：窗口越窄，箭头越密，直到每个采样点一个。
         * 这样风向和风速在图上的疏密始终一致，不会让人误以为两者采样频率不同。 */
        var visN = 0;
        for (var k0 = 0; k0 < xd.length; k0++) {
            if (xd[k0] >= lo && xd[k0] <= hi) { visN++; }
        }
        var step = Math.max(1, Math.ceil(visN / Math.max(1, chart.plotWidth / ARROW_GAP_PX)));

        for (var j = 0; j < xd.length; j += step) {
            var x = xd[j];
            if (x < lo || x > hi) { continue; }

            /* 风速取同一时刻的值：没有风速序列（用户没勾选）时退回中等长度 */
            var v = null;
            if (spdS) {
                var sp = pointNear(spdS, x);
                v = sp ? sp.y : null;
            } else if (window.ENV_DATA && ENV_DATA.windSpeed) {
                var arr = ENV_DATA.windSpeed;
                var g = Math.round((x - arr[0][0]) / 1800000);
                if (arr[g] && Math.abs(arr[g][0] - x) < TOL_MS) { v = arr[g][1]; }
            }
            if (v != null && v < CALM_MS) { continue; }   // 静风不画

            var frac = v == null ? 0.5 : Math.min(v / maxSpd, 1);
            var len = 6 + frac * 8;                       // 6–14 px
            var px = ax.toPixels(x, false);
            /* 箭头统一画在绘图区**底部**一条固定的带上。
             * 不跟着风速曲线走：风速没被勾选时它就无处安放，而且曲线本身起伏
             * 会让箭头高低乱跳、更难读方向。
             * 放底部而不是顶部：顶部紧挨着上方那张图的下沿，视觉上会被误认为
             * 是上图的一部分。 */
            var py = chart.plotTop + chart.plotHeight - 16;

            /* 气象风向角是**来向**，箭头要指向去向，故 +180° */
            var rad = (yd[j] + 180) * Math.PI / 180;
            var dx = Math.sin(rad) * len, dy = -Math.cos(rad) * len;
            var x1 = px - dx / 2, y1 = py - dy / 2;
            var x2 = px + dx / 2, y2 = py + dy / 2;

            ren.path(['M', x1, y1, 'L', x2, y2])
               .attr({ stroke: col, 'stroke-width': 1.2, opacity: 0.35 + frac * 0.5 })
               .add(arrowGroup);
            /* 箭头头部：两条短斜线 */
            var hb = 4;
            ren.path([
                'M', x2, y2,
                'L', x2 - hb * Math.sin(rad - 0.45), y2 + hb * Math.cos(rad - 0.45),
                'M', x2, y2,
                'L', x2 - hb * Math.sin(rad + 0.45), y2 + hb * Math.cos(rad + 0.45)
            ]).attr({ stroke: col, 'stroke-width': 1.2, opacity: 0.35 + frac * 0.5 })
              .add(arrowGroup);
        }
    }

    function rebuild() {
        var ext = null;
        if (chart && chart.xAxis && chart.xAxis[0]) {
            ext = chart.xAxis[0].getExtremes();
        }
        if (chart) { chart.destroy(); chart = null; }
        build();
        /* 重建后把原来的时间区间恢复回去，否则每次点标签视图都跳回全区间 */
        if (chart && ext && ext.min != null) {
            syncing = true;
            try { chart.xAxis[0].setExtremes(ext.min, ext.max, true, false); }
            finally { syncing = false; }
        }
        paintTags();
        /* 重新挂联动：本图刚换了实例；主图若也重建过（语言/主题切换），
         * 它身上的 _envLinked / _syncStyled 会随旧实例一起消失，linkMain 会补回来。 */
        linkMain();
    }

    function toggle(key) {
        active[key] = !active[key];
        rebuild();
    }

    function setAll(on) {
        ENV_VARS.forEach(function (v) { active[v.key] = !!on; });
        rebuild();
    }

    /* ======================================================================
     * 跨图表联动指针
     *
     * 目标：鼠标停在**任一**张图上，两张图同时出现竖线，并弹出**一个**提示框，
     * 里面同时列出该时刻的液流、径向变化，以及当前选中的全部环境变量。
     * 不必在两张图之间来回看，也不必自己对时间。
     *
     * 实现要点
     *   · 竖线用 crosshair 且 snap:false —— 直接跟鼠标像素位置走。
     *     两张图的绘图区左右边距是写死对齐的（PLOT_MARGIN），所以同一个
     *     chartX 在两张图上就是同一时刻，可以直接把像素值递过去。
     *   · 提示框只出现在鼠标所在那张图上（两个框同时弹会互相遮挡），
     *     但内容是两张图合并的 —— formatter 里主动去另一张图取值。
     * ====================================================================== */

    var TOL_MS = 45 * 60 * 1000;      // 找最近点的容差：采样间隔 30 分钟，留一点余量

    function mainChart() {
        return (window.SiteChart && SiteChart.chart) || null;
    }

    /* 在一条序列里找离 x 最近的点。二分，不要线性扫 —— 每次鼠标移动都要调用，
     * 序列有两千多点，线性扫会让指针发涩。 */
    function pointNear(series, x) {
        var xd = series.xData, yd = series.yData;
        if (!xd || !xd.length) { return null; }
        var lo = 0, hi = xd.length - 1;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (xd[mid] < x) { lo = mid + 1; } else { hi = mid; }
        }
        var best = lo;
        if (lo > 0 && Math.abs(xd[lo - 1] - x) < Math.abs(xd[lo] - x)) { best = lo - 1; }
        if (Math.abs(xd[best] - x) > TOL_MS) { return null; }
        return { x: xd[best], y: yd[best] };
    }

    function row(color, name, val, unit, dec) {
        if (val == null || isNaN(val)) { return ''; }
        return '<span style="color:' + color + '">●</span> ' +
               name + ': <b>' + Highcharts.numberFormat(val, dec) + '</b> ' +
               (unit || '') + '<br/>';
    }

    /* 两张图共用同一个 formatter：先写时间，再写树木两条，最后写环境各条。
     * this.x 是当前悬停点的时间戳，两张图的时间戳是同一套（都吸附到半点）。 */
    function combinedTooltip() {
        var x = this.x;
        var s = '<span style="font-size:11px">' +
                Highcharts.dateFormat(t('chart.tipDate'), x) + '</span><br/>';

        var mc = mainChart();
        if (mc && mc.series) {
            for (var i = 0; i < mc.series.length; i++) {
                var ser = mc.series[i];
                /* navigator 自己也是一条 series，别混进来 */
                if (!ser.visible || ser.options.isInternal ||
                    (ser.options.className || '').indexOf('navigator') >= 0) { continue; }
                var p = pointNear(ser, x);
                if (p) {
                    s += row(ser.color, ser.name, p.y,
                             (ser.tooltipOptions && ser.tooltipOptions.valueSuffix) || '', 1);
                }
            }
        }

        if (chart && chart.series && chart.series.length) {
            var any = false;
            for (var j = 0; j < chart.series.length; j++) {
                var es = chart.series[j];
                if (!es.visible || es.options.isInternal ||
                    (es.options.className || '').indexOf('navigator') >= 0) { continue; }
                var ep = pointNear(es, x);
                if (ep) {
                    if (!any) { s += '<span style="opacity:.5">──────────</span><br/>'; any = true; }
                    s += row(es.color, es.name, ep.y,
                             (es.tooltipOptions && es.tooltipOptions.valueSuffix) || '',
                             (es.tooltipOptions && es.tooltipOptions.valueDecimals != null)
                                 ? es.tooltipOptions.valueDecimals : 1);
                }
            }
        }
        return s;
    }

    function crosshairOpts() {
        return {
            width: 1,
            color: cssVar('--text-faint', '#8a8a8a'),
            dashStyle: 'Dash',
            /* snap:false —— 竖线跟鼠标像素走，不吸附到数据点。
             * 两张图绘图区已对齐，同一 chartX 即同一时刻，递像素值最省事也最准。 */
            snap: false
        };
    }

    /* 把鼠标位置同步到另一张图：只画竖线，不弹它自己的提示框
     * （两个框同时弹会互相遮挡，而内容本来就已经合并在一个框里了）。 */
    function mirrorCrosshair(from) {
        var other = from === 'env' ? mainChart() : chart;
        if (!other || !other.xAxis || !other.xAxis[0]) { return null; }
        return other;
    }

    function bindPointerSync(ch, who) {
        if (!ch || !ch.container || ch.container._syncBound) { return; }
        ch.container._syncBound = true;

        ch.container.addEventListener('mousemove', function (e) {
            var other = mirrorCrosshair(who);
            if (!other) { return; }
            try {
                var ev = ch.pointer.normalize(e);
                /* 绘图区已对齐，chartX 可以直接借用 */
                other.xAxis[0].drawCrosshair({
                    chartX: ev.chartX,
                    chartY: other.plotTop + 1
                });
            } catch (err) { /* 图表正在重建时忽略 */ }
        });

        ch.container.addEventListener('mouseleave', function () {
            var other = mirrorCrosshair(who);
            if (!other) { return; }
            try { other.xAxis[0].hideCrosshair(); } catch (err) { /* 同上 */ }
        });
    }

    /* ======================================================================
     * 与上方 Tree data 图表共用时间轴
     *
     * 两张图互相监听 afterSetExtremes 并调用对方的 setExtremes。
     * 必须有 syncing 标志：A 改动 -> 通知 B -> B 的 setExtremes 又会触发它自己的
     * afterSetExtremes -> 再通知回 A …… 不拦就是无限循环，页面直接卡死。
     * ====================================================================== */
    var syncing = false;

    function push(from, e) {
        if (syncing) { return; }
        var other = from === 'env'
            ? (window.SiteChart && SiteChart.chart)
            : chart;
        if (!other || !other.xAxis || !other.xAxis[0]) { return; }
        syncing = true;
        try {
            /* redraw=true，animation=false —— 联动要跟手，加动画会拖尾 */
            other.xAxis[0].setExtremes(e.min, e.max, true, false);
        } catch (err) {
            /* 一方还没建好时忽略即可，下次事件会再同步 */
        } finally {
            syncing = false;
        }
    }

    function linkMain() {
        if (!window.SiteChart || !SiteChart.chart) { return false; }
        var ax = SiteChart.chart.xAxis[0];
        if (!ax) { return false; }
        if (!ax._envLinked) {
            /* Highcharts 的 xAxis.update 会重建事件，所以用 addEvent 而不是写 options */
            Highcharts.addEvent(ax, 'afterSetExtremes', function (e) { push('main', e); });
            ax._envLinked = true;
        }

        /* 绑好之后立刻把主图**当前**的区间同步过来。
         * 不做这一步的话首屏两张图对不上：主图的 rangeSelector 默认选「1周」，
         * 建图时就把自己缩到最后 7 天了，而本图是后建的、显示全区间 ——
         * 上下一看是两段完全不同的时间。联动只在「有人操作」时才触发，
         * 而首屏没人操作过。 */
        var e0 = ax.getExtremes();
        if (chart && e0 && e0.min != null) {
            var cur = chart.xAxis[0].getExtremes();
            if (Math.abs(cur.min - e0.min) > 1000 || Math.abs(cur.max - e0.max) > 1000) {
                syncing = true;
                try { chart.xAxis[0].setExtremes(e0.min, e0.max, true, false); }
                finally { syncing = false; }
            }
        }

        /* 给主图装上共用的 formatter 与竖线。
         * 必须每次 linkMain() 都重装：主图在语言/主题切换时是**销毁重建**的，
         * 之前 update 进去的配置会随旧实例一起没掉。 */
        var mc = SiteChart.chart;
        if (!mc._syncStyled) {
            mc.update({
                xAxis: { crosshair: crosshairOpts() },
                tooltip: { shared: true, split: false, formatter: combinedTooltip }
            }, false);
            mc.redraw(false);
            mc._syncStyled = true;
        }
        bindPointerSync(mc, 'main');
        bindPointerSync(chart, 'env');
        return true;
    }

    function init() {
        if (!document.getElementById(CONTAINER)) { return; }
        if (typeof ENV_VARS === 'undefined') { return; }

        ENV_VARS.forEach(function (v) { active[v.key] = !!v.on; });
        buildTags();
        build();
        paintTags();

        /* 上方图表可能还没建好（chart.js 在本文件之后加载完成），
         * 所以轮询几次，绑上就停。 */
        var tries = 0;
        (function tryLink() {
            if (linkMain() || ++tries > 40) { return; }
            window.setTimeout(tryLink, 150);
        }());

        var all = document.getElementById('envAll');
        if (all) { all.addEventListener('click', function () { setAll(true); }); }
        var none = document.getElementById('envNone');
        if (none) { none.addEventListener('click', function () { setAll(false); }); }

        /* 语言或主题变了都要重建：Highcharts 把文案与配色烤进已生成的 SVG */
        if (window.Lang) { Lang.onChange(function () { buildTags(); rebuild(); }); }
        if (window.Theme) { Theme.onChange(rebuild); }

        window.EnvChart = {
            chart: function () { return chart; },
            toggle: toggle,
            setAll: setAll,
            active: activeKeys,
            colors: COLORS,
            /* 解锁完整数据后（js/unlock.js 换掉 ENV_DATA）重建。
             * 这里不能直接用 rebuild —— 它会把旧的时间区间恢复回去，
             * 而解锁的意义正是要看到区间之外的数据。所以先清掉再重建。 */
            reload: function () {
                if (chart) {
                    syncing = true;
                    try { chart.xAxis[0].setExtremes(null, null, false, false); }
                    finally { syncing = false; }
                }
                rebuild();
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

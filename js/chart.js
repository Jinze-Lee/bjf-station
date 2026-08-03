/* ==========================================================================
 * Tree data 图表 —— Highcharts Stock 配置
 *
 * 视觉与交互 1:1 复刻 treewatch.net "Tree data" 区块：
 * 双 Y 轴、深色主题、rangeSelector 按钮 + 日期输入框、横向拖拽缩放、
 * navigator 导航条、scrollbar、shared tooltip。
 *
 * 与参考站的量纲差异
 * ------------------
 * 参考站画的是整树液流 (L/h)。本站画的是**液流通量密度 Fd (g m⁻² s⁻¹)**，
 * 因为 TDP 的直接产物是 Fd，换算成整树液流必须乘边材面积，
 * 而本站尚无边材厚度实测值。等边材数据补齐后，只需在这里改单位与换算。
 *
 * 数据来源：js/sample-data.js（共用时间轴 + 各树数值数组）
 * 树木清单：js/trees.js
 *
 * 对外句柄：window.SiteChart = { chart, setTree(id), currentTree() }
 * ========================================================================== */

(function () {
    'use strict';

    var CONTAINER = 'chartDIASF';

    /* 配色不写死在这里，改从 css/style.css 的 :root 变量读 ——
     * 整站换主题时只改 CSS 一处，图表自动跟着变，不会出现
     * 「页面换了配色、图表还是老颜色」的脱节。
     * 取不到值（CSS 没加载完/极老浏览器）时回退到暖白主题的对应色。 */
    function cssVar(name, fallback) {
        try {
            var v = getComputedStyle(document.documentElement)
                        .getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) {
            return fallback;
        }
    }

    /* 在 render() 里调用而不是模块加载时 —— 那时样式表可能还没生效 */
    function palette() {
        return {
            fd:      cssVar('--sapflow',    '#2c6e8f'),   // 液流：青蓝
            rad:     cssVar('--radial',     '#c2703d'),   // 径向：赤陶
            bg:       cssVar('--bg',        '#faf8f5'),
            surface:  cssVar('--surface',   '#ffffff'),
            surface2: cssVar('--surface-2', '#f2eee8'),
            grid:    cssVar('--grid',       '#e4ded5'),
            rule:    cssVar('--rule',       '#e8e2da'),
            ruleHi:  cssVar('--rule-strong','#d5ccc0'),
            text:    cssVar('--text',       '#2d2a26'),
            soft:    cssVar('--text-soft',  '#6b655c'),
            faint:   cssVar('--text-faint', '#948d82'),
            heading: cssVar('--heading',    '#3d5a45')
        };
    }

    /* 首屏默认展示的树：DT3 样点最大的一棵山杨。
     * 选它是因为地图上也默认打开这棵树的弹窗，两处保持一致。 */
    var DEFAULT_TREE = 'DT3-SY2-1138';

    var chart = null;
    var current = null;

    function t(k) { return window.Lang ? Lang.t(k) : k; }

    /* --- 依赖缺失时给出可操作提示，而不是白屏 --- */
    function renderLoadError(msg) {
        var el = document.getElementById(CONTAINER);
        if (!el) { return; }
        el.className = 'chart-error';
        el.innerHTML =
            '<div><strong>图表未能加载</strong></div><div>' + msg + '</div>';
    }

    /* 数据文件 js/observations.js 里已经是 [[毫秒时间戳, 值], ...]。
     *
     * ⚠️ 必须传**副本**给 Highcharts，不能传 OBS_FD[id] 原数组。
     * Highcharts 的 setData 会把传入的数组接管并**就地改写**（updatePoints
     * 逐点更新时直接改的就是这个数组）。传原数组的话，切换树木会把
     * js/observations.js 里存的观测数据改坏 —— 实测中出现过
     * OBS_FD['DT3-SY2-1138'] 从 304 点被改成 435 点。
     *
     * 这个 bug 在合成示例数据下看不出来：那时 20 棵树都是 672 点，
     * 长度一致，就地更新不改变长度。只有真实数据长度参差才会暴露。 */
    function seriesOf(store, id) {
        var pts = (store && store[id]) ? store[id] : [];
        var out = new Array(pts.length);
        for (var i = 0; i < pts.length; i++) {
            out[i] = [pts[i][0], pts[i][1]];
        }
        return out;
    }

    /* 径向变化仪存的是**原始位移读数**（μm），零点取决于传感器安装位置，
     * 绝对值对读者没有意义（比如同一片林子里有的树读数 500、有的 174000）。
     * 这里按每条序列的首个点归零，显示成「相对记录起点的径向变化量」——
     * 这也是 dendrometer 文献的标准画法。 */
    function zeroed(store, id) {
        var pts = seriesOf(store, id);
        if (!pts.length) { return []; }
        var base = pts[0][1];
        var out = new Array(pts.length);
        for (var i = 0; i < pts.length; i++) {
            out[i] = [pts[i][0], pts[i][1] - base];
        }
        return out;
    }

    function treeById(id) {
        for (var i = 0; i < TREES.length; i++) {
            if (TREES[i].id === id) { return TREES[i]; }
        }
        return null;
    }

    /* --- 切换到指定树木 --- */
    function setTree(id) {
        if (!chart || !OBS_FD[id]) { return; }
        current = id;

        chart.series[0].setData(seriesOf(OBS_FD, id), false);
        chart.series[1].setData(zeroed(OBS_RAD, id), false);
        chart.redraw();

        /* 同步页面上的树木信息卡与下拉框 */
        var t = treeById(id);
        if (t && typeof window.updateTreeInfo === 'function') {
            window.updateTreeInfo(t);
        }
        var sel = document.getElementById('treeSelect');
        if (sel && sel.value !== id) { sel.value = id; }
    }

    function render() {
        if (typeof Highcharts === 'undefined' || !Highcharts.stockChart) {
            renderLoadError('Highcharts Stock 未能载入，请确认 <code>js/highstock.js</code> 存在。');
            return;
        }
        if (typeof TREES === 'undefined' || typeof OBS_FD === 'undefined') {
            renderLoadError('数据文件未能载入，请确认 <code>js/trees.js</code> 与 ' +
                            '<code>js/observations.js</code> 存在。');
            return;
        }

        /* 默认树若在本批数据里没有，退回第一棵有数据的树 —— 实测数据可能
         * 只覆盖部分树木（某些设备当期未回传）。 */
        var withData = TREES.filter(function (t) { return OBS_FD[t.id] || OBS_RAD[t.id]; });
        if (!withData.length) {
            renderLoadError('数据文件里没有任何观测点。');
            return;
        }
        var first = OBS_FD[DEFAULT_TREE] ? DEFAULT_TREE : withData[0].id;
        current = first;

        /* lang 是全局选项，必须用 setOptions 设置，写进 chart config 不生效。
         * 这里同时把 rangeSelector 的文案、月份名与星期名切到当前语言。
         * 注意：rangeSelector 的标签在建图时就渲染定型，改 lang 后必须
         * **重建图表**才会生效 —— 见下方 Lang.onChange 的处理。 */
        Highcharts.setOptions({
            lang: {
                rangeSelectorZoom: t('chart.zoom'),
                rangeSelectorFrom: t('chart.from'),
                rangeSelectorTo:   t('chart.to'),
                months:      t('chart.months').split(','),
                shortMonths: t('chart.shortMonths').split(','),
                weekdays:    t('chart.weekdays').split(',')
            }
        });

        var C = palette();

        chart = Highcharts.stockChart(CONTAINER, {

            chart: {
                backgroundColor: C.bg,
                plotBorderColor: C.bg,
                style: { fontFamily: 'inherit' },
                zooming: { type: 'x' },       // 横向点击拖拽框选缩放
                /* 左右边距写死，为的是让本图与下方环境图的**绘图区左右对齐**。
                 * 不固定的话，两张图各自按自己的轴标签宽度算边距（气压是四位数、
                 * 光照是两位数），绘图区会差出几十像素 —— 上下叠着看时，
                 * 同一时刻在两张图上不在同一条竖线上，对比就失去意义了。
                 * 数值同步改 chart-env.js 里的 PLOT_MARGIN。 */
                marginLeft: 92,
                marginRight: 92,
                spacingBottom: 6
            },

            /* 台站在北京，数据时间戳的当地时区是 UTC+8。
             * 不设这一项的话 Highcharts 默认按 UTC 显示，昼夜节律会整体
             * 错 8 小时——液流峰值会落在半夜。中国不实行夏令时，用固定
             * 偏移即可（负值代表东经方向）。 */
            time: {
                timezoneOffset: -(typeof OBS_META !== 'undefined' &&
                                  OBS_META.timezoneOffsetMin) || -480
            },

            accessibility: { enabled: false },
            credits:   { enabled: false },
            exporting: { enabled: false },

            plotOptions: {
                area: {
                    fillColor: {
                        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                        /* 浅色底上纯色填充会糊成一片，起点降到 0.34 透明度，
                         * 让面积只作为「量」的暗示，不压过曲线本身 */
                        stops: [
                            [0, Highcharts.color(C.fd).setOpacity(0.34).get('rgba')],
                            [1, Highcharts.color(C.fd).setOpacity(0).get('rgba')]
                        ]
                    },
                    marker: { radius: 2 },
                    lineWidth: 1,
                    states: { hover: { lineWidth: 1 } },
                    threshold: null
                }
            },

            /* --- 时间范围选择器：按钮 + From/To 输入框 --------------------- */
            rangeSelector: {
                /* 默认选中项要跟着数据跨度走：预处理会把各来源裁到共同时间窗，
                 * 一批数据可能不足一周。此时 Highcharts 会把 1w 按钮置灰，
                 * 写死 selected:1 就会落空（谁都没选中）。
                 * 不足 7 天则默认「全部」，否则默认「1周」。 */
                selected: (function () {
                    var sp = (typeof OBS_META !== 'undefined' && OBS_META.span) || null;
                    var days = sp ? (sp[1] - sp[0]) / 86400000 : 999;
                    return days >= 7 ? 1 : 2;
                }()),
                buttons: [
                    { type: 'day',  count: 1, text: t('chart.btn1d') },
                    { type: 'week', count: 1, text: t('chart.btn1w') },
                    { type: 'all',            text: t('chart.btnAll') }
                ],
                buttonTheme: {
                    fill: C.surface,
                    stroke: C.ruleHi,
                    'stroke-width': 1,
                    r: 3,
                    style: { color: C.soft, fontWeight: '500' },
                    states: {
                        hover:  { fill: C.rule,    stroke: C.ruleHi, style: { color: C.text } },
                        select: { fill: C.heading, stroke: C.heading, style: { color: '#ffffff' } }
                    }
                },
                inputBoxBorderColor: C.ruleHi,
                inputStyle: { backgroundColor: C.surface, color: C.text },
                labelStyle: { color: C.soft },
                /* 英文下显示 "Jul 20, 2026"（同参考站），中文下显示 "2026年07月20日" */
                inputDateFormat: t('chart.inputFormat'),
                inputEditDateFormat: '%Y-%m-%d'
            },

            /* --- 序列 ------------------------------------------------------ */
            series: [{
                name: t('chart.fd'),
                yAxis: 1,
                type: 'area',
                color: C.fd,
                data: seriesOf(OBS_FD, first),
                tooltip: { valueDecimals: 1, valueSuffix: t('chart.fdUnit') }
            }, {
                name: t('chart.rad'),
                yAxis: 0,
                color: C.rad,
                marker: { enabled: false, radius: 3 },
                data: zeroed(OBS_RAD, first),
                tooltip: { valueDecimals: 1, valueSuffix: t('chart.radUnit') }
            }],

            /* --- 坐标轴 ---------------------------------------------------- */
            xAxis: {
                lineColor: C.ruleHi,
                lineWidth: 1,
                tickColor: C.ruleHi,
                tickWidth: 1,
                /* 两张图各自都标日期。
                 * 曾经把这一排关掉过（想着"一条时间轴就够了"），但实际用起来
                 * 看上图时要低头到下图去找日期，很别扭。两张图各标一次更好用，
                 * 反正它们的刻度位置完全一致（绘图区左右边距写死对齐）。 */
                labels: { style: { color: C.soft } },
                ordinal: false,               // 按真实时间等距，不压缩数据空隙
                dateTimeLabelFormats: { day: t('chart.axisDay'), week: t('chart.axisDay') }
            },

            yAxis: [{
                /* 主轴：径向变化（Stock 默认 opposite:true -> 右侧） */
                gridLineColor: C.grid,
                gridLineWidth: 1,
                gridLineDashStyle: 'longdash',
                lineColor: C.ruleHi,
                tickColor: C.ruleHi,
                tickWidth: 1,
                title: {
                    text: t('chart.rad'),
                    style: { color: C.rad, fontSize: '22px' }
                },
                labels: {
                    format: '{value}',
                    style: { color: C.soft },
                    align: 'left',
                    x: 15
                }
            }, {
                /* 副轴：Sap flux density（opposite:false -> 左侧） */
                floor: 0,
                min: 0,
                gridLineColor: C.grid,
                gridLineWidth: 1,
                gridLineDashStyle: 'longdash',
                lineColor: C.ruleHi,
                tickColor: C.ruleHi,
                tickWidth: 1,
                title: {
                    text: t('chart.fd'),
                    style: { color: C.fd, fontSize: '22px' }
                },
                labels: {
                    format: '{value}',
                    style: { color: C.soft }
                },
                opposite: false
            }],

            /* --- 提示框：两序列共用 ---------------------------------------- */
            tooltip: {
                shared: true,
                /* 跟着主题走，不能写死。这里原先是 'rgba(255,255,255,0.97)'，
                 * 浅色主题时期留下的 —— 深色主题下就成了一块刺眼的白，
                 * 而下方环境图的提示框是深的，同一页面两种底色。 */
                backgroundColor: C.surface,
                borderColor: C.ruleHi,
                borderWidth: 1,
                shadow: true,
                style: { color: C.text },
                xDateFormat: t('chart.tipDate')
            },

            /* 参考站没有图例（Stock 默认关闭）。这里开启以便区分两条曲线，
             * 要完全对齐参考站把 enabled 改成 false 即可。 */
            /* 图例挪到图**上方**。原先在底部，正好卡在两张图中间，
             * 把本该贴在一起的上下图切开。放上面既不占中间的位置，
             * 又保留了「点图例开关序列」这个功能。 */
            legend: {
                enabled: true,
                align: 'center',
                verticalAlign: 'top',
                margin: 6,
                padding: 0,
                itemStyle:       { color: C.text, fontWeight: 'normal' },
                itemHoverStyle:  { color: C.heading },
                itemHiddenStyle: { color: '#bdb6ab' },
                backgroundColor: 'transparent'
            },

            drilldown: {
                activeAxisLabelStyle: { color: C.text },
                activeDataLabelStyle: { color: C.text }
            },

            navigation: {
                buttonOptions: { symbolStroke: C.soft, theme: { fill: C.surface } }
            },

            /* --- 缩略导航条与滚动条 ----------------------------------------
             * 整页只有这一条，位置在两张图**中间**（即本图底部）。
             * 下方环境图不再重复挂 —— 两条 navigator 会让人不确定该拖哪个。
             * 拖它两张图一起走，联动见 chart-env.js。 */
            navigator: {
                handles: { backgroundColor: C.surface, borderColor: '#9a9287' },
                outlineColor: C.ruleHi,
                /* 浅底上遮罩要用深色半透明；沿用深色版的白色遮罩会让
                 * 「选中区」比「未选中区」更亮，视觉上正好反了 */
                maskFill: 'rgba(45, 42, 38, 0.09)',
                series: { color: Highcharts.color(C.fd).setOpacity(0.45).get('rgba'),
                          lineColor: C.fd },
                xAxis: {
                    gridLineColor: C.rule,
                    labels: { style: { color: C.faint }, opacity: 1 },
                    /* 不设的话中文月份名会被默认格式拆成 "14 7月" 这种错乱写法 */
                    dateTimeLabelFormats: {
                        day:   t('chart.navDay'),
                        week:  t('chart.navDay'),
                        month: t('chart.navDay')
                    }
                }
            },

            scrollbar: {
                buttonsEnabled: true,
                barBackgroundColor: '#c3bbb0',
                barBorderColor: '#c3bbb0',
                barBorderRadius: 3,
                buttonArrowColor: C.soft,
                buttonBackgroundColor: C.surface,
                buttonBorderColor: C.ruleHi,
                rifleColor: C.surface,
                trackBackgroundColor: C.surface2,
                trackBorderColor: C.rule
            }
        });

        window.SiteChart = {
            chart: chart,
            setTree: setTree,
            currentTree: function () { return current; },
            defaultTree: DEFAULT_TREE
        };

        /* 初始化信息卡与下拉框选中项 */
        var sel0 = document.getElementById('treeSelect');
        if (sel0) { sel0.value = first; }
        if (typeof window.updateTreeInfo === 'function') {
            window.updateTreeInfo(treeById(first));
        }
    }

    /* 下拉框：只绑一次，重建图表时不重复绑定 */
    function bindSelect() {
        var sel = document.getElementById('treeSelect');
        if (!sel || sel.dataset.bound) { return; }
        sel.dataset.bound = '1';
        sel.addEventListener('change', function () { setTree(sel.value); });
    }

    function init() {
        render();
        bindSelect();

        /* 语言切换：rangeSelector 的 Zoom/From/To 与日期格式在建图时就渲染定型，
         * 单纯 redraw 改不动，必须销毁重建。代价是丢失当前缩放区间 ——
         * 换语言是低频操作，这个取舍可以接受；当前选中的树会保留。 */
        function rebuild() {
            var keep = current;
            if (chart) { chart.destroy(); chart = null; }
            DEFAULT_TREE = keep || DEFAULT_TREE;
            render();
            bindSelect();
        }

        if (window.Lang) { Lang.onChange(rebuild); }

        /* 主题切换同样要重建。Highcharts 把颜色**烤进**已生成的 SVG 属性里，
         * 改 CSS 变量不会让已画出来的轴线、按钮、tooltip 跟着变；
         * 而 palette() 是在 render() 里读变量的，所以重建一次就全对了。
         * Theme 的回调已经在 rAF 里等过一帧，此刻读到的是新主题的变量值。 */
        if (window.Theme) { Theme.onChange(rebuild); }

        /* 解锁完整数据后（js/unlock.js 换掉 OBS_FD / OBS_RAD）也要重建 ——
         * setData 只能换当前这棵树的点，换不掉「哪些树有数据」和时间轴范围。 */
        window.SiteChart.reload = rebuild;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

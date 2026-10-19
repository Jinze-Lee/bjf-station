/* ==========================================================================
 * 按需加载：地图与图表
 *
 * 问题
 * ----
 * 实测线上首屏：26 个资源在同一毫秒排队，全部加载完 4.1 秒。其中
 *   地图    leaflet.js 42 KB + leaflet.css 4 KB + 45 个高德瓦片 157 KB
 *   图表    highstock.js 132 KB + observations.js 178 KB + environment.js 50 KB
 * 加起来 560 KB 多，全都在用户还没滚到那两块之前就开抢带宽了。
 *
 * 做法
 * ----
 * 用 IntersectionObserver 盯住 #location 和 #treedata 两个区块，
 * 进入视野前 600px 才开始下对应的脚本。两组互不相干，各自独立触发。
 *
 * 600px 这个提前量是有意给的：既让用户滚到时通常已经就位，
 * 又不至于在首屏就触发（首屏到 #location 的距离远大于 600px）。
 *
 * 关键约束
 * --------
 * 1. 脚本之间有顺序依赖，必须**串行**加载，不能并发：
 *      highstock.js -> observations.js -> chart.js -> environment.js -> chart-env.js
 *      leaflet.js   -> map.js
 *    并发的话 chart.js 可能在 highstock.js 之前执行，直接报 Highcharts is not defined。
 *
 * 2. 这些脚本原先是 <script> 标签，DOMContentLoaded 时就位，
 *    所以它们内部都写了「document.readyState === 'loading' ? 监听 : 直接跑」的分支。
 *    动态插入时 readyState 早已是 complete，会走「直接跑」——正是我们要的，
 *    不需要额外触发什么事件。
 *
 * 3. 不支持 IntersectionObserver 的浏览器直接全量加载，行为退回改造之前。
 *
 * 对外句柄：window.LazyLoad = { ensureChart(), ensureMap(), state }
 *   两个 ensure 都返回 Promise，重复调用只会加载一次。
 * ========================================================================== */

(function () {
    'use strict';

    var ROOT_MARGIN = '600px';

    /* js 数组里的每一项要么是路径字符串，要么是
     *   { src, check, fallback }  —— 加载完若 check() 为假，再去下 fallback。
     *
     * 原先 index.html 里的 CDN 回退是 document.write 写的，那套在这里用不了：
     * 页面已经加载完，document.write 会把整个文档清空。所以改成检测式回退。 */
    var GROUPS = {
        map: {
            anchor: '#location',
            css: ['css/leaflet.css'],
            js: [
                { src: 'js/leaflet.js',
                  check: function () { return !!window.L; },
                  fallback: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' },
                'js/survey-points.js',
                'js/treestems.js',
            'js/canopyP.js',
                'js/bounds.js',
                'js/devices.js',
                'js/map.js'
            ]
        },
        chart: {
            anchor: '#treedata',
            css: [],
            /* 顺序即依赖顺序，不可打乱 */
            js: [
                { src: 'js/highstock.js',
                  check: function () { return !!window.Highcharts; },
                  /* 本地优先的原因：code.highcharts.com 在国内常被拒（实测 403），
                     所以这条回退多半用不上，留着只是防本地文件缺失。 */
                  fallback: 'https://code.highcharts.com/stock/highstock.js' },
                /* 尺寸度量要在两张图之前：它们建图时就要读边距与高度 */
                'js/chart-metrics.js',
                'js/observations.js', 'js/chart.js',
                'js/environment.js', 'js/chart-env.js',
            'js/chart-demo.js',
                /* 解锁模块要在两张图之后：它解开数据后要调 SiteChart.reload
                   和 EnvChart.reload，那时两个句柄必须已经存在 */
                'js/unlock.js'
            ]
        }
    };

    var state = { map: 'idle', chart: 'idle' };
    var promises = {};

    function loadCss(href) {
        return new Promise(function (resolve) {
            /* 样式表缺了不该卡住脚本，所以失败也 resolve */
            var el = document.createElement('link');
            el.rel = 'stylesheet';
            el.href = href;
            el.onload = el.onerror = function () { resolve(); };
            document.head.appendChild(el);
        });
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            /* 版本戳：改了 JS 但浏览器缓存住旧文件会让人以为没改（本地实测踩过两次） */
            el.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=20261019d';
            el.async = false;          /* 保险：即使被并发插入也按顺序执行 */
            el.onload = function () { resolve(); };
            el.onerror = function () { reject(new Error('加载失败: ' + src)); };
            document.body.appendChild(el);
        });
    }

    function load(name) {
        if (promises[name]) { return promises[name]; }
        var g = GROUPS[name];
        state[name] = 'loading';

        /* CSS 可以并发（互不依赖），JS 必须串行 */
        var p = Promise.all(g.css.map(loadCss));
        g.js.forEach(function (item) {
            p = p.then(function () {
                if (typeof item === 'string') { return loadScript(item); }
                /* 带回退的：本地失败或加载后全局变量没出现，就走 CDN */
                return loadScript(item.src).catch(function () { /* 本地文件缺失 */ })
                    .then(function () {
                        if (item.check()) { return; }
                        return loadScript(item.fallback);
                    });
            });
        });

        promises[name] = p.then(function () {
            state[name] = 'ready';
            document.dispatchEvent(new CustomEvent('lazy:' + name));
        }, function (err) {
            state[name] = 'error';
            /* 报出来而不是静默 —— 图表/地图空着但控制台干净，最难查 */
            console.error('[lazy-load] ' + name + ' 加载失败:', err);
            throw err;
        });
        return promises[name];
    }

    function init() {
        /* 三维 iframe：滚到跟前才装 src —— 一进主页就下 121MB 点云是不行的。
         * 与 JS 懒加载分开处理（iframe 不是脚本）。 */
        var frame = document.getElementById('canopyFrame');
        if (frame) {
            var loadFrame = function () {
                if (!frame.getAttribute('src')) {
                    /* 加版本戳：iframe 里的 HTML 也会被浏览器缓存，改了看不到（实测踩到过） */
                    var ds = frame.getAttribute('data-src') || '';
                    frame.setAttribute('src', ds + (ds.indexOf('?') >= 0 ? '&' : '?') + 'v=20261019e');
                    /* 别死等 iframe 的 load 事件：资源慢时它可能很久不触发，看起来就像「点了没反应」。
                       点下去就先把占位层收起来，另加 8 秒兜底；load 事件到了仍然再兜一次。 */
                    var ph0 = document.getElementById('canopyPlaceholder');
                    if (ph0) { ph0.style.display = 'none'; }
                    setTimeout(function () {
                        var ph1 = document.getElementById('canopyPlaceholder');
                        if (ph1) { ph1.style.display = 'none'; }
                    }, 8000);
                }
            };
            frame.addEventListener('load', function () {
                var ph = document.getElementById('canopyPlaceholder');
                if (ph) { ph.style.display = 'none'; }
            });
            /* 点击「加载三维点云」按钮，或点任何指向 #canopy 的链接（导航「三维」/ 地图区的入口）
             * 才加载。不随滚动自动加载 —— 三维点云约 100 MB，滚过就下不合适。 */
            var cbtn = document.getElementById('canopyLoad');
            if (cbtn) { cbtn.addEventListener('click', loadFrame); }
            /* 「全屏」：对 iframe 元素本身请求全屏（进了全屏也就顺手把点云加载上） */
            var cfull = document.getElementById('canopyFull');
            if (cfull) { cfull.addEventListener('click', function () {
                loadFrame();
                var req = frame.requestFullscreen || frame.webkitRequestFullscreen;
                if (req) { try { req.call(frame); } catch (e) {} }
            }); }
            if (location.hash === '#canopy') { loadFrame(); }
            document.addEventListener('click', function (e) {
                var a = e.target.closest && e.target.closest('a[href="#canopy"]');
                if (a) { loadFrame(); }
            });
        }

        if (!('IntersectionObserver' in window)) {
            /* 老浏览器：直接全下，回到改造前的行为 */
            load('map');
            load('chart');
            return;
        }

        Object.keys(GROUPS).forEach(function (name) {
            var el = document.querySelector(GROUPS[name].anchor);
            if (!el) { return; }
            var io = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) {
                    io.disconnect();
                    load(name);
                }
            }, { rootMargin: ROOT_MARGIN });
            io.observe(el);
        });

        /* 带 #treedata / #location 锚点直接进来的，等不了滚动，立刻加载 */
        var hash = location.hash;
        if (hash === '#treedata') { load('chart'); }
        if (hash === '#location') { load('map'); }

        /* 点导航里的锚点链接同理：跳过去之前先把东西备好 */
        document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a[href^="#"]');
            if (!a) { return; }
            var h = a.getAttribute('href');
            if (h === '#treedata') { load('chart'); }
            if (h === '#location') { load('map'); }
        });

        window.LazyLoad = {
            ensureChart: function () { return load('chart'); },
            ensureMap: function () { return load('map'); },
            state: state
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

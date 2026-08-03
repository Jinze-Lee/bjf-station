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
                'js/observations.js', 'js/chart.js',
                'js/environment.js', 'js/chart-env.js',
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
            el.src = src;
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

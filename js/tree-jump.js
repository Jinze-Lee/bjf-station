/* ==========================================================================
 * 从三维页跳过来看某棵树的数据
 *
 * 两种来路：
 *   ① 主页内嵌的三维 iframe 里点了液流点 -> postMessage({type:'bfers-select-tree', id})
 *   ② 独立打开的 /3d/ 页里点了 -> 跳到 index.html?tree=<树号>#treedata
 *
 * 图表是懒加载的（滚到才下），所以这里要等 window.SiteChart 出现再选树。
 * ========================================================================== */
(function () {
    'use strict';

    function ensureTree(id, tries) {
        tries = tries || 0;
        if (tries === 0) {
            /* 先滚到树木数据区：图表是懒加载的，不滚过去它永远不初始化 */
            var el0 = document.getElementById('treedata');
            if (el0 && el0.scrollIntoView) { el0.scrollIntoView({ behavior: 'auto', block: 'start' }); }
        }
        if (window.SiteChart && typeof window.SiteChart.setTree === 'function') {
            window.SiteChart.setTree(id);
            var el = document.getElementById('treedata');
            if (el && el.scrollIntoView) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return;
        }
        if (tries > 60) { return; }                 /* 最多等 18 秒 */
        setTimeout(function () { ensureTree(id, tries + 1); }, 300);
    }

    /* ① 来自内嵌三维页的点击 */
    window.addEventListener('message', function (e) {
        var d = e.data;
        if (d && d.type === 'bfers-select-tree' && typeof d.id === 'string' && d.id) {
            ensureTree(d.id);
        }
    });

    /* ② 带 ?tree= 打开（独立三维页跳过来的） */
    var m = /[?&]tree=([^&#]+)/.exec(location.search);
    if (m) { ensureTree(decodeURIComponent(m[1])); }
}());

/* ==========================================================================
 * 树木选择器与信息卡（支持中英文切换）
 *
 * 职责：
 *   1. 用 trees.js 的数据填充树木下拉框（按数采分组）
 *   2. 提供 window.updateTreeInfo(tree)，由 chart.js 在切换树木时调用
 *   3. 填充样点卡片、树种汇总表、导航栏里的样点名
 *   4. 向 Lang 注册回调，语言切换时整体重绘
 *
 * 本文件必须在 chart.js **之前**加载：chart.js 初始化时会读取下拉框
 * 并调用 updateTreeInfo，依赖这里先注册好。
 *
 * 对外句柄：window.TreeInfo = { plotName, speciesName, woodName, current() }
 * ========================================================================== */

(function () {
    'use strict';

    var currentTree = null;

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function isZh() { return window.Lang && Lang.current === 'zh'; }
    function t(k)   { return window.Lang ? Lang.t(k) : k; }

    /* 观测数据是按需加载的（js/lazy-load.js），首屏时 OBS_FD 还不存在。
     * 这个状态下**不能**判定「无数据」—— 那会把 20 棵树全部禁掉，
     * 下拉框整个不能用。数据到齐后 lazy:chart 事件会触发重建（见 init）。 */
    function dataLoaded() { return typeof OBS_FD !== 'undefined'; }

    /* 当前数据文件里这棵树有没有观测值。
     * 数据未到时一律按「有」处理：宁可先放开、等数据到了再标，
     * 也不要在信息不足时就把选项禁掉。 */
    function hasData(id) {
        if (!dataLoaded()) { return true; }
        /* 液流和径向是两套独立仪器，装了其中一套就算有数据。
         * 这里原先查的是 OBS_DIA —— 数据文件里根本没这个全局（叫 OBS_RAD），
         * 所以「只有径向、没有液流」的树一直会被误判成无数据。
         * 当前 20 棵树两套都齐，看不出来，但下一批数据就会踩。 */
        return !!((OBS_FD[id] && OBS_FD[id].length) ||
                  (typeof OBS_RAD !== 'undefined' && OBS_RAD[id] && OBS_RAD[id].length));
    }

    /* 样点名：中文用 nameZh，英文用 name */
    function plotName(key) {
        var p = PLOTS[key];
        if (!p) { return key; }
        return isZh() ? p.nameZh : p.name;
    }

    /* 树种「常用名」：中文界面显示中文名，英文界面显示英文俗名 */
    function speciesName(tree) {
        return isZh() ? tree.speciesZh : tree.commonName;
    }

    /* 木材解剖类型 */
    function woodName(wood) { return t('wood.' + wood); }

    /* --- 导航栏里的样点名 --- */
    function fillNavPlots() {
        var els = document.querySelectorAll('.plot-label[data-plot]');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = plotName(els[i].getAttribute('data-plot'));
        }
    }

    /* --- 下拉框：按数采分组 --- */
    function buildSelect() {
        var sel = document.getElementById('treeSelect');
        if (!sel || typeof TREES === 'undefined') { return; }

        var keep = sel.value;
        sel.innerHTML = '';

        Object.keys(PLOTS).forEach(function (key) {
            var group = document.createElement('optgroup');
            group.label = key + ' — ' + plotName(key);
            TREES.filter(function (tr) { return tr.plot === key; }).forEach(function (tr) {
                var opt = document.createElement('option');
                opt.value = tr.id;
                opt.textContent = tr.id + '  ·  ' + (isZh() ? tr.speciesZh + ' ' + tr.species
                                                            : tr.species);
                /* 本批数据里没有这棵树时把它禁掉并标注 ——
                 * 否则选了没反应，会被当成网页坏了。实测数据常只覆盖部分树木。 */
                if (!hasData(tr.id)) {
                    opt.disabled = true;
                    opt.textContent += '  （' + t('treedata.noData') + '）';
                }
                group.appendChild(opt);
            });
            sel.appendChild(group);
        });

        if (keep) { sel.value = keep; }
    }

    /* --- 信息卡：随选中树木更新 --- */
    function updateTreeInfo(tree) {
        var box = document.getElementById('treeInfo');
        if (!box || !tree) { return; }
        currentTree = tree;
        var plot = PLOTS[tree.plot];

        box.innerHTML =
            '<div class="ti-head">' +
              '<span class="ti-dot" style="background:' + plot.color + '"></span>' +
              '<span class="ti-id">' + esc(tree.id) + '</span>' +
              '<span class="ti-sp">' + esc(tree.species) + '</span>' +
            '</div>' +
            '<dl class="ti-facts">' +
              '<div><dt>' + t('map.commonName') + '</dt><dd>' + esc(speciesName(tree)) + '</dd></div>' +
              '<div><dt>' + t('map.plot') + '</dt><dd>' + esc(plotName(tree.plot)) +
                  ' (' + esc(tree.plot) + ')</dd></div>' +
              '<div><dt>' + t('map.probe') + '</dt><dd>' + esc(tree.probe) + ' / ' +
                  esc(tree.gateway) + '</dd></div>' +
              '<div><dt>' + t('map.wood') + '</dt><dd>' + esc(woodName(tree.wood)) + '</dd></div>' +
              '<div><dt>' + t('map.circ') + '</dt><dd>' + tree.circumference.toFixed(2) + ' cm</dd></div>' +
              '<div><dt>' + t('map.dbh') + '</dt><dd>' + tree.dbh.toFixed(2) + ' cm</dd></div>' +
              '<div><dt>' + t('map.coords') + '</dt><dd>' + tree.lat.toFixed(6) + '°N, ' +
                  tree.lon.toFixed(6) + '°E <span class="muted">(WGS-84)</span></dd></div>' +
            '</dl>' +
            '<button type="button" id="locateTree" data-tree="' + esc(tree.id) + '">' +
              t('map.locate') + '</button>';

        var btn = document.getElementById('locateTree');
        if (btn) {
            btn.addEventListener('click', function () {
                var el = document.getElementById('map_canvas');
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
                if (window.SiteMap) {
                    setTimeout(function () { window.SiteMap.focusTree(tree.id); }, 450);
                }
            });
        }
    }

    /* --- 树种汇总表 --- */
    function buildSpeciesTable() {
        var tb = document.getElementById('speciesTableBody');
        if (!tb || typeof TREES === 'undefined') { return; }
        tb.innerHTML = '';

        var by = {};
        TREES.forEach(function (tr) {
            if (!by[tr.species]) {
                by[tr.species] = { sp: tr.species, tree: tr, wood: tr.wood, n: 0, dbh: [] };
            }
            by[tr.species].n += 1;
            by[tr.species].dbh.push(tr.dbh);
        });

        Object.keys(by).sort(function (a, b) { return by[b].n - by[a].n || a.localeCompare(b); })
            .forEach(function (k) {
                var r = by[k];
                var lo = Math.min.apply(null, r.dbh), hi = Math.max.apply(null, r.dbh);
                var row = document.createElement('tr');
                row.innerHTML =
                    '<td><span class="sp">' + esc(r.sp) + '</span></td>' +
                    '<td>' + esc(speciesName(r.tree)) + '</td>' +
                    '<td>' + esc(woodName(r.wood)) + '</td>' +
                    '<td class="num">' + r.n + '</td>' +
                    '<td class="num">' + lo.toFixed(1) + '–' + hi.toFixed(1) + '</td>';
                tb.appendChild(row);
            });
    }

    /* --- 样点汇总卡片 --- */
    function buildPlotSummary() {
        var el = document.getElementById('plotSummary');
        if (!el || typeof PLOTS === 'undefined') { return; }
        el.innerHTML = '';

        Object.keys(PLOTS).forEach(function (key) {
            var p = PLOTS[key];
            var trees = TREES.filter(function (tr) { return tr.plot === key; });
            var species = {};
            trees.forEach(function (tr) { species[tr.species] = 1; });

            var div = document.createElement('div');
            div.className = 'plot-card';
            div.style.borderLeftColor = p.color;
            div.innerHTML =
                '<h4><span class="ti-dot" style="background:' + p.color + '"></span>' +
                    esc(key) + '</h4>' +
                '<p class="plot-name">' + esc(plotName(key)) + '</p>' +
                '<p class="plot-stats">' + trees.length + ' ' + t('trees.nTrees') + ' · ' +
                    Object.keys(species).length + ' ' + t('trees.nSpecies') + '</p>';
            el.appendChild(div);
        });
    }

    function renderAll() {
        fillNavPlots();
        buildSelect();
        buildSpeciesTable();
        buildPlotSummary();
        if (currentTree) { updateTreeInfo(currentTree); }
    }

    window.updateTreeInfo = updateTreeInfo;
    window.TreeInfo = {
        plotName: plotName,
        speciesName: speciesName,
        woodName: woodName,
        hasData: hasData,
        current: function () { return currentTree; }
    };

    function init() {
        renderAll();
        if (window.Lang) { Lang.onChange(renderAll); }
        /* 观测数据到位后重建下拉框，把「本批无数据」的标注补上。
         * 事件由 js/lazy-load.js 在整组脚本加载完后派发。 */
        document.addEventListener('lazy:chart', buildSelect);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

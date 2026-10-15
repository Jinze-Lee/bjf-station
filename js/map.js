/* ==========================================================================
 * Tree Location 地图 —— 20 棵被监测树木 + 3 台数采
 *
 * 参考站点用 Google Maps（国内无法访问），这里改用 Leaflet + 国内可用瓦片。
 *
 * ⚠️ 坐标系陷阱（国内建站必踩）：
 *   高德等国内瓦片使用 GCJ-02（火星坐标系），而 trees.js 里存的是 WGS-84
 *   （GPS / 手簿 / 论文用的那一套）。把 WGS-84 直接打到高德瓦片上会偏 300–500 m。
 *   本文件实现 WGS-84 -> GCJ-02 转换，并在切换底图时自动换算，
 *   保证标记无论用哪个底图都落在正确位置。
 *
 * 标记按数采分三色（见 trees.js 的 PLOTS.color）：
 *   DT1 绿 / DT2 蓝 / DT3 橙
 * 点击树木标记会把 Tree data 图表切换到该树。
 *
 * 对外句柄：window.SiteMap = { map, markers, wgs84ToGcj02, focusTree(id) }
 * ========================================================================== */

(function () {
    'use strict';

    var CONTAINER = 'map_canvas';
    var DEFAULT_ZOOM = 16;

    /* 首屏默认展开这棵树的弹窗 —— 不这样的话用户可能根本不知道标记可以点。
     * （窄屏不弹，见下方 openPopup 处的说明。）
     * 必须与 chart.js 的 DEFAULT_TREE 一致。 */
    var DEFAULT_POPUP_TREE = 'DT1-BH1-1137';

    function t(k) { return window.Lang ? Lang.t(k) : k; }
    function plotName(k) {
        return window.TreeInfo ? window.TreeInfo.plotName(k) : PLOTS[k].name;
    }
    function speciesName(tr) {
        return window.TreeInfo ? window.TreeInfo.speciesName(tr) : tr.commonName;
    }
    function woodName(w) {
        return window.TreeInfo ? window.TreeInfo.woodName(w) : w;
    }

    /* ---------------------------------------------------------------------
     * WGS-84 -> GCJ-02 坐标转换（中国国测局加密算法）
     * 境外坐标不加密，直接返回原值。
     * ------------------------------------------------------------------- */
    var A  = 6378245.0;              // 克拉索夫斯基椭球长半轴
    var EE = 0.00669342162296594323; // 椭球偏心率平方

    function outOfChina(lat, lon) {
        return (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271);
    }

    function transformLat(x, y) {
        var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y +
                  0.2 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
        return ret;
    }

    function transformLon(x, y) {
        var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y +
                  0.1 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
        return ret;
    }

    function wgs84ToGcj02(lat, lon) {
        if (outOfChina(lat, lon)) { return [lat, lon]; }
        var dLat = transformLat(lon - 105.0, lat - 35.0);
        var dLon = transformLon(lon - 105.0, lat - 35.0);
        var radLat = lat / 180.0 * Math.PI;
        var magic = Math.sin(radLat);
        magic = 1 - EE * magic * magic;
        var sqrtMagic = Math.sqrt(magic);
        dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * Math.PI);
        dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * Math.PI);
        return [lat + dLat, lon + dLon];
    }

    /* ------------------------------------------------------------------- */
    function renderError(msg) {
        var el = document.getElementById(CONTAINER);
        if (!el) { return; }
        el.className = 'map-error';
        el.innerHTML = '<div><strong>地图未能加载</strong></div><div>' + msg + '</div>';
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function treePopup(tr) {
        return '<div class="tree-popup">' +
            '<strong>' + esc(tr.id) + '</strong>' +
            '<div class="sp">' + esc(tr.species) + '</div>' +
            '<div class="cn">' + esc(speciesName(tr)) + '</div>' +
            '<table>' +
              '<tr><th>' + t('map.plot') + '</th><td>' + esc(plotName(tr.plot)) +
                  ' (' + esc(tr.plot) + ')</td></tr>' +
              '<tr><th>' + t('map.wood') + '</th><td>' + esc(woodName(tr.wood)) + '</td></tr>' +
              '<tr><th>' + t('map.probe') + '</th><td>' + esc(tr.probe) + ' / ' +
                  esc(tr.gateway) + '</td></tr>' +
              '<tr><th>' + t('map.circ') + '</th><td>' + tr.circumference.toFixed(2) + ' cm</td></tr>' +
              '<tr><th>' + t('map.dbh') + '</th><td>' + tr.dbh.toFixed(2) + ' cm</td></tr>' +
              '<tr><th>' + t('map.coords') + '</th><td>' + tr.lat.toFixed(6) + '&deg;N, ' +
                  tr.lon.toFixed(6) + '&deg;E</td></tr>' +
            '</table>' +
            '<button type="button" class="popup-btn" data-tree="' + esc(tr.id) + '">' +
              t('map.showData') + '</button>' +
            '</div>';
    }

    function loggerPopup(key) {
        var p = PLOTS[key];
        return '<div class="tree-popup"><strong>' + key + ' &mdash; ' + t('map.logger') + '</strong>' +
            '<div class="cn">' + esc(plotName(key)) + '</div>' +
            '<table><tr><th>' + t('map.coords') + '</th><td>' + p.lat.toFixed(6) + '&deg;N, ' +
            p.lon.toFixed(6) + '&deg;E</td></tr></table></div>';
    }

    function render() {
        if (typeof L === 'undefined') {
            renderError('Leaflet 库不可用，请确认 <code>js/leaflet.js</code> 存在。');
            return;
        }
        if (typeof TREES === 'undefined' || typeof PLOTS === 'undefined') {
            renderError('树木数据不可用，请确认 <code>js/trees.js</code> 存在。');
            return;
        }

        /* 用全部树木的外接范围定初始视野 */
        var lats = TREES.map(function (t) { return t.lat; });
        var lons = TREES.map(function (t) { return t.lon; });
        var center = [(Math.min.apply(null, lats) + Math.max.apply(null, lats)) / 2,
                      (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2];

        var map = L.map(CONTAINER, {
            center: [center[0], center[1]],   /* 默认底图天地图是 WGS-84，不用补正 */
            zoom: DEFAULT_ZOOM,
            maxZoom: 21,                // 见下方 maxNativeZoom 说明
            scrollWheelZoom: false      // 避免页面滚动时误缩放；点击地图后启用
        });
        map.on('click', function () { map.scrollWheelZoom.enable(); });
        map.on('mouseout', function () { map.scrollWheelZoom.disable(); });

        /* 同一样点内的树木相距只有 8–20 m，高德瓦片最高只到 z18，
         * 在 z18 下 7 棵树会挤成一团。用 maxNativeZoom 让 Leaflet 在
         * z18 以上放大复用 z18 的瓦片（画面变糊但位置精确），
         * 这样才能把单棵树分辨开。 */
        var amapSat = L.tileLayer(
            'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
            { subdomains: '1234', maxNativeZoom: 18, maxZoom: 21,
              attribution: '&copy; 高德地图 AutoNavi (GCJ-02)' });

        var amapStreet = L.tileLayer(
            'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            { subdomains: '1234', maxNativeZoom: 18, maxZoom: 21,
              attribution: '&copy; 高德地图 AutoNavi (GCJ-02)' });

        var osm = L.tileLayer(
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            { maxNativeZoom: 19, maxZoom: 21,
              attribution: '&copy; OpenStreetMap contributors (WGS-84)' });

        /* --- 天地图影像（与三维底图同一个源；WGS-84 天然对齐，不用 GCJ 补正） ---
         * 天地图在这一带是「夏绿 / 冬灰」两块拼接（实测 5x5 瓦片平均色最大差 76），
         * 直接铺会有一块颜色突兀。自定义瓦片图层：每块算 RGB 均值/标准差，按 0.7
         * 靠向参考色调（参考 = 起手在样地一带采样 3x3 张的平均），接缝就不刺眼了
         * —— 与三维地面同一套做法（那边实测极差 68 -> 21）。 */
        var TDT_TK = 'faa2a38ebee2231bb08b9176019b1652';
        function tileStatsOf(img) {
            var S = 64, c = document.createElement('canvas');
            c.width = S; c.height = S;
            var g = c.getContext('2d');
            g.drawImage(img, 0, 0, S, S);
            var d = g.getImageData(0, 0, S, S).data, n = S * S;
            var s = [0, 0, 0], s2 = [0, 0, 0];
            for (var i = 0; i < d.length; i += 4) {
                for (var k = 0; k < 3; k++) { var v = d[i + k]; s[k] += v; s2[k] += v * v; }
            }
            var mean = [], sd = [];
            for (var j = 0; j < 3; j++) {
                mean[j] = s[j] / n;
                sd[j] = Math.sqrt(Math.max(1, s2[j] / n - mean[j] * mean[j]));
            }
            return { mean: mean, sd: sd };
        }
        function toneMatched(img, st, ref, strength) {
            var c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            var g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            var d = g.getImageData(0, 0, c.width, c.height), px = d.data;
            /* 只做均值偏移，而且留死区：本地区域几块本来就均匀，逐块微调反而在瓦片边上
               留下可见的台阶；只有差得多的（另一片拼接）才拉过来。 */
            var off = [];
            for (var k = 0; k < 3; k++) {
                var dm = ref.mean[k] - st.mean[k];
                off[k] = (Math.abs(dm) < 25 ? 0 : (dm - (dm > 0 ? 25 : -25))) * strength;
            }
            for (var i = 0; i < px.length; i += 4) {
                for (var j = 0; j < 3; j++) {
                    var v = px[i + j] + off[j];
                    px[i + j] = v < 0 ? 0 : (v > 255 ? 255 : v);
                }
            }
            g.putImageData(d, 0, 0);
            return c;
        }
        /* 参考色调：按层级各自算（与三维地面同一套逻辑 —— 那边平均的是同层级 64 块）。
         * 起手用别的层级当参考会让每块的增益各不相同，反而把画面切成一块块。 */
        var tdtRefs = {};
        function tdtRef(z) {
            if (!tdtRefs[z]) {
                tdtRefs[z] = new Promise(function (res) {
                    var p = map.project(map.getCenter(), z).divideBy(256).floor();
                    var all = [], jobs = [], done = false;
                    function finish() {
                        if (done) { return; }
                        done = true;
                        if (!all.length) { res(null); return; }
                        var mean = [0, 0, 0], sd = [0, 0, 0];
                        all.forEach(function (s) {
                            for (var k = 0; k < 3; k++) { mean[k] += s.mean[k] / all.length; sd[k] += s.sd[k] / all.length; }
                        });
                        res({ mean: mean, sd: sd });
                    }
                    /* 采样卡住（预览/跨境链路都可能）也不能拖着不铺瓦片 —— 6 秒到点就用已采到的 */
                    setTimeout(finish, 6000);
                    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
                        (function (x, y) {
                            jobs.push(new Promise(function (ok) {
                                var im = new Image();
                                im.crossOrigin = 'anonymous';
                                im.onload = function () {
                                    try { all.push(tileStatsOf(im)); } catch (e) {}
                                    ok();
                                };
                                im.onerror = function () { ok(); };
                                im.src = tdtTileUrl(x, y, z, x + y);
                            }));
                        }(p.x + i, p.y + j));
                    }
                    Promise.all(jobs).then(finish);
                });
            }
            return tdtRefs[z];
        }
        function tdtTileUrl(x, y, z, s) {
            return 'https://t' + ((s || 0) % 8) + '.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile' +
                   '&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles' +
                   '&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x + '&tk=' + TDT_TK;
        }
        var TdtLayer = L.TileLayer.extend({
            createTile: function (coords, done) {
                var size = this.getTileSize();
                var tile = document.createElement('canvas');
                tile.width = size.x; tile.height = size.y;
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function () {
                    tdtRef(Math.min(coords.z, 18)).then(function (ref) {
                        var g = tile.getContext('2d');
                        try {
                            var st = tileStatsOf(img);
                            g.drawImage(ref ? toneMatched(img, st, ref, 0.7) : img, 0, 0, tile.width, tile.height);
                        } catch (e) { g.drawImage(img, 0, 0, tile.width, tile.height); }
                        done(null, tile);
                    });
                };
                img.onerror = function () { done(new Error('tile'), tile); };
                img.src = this.getTileUrl(coords);
                return tile;
            }
        });
        var tdtSat = new TdtLayer(
            'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
            '&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles' +
            '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=' + TDT_TK,
            { subdomains: '01234567', maxNativeZoom: 18, maxZoom: 21,
              attribution: '&copy; 天地图 Tianditu (WGS-84)' });

        tdtSat.addTo(map);           /* 默认底图：天地图（金总选的） */

        /* 树木标记要盖在数采标签之上，否则会被完全遮住
         * （circleMarker 默认落在 overlayPane z400，divIcon 落在 markerPane z600） */
        map.createPane('treePane');
        map.getPane('treePane').style.zIndex = 650;

        /* --- 图层：树木按数采分三组，数采本体单独一组 --- */
        var useGcj = false;                // 当前底图是否为 GCJ-02 坐标系（默认底图是天地图，WGS-84）
        var markers = {};                  // 树号 -> marker
        var groups = {};                   // 数采 -> LayerGroup
        var loggerMarkers = [];

        function place(lat, lon) {
            return useGcj ? wgs84ToGcj02(lat, lon) : [lat, lon];
        }

        /* 样点颜色优先取 CSS 变量 --dt1/--dt2/--dt3，取不到才回落到
         * trees.js 里生成的 PLOTS[].color。
         *
         * 为什么要这么绕：两套主题的样点色不一样 —— 浅色主题下的样点绿要亮一档
         * （深绿会糊进卫星影像的植被里）。颜色写死在 trees.js 就只能有一套。
         * 走 CSS 变量后，切主题时 repaintTheme() 重读一遍就能全部换掉。 */
        function plotColor(key) {
            var order = { DT1: '--dt1', DT2: '--dt2', DT3: '--dt3' };
            var name = order[key];
            if (name) {
                try {
                    var v = getComputedStyle(document.documentElement)
                                .getPropertyValue(name).trim();
                    if (v) { return v; }
                } catch (e) { /* 落到下面的回退 */ }
            }
            return PLOTS[key].color;
        }

        Object.keys(PLOTS).forEach(function (key) {
            groups[key] = L.layerGroup().addTo(map);
        });

        TREES.forEach(function (tr) {
            /* 本批数据里没有这棵树时，标记画成空心，与「有数据」区分开 */
            var has = !window.TreeInfo || window.TreeInfo.hasData(tr.id);
            var m = L.circleMarker(place(tr.lat, tr.lon), {
                pane: 'treePane',
                radius: 6,
                color: has ? '#0d0f0b' : plotColor(tr.plot),
                weight: 1.5,
                fillColor: plotColor(tr.plot),
                fillOpacity: has ? 0.95 : 0.15
            });
            m.bindPopup(treePopup(tr), {
                minWidth: 250,
                /* 自动平移时留出边距，避免弹窗贴边或被裁掉 */
                autoPanPadding: [24, 24]
            });
            m.bindTooltip(tr.id, { direction: 'top', offset: [0, -8] });
            m.on('click', function () {
                if (window.SiteChart) { window.SiteChart.setTree(tr.id); }
            });
            m.addTo(groups[tr.plot]);
            markers[tr.id] = m;
        });

        /* 数采本体：方形标记，与树木区分 */
        var loggerLayer = L.layerGroup().addTo(map);

        function loggerIcon(key) {
            var c = plotColor(key);
            return L.divIcon({
                className: 'logger-icon',
                html: '<span style="border-color:' + c + ';color:' + c + '">' +
                      key + '</span>',
                iconSize: [38, 20],
                /* 标签上移，避免压住同一位置的树木标记 */
                iconAnchor: [19, 30]
            });
        }

        Object.keys(PLOTS).forEach(function (key) {
            var p = PLOTS[key];
            var m = L.marker(place(p.lat, p.lon), { icon: loggerIcon(key) });
            m.bindPopup(loggerPopup(key));
            m.addTo(loggerLayer);
            loggerMarkers.push({ key: key, marker: m });
        });

        /* --- RTK 实测点：主树（默认开）与样方内树（默认关） ---
         *
         * 数据来自 G:\\Forlijinze 的 RTK shapefile，见 js/survey-points.js。
         * 与上面那 20 棵「被监测树」用不同样式区分：这里是空心的中性色小圈，
         * 且留在默认 overlayPane（z400），低于被监测树用的 treePane（z650），
         * 所以永远不会盖住被监测树。颜色走 CSS 变量（--survey-main/--survey-tree），
         * 这样切主题时跟着变。
         */
        var surveyMainMarkers = [];
        var surveyTreeMarkers = [];

        function surveyColor(kind) {
            var name = (kind === 'main') ? '--survey-main' : '--survey-tree';
            try {
                var v = getComputedStyle(document.documentElement)
                            .getPropertyValue(name).trim();
                if (v) { return v; }
            } catch (e) { /* 落到回退色 */ }
            return (kind === 'main') ? '#7f9db9' : '#b08d63';
        }

        /* H 并非所有点都有（主树多数为 0），所以 >0 才显示数值，否则给破折号 */
        function hText(h) {
            return (h && h > 0) ? (h.toFixed(1) + ' m') : '\u2014';
        }

        function surveyPopup(pt, kind) {
            var rows = '';
            if (pt.species) {
                rows += '<tr><th>' + t('map.species') + '</th><td>' + esc(pt.species) + '</td></tr>';
            }
            rows += '<tr><th>' + t('map.coords') + '</th><td>' +
                    pt.lat.toFixed(6) + '&deg;N, ' + pt.lon.toFixed(6) + '&deg;E</td></tr>' +
                    '<tr><th>' + t('map.hRtk') + '</th><td>' + hText(pt.h) + '</td></tr>';
            return '<div class="tree-popup survey-popup">' +
                '<strong>' + esc(pt.name) + '</strong>' +
                '<div class="cn">' + t(kind === 'main' ? 'map.surveyMain' : 'map.surveyTree') + '</div>' +
                '<table>' + rows + '</table></div>';
        }

        var surveyMainLayer = L.layerGroup();
        var surveyTreeLayer = L.layerGroup();

        function addSurvey(arr, kind, layer, store, radius, weight) {
            arr.forEach(function (pt) {
                var c = surveyColor(kind);
                var m = L.circleMarker(place(pt.lat, pt.lon), {
                    radius: radius, weight: weight,
                    color: c, fillColor: c,
                    fillOpacity: (kind === 'main' ? 0.18 : 0.32)
                });
                m.bindPopup(surveyPopup(pt, kind));
                m.bindTooltip(pt.name, { direction: 'top', offset: [0, -6] });
                m.addTo(layer);
                store.push({ pt: pt, marker: m, kind: kind });
            });
        }

        if (typeof SURVEY !== 'undefined') {
            addSurvey(SURVEY.maintrees || [], 'main', surveyMainLayer, surveyMainMarkers, 4, 1.5);
            addSurvey(SURVEY.plotTrees || [], 'tree', surveyTreeLayer, surveyTreeMarkers, 3, 1);
            /* 散点图层不挂到地图上（金总要求移除所有 RTK 散点）；对象保留，
               别的代码（联动、验收）还能引用，只是不显示。 */
        }

        /* --- 样方框：已按金总要求从二维地图移除（2026-10-13）。
               那 53 个框是 pin 桩点凸包、每个才 9×10 m，又小又碎；三维里本来就没有。
               SURVEY.quadrats 数据仍保留在 js/survey-points.js 里，只是不画了。 --- */

        /* --- 样地边界 / 网格 / 水系（源：原始数据/bounds，见 js/bounds.js） --- */
        /* bounds.js 里的样地名只有中文；英文沿用 trees.js 的说法，免得同一块样地两个名字 */
        var BOUND_EN = { '综合林': 'Mixed forest plot', '落叶松': 'Larch plot', '油松': 'Pine plot' };
        function boundName(g) {
            return (window.Lang && Lang.current !== 'zh') ? (BOUND_EN[g.name] || g.name) : g.name;
        }
        var boundLayer = L.layerGroup(), grid20Layer = L.layerGroup(),
            grid40Layer = L.layerGroup(), drainLayer = L.layerGroup();
        var boundShapes = [], grid20Shapes = [], grid40Shapes = [], drainShapes = [];
        if (typeof BOUNDS !== 'undefined') {
            function addPolys(list, layer, store, opts) {
                (list || []).forEach(function (g) {
                    var poly = L.polygon(g.pts.map(function (p) { return place(p[0], p[1]); }), opts);
                    if (g.name) { poly.bindTooltip(boundName(g), { direction: 'top', offset: [0, -4] }); }
                    poly.addTo(layer);
                    store.push({ g: g, poly: poly });
                });
            }
            addPolys(BOUNDS.boundaries, boundLayer, boundShapes,
                { color: '#f98422', weight: 2.5, opacity: 1, fillColor: '#f98422', fillOpacity: 0.1 });
            addPolys(BOUNDS.grid20, grid20Layer, grid20Shapes,
                { color: '#eaeaea', weight: 1, opacity: 0.7, fill: false });
            addPolys(BOUNDS.grid40, grid40Layer, grid40Shapes,
                { color: '#ffd27f', weight: 1.4, opacity: 0.8, fill: false });
            (BOUNDS.drainage || []).forEach(function (line) {
                var pl = L.polyline(line.map(function (p) { return place(p[0], p[1]); }),
                    { color: '#4d7f9e', weight: 1.2, opacity: 0.8 });   /* 水系：灰蓝细线，不抢视线 */
                pl.addTo(drainLayer);
                drainShapes.push({ g: { pts: line }, poly: pl });
            });
            boundLayer.addTo(map);           /* 边界默认开；网格/水系默认关 */
        }

        /* --- 站点标注：定位站生活区 / 林场 / 大样地 / 白桦林样地（源 js/sites.js，
               由 工具/生成站点标注.py 生成）。金总要求「所有标签也加个按钮」，
               所以站点、大样地/白桦林、以及名称标注各挂一个开关。 --- */
        var siteLayer = L.layerGroup(), bigLayer = L.layerGroup(), nameLayer = L.layerGroup();
        var siteShapes = [], bigShapes = [], nameMarkers = [];

        /* 站点名字按当前语言取 */
        function siteName(g) { return (window.Lang && Lang.current !== 'zh') ? g.name : g.nameZh; }

        function polyCenter(g) {
            var r = g.pts, n = r.length, la = 0, lo = 0;
            if (r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) { n--; }   /* 首尾重合，去掉最后一个 */
            if (n < 3) { return null; }
            for (var i = 0; i < n; i++) { la += r[i][0]; lo += r[i][1]; }
            return [la / n, lo / n];
        }
        function addNameLabel(lat, lon, text) {
            var m = L.marker(place(lat, lon), { interactive: false,
                icon: L.divIcon({ className: 'plotname', iconSize: [140, 16], iconAnchor: [70, 8], html: text }) });
            m.addTo(nameLayer);
            nameMarkers.push({ lat: lat, lon: lon, m: m });
            return m;
        }
        function addNameLabelPoly(g, text) {
            var c = polyCenter(g);
            if (c) { addNameLabel(c[0], c[1], text); }
        }
        /* 名称标注：按当前语言重建（切语言时也要跟着换） */
        function rebuildNameLabels() {
            nameLayer.clearLayers();
            nameMarkers = [];
            var zh = !window.Lang || Lang.current === 'zh';
            if (typeof SITES !== 'undefined') {
                (SITES.areas || []).forEach(function (a) { addNameLabelPoly(a, zh ? a.nameZh : a.name); });
                (SITES.points || []).forEach(function (q) { addNameLabel(q.lat, q.lon, zh ? q.nameZh : q.name); });
            }
            if (typeof BOUNDS !== 'undefined') {
                (BOUNDS.boundaries || []).forEach(function (b) { addNameLabelPoly(b, boundName(b)); });
            }
        }
        if (typeof SITES !== 'undefined') {
            (SITES.points || []).forEach(function (p) {
                var m = L.circleMarker(place(p.lat, p.lon), {
                    radius: 5, color: '#20242a', weight: 1.6, fillColor: '#ffd400', fillOpacity: 1 });
                m.bindPopup('<b>' + esc(siteName(p)) + '</b>' + (p.alt != null ? '<br>' + p.alt + ' m' : ''));
                m.addTo(siteLayer);
                siteShapes.push({ g: p, m: m });
            });
            (SITES.areas || []).forEach(function (a) {
                var poly = L.polygon(a.pts.map(function (q) { return place(q[0], q[1]); }), {
                    color: '#3f8fd0', weight: 2.4, opacity: 1, fillColor: '#3f8fd0', fillOpacity: 0.1 });
                poly.bindTooltip(siteName(a), { direction: 'top', offset: [0, -4] });
                poly.addTo(bigLayer);
                bigShapes.push({ g: a, poly: poly });
            });
            /* 名称标注默认开（不跟 SITES 成不成功绑一起：三个样地的名字也要能开关） */
        }
        rebuildNameLabels();
        nameLayer.addTo(map);
        if (typeof SITES !== 'undefined') { siteLayer.addTo(map); bigLayer.addTo(map); }

        /* --- 其他台站（小五台 / 驼梁）：做法与东灵山样地一致 —— 实测点拟合的样方框 +
               名称标注，各自一个可勾选图层；另有「台站切换」按钮直接飞过去。
               源：js/stations.js（工具/生成台站样地.py 生成，与展板同一套几何）。 --- */
        var stationLayers = {}, stationShapes = {};
        if (typeof STATIONS !== 'undefined') {
            Object.keys(STATIONS).forEach(function (k) {
                var st = STATIONS[k];
                var grp = L.layerGroup();
                stationLayers[k] = grp;
                stationShapes[k] = [];
                (st.plots || []).forEach(function (p) {
                    var poly = L.polygon(p.pts.map(function (q) { return place(q[0], q[1]); }), {
                        color: st.color, weight: 2.4, opacity: 1, fillColor: st.color, fillOpacity: 0.12 });
                    poly.bindTooltip(p.nameZh, { direction: 'top', offset: [0, -4] });
                    poly.addTo(grp);
                    stationShapes[k].push({ g: p, poly: poly });
                });
            });
        }

        /* 台站切换：点了飞到该站，并只显示该站的样方框（东灵山 = 本站，回到原来的视野） */
        function stationName(st) { return (window.Lang && Lang.current !== 'zh') ? st.name : st.nameZh; }
        function goStation(k) {
            Object.keys(stationLayers).forEach(function (kk) {
                if (kk === k) { stationLayers[kk].addTo(map); } else { map.removeLayer(stationLayers[kk]); }
            });
            if (!k) { fitAll(); return; }
            var pts = [];
            (STATIONS[k].plots || []).forEach(function (p) {
                p.pts.forEach(function (q) { pts.push(place(q[0], q[1])); });
            });
            if (pts.length) { map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 17 }); }
        }
        if (typeof STATIONS !== 'undefined') {
            var sc = L.control({ position: 'topleft' });
            sc.onAdd = function () {
                var div = L.DomUtil.create('div', 'station-switch');
                function btn(label, key, on) {
                    var b = L.DomUtil.create('button', 'st-btn' + (on ? ' on' : ''), div);
                    b.type = 'button'; b.textContent = label;
                    L.DomEvent.on(b, 'click', function (e) {
                        L.DomEvent.stop(e);
                        Array.prototype.forEach.call(div.querySelectorAll('.st-btn'), function (x) { x.classList.remove('on'); });
                        b.classList.add('on');
                        goStation(key);
                    });
                    return b;
                }
                btn(t('map.stationDl'), null, true);
                Object.keys(STATIONS).forEach(function (k) { btn(stationName(STATIONS[k]), k, false); });
                return div;
            };
            sc.addTo(map);
        }

        /* --- 格网编号（VIT/T）：每个网格格子取中心，找最近的 RTK 实测主树命名，
               半透明写在格子中间 —— 与三维那个「格网编号」同一套做法。默认关。 --- */
        var cellNumLayer = L.layerGroup();
        var cellNumMarkers = [];
        if (typeof BOUNDS !== 'undefined' && typeof SURVEY !== 'undefined' && SURVEY.maintrees) {
            var MT = SURVEY.maintrees.filter(function (m) { return m.lat && m.lon; });
            function nearestName(lat, lon) {
                var best = '', bd = Infinity;
                for (var i = 0; i < MT.length; i++) {
                    var dy = (MT[i].lat - lat) * 110540;
                    var dx = (MT[i].lon - lon) * 111320 * Math.cos(lat * Math.PI / 180);
                    var d2 = dx * dx + dy * dy;
                    if (d2 < bd) { bd = d2; best = MT[i].name; }
                }
                return best;
            }
            function addCellNums(list, cls) {
                (list || []).forEach(function (g) {
                    var r = g.pts, n = r.length - 1, la = 0, lo = 0;   /* 首尾重合，去掉最后一个 */
                    if (n < 3) return;
                    for (var i = 0; i < n; i++) { la += r[i][0]; lo += r[i][1]; }
                    la /= n; lo /= n;
                    var m = L.marker(place(la, lo), { interactive: false,
                        icon: L.divIcon({ className: 'cellnum ' + cls, iconSize: [40, 12], iconAnchor: [20, 6],
                            html: nearestName(la, lo) }) });
                    m.addTo(cellNumLayer);
                    cellNumMarkers.push({ g: g, m: m });
                });
            }
            addCellNums(BOUNDS.grid20, 'c20');
            addCellNums(BOUNDS.grid40, 'c40');
        }

        /* --- 设备点（径向生长仪 / 液流 / LAI）—— 源 js/devices.js，与三维同一份数据。
               只画落在点云范围内的点（源表里有 10 个偏了约 600 m 的错坐标）。 --- */
        var devLayers = {}, devMarkers = {};
        if (typeof DEVICES !== 'undefined') {
            /* 点云（LiDAR 航测）覆盖范围，WGS-84；超出这个框的设备点源表里共 10 个是错坐标，不画 */
            var LAT_MIN = 39.9564368, LAT_MAX = 39.9620972;
            var LON_MIN = 115.4231939, LON_MAX = 115.4301577;
            var DEV_STYLE = {
                /* 形状也区分开：液流=圆、径向=方、LAI=三角（金总要求，不只用颜色） */
                dendrometer: { key: 'devDen', color: '#f0a23c', shape: 'square',   zh: '径向生长仪', en: 'Dendrometer' },
                sapflow:     { key: 'devSap', color: '#3fa9f5', shape: 'circle',   zh: '液流',       en: 'Sap flow' },
                lai:         { key: 'devLai', color: '#b07fd8', shape: 'triangle', zh: 'LAI',        en: 'LAI' }
            };
            function devIcon(st, size) {
                var s = size, h = size / 2, svg;
                if (st.shape === 'circle') {
                    svg = '<circle cx="' + h + '" cy="' + h + '" r="' + (h - 1.5) + '" fill="' + st.color +
                          '" stroke="#0d0f0b" stroke-width="1.5"/>';
                } else if (st.shape === 'square') {
                    svg = '<rect x="1.5" y="1.5" width="' + (s - 3) + '" height="' + (s - 3) +
                          '" fill="' + st.color + '" stroke="#0d0f0b" stroke-width="1.5"/>';
                } else {
                    svg = '<polygon points="' + h + ',1.5 ' + (s - 1.5) + ',' + (s - 2) + ' 1.5,' + (s - 2) +
                          '" fill="' + st.color + '" stroke="#0d0f0b" stroke-width="1.5"/>';
                }
                return L.divIcon({ className: 'dev-ico', iconSize: [s, s], iconAnchor: [h, h],
                    html: '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '">' + svg + '</svg>' });
            }
            Object.keys(DEV_STYLE).forEach(function (k) {
                var st = DEV_STYLE[k];
                var grp = L.layerGroup();
                devLayers[k] = grp; devMarkers[k] = [];
                (DEVICES[k] || []).forEach(function (d) {
                    if (d.lon == null || d.lat == null) return;
                    if (d.lon < LON_MIN || d.lon > LON_MAX || d.lat < LAT_MIN || d.lat > LAT_MAX) return;
                    var m = L.marker(place(d.lat, d.lon), { icon: devIcon(st, 13) })
                        .bindTooltip((d.name || d.id), { direction: 'top', offset: [0, -8] });
                    m.addTo(grp);
                    devMarkers[k].push(m);
                });
            });
        }

        /* --- 单木覆盖（Voronoi / 泰森多边形）：整片区域按最近的树填色 ---
         * 数据见 js/voronoi.js。用 canvas 渲染器承载 3779 个面。
         * 默认关（和「样方内树」一致），否则会把那 20 棵监测树淹掉。 */
        var tsLayer = L.layerGroup();
        var tsMarkers = [];
        if (typeof VORONOI !== 'undefined' && VORONOI.cells) {
            var tsRenderer = L.canvas({ padding: 0.5 });
            var tsSpecies = VORONOI.species || {};
            VORONOI.cells.forEach(function (c) {   // [Spe_ID, [[lat,lon],...]]
                var sp = tsSpecies[String(c[0])];
                var col = (sp && sp.color) ? sp.color : '#888888';
                var poly = L.polygon(c[1].map(function (p) { return place(p[0], p[1]); }), {
                    renderer: tsRenderer, color: col, weight: 0.4, opacity: 0.6,
                    fillColor: col, fillOpacity: 0.75
                });
                if (sp) { poly.bindTooltip(sp.zh, { direction: 'top', offset: [0, -4] }); }
                poly.addTo(tsLayer);
                tsMarkers.push({ g: { pts: c[1] }, poly: poly });
            });

            /* 物种图例（勾选「单木覆盖」时显示，否则收起） */
            var sl = L.control({ position: 'bottomleft' });
            sl.onAdd = function () {
                var div = L.DomUtil.create('div', 'species-legend');
                var html = '<div class="sl-title">' + t('map.speciesLegend') + '</div>';
                Object.keys(tsSpecies).forEach(function (k) {
                    html += '<div class="sl-row"><i style="background:' + tsSpecies[k].color +
                            '"></i>' + esc(tsSpecies[k].zh) + '</div>';
                });
                div.innerHTML = html;
                return div;
            };
            tsLayer.on('add', function () { sl.addTo(map); });
            tsLayer.on('remove', function () { map.removeControl(sl); });
        }

        /* --- 切换底图时按目标坐标系重新摆放所有标记 --- */
        function replaceAll() {
            TREES.forEach(function (t) {
                markers[t.id].setLatLng(place(t.lat, t.lon));
            });
            loggerMarkers.forEach(function (o) {
                o.marker.setLatLng(place(PLOTS[o.key].lat, PLOTS[o.key].lon));
            });
            surveyMainMarkers.forEach(function (o) {
                o.marker.setLatLng(place(o.pt.lat, o.pt.lon));
            });
            surveyTreeMarkers.forEach(function (o) {
                o.marker.setLatLng(place(o.pt.lat, o.pt.lon));
            });
            tsMarkers.forEach(function (o) {
                o.poly.setLatLngs(o.g.pts.map(function (p) { return place(p[0], p[1]); }));
            });
            [boundShapes, grid20Shapes, grid40Shapes, drainShapes].forEach(function (arr) {
                arr.forEach(function (o) {
                    o.poly.setLatLngs(o.g.pts.map(function (p) { return place(p[0], p[1]); }));
                });
            });
            cellNumMarkers.forEach(function (o) {
                var r = o.g.pts, n = r.length - 1, la = 0, lo = 0;
                for (var i = 0; i < n; i++) { la += r[i][0]; lo += r[i][1]; }
                o.m.setLatLng(place(la / n, lo / n));
            });
            siteShapes.forEach(function (o) { o.m.setLatLng(place(o.g.lat, o.g.lon)); });
            bigShapes.forEach(function (o) {
                o.poly.setLatLngs(o.g.pts.map(function (q) { return place(q[0], q[1]); }));
            });
            nameMarkers.forEach(function (o) { o.m.setLatLng(place(o.lat, o.lon)); });
            Object.keys(stationShapes).forEach(function (k) {
                stationShapes[k].forEach(function (o) {
                    o.poly.setLatLngs(o.g.pts.map(function (q) { return place(q[0], q[1]); }));
                });
            });
            map.panTo(place(center[0], center[1]));
        }

        map.on('baselayerchange', function (e) {
            /* 天地图与 OSM 是 WGS-84，高德是 GCJ-02 —— 底图换了要重新摆放所有标记 */
            useGcj = (e.name !== t('map.tdt') && e.name !== 'OpenStreetMap');
            replaceAll();
        });

        /* 图层控件的标签也要跟随语言，Leaflet 不支持原地改名，
         * 所以语言切换时整个控件重建。 */
        var layerControl = null;

        function buildLayerControl() {
            if (layerControl) { map.removeControl(layerControl); }

            var bases = {};
            bases[t('map.tdt')]       = tdtSat;      /* 默认底图（金总选的天地图） */
            bases[t('map.satellite')] = amapSat;
            bases[t('map.street')]    = amapStreet;
            bases[t('map.osm')]       = osm;

            var overlays = {};
            Object.keys(PLOTS).forEach(function (key) {
                overlays['<span style="color:' + plotColor(key) + '">&#9679;</span> ' +
                         key + ' &mdash; ' + plotName(key)] = groups[key];
            });
            overlays[t('map.loggers')] = loggerLayer;
            /* RTK 实测主树/样方内树 与 样方框(53) 均已按金总要求移除（2026-10-13） */
            if (typeof VORONOI !== 'undefined' && VORONOI.cells) {
                overlays['<span style="color:#7fae54">&#9632;</span> ' + t('map.tsLayer') +
                         ' (' + VORONOI.cells.length + ')'] = tsLayer;
            }
            if (typeof BOUNDS !== 'undefined') {
                overlays['<span style="color:#f98422">&#9634;</span> ' + t('map.boundLayer')] = boundLayer;
                overlays[t('map.grid20Layer')] = grid20Layer;
                overlays[t('map.grid40Layer')] = grid40Layer;
                overlays[t('map.drainLayer')] = drainLayer;
            }
            if (typeof SITES !== 'undefined') {
                overlays['<span style="color:#3f8fd0">&#9634;</span> ' + t('map.bigLayer')] = bigLayer;
                overlays['<span style="color:#ffd400">&#9679;</span> ' + t('map.siteLayer')] = siteLayer;
                overlays['<span style="color:#c9c9c9">A</span> ' + t('map.nameLayer')] = nameLayer;
            }
            if (typeof STATIONS !== 'undefined') {
                Object.keys(STATIONS).forEach(function (k) {
                    var st = STATIONS[k];
                    overlays['<span style="color:' + st.color + '">&#9634;</span> ' + stationName(st) +
                             ' ' + t('map.stationPlots')] = stationLayers[k];
                });
            }
            Object.keys(devLayers || {}).forEach(function (k) {
                var st = { dendrometer: '#f0a23c', sapflow: '#3fa9f5', lai: '#b07fd8' }[k];
                var nm = { dendrometer: [ '径向生长仪', 'Dendrometer' ],
                           sapflow: [ '液流', 'Sap flow' ],
                           lai: [ 'LAI', 'LAI' ] }[k];
                var label = (Lang.current === 'zh' ? nm[0] : nm[1]) + ' (' + devMarkers[k].length + ')';
                overlays['<span style="color:' + st + '">&#9679;</span> ' + label] = devLayers[k];
            });
            if (typeof BOUNDS !== 'undefined' && typeof SURVEY !== 'undefined') {
                overlays['<span style="color:#c9c9c9">#</span> ' + t('map.cellNumLayer')] = cellNumLayer;
            }

            /* 窄屏折叠成一个图标，点开才展开。
             *
             * 展开态有 3 个底图 + 4 个图层共 7 行，宽屏上摊在右上角不碍事；
             * 手机上实测直接盖住大半张地图，地图本身反而看不见了
             * （每行还因为触摸目标要求撑到了 40px，更高）。
             * Leaflet 自带的折叠态在触屏上是点击展开，不是悬停，正合适。
             *
             * 断点 700 与 css/style.css、js/chart-metrics.js 保持一致。 */
            var narrow = (window.innerWidth || 1024) < 700;
            layerControl = L.control.layers(bases, overlays,
                { position: 'topright', collapsed: narrow }).addTo(map);
        }
        buildLayerControl();

        /* 转屏或改窗口宽度跨过断点时重建控件 —— collapsed 是创建时定型的。
         * 只在真的跨过断点时重建：手机滚动收起地址栏也会触发 resize。 */
        (function () {
            function isNarrow() { return (window.innerWidth || 1024) < 700; }
            var was = isNarrow(), timer = null;
            window.addEventListener('resize', function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    if (isNarrow() === was) { return; }
                    was = isNarrow();
                    buildLayerControl();
                }, 200);
            });
        }());

        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

        /* 初始视野：把 20 棵树全部框进来。
         * DT3 是最北的样点，它的弹窗向上展开，实测高约 285px，
         * 所以上方要留 310px；右侧留 310px 给图层控件。 */
        function fitAll() {
            /* 桌面端上方要留 310px 给默认弹窗、右侧留 310px 给图层控件；
             * 手机上不弹窗、控件也折叠了，再用 310px 会把 20 棵树挤进一个角落。 */
            var narrow = (window.innerWidth || 1024) < 700;
            var opts = narrow
                ? { paddingTopLeft: [24, 40], paddingBottomRight: [40, 40], maxZoom: 18 }
                : { paddingTopLeft: [40, 310], paddingBottomRight: [310, 50], maxZoom: 18 };
            map.fitBounds(
                L.latLngBounds(TREES.map(function (tr) { return place(tr.lat, tr.lon); })),
                opts
            );
        }
        fitAll();

        /* 语言切换：重建图层控件，并刷新所有弹窗内容 */
        if (window.Lang) {
            Lang.onChange(function () {
                buildLayerControl();
                rebuildNameLabels();
                siteShapes.forEach(function (o) {
                    o.m.setPopupContent('<b>' + esc(siteName(o.g)) + '</b>' +
                        (o.g.alt != null ? '<br>' + o.g.alt + ' m' : ''));
                });
                bigShapes.forEach(function (o) { o.poly.setTooltipContent(siteName(o.g)); });
                boundShapes.forEach(function (o) { o.poly.setTooltipContent(boundName(o.g)); });
                TREES.forEach(function (tr) {
                    markers[tr.id].setPopupContent(treePopup(tr));
                });
                loggerMarkers.forEach(function (o) {
                    o.marker.setPopupContent(loggerPopup(o.key));
                });
                surveyMainMarkers.forEach(function (o) {
                    o.marker.setPopupContent(surveyPopup(o.pt, 'main'));
                });
                surveyTreeMarkers.forEach(function (o) {
                    o.marker.setPopupContent(surveyPopup(o.pt, 'tree'));
                });
            });
        }

        /* 主题切换：标记颜色是建 marker 时写进 SVG 属性 / divIcon HTML 的，
         * 换 CSS 变量不会让已经画出来的标记跟着变，得逐个重设。 */
        function repaintTheme() {
            TREES.forEach(function (tr) {
                var has = !window.TreeInfo || window.TreeInfo.hasData(tr.id);
                var c = plotColor(tr.plot);
                markers[tr.id].setStyle({
                    color: has ? '#0d0f0b' : c,
                    fillColor: c
                });
            });
            loggerMarkers.forEach(function (o) {
                o.marker.setIcon(loggerIcon(o.key));
            });
            function recolor(arr, kind) {
                var c = surveyColor(kind);
                arr.forEach(function (o) {
                    o.marker.setStyle({ color: c, fillColor: c });
                });
            }
            recolor(surveyMainMarkers, 'main');
            recolor(surveyTreeMarkers, 'tree');
            /* 图层控件的色点写在标签 HTML 里，只能整个重建 */
            buildLayerControl();
        }

        if (window.Theme) { Theme.onChange(repaintTheme); }

        /* 默认展开一棵树的弹窗，提示用户标记是可以点的。
         *
         * 窄屏不开：弹窗有十来行字段，在手机上宽度几乎顶满，把地图盖住 ——
         * 本来是「提示可以点」，结果变成挡着不让看。手机上标记本身已经够显眼，
         * 而且触屏用户对「点一下试试」的预期比鼠标用户更强。 */
        if (markers[DEFAULT_POPUP_TREE] && (window.innerWidth || 1024) >= 700) {
            markers[DEFAULT_POPUP_TREE].openPopup();
        }

        /* 弹窗里的「查看该树数据」按钮 */
        map.on('popupopen', function (e) {
            var btn = e.popup.getElement().querySelector('.popup-btn');
            if (!btn) { return; }
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-tree');
                if (window.SiteChart) { window.SiteChart.setTree(id); }
                var el = document.getElementById('treedata');
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            });
        });

        /* 供页面其它部分调用：定位到某棵树并打开弹窗 */
        function focusTree(id) {
            var m = markers[id];
            if (!m) { return; }
            /* 缩到 z20：同一样点内树木相距 8–20 m，只有这个尺度才分得开 */
            map.setView(m.getLatLng(), Math.max(map.getZoom(), 20));
            m.openPopup();
        }

        window.SiteMap = {
            map: map,
            markers: markers,
            loggerMarkers: loggerMarkers,
            wgs84ToGcj02: wgs84ToGcj02,
            focusTree: focusTree,
            isGcj: function () { return useGcj; },
            plotColor: plotColor,
            repaintTheme: repaintTheme,
            surveyMainMarkers: surveyMainMarkers,
            surveyTreeMarkers: surveyTreeMarkers,
            surveyMainLayer: surveyMainLayer,
            surveyTreeLayer: surveyTreeLayer
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
}());

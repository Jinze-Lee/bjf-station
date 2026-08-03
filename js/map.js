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
     * 选 DT3 样点最大的一棵山杨，与图表的默认树保持一致。 */
    var DEFAULT_POPUP_TREE = 'DT3-SY2-1138';

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
            center: wgs84ToGcj02(center[0], center[1]),
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

        amapSat.addTo(map);

        /* 树木标记要盖在数采标签之上，否则会被完全遮住
         * （circleMarker 默认落在 overlayPane z400，divIcon 落在 markerPane z600） */
        map.createPane('treePane');
        map.getPane('treePane').style.zIndex = 650;

        /* --- 图层：树木按数采分三组，数采本体单独一组 --- */
        var useGcj = true;                 // 当前底图是否为 GCJ-02 坐标系
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

        /* --- 切换底图时按目标坐标系重新摆放所有标记 --- */
        function replaceAll() {
            TREES.forEach(function (t) {
                markers[t.id].setLatLng(place(t.lat, t.lon));
            });
            loggerMarkers.forEach(function (o) {
                o.marker.setLatLng(place(PLOTS[o.key].lat, PLOTS[o.key].lon));
            });
            map.panTo(place(center[0], center[1]));
        }

        map.on('baselayerchange', function (e) {
            useGcj = (e.name !== 'OpenStreetMap');
            replaceAll();
        });

        /* 图层控件的标签也要跟随语言，Leaflet 不支持原地改名，
         * 所以语言切换时整个控件重建。 */
        var layerControl = null;

        function buildLayerControl() {
            if (layerControl) { map.removeControl(layerControl); }

            var bases = {};
            bases[t('map.satellite')] = amapSat;
            bases[t('map.street')]    = amapStreet;
            bases[t('map.osm')]       = osm;

            var overlays = {};
            Object.keys(PLOTS).forEach(function (key) {
                overlays['<span style="color:' + plotColor(key) + '">&#9679;</span> ' +
                         key + ' &mdash; ' + plotName(key)] = groups[key];
            });
            overlays[t('map.loggers')] = loggerLayer;

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
            map.fitBounds(
                L.latLngBounds(TREES.map(function (tr) { return place(tr.lat, tr.lon); })),
                { paddingTopLeft: [40, 310], paddingBottomRight: [310, 50], maxZoom: 18 }
            );
        }
        fitAll();

        /* 语言切换：重建图层控件，并刷新所有弹窗内容 */
        if (window.Lang) {
            Lang.onChange(function () {
                buildLayerControl();
                TREES.forEach(function (tr) {
                    markers[tr.id].setPopupContent(treePopup(tr));
                });
                loggerMarkers.forEach(function (o) {
                    o.marker.setPopupContent(loggerPopup(o.key));
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
            repaintTheme: repaintTheme
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
}());

/* ==========================================================================
 * 三维区块默认内容：高清 LiDAR 正射影像（深度缩放）
 *
 * 背景
 * ----
 * 三维点云是实时的（Potree，整页约 121 MB，要 Range 请求边看边下）。金总的意见是
 * 「能不能固定成图片、别实时加载」——于是先用 28 GB 原始 LiDAR 渲了一张 0.10 m/px 的
 * 真彩正射影像，切成瓦片（ortho_tiles/，共约 3 MB）。这个模块就是把它铺进三维区块，
 * 作为**默认**内容：看一眼林相不必先下 121 MB。
 *
 * 实时点云没有删 —— 区块下方的「加载三维点云」按钮按需换成 Potree（见 lazy-load.js）。
 *
 * 依赖：Leaflet（由懒加载的 map 组带进来，本组声明了依赖 map）。
 * 对外句柄：window.CanopyOrtho = { map }
 * ========================================================================== */

(function () {
    'use strict';

    var el = document.getElementById('canopyOrtho');
    if (!el || !window.L || window.CanopyOrtho) { return; }

    /* 正射影像的有效范围（WGS-84；由 EPSG:32650 的实测覆盖范围换算而来） */
    var SW = [39.9565625, 115.4232255];
    var NE = [39.9620508, 115.4301148];

    var map = L.map(el, {
        zoomControl: true,
        maxZoom: 22,
        maxBounds: L.latLngBounds(SW, NE).pad(0.25),   /* 别让人拖到影像外面一片空白 */
        scrollWheelZoom: false      /* 同 2D 地图：点击后启用，避免页面滚动时误缩放 */
    });
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    map.on('mouseout', function () { map.scrollWheelZoom.disable(); });

    map.setView([39.9592671, 115.4266757], 17);      /* 先用样地中心兜底 */

    L.tileLayer('ortho_tiles/{z}/{x}/{y}.webp', {
        minNativeZoom: 14, maxNativeZoom: 20,
        attribution: '无人机 LiDAR 正射影像 0.10 m（本站自制）'
    }).addTo(map);

    /* 容器尺寸要等一帧才定下来；尺寸没定就 fitBounds 会挑到很离谱的缩放。
       先刷新尺寸，再收拢到影像范围 —— 影像基本是方的、框架是宽的，两侧会留边，
       那没关系（底下给的是主题底色，不是生硬的黑）。 */
    setTimeout(function () {
        var b = L.latLngBounds(SW, NE);
        map.invalidateSize();
        /* 按范围取缩放后往里收一档：fitBounds 按墨卡托的纵向拟合偏小，
           只用 fitBounds 的话画面里只剩中间一小块。 */
        map.setView(b.getCenter(), map.getBoundsZoom(b, false, [-40, -40]));
    }, 350);

    window.CanopyOrtho = { map: map };
}());

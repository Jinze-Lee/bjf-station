/* v112 可选增强视效。v111 基础样式保持原文件，数据及报警判断由 alarms.js 提供。 */
(function () {
    'use strict';
    var panel = document.getElementById('alarmPanel');
    var content = document.getElementById('alarmContent');
    var root = document.getElementById('labels');
    var params = new URLSearchParams(location.search);
    var saved;
    try { saved = localStorage.getItem('bfers-3d-alarm-visual'); } catch (e) {}
    var requested = params.get('alarmStyle');
    // 原 v111 预览地址继续默认显示经典版，便于直接对照。
    var legacy = params.get('v') === '20261021-alarm111';
    var enhanced = requested === 'classic' ? false : requested === 'boost' ? true : legacy ? false : saved !== 'classic';
    var last = 0, terrainCache = null, pointer = null;
    function tr(cn, en) { return typeof LANG === 'undefined' || LANG === 'zh' ? cn : en; }
    var bar = document.createElement('div');
    bar.className = 'alarm-visual-bar';
    bar.innerHTML = '<span id="alarmVisualLabel"></span><div role="group" aria-labelledby="alarmVisualLabel">' +
        '<button type="button" id="alarmClassic" aria-pressed="false"></button>' +
        '<button type="button" id="alarmBoost" aria-pressed="false"></button></div>';
    panel.insertBefore(bar, content);
    var classicBtn = document.getElementById('alarmClassic'), boostBtn = document.getElementById('alarmBoost');
    var NS = 'http://www.w3.org/2000/svg';
    var field = document.createElementNS(NS, 'svg');
    field.id = 'alarmField'; field.classList.add('alarm-field');
    field.setAttribute('aria-hidden', 'true'); field.setAttribute('focusable', 'false');
    field.innerHTML =
        '<defs><linearGradient id="alarmBeamGradient" gradientUnits="userSpaceOnUse" x1="0" y1="1" x2="0" y2="0">' +
        '<stop offset="0" stop-color="#e5ad74" stop-opacity=".05"/><stop offset=".65" stop-color="#ff9a70" stop-opacity=".75"/>' +
        '<stop offset="1" stop-color="#fff0be" stop-opacity=".95"/></linearGradient></defs>' +
        '<path class="alarm-floor-fill"/><path class="alarm-floor-outline" pathLength="1000"/>' +
        '<path class="alarm-floor-scan" pathLength="1000"/><path class="alarm-floor-inner" pathLength="1000"/>' +
        '<path class="alarm-floor-ticks"/><path class="alarm-beam-soft"/><path class="alarm-beam"/><path class="alarm-beam-flow" pathLength="100"/>' +
        '<path class="alarm-link"/><path class="alarm-link-flow" pathLength="1000"/>' +
        '<path class="alarm-target"/><circle class="alarm-link-terminal" r="3"/>';
    root.appendChild(field);
    var nodes = {};
    ['floor-fill', 'floor-outline', 'floor-scan', 'floor-inner', 'floor-ticks', 'beam-soft', 'beam', 'beam-flow',
        'link', 'link-flow', 'target', 'link-terminal'].forEach(function (name) {
        nodes[name] = field.querySelector('.alarm-' + name);
    });
    var beamGradient = field.querySelector('#alarmBeamGradient');
    var track = document.createElement('div');
    track.className = 'alarm-tracker'; track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<span class="alarm-track-cap"></span><strong></strong><span class="alarm-track-state"></span>';
    root.appendChild(track);
    function hide() { field.style.display = 'none'; track.style.display = 'none'; }
    function paintLanguage() {
        document.getElementById('alarmVisualLabel').textContent = tr('视觉模式', 'Visual style');
        classicBtn.textContent = tr('经典 V111', 'Classic V111');
        boostBtn.textContent = tr('增强 V112', 'Enhanced V112');
        classicBtn.setAttribute('aria-pressed', String(!enhanced));
        boostBtn.setAttribute('aria-pressed', String(enhanced));
    }
    function applyMode(value, persist) {
        enhanced = value;
        document.body.classList.toggle('alarms-boost', value);
        paintLanguage();
        if (!value) hide();
        if (persist) {
            try { localStorage.setItem('bfers-3d-alarm-visual', value ? 'boost' : 'classic'); } catch (e) {}
            var url = new URL(location.href);
            url.searchParams.set('alarmStyle', value ? 'boost' : 'classic');
            history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
    }
    classicBtn.addEventListener('click', function () { applyMode(false, true); });
    boostBtn.addEventListener('click', function () { applyMode(true, true); });
    panel.addEventListener('pointermove', function (e) {
        if (enhanced && e.pointerType !== 'touch') {
            var r = panel.getBoundingClientRect();
            pointer = [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100];
        }
    });
    panel.addEventListener('pointerleave', function () { pointer = [85, 5]; });
    function floorZ(E, N, fallback) {
        var z = typeof window.groundZ === 'function' ? window.groundZ(E, N) : NaN;
        return isFinite(z) ? z : fallback;
    }
    function circle(p, z, radius) {
        var pts = [];
        for (var i = 0; i < 64; i++) {
            var a = i / 64 * Math.PI * 2;
            var E = p.E + Math.cos(a) * radius, N = p.N + Math.sin(a) * radius;
            pts.push([E, N, floorZ(E, N, z) + .7]);
        }
        return pts;
    }
    function geometry(state, z) {
        if (terrainCache && terrainCache.id === state.id && terrainCache.provider === window.groundZ &&
            Math.abs(terrainCache.z - z) < .3) return terrainCache;
        var p = state.position, ticks = [];
        for (var i = 0; i < 12; i++) {
            var a = i / 12 * Math.PI * 2;
            ticks.push([13, 15.5].map(function (r) {
                var E = p.E + Math.cos(a) * r, N = p.N + Math.sin(a) * r;
                return [E, N, floorZ(E, N, z) + .7];
            }));
        }
        terrainCache = { id: state.id, z: z, provider: window.groundZ,
            outer: circle(p, z, 14), inner: circle(p, z, 10.5), ticks: ticks };
        return terrainCache;
    }
    function n(v) { return Math.round(v * 10) / 10; }
    function point(V, P, p) { return projXYZ(V, P, p[0], p[1], p[2]); }
    function loopPath(V, P, points) {
        var path = '';
        for (var i = 0; i < points.length; i++) {
            var xy = point(V, P, points[i]);
            if (!xy) return '';
            path += (i ? 'L' : 'M') + n(xy[0]) + ',' + n(xy[1]);
        }
        return path + 'Z';
    }
    function update(now) {
        if (!enhanced || !window.DeviceAlarms || typeof DeviceAlarms.visualState !== 'function') { hide(); return; }
        var state = DeviceAlarms.visualState();
        if (!state.visible || !state.point || !state.position || !window.__allLoaded) { hide(); return; }
        if (now - last < 33) return;
        last = now;
        if (pointer) {
            panel.style.setProperty('--alarm-glow-x', pointer[0].toFixed(1) + '%');
            panel.style.setProperty('--alarm-glow-y', pointer[1].toFixed(1) + '%');
            pointer = null;
        }
        var cam = viewer.scene.getActiveCamera();
        if (!cam) { hide(); return; }
        var V = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
        var p = state.position, z = floorZ(p.E, p.N, p.Z);
        var base = projXYZ(V, P, p.E, p.N, z + .8);
        var anchor = projXYZ(V, P, p.E, p.N, z + 12);
        if (!base || !anchor || anchor[0] < 20 || anchor[0] > innerWidth - 20 ||
            anchor[1] < 100 || anchor[1] > innerHeight - 15) { hide(); return; }
        var cx = anchor[0], cy = anchor[1] - 44, g = geometry(state, z);
        var outer = loopPath(V, P, g.outer), inner = loopPath(V, P, g.inner);
        if (!outer || !inner) { hide(); return; }
        field.classList.toggle('history', state.point.status === 'ok');
        field.setAttribute('viewBox', '0 0 ' + innerWidth + ' ' + innerHeight);
        nodes['floor-fill'].setAttribute('d', outer);
        nodes['floor-outline'].setAttribute('d', outer);
        nodes['floor-scan'].setAttribute('d', outer);
        nodes['floor-inner'].setAttribute('d', inner);
        var ticks = g.ticks.map(function (pair) {
            var a = point(V, P, pair[0]), b = point(V, P, pair[1]);
            return a && b ? 'M' + n(a[0]) + ',' + n(a[1]) + 'L' + n(b[0]) + ',' + n(b[1]) : '';
        }).join('');
        nodes['floor-ticks'].setAttribute('d', ticks);
        var beam = 'M' + n(base[0]) + ',' + n(base[1]) + 'L' + n(cx) + ',' + n(cy);
        nodes.beam.setAttribute('d', beam); nodes['beam-soft'].setAttribute('d', beam);
        nodes['beam-flow'].setAttribute('d', beam);
        beamGradient.setAttribute('x1', n(base[0])); beamGradient.setAttribute('y1', n(base[1]));
        beamGradient.setAttribute('x2', n(cx)); beamGradient.setAttribute('y2', n(cy));
        var target = '';
        [-1, 1].forEach(function (x) {
            [-1, 1].forEach(function (y) {
                target += 'M' + n(cx + x * 20) + ',' + n(cy + y * 30) +
                    'H' + n(cx + x * 30) + 'V' + n(cy + y * 20);
            });
        });
        nodes.target.setAttribute('d', target);
        var rect = panel.getBoundingClientRect(), showing = rect.width > 0 && rect.height > 0;
        var connect = '', endX, endY;
        if (state.selected && showing) {
            if (innerWidth <= 700) {
                endX = Math.min(rect.right - 30, Math.max(rect.left + 30, cx + 50));
                endY = rect.top;
                connect = 'M' + n(cx + 30) + ',' + n(cy + 10) + 'L' + n(endX) + ',' + n(cy + 50) +
                    'V' + n(endY);
            } else {
                endX = rect.left; endY = rect.top + 42;
                var elbow = Math.min(endX - 30, Math.max(cx + 70, endX - 110));
                connect = 'M' + n(cx + 30) + ',' + n(cy) + 'H' + n(elbow - 30) +
                    'L' + n(elbow) + ',' + n(cy - 30) + 'V' + n(endY + 25) +
                    'L' + n(elbow + 25) + ',' + n(endY) + 'H' + n(endX);
            }
        }
        nodes.link.setAttribute('d', connect); nodes['link-flow'].setAttribute('d', connect);
        nodes['link-terminal'].style.display = connect ? '' : 'none';
        if (connect) {
            nodes['link-terminal'].setAttribute('cx', n(endX));
            nodes['link-terminal'].setAttribute('cy', n(endY));
        }
        field.style.display = 'block';
        if (state.selected && showing && innerWidth > 700) {
            var x = cx + 65, y = Math.max(105, cy - 95);
            if (x + 195 > rect.left - 20) x = Math.max(12, cx - 250);
            track.style.left = n(x) + 'px'; track.style.top = n(y) + 'px';
            track.querySelector('.alarm-track-cap').textContent = state.point.status === 'ok' ?
                tr('历史定位', 'HISTORY LOCATION') : tr('异常设备定位', 'ALERT LOCATION');
            track.querySelector('strong').textContent = state.id;
            var channelNames = [];
            Object.keys(state.point.channels).forEach(function (key) {
                if (state.point.channels[key].status !== 'ok') channelNames.push(key === 'sapflow' ? tr('液流', 'Sap flow') : tr('径向生长', 'Dendrometer'));
            });
            track.querySelector('.alarm-track-state').textContent = channelNames.length ?
                channelNames.join(' / ') : tr('历史记录已恢复或订正', 'Records resumed or corrected');
            track.style.display = 'block';
        } else track.style.display = 'none';
    }
    hide(); applyMode(enhanced, false);
    window.AlarmVisuals = { update: update, refreshLanguage: paintLanguage };
}());

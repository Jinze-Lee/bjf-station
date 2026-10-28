(function () {
    'use strict';
    var section = document.getElementById('deviceOverview');
    var frame = document.getElementById('deviceOverviewFrame');
    var button = document.getElementById('deviceOverviewToggle');
    if (!section || !frame || !button) { return; }
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var paused = reduced.matches;
    var visible = false;
    var targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
    function send() {
        if (frame.contentWindow && frame.getAttribute('src')) {
            frame.contentWindow.postMessage({type: 'bfers:overview-state', paused: paused, visible: visible && !document.hidden}, targetOrigin);
        }
        button.setAttribute('aria-pressed', String(paused));
        button.textContent = window.Lang ? Lang.t(paused ? 'overview.play' : 'overview.pause') : (paused ? '播放动画' : '暂停动画');
    }
    function load() {
        if (!frame.getAttribute('src')) { frame.src = frame.dataset.src + '&v=20261028-device114'; }
    }
    if ('IntersectionObserver' in window) {
        var preload = new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) { return entry.isIntersecting; })) { load(); preload.disconnect(); }
        }, {rootMargin: '500px'});
        preload.observe(section);
        new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; send(); }).observe(section);
    } else { visible = true; load(); }
    frame.addEventListener('load', send);
    window.addEventListener('message', function (event) {
        if (event.source !== frame.contentWindow || (location.protocol !== 'file:' && event.origin !== location.origin)) { return; }
        if (event.data && event.data.type === 'bfers:overview-height' && Number.isFinite(event.data.height)) {
            frame.style.height = Math.max(300, Math.min(1200, event.data.height)) + 'px';
            send();
        }
    });
    button.addEventListener('click', function () { paused = !paused; send(); });
    document.addEventListener('visibilitychange', send);
    reduced.addEventListener('change', function (event) { paused = event.matches; send(); });
    if (window.Lang) { Lang.onChange(send); }
    var detail = document.getElementById('networkDetail');
    if (detail) {
        function updateDetail() {
            if (window.SiteNetwork) { detail.open && !reduced.matches ? SiteNetwork.play() : SiteNetwork.pause(); }
        }
        detail.addEventListener('toggle', updateDetail);
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', updateDetail); }
        else { updateDetail(); }
    }
    send();
}());

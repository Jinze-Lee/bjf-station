(function () {
    'use strict';
    if (window.parent === window) { return; }
    var targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
    function height() {
        var page = document.querySelector('.page');
        window.parent.postMessage({type: 'bfers:overview-height', height: Math.ceil(page.getBoundingClientRect().height + 2)}, targetOrigin);
    }
    window.addEventListener('message', function (event) {
        if (event.source !== window.parent || (location.protocol !== 'file:' && event.origin !== location.origin)) { return; }
        if (event.data && event.data.type === 'bfers:overview-state' && window.OverviewControl) {
            OverviewControl.setState(event.data);
        }
    });
    if ('ResizeObserver' in window) { new ResizeObserver(height).observe(document.querySelector('.page')); }
    window.addEventListener('load', height);
    height();
}());

// רקע האתר: אולם אירועים אלגנטי ומעומעם (SVG), ומעליו שורות קטנות "שמחה בשיחה ♥ מזל טוב ♥" שרצות לסירוגין.
// קישוט בלבד (aria-hidden). בלי JavaScript נשאר רקע שמנת רגיל מ-site.css.
(function () {
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  function hall() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
    s += '<defs>' +
      '<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3cf9c"/><stop offset=".6" stop-color="#f3e8cb"/><stop offset="1" stop-color="#faf3e2"/></linearGradient>' +
      '<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eadcb8"/><stop offset="1" stop-color="#f7efdc"/></linearGradient>' +
      '<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f6e7c4"/></linearGradient>' +
      '<radialGradient id="glow"><stop offset="0" stop-color="#fff3d1" stop-opacity=".95"/><stop offset="1" stop-color="#f3d99a" stop-opacity="0"/></radialGradient>' +
      '<filter id="b14" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>' +
      '<filter id="b7" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>' +
      '</defs>';
    s += '<rect width="1600" height="900" fill="url(#wall)"/>';
    // קירות עם חלונות מקושתים וקורות
    s += '<g filter="url(#b14)">';
    for (var i = 0; i < 6; i++) {
      var x = 70 + i * 270;
      s += '<rect x="' + (x - 30) + '" y="120" width="40" height="560" fill="#d8c08a" opacity=".8"/>';
      s += '<path d="M' + (x + 20) + ' 640 V300 Q' + (x + 20) + ' 190 ' + (x + 110) + ' 190 Q' + (x + 200) + ' 190 ' + (x + 200) + ' 300 V640 Z" fill="url(#glass)" stroke="#c4a259" stroke-width="12"/>';
    }
    s += '<rect x="0" y="650" width="1600" height="40" fill="#e3cf9f" opacity=".8"/>';
    s += '</g>';
    // רצפה מבריקה
    s += '<rect y="690" width="1600" height="210" fill="url(#floor)"/>';
    s += '<g filter="url(#b14)" opacity=".55">';
    for (var r = 0; r < 6; r++) s += '<rect x="' + (110 + r * 270) + '" y="700" width="150" height="190" fill="#fff6dc"/>';
    s += '</g>';
    // שולחנות עגולים עם מפות לבנות ומרכזי שולחן
    s += '<g filter="url(#b7)">';
    [[260, 760, 1], [640, 800, 1.25], [1010, 770, 1.05], [1370, 805, 1.3], [90, 810, 1.15]].forEach(function (t) {
      var k = t[2];
      s += '<ellipse cx="' + t[0] + '" cy="' + (t[1] + 40 * k) + '" rx="' + 118 * k + '" ry="' + 22 * k + '" fill="#e9dbb6" opacity=".7"/>';
      s += '<path d="M' + (t[0] - 100 * k) + ' ' + (t[1] + 20 * k) + ' Q' + t[0] + ' ' + (t[1] + 70 * k) + ' ' + (t[0] + 100 * k) + ' ' + (t[1] + 20 * k) + ' L' + (t[0] + 112 * k) + ' ' + (t[1] + 52 * k) + ' L' + (t[0] - 112 * k) + ' ' + (t[1] + 52 * k) + 'Z" fill="#fffdf6"/>';
      s += '<ellipse cx="' + t[0] + '" cy="' + (t[1] + 18 * k) + '" rx="' + 104 * k + '" ry="' + 20 * k + '" fill="#fffefa"/>';
      s += '<circle cx="' + t[0] + '" cy="' + (t[1] - 8 * k) + '" r="' + 16 * k + '" fill="#d9b868"/>';
      s += '<circle cx="' + (t[0] - 30 * k) + '" cy="' + (t[1] + 6 * k) + '" r="' + 9 * k + '" fill="#f2dfae"/>';
    });
    s += '</g>';
    // נברשות
    s += '<g filter="url(#b7)">';
    [[400, 150, 1], [800, 120, 1.4], [1200, 150, 1]].forEach(function (c) {
      var k = c[2];
      s += '<line x1="' + c[0] + '" y1="0" x2="' + c[0] + '" y2="' + c[1] + '" stroke="#d2b476" stroke-width="5"/>';
      s += '<circle cx="' + c[0] + '" cy="' + (c[1] + 70 * k) + '" r="' + 150 * k + '" fill="url(#glow)"/>';
      for (var tier = 0; tier < 3; tier++) {
        var w = (60 + tier * 55) * k, y = c[1] + tier * 38 * k;
        s += '<ellipse cx="' + c[0] + '" cy="' + y + '" rx="' + w + '" ry="' + 11 * k + '" fill="#e0c07a"/>';
        for (var j = 0; j < 7; j++) s += '<circle cx="' + (c[0] - w + (2 * w / 6) * j) + '" cy="' + (y + 20 * k) + '" r="' + 8 * k + '" fill="#fff6d8"/>';
      }
    });
    s += '</g>';
    // נקודות אור (בוקה)
    s += '<g filter="url(#b7)">';
    for (var n = 0; n < 34; n++) {
      s += '<circle cx="' + Math.round(rnd() * 1600) + '" cy="' + Math.round(rnd() * 620) + '" r="' + Math.round(8 + rnd() * 26) + '" fill="#fff4cf" opacity="' + (0.18 + rnd() * 0.3).toFixed(2) + '"/>';
    }
    s += '</g></svg>';
    return s;
  }

  function rows(count) {
    var unit = '<span>שמחה בשיחה</span><i>♥&#xFE0E;</i><span>מזל טוב</span><i>♥&#xFE0E;</i>';
    var html = '';
    for (var r = 0; r < count; r++) {
      var one = '', k;
      for (k = 0; k < 12; k++) one += unit;
      // התוכן משוכפל פעמיים: התנועה ב-50% חוזרת בדיוק לאותו מצב
      html += '<div class="row' + (r % 2 ? ' rev' : '') + '" style="animation-delay:-' + Math.round(rnd() * 120) + 's;margin-inline-start:-' + Math.round(rnd() * 300) + 'px">' + one + one + '</div>';
    }
    return html;
  }

  function build() {
    var bg = document.createElement('div');
    bg.className = 'bg';
    bg.setAttribute('aria-hidden', 'true');
    var n = Math.max(10, Math.min(24, Math.round(window.innerHeight / 62)));
    bg.innerHTML = hall() + '<div class="rows">' + rows(n) + '</div><div class="veil"></div>';
    document.body.insertBefore(bg, document.body.firstChild);
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();

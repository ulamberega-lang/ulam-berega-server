// תנועה בגלילה: חשיפה של לוחות וכרטיסים, ופרלקסה עדינה לכותרת (לוגו ושם).
// רק transform ו-opacity. הכוונון כולו במשתני CSS ב-site.css (--reveal-*, --parallax).
// בלי JavaScript, או עם "הפחתת תנועה" במכשיר - הכול גלוי ונייח.
(function () {
  if (!window.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var root = document.documentElement;
  var timeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  // פרלקסה: הכותרת זזה לאט יותר מהדף. בדפדפן שתומך - CSS (view-timeline) בלי JavaScript.
  var hero = document.querySelector('.brand');
  if (!timeline && hero) {
    var ticking = false;
    var paint = function () {
      ticking = false;
      var k = parseFloat(getComputedStyle(root).getPropertyValue('--parallax')) || 0;
      var y = Math.min(scrollY, hero.offsetTop + hero.offsetHeight);
      hero.style.transform = y > 0 ? 'translate3d(0,' + (y * k).toFixed(1) + 'px,0)' : '';
    };
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }

  // חשיפה: מה שכבר על המסך בטעינה נשאר כמו שהוא (בלי הבהוב). השאר מוסתר ונחשף פעם אחת כשמגיעים אליו.
  if (!('IntersectionObserver' in window)) return;
  var items = [].slice.call(document.querySelectorAll('.panel, .way, footer.site')).filter(function (el) {
    return el.getBoundingClientRect().top > innerHeight;
  });
  if (!items.length) return;
  var io = new IntersectionObserver(function (entries) {
    var shown = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
    // השהיה מדורגת לפי סדר הופעה בדף, בין כל מה שנכנס יחד (למשל לוח והכרטיסים שבו)
    shown.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
    shown.forEach(function (el, i) {
      io.unobserve(el);
      el.style.setProperty('--reveal-i', Math.min(i, 3));
      el.classList.add('in');
      // בסוף מחזירים את האלמנט לעיצוב הרגיל שלו (כדי שמעברי ה-hover של הכפתורים ימשיכו לעבוד)
      el.addEventListener('animationend', function done(e) {
        if (e.target !== el) return;
        el.removeEventListener('animationend', done);
        el.classList.remove('reveal', 'in');
        el.style.removeProperty('--reveal-i');
      });
    });
  }, { rootMargin: '0px 0px -24px 0px' });
  items.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
})();

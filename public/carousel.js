(function () {
  var root = document.querySelector("[data-carousel]");
  if (!root) return;
  var slideLabelPrefix = (root.getAttribute("data-carousel-slide-prefix") || "Slide ").trim();
  var track = root.querySelector(".carousel-track");
  var slides = track ? [].slice.call(track.children) : [];
  var prev = root.querySelector(".carousel-prev");
  var next = root.querySelector(".carousel-next");
  var segmentsWrap = root.querySelector(".carousel-segments");
  var captionEl = root.querySelector("#carousel-caption");
  var counterEl = root.querySelector("#carousel-counter");
  var progressFill = root.querySelector("#carousel-progress-fill");
  var viewport = root.querySelector("[data-carousel-viewport]");
  if (!slides.length || !prev || !next || !segmentsWrap) return;

  var i = 0;
  var total = slides.length;

  function measureStepPx() {
    if (!viewport) return 0;
    var w = viewport.clientWidth;
    if (w > 1) return w;
    var r = viewport.getBoundingClientRect();
    return r.width > 1 ? r.width : 0;
  }

  /** Pin each slide to viewport width so flex % layout cannot collapse to zero width. */
  function layoutSlides() {
    var w = measureStepPx();
    if (w < 2) return;
    slides.forEach(function (sl) {
      sl.style.flexBasis = w + "px";
      sl.style.flexShrink = "0";
      sl.style.flexGrow = "0";
      sl.style.width = w + "px";
      sl.style.minWidth = w + "px";
      sl.style.maxWidth = w + "px";
    });
    track.style.width = total * w + "px";
  }

  function setCaption() {
    var s = slides[i];
    if (!captionEl || !s) return;
    var title = s.getAttribute("data-caption") || "";
    var hint = s.getAttribute("data-caption-hint") || "";
    captionEl.innerHTML = hint
      ? title + "<span>" + hint + "</span>"
      : title;
  }

  function setActiveSlide() {
    slides.forEach(function (sl, j) {
      sl.classList.toggle("is-active", j === i);
    });
  }

  function updateSegments() {
    [].forEach.call(segmentsWrap.querySelectorAll("button"), function (b, j) {
      b.setAttribute("aria-current", j === i ? "true" : "false");
      b.setAttribute("tabindex", j === i ? "0" : "-1");
    });
  }

  function updateCounter() {
    if (!counterEl) return;
    var cur = String(i + 1).padStart(2, "0");
    var tot = String(total).padStart(2, "0");
    counterEl.innerHTML = "<em>" + cur + "</em> / " + tot;
  }

  function updateProgress() {
    if (!progressFill) return;
    progressFill.style.width = ((i + 1) / total) * 100 + "%";
  }

  function applyTransform() {
    var step = measureStepPx();
    if (step > 0) {
      track.style.transform = "translateX(-" + i * step + "px)";
    }
  }

  function go(n) {
    i = (n + total) % total;
    applyTransform();
    setCaption();
    setActiveSlide();
    updateSegments();
    updateCounter();
    updateProgress();
  }

  slides.forEach(function (_, j) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "carousel-seg";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", slideLabelPrefix + (j + 1));
    b.addEventListener("click", function () {
      go(j);
    });
    segmentsWrap.appendChild(b);
  });

  prev.addEventListener("click", function () {
    go(i - 1);
  });
  next.addEventListener("click", function () {
    go(i + 1);
  });

  root.tabIndex = 0;
  root.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(i - 1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(i + 1);
    }
  });

  if (viewport) {
    var touchX = null;
    viewport.addEventListener(
      "touchstart",
      function (e) {
        touchX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchend",
      function (e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].screenX - touchX;
        touchX = null;
        if (dx < -56) go(i + 1);
        else if (dx > 56) go(i - 1);
      },
      { passive: true }
    );
  }

  function onResize() {
    layoutSlides();
    applyTransform();
  }
  window.addEventListener("resize", onResize);
  if (viewport && typeof ResizeObserver !== "undefined") {
    var ro = new ResizeObserver(onResize);
    ro.observe(viewport);
  }

  function boot() {
    layoutSlides();
    go(0);
  }

  function scheduleBoot() {
    requestAnimationFrame(function () {
      boot();
      requestAnimationFrame(function () {
        layoutSlides();
        applyTransform();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBoot);
  } else {
    scheduleBoot();
  }

  window.addEventListener("load", function () {
    layoutSlides();
    applyTransform();
  });
})();

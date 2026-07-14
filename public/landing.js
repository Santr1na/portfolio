(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ── Scroll reveal ── */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length && !reducedMotion) {
    var revealObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) {
      revealObs.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ── Navbar scroll + mobile menu ── */
  var nav = document.querySelector("[data-landing-nav]");
  var toggle = document.querySelector("[data-nav-toggle]");
  var drawer = document.querySelector("[data-nav-drawer]");
  var toggleLabel = toggle && toggle.querySelector("[data-nav-toggle-label]");

  if (nav) {
    var scrollTicking = false;
    function onScroll() {
      if (!scrollTicking) {
        requestAnimationFrame(function () {
          nav.classList.toggle("is-scrolled", window.scrollY > 24);
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (toggle && drawer) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      drawer.classList.toggle("is-open", !open);
      if (toggleLabel) {
        toggleLabel.textContent = open
          ? toggle.getAttribute("data-open-label") || toggleLabel.textContent
          : toggle.getAttribute("data-close-label") || "Close";
      }
    });

    drawer.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        toggle.setAttribute("aria-expanded", "false");
        drawer.classList.remove("is-open");
      });
    });
  }

  /* ── Active nav links on scroll ── */
  var navLinks = document.querySelectorAll("[data-nav-link]");
  var sections = [];
  navLinks.forEach(function (link) {
    var href = link.getAttribute("href");
    if (href && href.charAt(0) === "#") {
      var sec = document.querySelector(href);
      if (sec) sections.push({ el: sec, link: link });
    }
  });

  if (sections.length && !reducedMotion) {
    var navObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            navLinks.forEach(function (l) {
              l.classList.remove("is-active");
            });
            var match = sections.find(function (s) {
              return s.el === entry.target;
            });
            if (match) match.link.classList.add("is-active");
          }
        });
      },
      { threshold: 0.35, rootMargin: "-80px 0px -50% 0px" }
    );
    sections.forEach(function (s) {
      navObs.observe(s.el);
    });
  }

  /* ── Parallax ── */
  var parallaxEls = document.querySelectorAll("[data-parallax]");
  if (parallaxEls.length && !reducedMotion) {
    var parallaxTicking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (!parallaxTicking) {
          requestAnimationFrame(function () {
            var scrollY = window.scrollY;
            parallaxEls.forEach(function (el) {
              var factor = parseFloat(el.getAttribute("data-parallax")) || 0.05;
              el.style.transform = "translateY(" + scrollY * factor + "px)";
            });
            parallaxTicking = false;
          });
          parallaxTicking = true;
        }
      },
      { passive: true }
    );
  }

  /* ── Button ripple position ── */
  document.querySelectorAll(".lp-btn").forEach(function (btn) {
    btn.addEventListener("mousemove", function (e) {
      var rect = btn.getBoundingClientRect();
      btn.style.setProperty("--x", ((e.clientX - rect.left) / rect.width) * 100 + "%");
      btn.style.setProperty("--y", ((e.clientY - rect.top) / rect.height) * 100 + "%");
    });
  });

  /* ── Custom cursor ── */
  var cursor = document.querySelector("[data-lp-cursor]");
  if (cursor && finePointer && !reducedMotion) {
    document.body.classList.add("has-custom-cursor");
    var ringX = 0;
    var ringY = 0;
    var dotX = 0;
    var dotY = 0;
    var mouseX = 0;
    var mouseY = 0;
    var visible = false;

    document.addEventListener(
      "mousemove",
      function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (!visible) {
          cursor.classList.add("is-visible");
          visible = true;
        }
      },
      { passive: true }
    );

    document.addEventListener("mouseleave", function () {
      cursor.classList.remove("is-visible");
      visible = false;
    });

    var hoverables = "a, button, .lp-card, .lp-feature-card, .lp-testimonial, summary";
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest(hoverables)) {
        cursor.classList.add("is-hover");
      }
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest(hoverables)) {
        cursor.classList.remove("is-hover");
      }
    });

    function animateCursor() {
      dotX += (mouseX - dotX) * 0.35;
      dotY += (mouseY - dotY) * 0.35;
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      cursor.style.transform = "translate(" + ringX + "px, " + ringY + "px)";
      var dot = cursor.querySelector(".lp-cursor__dot");
      if (dot) {
        dot.style.transform = "translate(" + (dotX - ringX) + "px, " + (dotY - ringY) + "px)";
      }
      requestAnimationFrame(animateCursor);
    }
    animateCursor();
  }

  /* ── FAQ: close others when one opens ── */
  var faq = document.querySelector("[data-faq]");
  if (faq) {
    faq.querySelectorAll(".lp-faq__item").forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (item.open) {
          faq.querySelectorAll(".lp-faq__item").forEach(function (other) {
            if (other !== item) other.open = false;
          });
        }
      });
    });
  }

  /* ── Ambient background subtle animation ── */
  var ambient = document.querySelector(".ambient-glow");
  if (ambient && !reducedMotion) {
    var t = 0;
    function ambientLoop() {
      t += 0.003;
      ambient.style.transform =
        "translateX(calc(-50% + " + Math.sin(t) * 20 + "px)) translateY(" + Math.cos(t * 0.7) * 15 + "px)";
      requestAnimationFrame(ambientLoop);
    }
    ambientLoop();
  }
})();

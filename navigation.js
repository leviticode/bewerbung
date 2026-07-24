(() => {
  "use strict";

  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelectorAll(
    "#mainNavigation .nav-link"
  );

  if (!navToggle) {
    return;
  }

  function setMobileNavigation(open) {
    document.body.classList.toggle("mobile-nav-open", open);

    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute(
      "aria-label",
      open
        ? "Navigation schließen"
        : "Navigation öffnen"
    );
  }

  navToggle.addEventListener("click", () => {
    const isOpen =
      document.body.classList.contains("mobile-nav-open");

    setMobileNavigation(!isOpen);
  });

  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      setMobileNavigation(false);
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setMobileNavigation(false);
    }
  });

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 760) {
        setMobileNavigation(false);
      }
    },
    { passive: true }
  );
})();
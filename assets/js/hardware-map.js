document.querySelectorAll("[data-hardware-map]").forEach((selector) => {
  if (selector.dataset.hardwareMapInitialized === "true") return;
  selector.dataset.hardwareMapInitialized = "true";

  const tabs = selector.querySelectorAll(".hardware-map__tab");
  const preview = selector.querySelector(".hardware-map__preview");
  const image = preview.querySelector("img");
  const caption = selector.querySelector(".hardware-map__caption");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => {
        const active = item === tab;

        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });

      image.src = tab.dataset.image;
      image.alt = tab.dataset.alt;
      caption.textContent = tab.dataset.caption;

      if (preview.matches("a") && tab.dataset.href) {
        preview.href = tab.dataset.href;
      }
    });
  });
});

(function () {
  "use strict";

  var ORIGINAL_HTML_ATTRIBUTE = "data-tts-original-html";
  var PRESERVED_CLASS = "tts-layout-preserved-active";

  function preserveLayout(element) {
    if (!(element instanceof Element)) {
      return;
    }

    var original = element.getAttribute(ORIGINAL_HTML_ATTRIBUTE);
    if (original === null) {
      element.classList.remove(PRESERVED_CLASS);
      return;
    }

    // The shared reader's word-highlighting path rebuilds a narratable node.
    // Rebuilding is safe for plain text, but it removes meaningful nested
    // markup such as source-number spans, explicit line spans, and <br> tags.
    // Keep that original markup and use a metric-neutral block highlight.
    if (!original.includes("<")) {
      return;
    }

    if (element.innerHTML !== original) {
      element.innerHTML = original;
    }
    element.classList.add(PRESERVED_CLASS);
  }

  function inspectMutation(record) {
    var target = record.target;
    if (!(target instanceof Element)) {
      target = target.parentElement;
    }
    if (!target) {
      return;
    }

    if (target.hasAttribute(ORIGINAL_HTML_ATTRIBUTE) || target.classList.contains(PRESERVED_CLASS)) {
      preserveLayout(target);
    }

    var activeParent = target.closest("[" + ORIGINAL_HTML_ATTRIBUTE + "]");
    if (activeParent && activeParent !== target) {
      preserveLayout(activeParent);
    }
  }

  function start() {
    var content = document.getElementById("content");
    if (!content) {
      return;
    }

    var observer = new MutationObserver(function (records) {
      records.forEach(inspectMutation);
      content.querySelectorAll("." + PRESERVED_CLASS + ":not([" + ORIGINAL_HTML_ATTRIBUTE + "])")
        .forEach(function (element) {
          element.classList.remove(PRESERVED_CLASS);
        });
    });

    observer.observe(content, {
      attributes: true,
      attributeFilter: [ORIGINAL_HTML_ATTRIBUTE],
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}());

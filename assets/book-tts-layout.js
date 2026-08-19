(function () {
  "use strict";

  var ORIGINAL_HTML_ATTRIBUTE = "data-tts-original-html";
  var ACTIVE_WORD_CLASS = "bg-yellow-300";
  var RUNTIME_MAP_CLASS = "tts-runtime-word-map";
  var FALLBACK_CLASS = "tts-layout-preserved-active";
  var HIGHLIGHT_NAME = "adt-narration-word";
  var activeElements = new Set();
  var states = new WeakMap();
  var overlayNodes = [];

  function normaliseWord(value) {
    return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function visibleWords(element, runtimeMap) {
    var words = [];
    var walker = document.createTreeWalker(element, 4, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || runtimeMap.contains(node)) {
          return 2;
        }
        if (parent.closest("script, style, .sr-only, [aria-hidden='true']")) {
          return 2;
        }
        return 1;
      }
    });
    var expression = /[\p{L}\p{N}]+(?:[\u2019'\u2010-\u2015-][\p{L}\p{N}]+)*/gu;
    var node;
    while ((node = walker.nextNode())) {
      expression.lastIndex = 0;
      var match;
      while ((match = expression.exec(node.nodeValue))) {
        words.push({
          node: node,
          start: match.index,
          end: match.index + match[0].length,
          normalised: normaliseWord(match[0])
        });
      }
    }
    return words;
  }

  function runtimeWords(runtimeMap) {
    return Array.from(runtimeMap.querySelectorAll("[data-word-index]")).map(function (node) {
      return {
        index: Number(node.getAttribute("data-word-index")),
        normalised: normaliseWord(node.textContent || "")
      };
    });
  }

  // Align the spoken transcript with the printed words. Exact words act as
  // anchors; substitutions cover pronunciation expansions such as Dr/Doctor.
  function alignWords(spoken, printed) {
    var rows = spoken.length + 1;
    var columns = printed.length + 1;
    var costs = Array.from({ length: rows }, function () { return new Float64Array(columns); });
    var moves = Array.from({ length: rows }, function () { return new Uint8Array(columns); });
    var row;
    var column;
    for (row = 1; row < rows; row += 1) {
      costs[row][0] = row;
      moves[row][0] = 1;
    }
    for (column = 1; column < columns; column += 1) {
      costs[0][column] = column;
      moves[0][column] = 2;
    }
    for (row = 1; row < rows; row += 1) {
      for (column = 1; column < columns; column += 1) {
        var same = spoken[row - 1].normalised === printed[column - 1].normalised;
        var diagonal = costs[row - 1][column - 1] + (same ? 0 : 0.85);
        var removeSpoken = costs[row - 1][column] + 1;
        var removePrinted = costs[row][column - 1] + 1;
        if (diagonal <= removeSpoken && diagonal <= removePrinted) {
          costs[row][column] = diagonal;
          moves[row][column] = 3;
        } else if (removeSpoken <= removePrinted) {
          costs[row][column] = removeSpoken;
          moves[row][column] = 1;
        } else {
          costs[row][column] = removePrinted;
          moves[row][column] = 2;
        }
      }
    }

    var aligned = new Map();
    row = spoken.length;
    column = printed.length;
    while (row > 0 || column > 0) {
      var move = moves[row][column];
      if (move === 3) {
        aligned.set(spoken[row - 1].index, column - 1);
        row -= 1;
        column -= 1;
      } else if (move === 1) {
        var nearest = Math.max(0, Math.min(printed.length - 1, column - 1));
        aligned.set(spoken[row - 1].index, nearest);
        row -= 1;
      } else {
        column -= 1;
      }
    }
    return aligned;
  }

  function createState(element) {
    var original = element.getAttribute(ORIGINAL_HTML_ATTRIBUTE);
    if (original === null) {
      return null;
    }

    var runtimeMarkup = element.innerHTML;
    var template = document.createElement("template");
    template.innerHTML = original;
    var runtimeMap = document.createElement("span");
    runtimeMap.className = RUNTIME_MAP_CLASS;
    runtimeMap.setAttribute("aria-hidden", "true");
    runtimeMap.innerHTML = runtimeMarkup;

    element.replaceChildren(template.content, runtimeMap);
    var targetSelector = element.getAttribute("data-tts-highlight-target");
    var printedElement = targetSelector ? document.querySelector(targetSelector) : element;
    if (!printedElement) {
      printedElement = element;
    }
    var printed = visibleWords(printedElement, runtimeMap);
    var spoken = runtimeWords(runtimeMap);
    var state = {
      runtimeMap: runtimeMap,
      printed: printed,
      aligned: alignWords(spoken, printed)
    };
    states.set(element, state);
    activeElements.add(element);
    return state;
  }

  function rangeForWord(state, wordIndex) {
    var printedIndex = state.aligned.get(wordIndex);
    if (printedIndex === undefined || !state.printed[printedIndex]) {
      return null;
    }
    var word = state.printed[printedIndex];
    var range = document.createRange();
    range.setStart(word.node, word.start);
    range.setEnd(word.node, word.end);
    return range;
  }

  function rangeForBlock(state) {
    if (!state.printed.length) {
      return null;
    }
    var first = state.printed[0];
    var last = state.printed[state.printed.length - 1];
    var range = document.createRange();
    range.setStart(first.node, first.start);
    range.setEnd(last.node, last.end);
    return range;
  }

  function clearHighlight() {
    if (window.CSS && CSS.highlights) {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    }
    overlayNodes.forEach(function (node) {
      node.remove();
    });
    overlayNodes = [];
    activeElements.forEach(function (element) {
      if (element.classList.contains(FALLBACK_CLASS)) {
        element.classList.remove(FALLBACK_CLASS);
      }
    });
  }

  function showHighlight(element, range) {
    clearHighlight();
    if (!range) {
      return;
    }
    if (window.CSS && CSS.highlights && window.Highlight) {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
    } else {
      Array.from(range.getClientRects()).forEach(function (rect) {
        if (!rect.width || !rect.height) {
          return;
        }
        var overlay = document.createElement("span");
        overlay.className = "tts-word-highlight-overlay";
        overlay.style.left = (rect.left + window.scrollX) + "px";
        overlay.style.top = (rect.top + window.scrollY) + "px";
        overlay.style.width = rect.width + "px";
        overlay.style.height = rect.height + "px";
        document.body.appendChild(overlay);
        overlayNodes.push(overlay);
      });
    }
  }

  function prepareActiveElements(content) {
    content.querySelectorAll("[" + ORIGINAL_HTML_ATTRIBUTE + "]").forEach(function (element) {
      var state = states.get(element);
      if (!state || !element.contains(state.runtimeMap)) {
        createState(element);
      }
    });
  }

  function discardInactiveElements() {
    activeElements.forEach(function (element) {
      if (!element.hasAttribute(ORIGINAL_HTML_ATTRIBUTE)) {
        if (element.classList.contains(FALLBACK_CLASS)) {
          element.classList.remove(FALLBACK_CLASS);
        }
        activeElements.delete(element);
        states.delete(element);
      }
    });
  }

  function syncHighlight() {
    var activeElement = null;
    var activeRange = null;
    activeElements.forEach(function (element) {
      if (activeRange || !element.hasAttribute(ORIGINAL_HTML_ATTRIBUTE)) {
        return;
      }
      var state = states.get(element);
      if (!state) {
        return;
      }
      var activeWord = state.runtimeMap.querySelector("[data-word-index]." + ACTIVE_WORD_CLASS);
      if (activeWord) {
        activeElement = element;
        activeRange = rangeForWord(state, Number(activeWord.getAttribute("data-word-index")));
      } else if (element.classList.contains("tts-active-block")) {
        activeElement = element;
        activeRange = rangeForBlock(state);
      }
    });
    showHighlight(activeElement, activeRange);
  }

  function start() {
    var content = document.getElementById("content");
    if (!content) {
      return;
    }

    var queued = false;
    function update() {
      queued = false;
      prepareActiveElements(content);
      discardInactiveElements();
      syncHighlight();
    }
    function queueUpdate() {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    }

    var observer = new MutationObserver(queueUpdate);
    observer.observe(content, {
      attributes: true,
      attributeFilter: [ORIGINAL_HTML_ATTRIBUTE, "class"],
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

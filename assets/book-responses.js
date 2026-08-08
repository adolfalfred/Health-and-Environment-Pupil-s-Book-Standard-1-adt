(() => {
  "use strict";

  const PREFIX = "adt-health-environment-standard-1:";
  const STRUCTURAL_LINES = {
    pg002_sec001_n0002: ["First edition 2018", "Second Edition 2023"],
    pg002_sec001_n0004: [
      "Tanzania Institute of Education",
      "Mikocheni Area",
      "132 Ali Hassan Mwinyi Road",
      "P.O. Box 35094",
      "14112 Dar es Salaam",
    ],
  };

  const appendNumberAwareText = (parent, value) => {
    value.split(/(\d+)/).forEach((part) => {
      if (!part) return;
      if (/^\d+$/.test(part)) {
        const number = document.createElement("span");
        number.className = "source-number";
        number.textContent = part;
        parent.append(number);
      } else {
        parent.append(document.createTextNode(part));
      }
    });
  };

  const formatSourceNode = (node) => {
    const structural = STRUCTURAL_LINES[node.dataset.id];
    if (structural) {
      if (node.querySelectorAll(":scope > .source-line").length === structural.length) return;
      if (node.children.length) return;
      const fragment = document.createDocumentFragment();
      structural.forEach((line, index) => {
        if (index) fragment.append(document.createTextNode("\n"));
        const lineElement = document.createElement("span");
        lineElement.className = "source-line";
        appendNumberAwareText(lineElement, line);
        fragment.append(lineElement);
      });
      node.replaceChildren(fragment);
      return;
    }
    if (!/\d/.test(node.textContent) || node.children.length) return;
    const value = node.textContent;
    const fragment = document.createDocumentFragment();
    appendNumberAwareText(fragment, value);
    node.replaceChildren(fragment);
  };

  const initialiseSourceFormatting = () => {
    const content = document.getElementById("content");
    if (!content) return;
    const formatAll = () => content.querySelectorAll(
      ".source-h2[data-id], .source-h3[data-id], .source-text[data-id]"
    ).forEach(formatSourceNode);
    requestAnimationFrame(formatAll);
    const observer = new MutationObserver(() => requestAnimationFrame(formatAll));
    observer.observe(content, { childList: true, subtree: true });
  };

  const safeGet = (key) => {
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch (_) {
      return null;
    }
  };

  const safeSet = (key, value) => {
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch (_) {
      // The activity remains usable when private browsing blocks storage.
    }
  };

  const announce = (responseId, message) => {
    const status = document.getElementById(`${responseId}_status`);
    if (status) status.textContent = message;
  };

  const updateSharedState = (responseId, value) => {
    const shared = document.querySelector(`[data-canvas-response="${responseId}"]`);
    if (!shared) return;
    shared.value = value;
    safeSet(shared.dataset.practiceStorage, value);
    shared.dispatchEvent(new Event("input", { bubbles: true }));
    shared.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const initialiseDrawing = (canvas) => {
    const responseId = canvas.dataset.drawingResponse;
    const context = canvas.getContext("2d", { willReadFrequently: false });
    context.lineWidth = 7;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#173d33";
    let drawing = false;
    let moved = false;

    const point = (event) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left) * canvas.width / bounds.width,
        y: (event.clientY - bounds.top) * canvas.height / bounds.height,
      };
    };

    const save = () => {
      if (!moved) return;
      const data = canvas.toDataURL("image/png");
      safeSet(`${responseId}:drawing`, data);
      safeSet(`${responseId}:mode`, "drawing");
      updateSharedState(responseId, `drawing:${data}`);
      announce(responseId, "Drawing saved.");
    };

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      moved = false;
      canvas.setPointerCapture(event.pointerId);
      const start = point(event);
      context.beginPath();
      context.moveTo(start.x, start.y);
      event.preventDefault();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const next = point(event);
      context.lineTo(next.x, next.y);
      context.stroke();
      moved = true;
      event.preventDefault();
    });

    const finish = (event) => {
      if (!drawing) return;
      drawing = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      save();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);

    const stored = safeGet(`${responseId}:drawing`);
    const storedMode = safeGet(`${responseId}:mode`);
    const alternative = document.querySelector(`[data-canvas-alternative="${responseId}"]`);
    if (storedMode === "alternative" && alternative?.value) {
      updateSharedState(responseId, `alternative:${alternative.value}`);
      announce(responseId, "Typed or Braille answer restored.");
    }
    if (stored) {
      const image = new Image();
      image.addEventListener("load", () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (storedMode !== "alternative" || !alternative?.value) {
          safeSet(`${responseId}:mode`, "drawing");
          updateSharedState(responseId, `drawing:${stored}`);
          announce(responseId, "Saved drawing restored.");
        }
      });
      image.src = stored;
    } else if (alternative?.value) {
      safeSet(`${responseId}:mode`, "alternative");
      updateSharedState(responseId, `alternative:${alternative.value}`);
      announce(responseId, "Typed or Braille answer restored.");
    }

    const clearButton = document.querySelector(`[data-clear-drawing="${responseId}"]`);
    clearButton?.addEventListener("click", () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      safeSet(`${responseId}:drawing`, "");
      safeSet(`${responseId}:mode`, alternative?.value ? "alternative" : "");
      updateSharedState(responseId, alternative?.value ? `alternative:${alternative.value}` : "");
      announce(responseId, "Drawing cleared.");
    });

    alternative?.addEventListener("input", () => {
      if (alternative.value) {
        safeSet(`${responseId}:mode`, "alternative");
        updateSharedState(responseId, `alternative:${alternative.value}`);
      } else if (safeGet(`${responseId}:drawing`)) {
        safeSet(`${responseId}:mode`, "drawing");
        updateSharedState(responseId, `drawing:${safeGet(`${responseId}:drawing`)}`);
      } else {
        safeSet(`${responseId}:mode`, "");
        updateSharedState(responseId, "");
      }
      announce(responseId, alternative.value ? "Typed or Braille answer saved." : "Typed or Braille answer cleared.");
    });
  };

  const initialise = () => {
    document.querySelectorAll("[data-practice-storage]").forEach((field) => {
      const key = field.dataset.practiceStorage;
      if (field.type !== "hidden") {
        const stored = safeGet(key);
        if (stored !== null) field.value = stored;
      }
      field.addEventListener("input", () => safeSet(key, field.value));
      field.addEventListener("change", () => safeSet(key, field.value));
    });
    document.querySelectorAll("canvas[data-drawing-response]").forEach(initialiseDrawing);
    initialiseSourceFormatting();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();

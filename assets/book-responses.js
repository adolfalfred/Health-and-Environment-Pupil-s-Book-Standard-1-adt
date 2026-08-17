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

  const normaliseAnswer = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(a|an|the)\s+/, "");

  const splitAggregateAnswers = (value) => value
    .split(/[\r\n;,]+/)
    .map((part) => part
      .trim()
      .replace(/^(?:picture\s*)?(?:\d+(?:\s*\([a-z]\))?|[a-z])\s*[.):\-]\s*/i, "")
      .trim())
    .filter(Boolean);

  const responseFields = (group) => Array.from(group.querySelectorAll("[data-activity-item]"));

  const responseContainer = (field) => field.closest(".response-card, .matching-answer-cell");

  const synchroniseMatchingChoices = (group, changedField = null) => {
    const fields = Array.from(group.querySelectorAll("input[data-matching-input][data-activity-item]"));
    fields.forEach((field) => {
      const normalised = field.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
      if (field.value !== normalised) field.value = normalised;
    });

    if (changedField?.value && fields.some(
      (field) => field !== changedField && field.value === changedField.value
    )) {
      changedField.value = "";
      safeSet(changedField.dataset.practiceStorage, "");
      changedField.setAttribute("aria-invalid", "true");
      changedField.title = "This matching letter has already been used.";
      responseContainer(changedField)?.classList.add("answer-unanswered");
    } else if (changedField) {
      changedField.removeAttribute("aria-invalid");
      changedField.removeAttribute("title");
      responseContainer(changedField)?.classList.remove("answer-unanswered");
    }

    const usedChoices = new Set();
    fields.forEach((field) => {
      if (!field.value) return;
      if (usedChoices.has(field.value)) {
        field.value = "";
        safeSet(field.dataset.practiceStorage, "");
        return;
      }
      usedChoices.add(field.value);
    });
  };

  const initialiseUniqueMatchingChoices = (group) => {
    const fields = Array.from(group.querySelectorAll("input[data-matching-input][data-activity-item]"));
    if (!fields.length) return;
    synchroniseMatchingChoices(group);
    fields.forEach((field) => field.addEventListener("input", () => {
      synchroniseMatchingChoices(group, field);
    }));
  };

  const clearAssessmentAppearance = (group) => {
    group.classList.remove("assessment-correct", "assessment-incorrect", "assessment-submitted");
    responseFields(group).forEach((field) => {
      field.removeAttribute("aria-invalid");
      responseContainer(field)?.classList.remove("answer-correct", "answer-incorrect", "answer-unanswered");
    });
  };

  const setFieldResult = (field, result) => {
    const container = responseContainer(field);
    container?.classList.remove("answer-correct", "answer-incorrect", "answer-unanswered");
    if (result) container?.classList.add(`answer-${result}`);
    if (result === "incorrect" || result === "unanswered") {
      field.setAttribute("aria-invalid", "true");
    } else {
      field.removeAttribute("aria-invalid");
    }
  };

  const defaultFeedback = (group) => group.dataset.assessmentMode === "objective"
    ? "Complete every answer, then submit to check your work."
    : "Complete the activity, then submit it for teacher review.";

  const resetAssessmentMessage = (group, message = defaultFeedback(group)) => {
    clearAssessmentAppearance(group);
    const feedback = group.querySelector(".activity-feedback");
    if (feedback) feedback.textContent = message;
    const submit = group.querySelector("[data-submit-group]");
    if (submit) submit.textContent = "Submit answers";
  };

  const assessGroup = (group, { restore = false } = {}) => {
    const fields = responseFields(group);
    const values = fields.map((field) => field.value.trim());
    const unanswered = values.reduce((count, value) => count + Number(!value), 0);
    const feedback = group.querySelector(".activity-feedback");
    const submit = group.querySelector("[data-submit-group]");

    clearAssessmentAppearance(group);
    if (unanswered) {
      fields.forEach((field, index) => {
        if (!values[index]) setFieldResult(field, "unanswered");
      });
      group.classList.add("assessment-incorrect");
      if (feedback) {
        feedback.textContent = unanswered === 1
          ? "Complete the unanswered part before submitting."
          : `Complete all parts before submitting. ${unanswered} answers are still missing.`;
      }
      if (!restore) feedback?.focus?.();
      return false;
    }

    if (group.dataset.assessmentMode === "objective") {
      let answerKey;
      try {
        answerKey = JSON.parse(group.dataset.answerKey || "[]");
      } catch (_) {
        answerKey = [];
      }
      const aggregateMode = group.dataset.answerMode === "all-in-one";
      const expectedAggregateCount = Number(group.dataset.answerCount || 0);
      if (
        (!aggregateMode && answerKey.length !== fields.length)
        || (aggregateMode && (
          fields.length !== 1
          || answerKey.length !== expectedAggregateCount
        ))
      ) {
        if (feedback) feedback.textContent = "This activity cannot be checked right now. Please ask your teacher.";
        return false;
      }

      if (aggregateMode) {
        const answers = splitAggregateAnswers(values[0]);
        if (answers.length !== answerKey.length) {
          setFieldResult(fields[0], "incorrect");
          group.classList.add("assessment-incorrect");
          if (feedback) {
            feedback.textContent = `Enter ${answerKey.length} answers, one per line, in picture-number order.`;
          }
          if (submit) submit.textContent = "Check again";
          if (!restore) feedback?.focus?.();
          return false;
        }

        const correct = answers.reduce((count, answerValue, index) => {
          const answer = normaliseAnswer(answerValue);
          const accepted = answerKey[index].some(
            (candidate) => normaliseAnswer(candidate) === answer
          );
          return count + Number(accepted);
        }, 0);
        const allCorrect = correct === answerKey.length;
        setFieldResult(fields[0], allCorrect ? "correct" : "incorrect");
        group.classList.add(allCorrect ? "assessment-correct" : "assessment-incorrect");
        if (feedback) {
          feedback.textContent = allCorrect
            ? `Excellent! All ${answerKey.length} answers are correct.`
            : `${correct} of ${answerKey.length} answers are correct. Check the order and try again.`;
        }
        if (submit) submit.textContent = allCorrect ? "Check answers again" : "Check again";
        safeSet(`${group.id}:assessment`, JSON.stringify({ submitted: true }));
        if (!restore) feedback?.focus?.();
        return allCorrect;
      }

      let correct = 0;
      fields.forEach((field, index) => {
        const answer = normaliseAnswer(values[index]);
        const accepted = answerKey[index].some((candidate) => normaliseAnswer(candidate) === answer);
        setFieldResult(field, accepted ? "correct" : "incorrect");
        if (accepted) correct += 1;
      });
      const allCorrect = correct === fields.length;
      group.classList.add(allCorrect ? "assessment-correct" : "assessment-incorrect");
      if (feedback) {
        feedback.textContent = allCorrect
          ? `Excellent! All ${fields.length} answers are correct.`
          : `${correct} of ${fields.length} answers are correct. Review the highlighted answers and try again.`;
      }
      if (submit) submit.textContent = allCorrect ? "Check answers again" : "Check again";
      safeSet(`${group.id}:assessment`, JSON.stringify({ submitted: true }));
    } else {
      group.classList.add("assessment-submitted");
      if (feedback) feedback.textContent = "Answer submitted and saved. Ask your teacher to review it.";
      if (submit) submit.textContent = "Submit again";
      safeSet(`${group.id}:assessment`, JSON.stringify({ submitted: true }));
    }
    if (!restore) feedback?.focus?.();
    return true;
  };

  const clearGroupAnswers = (group) => {
    responseFields(group).forEach((field) => {
      if (field.dataset.canvasResponse) {
        document.querySelector(`[data-clear-drawing="${field.id}"]`)?.click();
        const alternative = document.querySelector(`[data-canvas-alternative="${field.id}"]`);
        if (alternative) {
          alternative.value = "";
          safeSet(alternative.dataset.practiceStorage, "");
          alternative.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      field.value = "";
      safeSet(field.dataset.practiceStorage, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    safeSet(`${group.id}:assessment`, "");
    resetAssessmentMessage(group, "Answers cleared. Complete the activity when you are ready.");
    responseFields(group).find((field) => field.type !== "hidden")?.focus();
  };

  const initialiseResponseGroup = (group) => {
    const submit = group.querySelector("[data-submit-group]");
    const reset = group.querySelector("[data-reset-group]");
    submit?.addEventListener("click", () => assessGroup(group));
    reset?.addEventListener("click", () => clearGroupAnswers(group));

    responseFields(group).forEach((field) => {
      ["input", "change"].forEach((eventName) => field.addEventListener(eventName, () => {
        if (!safeGet(`${group.id}:assessment`)) return;
        safeSet(`${group.id}:assessment`, "");
        resetAssessmentMessage(group, "Your change is saved. Submit again to check or send it.");
      }));
    });

    if (safeGet(`${group.id}:assessment`)) assessGroup(group, { restore: true });
  };

  const initialisePageActivityDock = (dock) => {
    if (dock.dataset.activityInitialised === "true") return;
    dock.dataset.activityInitialised = "true";
    const section = dock.closest("section[data-section-id]");
    const groups = Array.from(section?.querySelectorAll("[data-response-group]") || []);
    const submit = dock.querySelector("[data-submit-page]");
    const reset = dock.querySelector("[data-reset-page]");
    const feedback = dock.querySelector(".page-activity-feedback");

    submit?.addEventListener("click", () => {
      groups.forEach((group) => assessGroup(group));
      const fields = groups.flatMap(responseFields);
      const unanswered = fields.reduce((count, field) => count + Number(!field.value.trim()), 0);
      const incorrect = groups.some((group) => (
        group.dataset.assessmentMode === "objective"
        && group.classList.contains("assessment-incorrect")
      ));
      const hasReview = groups.some((group) => group.dataset.assessmentMode === "review");

      if (unanswered) {
        feedback.textContent = unanswered === 1
          ? "Complete the highlighted answer before submitting this page."
          : `Complete the highlighted answers before submitting this page. ${unanswered} answers are missing.`;
        dock.dataset.pageResult = "incomplete";
      } else if (incorrect) {
        feedback.textContent = "Some answers need another try. Review the red-highlighted responses and submit again.";
        dock.dataset.pageResult = "incorrect";
        submit.textContent = "Check again";
      } else {
        feedback.textContent = hasReview
          ? "Page submitted. Fixed answers are correct; open answers are saved for teacher review."
          : "Excellent! Every answer on this page is correct.";
        dock.dataset.pageResult = "correct";
        submit.textContent = "Check again";
      }
      feedback.focus();
    });

    reset?.addEventListener("click", () => {
      groups.forEach(clearGroupAnswers);
      dock.removeAttribute("data-page-result");
      if (submit) submit.textContent = "Submit";
      if (feedback) {
        feedback.textContent = "Page answers cleared.";
        feedback.focus();
      }
    });

    groups.flatMap(responseFields).forEach((field) => {
      ["input", "change"].forEach((eventName) => field.addEventListener(eventName, () => {
        if (!dock.dataset.pageResult) return;
        dock.removeAttribute("data-page-result");
        if (submit) submit.textContent = "Submit";
        if (feedback) feedback.textContent = "Your changes are saved.";
      }));
    });
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
    document.querySelectorAll(".matching-group[data-response-group]")
      .forEach(initialiseUniqueMatchingChoices);
    document.querySelectorAll("[data-response-group]").forEach(initialiseResponseGroup);
    document.querySelectorAll("[data-page-activity-dock]").forEach(initialisePageActivityDock);
    initialiseSourceFormatting();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();

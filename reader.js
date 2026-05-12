const state = {
  manifest: null,
  entries: [],
  entryIndex: 0,
  pageIndex: 0,
  pagesByEntry: new Map(),
  touchStartX: 0,
  touchStartY: 0
};

const els = {
  bookTitle: document.getElementById("bookTitle"),
  chapterTitle: document.getElementById("chapterTitle"),
  page: document.getElementById("page"),
  pageContent: document.getElementById("pageContent"),
  pageIndicator: document.getElementById("pageIndicator"),
  pageSlider: document.getElementById("pageSlider"),
  chapterList: document.getElementById("chapterList"),
  tocPanel: document.getElementById("tocPanel"),
  tocButton: document.getElementById("tocButton"),
  themeButton: document.getElementById("themeButton"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage")
};

init();

async function init() {
  restoreTheme();
  bindEvents();

  try {
    const response = await fetch("manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("manifest.json을 불러오지 못했습니다.");

    state.manifest = await response.json();
    state.entries = createEntries(state.manifest);
    els.bookTitle.textContent = state.manifest.title || "Legend of Siclayan";
    restorePosition();
    renderChapterList();
    await loadEntry(state.entryIndex, state.pageIndex);
  } catch (error) {
    renderError(error.message);
  }
}

function bindEvents() {
  els.tocButton.addEventListener("click", openToc);
  els.themeButton.addEventListener("click", toggleTheme);
  els.prevPage.addEventListener("click", previousPage);
  els.nextPage.addEventListener("click", nextPage);

  document.querySelectorAll("[data-close-toc]").forEach((button) => {
    button.addEventListener("click", closeToc);
  });

  els.pageSlider.addEventListener("input", (event) => {
    state.pageIndex = Number(event.target.value) - 1;
    renderPage();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") previousPage();
    if (event.key === "ArrowRight" || event.key === " ") nextPage();
    if (event.key === "Escape") closeToc();
  });

  window.addEventListener("resize", () => {
    fitTextToPage();
  });

  els.page.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    state.touchStartX = touch.clientX;
    state.touchStartY = touch.clientY;
  }, { passive: true });

  els.page.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - state.touchStartX;
    const dy = touch.clientY - state.touchStartY;

    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    if (dx < 0) nextPage();
    else previousPage();
  }, { passive: true });
}

function createEntries(manifest) {
  if (Array.isArray(manifest.volumes)) {
    return manifest.volumes.flatMap((volume, volumeIndex) => {
      const entries = [];
      if (volume.cover) {
        entries.push({ type: "cover", volume, volumeIndex, title: volume.title, cover: volume.cover });
      }

      for (const chapter of volume.chapters || []) {
        entries.push({ type: "chapter", volume, volumeIndex, chapter });
      }

      return entries;
    });
  }

  return (manifest.chapters || []).map((chapter) => ({
    type: "chapter",
    volume: { number: 1, title: "1권" },
    volumeIndex: 0,
    chapter
  }));
}

async function loadEntry(entryIndex, requestedPage = 0) {
  const entry = state.entries[entryIndex];
  if (!entry) return;

  state.entryIndex = entryIndex;
  els.chapterTitle.textContent = entryLabel(entry);
  setLoading();

  if (entry.type === "cover") {
    state.pageIndex = 0;
    renderPage();
    renderChapterList();
    return;
  }

  if (!state.pagesByEntry.has(entryIndex)) {
    const response = await fetch(encodeURI(entry.chapter.path), { cache: "no-store" });
    if (!response.ok) throw new Error(`${entry.chapter.path} 원고를 불러오지 못했습니다.`);
    const text = await response.text();
    const textPages = paginate(text, state.manifest.pageSize || 520);
    state.pagesByEntry.set(entryIndex, createDisplayPages(entry, textPages));
  }

  const pages = getPages();
  state.pageIndex = clamp(requestedPage, 0, Math.max(0, pages.length - 1));
  renderPage();
  renderChapterList();
}

function paginate(text, pageSize) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const pages = [];
  let current = [];
  let count = 0;

  for (const paragraph of paragraphs) {
    const paragraphWeight = paragraph.length + 2;
    if (current.length && count + paragraphWeight > pageSize) {
      pages.push(current);
      current = [];
      count = 0;
    }

    if (paragraph.length > pageSize) {
      const chunks = splitLongParagraph(paragraph, pageSize);
      for (const chunk of chunks) {
        if (current.length) {
          pages.push(current);
          current = [];
          count = 0;
        }
        pages.push([chunk]);
      }
      continue;
    }

    current.push(paragraph);
    count += paragraphWeight;
  }

  if (current.length) pages.push(current);
  return pages.length ? pages : [[""]];
}

function splitLongParagraph(paragraph, pageSize) {
  const chunks = [];
  for (let start = 0; start < paragraph.length; start += pageSize) {
    chunks.push(paragraph.slice(start, start + pageSize));
  }
  return chunks;
}

function renderPage() {
  const entry = getEntry();
  const pages = getPages();
  const pageNumber = state.pageIndex + 1;

  els.page.className = "page";
  els.pageContent.className = "page-content";
  els.pageContent.style.fontSize = "";
  els.pageContent.style.lineHeight = "";
  els.pageContent.innerHTML = "";

  if (entry.type === "cover") {
    renderCover(entry);
  } else {
    renderChapterPage(entry, pages, pageNumber);
  }

  els.pageIndicator.textContent = entry.type === "cover" ? "표지" : `${pageNumber} / ${pages.length}`;
  els.pageSlider.max = String(Math.max(1, pages.length));
  els.pageSlider.value = String(pageNumber);
  els.pageSlider.disabled = entry.type === "cover";
  els.chapterTitle.textContent = entryLabel(entry);
  fitTextToPage();
  savePosition();
}

function renderCover(entry) {
  els.page.classList.add("cover-mode");
  els.pageContent.classList.add("cover-content");

  const wrapper = document.createElement("section");
  wrapper.className = "cover-page";

  const image = document.createElement("img");
  image.src = encodeURI(`${state.manifest.illustrationsPath}/${entry.cover}`);
  image.alt = `${entry.volume.title} 표지`;

  const label = document.createElement("div");
  label.className = "cover-label";
  label.textContent = `${entry.volume.title} 표지`;

  wrapper.append(image, label);
  els.pageContent.appendChild(wrapper);
}

function createDisplayPages(entry, textPages) {
  const pages = textPages.map((paragraphs, index) => ({
    type: "text",
    paragraphs,
    textPageNumber: index + 1
  }));

  const illustrations = findIllustrationsForChapter(entry.chapter.number);
  for (const illustration of illustrations) {
    const insertAt = clamp(illustration.pageNumber - 1, 0, pages.length);
    pages.splice(insertAt, 0, {
      type: "illustration",
      file: illustration.file,
      targetPageNumber: illustration.pageNumber
    });
  }

  return pages;
}

function renderChapterPage(entry, pages, pageNumber) {
  const currentPage = pages[state.pageIndex];
  const background = currentPage.type === "text"
    ? findBackgroundIllustration(entry.chapter.number, currentPage.textPageNumber, pageNumber)
    : null;

  if (currentPage.type === "text" && currentPage.textPageNumber === 1) {
    const heading = document.createElement("h1");
    heading.className = "chapter-heading";
    heading.textContent = entryLabel(entry);
    els.pageContent.appendChild(heading);
  }

  if (currentPage.type === "illustration") {
    els.pageContent.classList.add("has-illustration");

    const figure = document.createElement("figure");
    figure.className = "illustration-page";

    const image = document.createElement("img");
    image.src = encodeURI(`${state.manifest.illustrationsPath}/${currentPage.file}`);
    image.alt = `${entryLabel(entry)} ${currentPage.targetPageNumber}페이지 삽화`;

    const caption = document.createElement("figcaption");
    caption.className = "illustration-caption";
    caption.textContent = `${entryLabel(entry)} · ${currentPage.targetPageNumber}페이지 삽화`;

    figure.append(image, caption);
    els.pageContent.appendChild(figure);
    return;
  }

  if (background) {
    els.pageContent.classList.add("has-bg-illustration");
    els.pageContent.style.setProperty("--bg-illustration", `url("${encodeURI(`${state.manifest.illustrationsPath}/${background.file}`)}")`);
    els.pageContent.style.setProperty("--bg-opacity", String(background.opacity));
    els.pageContent.style.setProperty("--bg-position", background.position);
  }

  for (const paragraph of currentPage.paragraphs) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    els.pageContent.appendChild(p);
  }
}

function fitTextToPage() {
  const hasMedia = Boolean(els.pageContent.querySelector(".illustration-page, .cover-page"));
  if (hasMedia) {
    els.pageContent.style.fontSize = "";
    els.pageContent.style.lineHeight = "";
    return;
  }

  els.pageContent.style.fontSize = "";
  els.pageContent.style.lineHeight = "";

  requestAnimationFrame(() => {
    const baseSize = parseFloat(getComputedStyle(els.pageContent).fontSize);
    let size = baseSize;
    let lineHeight = 1.72;

    while (els.pageContent.scrollHeight > els.pageContent.clientHeight && size > 12.5) {
      size -= 0.5;
      lineHeight = Math.max(1.56, lineHeight - 0.015);
      els.pageContent.style.fontSize = `${size}px`;
      els.pageContent.style.lineHeight = String(lineHeight);
    }
  });
}

function renderChapterList() {
  if (!state.manifest) return;

  els.chapterList.innerHTML = "";

  for (const volume of state.manifest.volumes || []) {
    const group = document.createElement("section");
    group.className = "toc-volume";

    const heading = document.createElement("div");
    heading.className = "toc-volume-title";
    heading.textContent = volume.title;
    group.appendChild(heading);

    const coverIndex = state.entries.findIndex((entry) => entry.type === "cover" && entry.volume === volume);
    if (coverIndex >= 0) {
      group.appendChild(createTocButton("표지", coverIndex));
    }

    for (const chapter of volume.chapters || []) {
      const entryIndex = state.entries.findIndex((entry) => entry.type === "chapter" && entry.chapter === chapter);
      group.appendChild(createTocButton(chapterLabel(chapter), entryIndex));
    }

    els.chapterList.appendChild(group);
  }
}

function createTocButton(label, entryIndex) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chapter-button${entryIndex === state.entryIndex ? " active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", async () => {
    closeToc();
    await loadEntry(entryIndex, 0);
  });
  return button;
}

function findIllustrationsForChapter(chapterNumber) {
  const list = state.manifest.illustrations || [];
  const pattern = new RegExp(`^${chapterNumber}_(\\d+)\\.`, "i");

  return list
    .map((file) => {
      const match = file.match(pattern);
      return match ? { file, pageNumber: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

function findBackgroundIllustration(chapterNumber, textPageNumber, displayPageNumber) {
  const list = state.manifest.backgroundIllustrations || [];
  const shorthandCandidates = [
    `${chapterNumber}_${textPageNumber}_bg.`,
    `${chapterNumber}_${displayPageNumber}_bg.`
  ];

  const manifestEntry = list.find((item) => {
    if (typeof item === "string") {
      return shorthandCandidates.some((prefix) => item.startsWith(prefix));
    }

    return item.chapter === chapterNumber && (
      item.page === textPageNumber ||
      item.displayPage === displayPageNumber
    );
  });

  if (manifestEntry) {
    return normalizeBackgroundIllustration(manifestEntry);
  }

  const fileEntry = (state.manifest.illustrations || []).find((file) => (
    shorthandCandidates.some((prefix) => file.startsWith(prefix))
  ));
  return fileEntry ? normalizeBackgroundIllustration(fileEntry) : null;
}

function normalizeBackgroundIllustration(entry) {
  if (typeof entry === "string") {
    return {
      file: entry,
      opacity: 0.22,
      position: "center center"
    };
  }

  return {
    file: entry.file,
    opacity: entry.opacity ?? 0.22,
    position: entry.position || "center center"
  };
}

function previousPage() {
  if (!state.manifest) return;
  if (state.pageIndex > 0) {
    state.pageIndex -= 1;
    renderPage();
    return;
  }

  if (state.entryIndex > 0) {
    const previousEntry = state.entryIndex - 1;
    const cached = state.pagesByEntry.get(previousEntry);
    const lastPage = state.entries[previousEntry].type === "cover" ? 0 : (cached ? cached.length - 1 : 0);
    loadEntry(previousEntry, lastPage).catch((error) => renderError(error.message));
  }
}

function nextPage() {
  if (!state.manifest) return;
  const pages = getPages();
  if (state.pageIndex < pages.length - 1) {
    state.pageIndex += 1;
    renderPage();
    return;
  }

  if (state.entryIndex < state.entries.length - 1) {
    loadEntry(state.entryIndex + 1, 0).catch((error) => renderError(error.message));
  }
}

function openToc() {
  els.tocPanel.classList.add("open");
  els.tocPanel.setAttribute("aria-hidden", "false");
}

function closeToc() {
  els.tocPanel.classList.remove("open");
  els.tocPanel.setAttribute("aria-hidden", "true");
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("los-reader-theme", document.body.classList.contains("dark") ? "dark" : "light");
}

function restoreTheme() {
  if (localStorage.getItem("los-reader-theme") === "dark") {
    document.body.classList.add("dark");
  }
}

function restorePosition() {
  const saved = JSON.parse(localStorage.getItem("los-reader-position") || "{}");
  const savedEntry = Number.isFinite(Number(saved.entryIndex)) ? Number(saved.entryIndex) : Number(saved.chapterIndex);
  state.entryIndex = clamp(savedEntry || 0, 0, state.entries.length - 1);
  state.pageIndex = Math.max(0, Number(saved.pageIndex) || 0);
}

function savePosition() {
  localStorage.setItem("los-reader-position", JSON.stringify({
    entryIndex: state.entryIndex,
    pageIndex: state.pageIndex
  }));
}

function setLoading() {
  els.page.className = "page";
  els.pageContent.className = "page-content loading";
  els.pageContent.textContent = "원고를 불러오는 중입니다.";
}

function renderError(message) {
  els.page.className = "page";
  els.pageContent.className = "page-content error";
  els.pageContent.textContent = message;
}

function getEntry() {
  return state.entries[state.entryIndex];
}

function getPages() {
  const entry = getEntry();
  if (!entry || entry.type === "cover") return [[""]];
  return state.pagesByEntry.get(state.entryIndex) || [[""]];
}

function entryLabel(entry) {
  if (entry.type === "cover") return `${entry.volume.title} 표지`;
  return chapterLabel(entry.chapter);
}

function chapterLabel(chapter) {
  return chapter.number === 0 ? `프롤로그 · ${chapter.title}` : `${chapter.number}화 · ${chapter.title}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

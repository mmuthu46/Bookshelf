/* ==========================================================================
   reader.js
   In-browser PDF reader built on PDF.js.
   URL format:  reader.html?id=<book-id>
   Progress is saved to localStorage after every page turn and restored
   automatically on next open.
   Keyboard: ← previous page  /  → next page
   ========================================================================== */

(function () {
  "use strict";

  var PROGRESS_KEY = "bookshelf.progress.v1";
  var LIBRARY_KEY  = "bookshelf.library.v1";
  var DATA_URL     = "../assets/books/books.json";

  var state = {
    bookId     : null,
    book       : null,
    pdf        : null,
    currentPage: 1,
    totalPages : 0,
    rendering  : false,
    pendingPage: null
  };

  var els = {};

  // ------------------------------------------------------------------------
  // localStorage helpers
  // ------------------------------------------------------------------------

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }
    catch (e) { return {}; }
  }

  function saveProgress(page) {
    try {
      var all = getProgress();
      all[state.bookId] = {
        page    : page,
        total   : state.totalPages,
        lastRead: new Date().toISOString()
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function getLibrary() {
    try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]"); }
    catch (e) { return []; }
  }

  function toggleLibrary() {
    var lib = getLibrary();
    var idx = lib.indexOf(state.bookId);
    if (idx === -1) { lib.push(state.bookId); }
    else            { lib.splice(idx, 1); }
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib)); } catch (e) {}
    refreshLibBtn();
  }

  // ------------------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------------------

  function refreshLibBtn() {
    var inLib = getLibrary().indexOf(state.bookId) !== -1;
    els.libBtn.textContent = inLib ? "✓ In Library" : "+ Library";
    els.libBtn.classList.toggle("in-library", inLib);
  }

  function updateControls() {
    var page  = state.currentPage;
    var total = state.totalPages;
    els.pageDisplay.textContent = "/ " + total;
    els.pageInput.value = page;
    els.pageInput.max   = total;
    els.prevBtn.disabled = (page <= 1);
    els.nextBtn.disabled = (page >= total);
    var pct = total > 0 ? Math.round((page / total) * 100) : 0;
    els.progressFill.style.width = pct + "%";
    els.progressFill.title = pct + "% read";
  }

  function setStatus(msg, isError) {
    if (!els.canvasContainer.querySelector("#pdf-canvas")) {
      els.canvasContainer.innerHTML =
        '<div class="reader-loading' + (isError ? " error" : "") + '">' + msg + "</div>";
    }
  }

  function ensureCanvas() {
    var existing = document.getElementById("pdf-canvas");
    if (existing) return existing;
    var c = document.createElement("canvas");
    c.id = "pdf-canvas";
    els.canvasContainer.innerHTML = "";
    els.canvasContainer.appendChild(c);
    return c;
  }

  // ------------------------------------------------------------------------
  // PDF rendering
  // ------------------------------------------------------------------------

  function renderPage(pageNum) {
    if (state.rendering) {
      state.pendingPage = pageNum;
      return;
    }
    state.rendering = true;

    state.pdf.getPage(pageNum).then(function (page) {
      var canvas    = ensureCanvas();
      var ctx       = canvas.getContext("2d");
      var containerW = Math.max(els.canvasContainer.clientWidth - 32, 300);
      var baseVp    = page.getViewport({ scale: 1 });
      var scale     = Math.min(1.8, containerW / baseVp.width);
      var viewport  = page.getViewport({ scale: scale });

      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      return page.render({ canvasContext: ctx, viewport: viewport }).promise;

    }).then(function () {
      state.rendering    = false;
      state.currentPage  = pageNum;
      updateControls();
      saveProgress(pageNum);

      if (state.pendingPage !== null) {
        var next = state.pendingPage;
        state.pendingPage = null;
        renderPage(next);
      }

    }).catch(function (err) {
      state.rendering = false;
      setStatus("Error rendering page " + pageNum + ": " + err.message, true);
    });
  }

  // ------------------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------------------

  function init() {
    var params   = new URLSearchParams(window.location.search);
    state.bookId = params.get("id");

    if (!state.bookId) {
      fatalError("No book id in URL. <a href='library.html'>Back to Library</a>");
      return;
    }

    fetch(DATA_URL + "?cb=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.book = (data.books || []).find(function (b) {
          return b.id === state.bookId;
        });

        if (!state.book) {
          fatalError('Book "' + state.bookId + '" not found. <a href="library.html">Back to Library</a>');
          return;
        }
        if (!state.book.localPdf) {
          fatalError(
            "This book does not have a local PDF. " +
            (state.book.url
              ? 'Read it online at <a href="' + state.book.url + '" target="_blank" rel="noopener noreferrer">' + state.book.url + "</a>"
              : "") +
            '<br><a href="library.html">Back to Library</a>'
          );
          return;
        }

        document.title = state.book.title + " — Reader";
        els.bookTitle.textContent = state.book.title;
        refreshLibBtn();

        var saved     = getProgress()[state.bookId] || {};
        var startPage = (saved.page && saved.page > 0) ? saved.page : 1;

        setStatus("Loading PDF…");

        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        pdfjsLib.getDocument(state.book.localPdf).promise
          .then(function (pdf) {
            state.pdf        = pdf;
            state.totalPages = pdf.numPages;
            updateControls();
            renderPage(Math.min(startPage, pdf.numPages));
          })
          .catch(function (err) {
            fatalError(
              "<strong>Could not load PDF</strong><br>" +
              err.message +
              "<br><br>Make sure the PDF file has been downloaded into " +
              "<code>assets/pdfs/</code> and the page is served over HTTP (not file://)." +
              '<br><a href="library.html">Back to Library</a>'
            );
          });
      })
      .catch(function (err) {
        fatalError("Could not load books.json: " + err.message);
      });
  }

  function fatalError(html) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:sans-serif;color:#f87171;line-height:1.7">' +
      html + "</div>";
  }

  // ------------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------------

  function bindEvents() {
    els.prevBtn.addEventListener("click", function () {
      if (state.currentPage > 1) renderPage(state.currentPage - 1);
    });
    els.nextBtn.addEventListener("click", function () {
      if (state.currentPage < state.totalPages) renderPage(state.currentPage + 1);
    });

    els.pageInput.addEventListener("change", function () {
      var p = parseInt(this.value, 10);
      if (!isNaN(p) && p >= 1 && p <= state.totalPages) renderPage(p);
      else this.value = state.currentPage;
    });

    els.libBtn.addEventListener("click", toggleLibrary);

    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft"  && state.currentPage > 1) renderPage(state.currentPage - 1);
      if (e.key === "ArrowRight" && state.currentPage < state.totalPages) renderPage(state.currentPage + 1);
    });
  }

  function cacheElements() {
    els.bookTitle       = document.getElementById("reader-book-title");
    els.pageDisplay     = document.getElementById("reader-page-display");
    els.pageInput       = document.getElementById("reader-page-input");
    els.prevBtn         = document.getElementById("reader-prev-btn");
    els.nextBtn         = document.getElementById("reader-next-btn");
    els.libBtn          = document.getElementById("reader-lib-btn");
    els.progressFill    = document.getElementById("reader-progress-fill");
    els.canvasContainer = document.getElementById("reader-canvas-container");
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    init();
  });
})();

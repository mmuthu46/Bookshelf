/* ==========================================================================
   library.js
   Renders the user's personal reading library pulled from localStorage.
   Books are added/removed from any card on bookshelf.html.
   ========================================================================== */

(function () {
  "use strict";

  var LIBRARY_KEY  = "bookshelf.library.v1";
  var PROGRESS_KEY = "bookshelf.progress.v1";
  var DATA_URL     = "../assets/books/books.json";

  var allBooks = [];
  var els      = {};

  // ------------------------------------------------------------------------
  // localStorage helpers
  // ------------------------------------------------------------------------

  function getLibrary() {
    try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]"); }
    catch (e) { return []; }
  }

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }
    catch (e) { return {}; }
  }

  function removeFromLibrary(bookId) {
    var lib = getLibrary().filter(function (id) { return id !== bookId; });
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib)); } catch (e) {}
    render();
  }

  // ------------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------------

  function escapeHtml(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g,  "&lt;")
      .replace(/>/g,  "&gt;")
      .replace(/"/g,  "&quot;");
  }

  function safeHref(url) {
    try {
      var p = new URL(url, window.location.href);
      return (p.protocol === "http:" || p.protocol === "https:") ? p.href : "#";
    } catch (e) { return "#"; }
  }

  function timeAgo(iso) {
    if (!iso) return "";
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1)  return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24)  return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return Math.floor(days / 30) + "mo ago";
  }

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  function render() {
    var lib      = getLibrary();
    var progress = getProgress();

    var count = lib.length;
    els.count.textContent = count + " book" + (count === 1 ? "" : "s");

    if (count === 0) {
      els.container.innerHTML =
        '<div class="state-message">' +
        "<strong>Your library is empty</strong>" +
        'Go to the <a href="bookshelf.html">Bookshelf</a> and click ' +
        "<em>+ Library</em> on any book to shortlist it here." +
        "</div>";
      return;
    }

    var libBooks = allBooks.filter(function (b) {
      return lib.indexOf(b.id) !== -1;
    });

    var sortBy = els.sortBy.value;
    libBooks.sort(function (a, b) {
      if (sortBy === "title") {
        return (a.title || "").localeCompare(b.title || "");
      }
      if (sortBy === "category") {
        var ca = (a.categories || [])[0] || "";
        var cb = (b.categories || [])[0] || "";
        return ca.localeCompare(cb);
      }
      if (sortBy === "lastread") {
        var pa = progress[a.id] || {}, pb = progress[b.id] || {};
        var ta = pa.lastRead ? new Date(pa.lastRead).getTime() : 0;
        var tb = pb.lastRead ? new Date(pb.lastRead).getTime() : 0;
        return tb - ta;
      }
      // "added" — preserve insertion order
      return lib.indexOf(a.id) - lib.indexOf(b.id);
    });

    var html = '<div class="lib-list">';

    libBooks.forEach(function (book) {
      var prog   = progress[book.id] || {};
      var hasPdf = !!book.localPdf;
      var pct    = (prog.page && prog.total)
        ? Math.min(100, Math.round((prog.page / prog.total) * 100))
        : 0;

      // Action button
      var readBtn;
      if (hasPdf) {
        var label = (prog.page && prog.page > 1) ? "Continue Reading" : "Start Reading";
        readBtn =
          '<a href="reader.html?id=' + escapeHtml(book.id) + '" class="btn">' +
          label + "</a>";
      } else {
        readBtn =
          '<a href="' + escapeHtml(safeHref(book.url || "#")) + '" ' +
          'target="_blank" rel="noopener noreferrer" class="btn secondary">' +
          "Open Link</a>";
      }

      // Progress section (PDF books only)
      var progressHtml = "";
      if (hasPdf) {
        var progressText = prog.page
          ? "Page " + prog.page + (prog.total ? " of " + prog.total : "") +
            " &nbsp;·&nbsp; " + pct + "%" +
            (prog.lastRead ? " &nbsp;·&nbsp; Last read " + timeAgo(prog.lastRead) : "")
          : "Not started yet";

        progressHtml =
          '<div class="lib-progress-track" aria-label="Reading progress ' + pct + '%">' +
          '<div class="lib-progress-fill" style="width:' + pct + '%"></div>' +
          "</div>" +
          '<p class="lib-progress-text">' + progressText + "</p>";
      }

      // Category chips
      var chips = (book.categories || []).map(function (c) {
        return '<span class="category-chip">' + escapeHtml(c) + "</span>";
      }).join("");

      html +=
        '<article class="lib-card">' +
        '  <div class="lib-card-body">' +
        '    <h3 class="lib-card-title">' + escapeHtml(book.title || "Untitled") + "</h3>" +
        '    <div class="book-meta-line">' +
        (book.author ? escapeHtml(book.author) : "") +
        (book.year   ? " &nbsp;&middot;&nbsp; " + escapeHtml(book.year) : "") +
        "    </div>" +
        (chips ? '<div class="tag-row" style="margin-top:6px">' + chips + "</div>" : "") +
        progressHtml +
        "  </div>" +
        '  <div class="lib-card-actions">' +
        readBtn +
        '  <button class="btn secondary lib-remove-btn" ' +
        'data-id="' + escapeHtml(book.id) + '">Remove</button>' +
        "  </div>" +
        "</article>";
    });

    html += "</div>";
    els.container.innerHTML = html;
  }

  // ------------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------------

  function cacheElements() {
    els.container = document.getElementById("lib-container");
    els.count     = document.getElementById("lib-count");
    els.sortBy    = document.getElementById("lib-sort-by");
  }

  function bindEvents() {
    els.sortBy.addEventListener("change", render);

    els.container.addEventListener("click", function (e) {
      var btn = e.target.closest(".lib-remove-btn");
      if (!btn) return;
      removeFromLibrary(btn.getAttribute("data-id"));
    });
  }

  function loadAndRender() {
    fetch(DATA_URL + "?cb=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        allBooks = data.books || [];
        render();
      })
      .catch(function (err) {
        els.container.innerHTML =
          '<div class="state-message error"><strong>Could not load books data</strong>' +
          escapeHtml(err.message) + "</div>";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    loadAndRender();
  });
})();

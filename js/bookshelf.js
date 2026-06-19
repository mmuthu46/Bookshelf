/* ==========================================================================
   bookshelf.js
   Loads assets/books/books.json and renders a searchable, filterable,
   groupable, sortable bookshelf. No frameworks, no build step.
   ========================================================================== */

(function () {
  "use strict";

  var DATA_URL = "../assets/books/books.json";
  var STORAGE_KEY = "bookshelf.filters.v1";
  var SEARCH_DEBOUNCE_MS = 180;

  /** @type {Array<Object>} raw list of book entries loaded from JSON */
  var allBooks = [];

  /** DOM references */
  var els = {};

  /** Debounce timer handle for search input */
  var searchDebounceHandle = null;

  // ------------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------------

  /**
   * Escape a string for safe insertion into HTML to avoid XSS when
   * rendering values pulled from the JSON data file.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    var str = String(value);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Validate that a URL string is http(s) before rendering as a link href,
   * as a defense-in-depth measure against javascript: URLs in source data.
   * @param {string} url
   * @returns {string} safe href, or "#" if invalid
   */
  function safeHref(url) {
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (e) {
      /* fall through */
    }
    return "#";
  }

  function debounce(fn, delay) {
    return function () {
      var args = arguments;
      clearTimeout(searchDebounceHandle);
      searchDebounceHandle = setTimeout(function () {
        fn.apply(null, args);
      }, delay);
    };
  }

  function readStoredFilters() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStoredFilters(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable - ignore silently */
    }
  }

  function getSelectedValues(selectEl) {
    return Array.prototype.slice
      .call(selectEl.options)
      .filter(function (opt) {
        return opt.selected;
      })
      .map(function (opt) {
        return opt.value;
      });
  }

  function setSelectedValues(selectEl, values) {
    var valueSet = {};
    (values || []).forEach(function (v) {
      valueSet[v] = true;
    });
    Array.prototype.slice.call(selectEl.options).forEach(function (opt) {
      opt.selected = !!valueSet[opt.value];
    });
  }

  // ------------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------------

  function loadBooks() {
    var url = DATA_URL + "?cb=" + Date.now();

    fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status + " while fetching books.json");
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.books)) {
          throw new Error("books.json is missing a top-level 'books' array");
        }
        allBooks = data.books;
        populateTagOptions(allBooks);
        restoreFiltersFromStorage();
        renderResults();
      })
      .catch(function (err) {
        renderErrorState(err);
      });
  }

  function populateTagOptions(books) {
    var tagSet = {};
    books.forEach(function (book) {
      (book.tags || []).forEach(function (tag) {
        tagSet[tag] = true;
      });
    });
    var sortedTags = Object.keys(tagSet).sort(function (a, b) {
      return a.localeCompare(b);
    });

    els.tagFilter.innerHTML = "";
    sortedTags.forEach(function (tag) {
      var opt = document.createElement("option");
      opt.value = tag;
      opt.textContent = tag;
      els.tagFilter.appendChild(opt);
    });

    els.tagFilter.dataset.allTags = JSON.stringify(sortedTags);
  }

  // ------------------------------------------------------------------------
  // Filtering / sorting / grouping
  // ------------------------------------------------------------------------

  function getCurrentFilterState() {
    return {
      search: els.searchInput.value.trim(),
      categories: getSelectedValues(els.categoryFilter),
      tags: getSelectedValues(els.tagFilter),
      groupBy: els.groupBy.value,
      sortBy: els.sortBy.value,
    };
  }

  function matchesSearch(book, query) {
    if (!query) return true;
    var haystack = [
      book.title,
      book.author,
      book.publisher,
      (book.categories || []).join(" "),
      (book.tags || []).join(" "),
      book.notes,
    ]
      .filter(Boolean)
      .join(" \u2022 ")
      .toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function matchesCategories(book, selectedCategories) {
    if (!selectedCategories.length) return true;
    var bookCategories = book.categories || [];
    return selectedCategories.some(function (cat) {
      return bookCategories.indexOf(cat) !== -1;
    });
  }

  function matchesTags(book, selectedTags) {
    if (!selectedTags.length) return true;
    var bookTags = book.tags || [];
    return selectedTags.some(function (tag) {
      return bookTags.indexOf(tag) !== -1;
    });
  }

  function filterBooks(state) {
    return allBooks.filter(function (book) {
      return (
        matchesSearch(book, state.search) &&
        matchesCategories(book, state.categories) &&
        matchesTags(book, state.tags)
      );
    });
  }

  function sortBooks(books, sortBy) {
    var copy = books.slice();
    if (sortBy === "title") {
      copy.sort(function (a, b) {
        return (a.title || "").localeCompare(b.title || "");
      });
    } else if (sortBy === "year") {
      copy.sort(function (a, b) {
        return (b.year || 0) - (a.year || 0);
      });
    }
    // "recent" = preserve original list order (default insertion order)
    return copy;
  }

  function groupBooks(books, groupBy) {
    if (groupBy === "none") {
      return [{ key: null, label: null, items: books }];
    }

    var buckets = {};
    var order = [];

    books.forEach(function (book) {
      var keys;
      if (groupBy === "year") {
        keys = [book.year ? String(book.year) : "Unknown Year"];
      } else if (groupBy === "category") {
        keys = book.categories && book.categories.length ? book.categories : ["Uncategorized"];
      } else {
        keys = ["All"];
      }

      keys.forEach(function (key) {
        if (!buckets[key]) {
          buckets[key] = [];
          order.push(key);
        }
        buckets[key].push(book);
      });
    });

    // Sort group headings: years descending, categories alphabetically
    if (groupBy === "year") {
      order.sort(function (a, b) {
        if (a === "Unknown Year") return 1;
        if (b === "Unknown Year") return -1;
        return Number(b) - Number(a);
      });
    } else {
      order.sort(function (a, b) {
        return a.localeCompare(b);
      });
    }

    return order.map(function (key) {
      return { key: key, label: key, items: buckets[key] };
    });
  }

  // ------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------

  function renderResults() {
    var state = getCurrentFilterState();
    writeStoredFilters(state);

    var filtered = filterBooks(state);
    var sorted = sortBooks(filtered, state.sortBy);
    var groups = groupBooks(sorted, state.groupBy);

    els.resultsCount.textContent =
      sorted.length === 0
        ? "No results"
        : sorted.length + " of " + allBooks.length + " entries shown";

    if (allBooks.length === 0) {
      renderEmptyState("No books yet", "Add your first entry from the Configure page.");
      return;
    }

    if (sorted.length === 0) {
      renderEmptyState(
        "No matching entries",
        "Try clearing the search box or removing some filters."
      );
      return;
    }

    var html = "";
    groups.forEach(function (group) {
      if (group.label) {
        html += '<h2 class="group-heading">' + escapeHtml(group.label) + "</h2>";
      }
      html += '<div class="book-grid">';
      group.items.forEach(function (book) {
        html += renderCard(book);
      });
      html += "</div>";
    });

    els.resultsContainer.innerHTML = html;
  }

  function renderCard(book) {
    var year = book.year ? escapeHtml(book.year) : "";
    var author = book.author ? escapeHtml(book.author) : "";
    var publisher = book.publisher ? escapeHtml(book.publisher) : "";

    var metaParts = [];
    if (author) metaParts.push(author);
    if (publisher) metaParts.push(publisher);
    if (year) metaParts.push(year);

    var categoriesHtml = (book.categories || [])
      .map(function (c) {
        return '<span class="category-chip">' + escapeHtml(c) + "</span>";
      })
      .join("");

    var tagsHtml = (book.tags || [])
      .map(function (t) {
        return '<span class="tag-chip">' + escapeHtml(t) + "</span>";
      })
      .join("");

    var notesHtml = book.notes
      ? '<p class="book-notes">' + escapeHtml(book.notes) + "</p>"
      : "";

    var href = safeHref(book.url || "#");

    return (
      '<article class="book-card">' +
      "<h3><a href=\"" +
      href +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(book.title || "Untitled") +
      "</a></h3>" +
      (metaParts.length
        ? '<div class="book-meta-line">' + escapeHtml(metaParts.join(" \u00b7 ")) + "</div>"
        : "") +
      notesHtml +
      (categoriesHtml || tagsHtml
        ? '<div class="tag-row">' + categoriesHtml + tagsHtml + "</div>"
        : "") +
      "</article>"
    );
  }

  function renderEmptyState(title, body) {
    els.resultsContainer.innerHTML =
      '<div class="state-message"><strong>' +
      escapeHtml(title) +
      "</strong>" +
      escapeHtml(body) +
      "</div>";
  }

  function renderErrorState(err) {
    els.resultsCount.textContent = "Error";
    els.resultsContainer.innerHTML =
      '<div class="state-message error"><strong>Could not load books.json</strong>' +
      escapeHtml(err && err.message ? err.message : String(err)) +
      "<br/><br/>Check that assets/books/books.json exists and is valid JSON, " +
      "and that you are serving this page over http(s) rather than opening it " +
      "directly as a file:// URL (fetch is blocked for local files in most browsers)." +
      "</div>";
  }

  // ------------------------------------------------------------------------
  // Filter state persistence
  // ------------------------------------------------------------------------

  function restoreFiltersFromStorage() {
    var stored = readStoredFilters();
    if (!stored) return;

    if (typeof stored.search === "string") {
      els.searchInput.value = stored.search;
    }
    if (Array.isArray(stored.categories)) {
      setSelectedValues(els.categoryFilter, stored.categories);
    }
    if (Array.isArray(stored.tags)) {
      setSelectedValues(els.tagFilter, stored.tags);
    }
    if (stored.groupBy) {
      els.groupBy.value = stored.groupBy;
    }
    if (stored.sortBy) {
      els.sortBy.value = stored.sortBy;
    }
  }

  function resetFilters() {
    els.searchInput.value = "";
    setSelectedValues(els.categoryFilter, []);
    setSelectedValues(els.tagFilter, []);
    els.groupBy.value = "none";
    els.sortBy.value = "recent";
    renderResults();
  }

  // ------------------------------------------------------------------------
  // Tag typeahead (simple filter of the tag <select> options)
  // ------------------------------------------------------------------------

  function applyTagTypeahead() {
    var query = els.tagTypeahead.value.trim().toLowerCase();
    var allTags = [];
    try {
      allTags = JSON.parse(els.tagFilter.dataset.allTags || "[]");
    } catch (e) {
      allTags = [];
    }

    var currentlySelected = getSelectedValues(els.tagFilter);
    var visibleTags = query
      ? allTags.filter(function (tag) {
          return tag.toLowerCase().indexOf(query) !== -1;
        })
      : allTags;

    els.tagFilter.innerHTML = "";
    visibleTags.forEach(function (tag) {
      var opt = document.createElement("option");
      opt.value = tag;
      opt.textContent = tag;
      opt.selected = currentlySelected.indexOf(tag) !== -1;
      els.tagFilter.appendChild(opt);
    });
  }

  // ------------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------------

  function cacheElements() {
    els.searchInput = document.getElementById("search-input");
    els.categoryFilter = document.getElementById("category-filter");
    els.tagFilter = document.getElementById("tag-filter");
    els.tagTypeahead = document.getElementById("tag-typeahead");
    els.groupBy = document.getElementById("group-by");
    els.sortBy = document.getElementById("sort-by");
    els.resultsContainer = document.getElementById("results-container");
    els.resultsCount = document.getElementById("results-count");
    els.resetFiltersBtn = document.getElementById("reset-filters-btn");
  }

  function bindEvents() {
    var debouncedRender = debounce(renderResults, SEARCH_DEBOUNCE_MS);

    els.searchInput.addEventListener("input", debouncedRender);
    els.categoryFilter.addEventListener("change", renderResults);
    els.tagFilter.addEventListener("change", renderResults);
    els.groupBy.addEventListener("change", renderResults);
    els.sortBy.addEventListener("change", renderResults);
    els.tagTypeahead.addEventListener("input", debounce(applyTagTypeahead, SEARCH_DEBOUNCE_MS));
    els.resetFiltersBtn.addEventListener("click", resetFilters);
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    loadBooks();
  });
})();

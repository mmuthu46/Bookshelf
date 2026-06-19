/* ==========================================================================
   books-config.js
   Builds a JSON snippet for a new book entry, and optionally commits it
   directly to GitHub via the REST API using an in-memory PAT.
   ========================================================================== */

(function () {
  "use strict";

  var DATA_PATH = "assets/books/books.json"; // path within the repo (no leading slash)
  var DATA_URL_RELATIVE = "../assets/books/books.json"; // path relative to this page, for local preview/dedupe check

  /**
   * In-memory only. Never persisted to localStorage/sessionStorage/cookies.
   * Cleared automatically on page reload since it's just a JS variable.
   */
  var sessionToken = "";

  var els = {};
  var lastGeneratedEntry = null;
  var existingBooksCache = null; // cache of books.json contents for dedupe checks

  // ------------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------------

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slugify(title) {
    return String(title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function isValidUrl(value) {
    try {
      var parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (e) {
      return false;
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

  function parseTagsInput(raw) {
    return String(raw || "")
      .split(",")
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);
  }

  function logApiStatus(message, isAppend) {
    if (isAppend) {
      els.apiStatusLog.textContent += "\n" + message;
    } else {
      els.apiStatusLog.textContent = message;
    }
    els.apiStatusLog.scrollTop = els.apiStatusLog.scrollHeight;
  }

  // ------------------------------------------------------------------------
  // Form -> entry object
  // ------------------------------------------------------------------------

  function clearFieldErrors() {
    els.errorTitle.textContent = "";
    els.errorUrl.textContent = "";
    els.errorYear.textContent = "";
  }

  function validateForm() {
    clearFieldErrors();
    var valid = true;

    var title = els.fieldTitle.value.trim();
    var url = els.fieldUrl.value.trim();
    var year = els.fieldYear.value.trim();

    if (!title) {
      els.errorTitle.textContent = "Title is required.";
      valid = false;
    }

    if (!url) {
      els.errorUrl.textContent = "URL is required.";
      valid = false;
    } else if (!isValidUrl(url)) {
      els.errorUrl.textContent = "Enter a valid http(s) URL.";
      valid = false;
    }

    if (year) {
      var yearNum = Number(year);
      if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
        els.errorYear.textContent = "Year must be a whole number between 1900 and 2100.";
        valid = false;
      }
    }

    return valid;
  }

  function buildEntryFromForm() {
    var title = els.fieldTitle.value.trim();
    var url = els.fieldUrl.value.trim();
    var author = els.fieldAuthor.value.trim();
    var publisher = els.fieldPublisher.value.trim();
    var yearRaw = els.fieldYear.value.trim();
    var license = els.fieldLicense.value;
    var categories = getSelectedValues(els.fieldCategories);
    var tags = parseTagsInput(els.fieldTags.value);
    var notes = els.fieldNotes.value.trim();

    var entry = {
      id: slugify(title),
      title: title,
      url: url,
    };

    if (author) entry.author = author;
    if (publisher) entry.publisher = publisher;
    if (yearRaw) entry.year = Number(yearRaw);
    if (categories.length) entry.categories = categories;
    if (tags.length) entry.tags = tags;
    if (license) entry.license = license;
    if (notes) entry.notes = notes;

    return entry;
  }

  // ------------------------------------------------------------------------
  // Dedupe check against currently loaded books.json (best-effort, local)
  // ------------------------------------------------------------------------

  function fetchExistingBooks() {
    if (existingBooksCache) {
      return Promise.resolve(existingBooksCache);
    }
    var url = DATA_URL_RELATIVE + "?cb=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      })
      .then(function (data) {
        existingBooksCache = Array.isArray(data.books) ? data.books : [];
        return existingBooksCache;
      })
      .catch(function () {
        existingBooksCache = [];
        return existingBooksCache;
      });
  }

  function findDuplicate(entry, books) {
    return books.find(function (b) {
      return b.id === entry.id || b.url === entry.url;
    });
  }

  // ------------------------------------------------------------------------
  // Snippet generation (primary path)
  // ------------------------------------------------------------------------

  function handleGenerateSnippet(event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    var entry = buildEntryFromForm();
    lastGeneratedEntry = entry;

    fetchExistingBooks().then(function (books) {
      var duplicate = findDuplicate(entry, books);
      var duplicateNoticeEl = els.duplicateNotice;

      if (duplicate) {
        duplicateNoticeEl.innerHTML =
          '<div class="notice warn">An entry with the same <strong>id</strong> or ' +
          '<strong>url</strong> already exists ("' +
          escapeHtml(duplicate.title) +
          '"). Pasting this snippet should <em>replace</em> that existing object ' +
          "in books.json rather than duplicate it. If you use the GitHub API " +
          "commit option below, it will automatically replace the existing entry." +
          "</div>";
      } else {
        duplicateNoticeEl.innerHTML =
          '<div class="notice success">No existing entry found with this id or URL — ' +
          "this will be a new addition.</div>";
      }

      els.snippetOutput.textContent = JSON.stringify(entry, null, 2) + ",";
      els.snippetSection.hidden = false;
      els.snippetSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleCopySnippet() {
    var text = els.snippetOutput.textContent;
    if (!navigator.clipboard) {
      // Fallback: select the text so the user can copy manually.
      var range = document.createRange();
      range.selectNodeContents(els.snippetOutput);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      var original = els.copySnippetBtn.textContent;
      els.copySnippetBtn.textContent = "Copied!";
      setTimeout(function () {
        els.copySnippetBtn.textContent = original;
      }, 1500);
    });
  }

  function handleClearForm() {
    els.bookForm.reset();
    clearFieldErrors();
    els.snippetSection.hidden = true;
    lastGeneratedEntry = null;
  }

  // ------------------------------------------------------------------------
  // GitHub REST API commit flow (optional path)
  // ------------------------------------------------------------------------

  function base64EncodeUtf8(str) {
    // Correctly handle UTF-8 content when base64-encoding for the GitHub API.
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
    );
  }

  function base64DecodeUtf8(b64) {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );
  }

  function githubApiUrl(owner, repo, path) {
    return (
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/contents/" +
      path
    );
  }

  function fetchCurrentFile(owner, repo, branch, token) {
    var url = githubApiUrl(owner, repo, DATA_PATH) + "?ref=" + encodeURIComponent(branch);
    return fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
      },
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (text) {
          throw new Error("GET books.json failed: HTTP " + resp.status + " — " + text);
        });
      }
      return resp.json();
    });
  }

  function putUpdatedFile(owner, repo, branch, token, newContentObj, sha, commitMessage) {
    var url = githubApiUrl(owner, repo, DATA_PATH);
    var body = {
      message: commitMessage,
      content: base64EncodeUtf8(JSON.stringify(newContentObj, null, 2) + "\n"),
      branch: branch,
    };
    if (sha) body.sha = sha;

    return fetch(url, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (text) {
          throw new Error("PUT books.json failed: HTTP " + resp.status + " — " + text);
        });
      }
      return resp.json();
    });
  }

  function handleCommitViaApi() {
    clearFieldErrors();

    if (!validateForm()) {
      logApiStatus("Form has validation errors. Fix them above before committing.");
      return;
    }

    var owner = els.fieldOwner.value.trim();
    var repo = els.fieldRepo.value.trim();
    var branch = els.fieldBranch.value.trim() || "main";
    var token = els.fieldToken.value.trim();

    if (!owner || !repo) {
      logApiStatus("Repo owner and repo name are required for the API commit path.");
      return;
    }
    if (!token) {
      logApiStatus("Paste a GitHub Personal Access Token to use this option.");
      return;
    }

    // Token stays only in this local variable for the duration of the call.
    sessionToken = token;

    var entry = buildEntryFromForm();
    lastGeneratedEntry = entry;

    els.commitApiBtn.disabled = true;
    logApiStatus("Fetching current books.json from " + owner + "/" + repo + "@" + branch + " …");

    fetchCurrentFile(owner, repo, branch, sessionToken)
      .then(function (fileData) {
        logApiStatus("Fetched current file (sha " + fileData.sha.slice(0, 7) + "). Parsing JSON…", true);

        var decoded = base64DecodeUtf8(fileData.content.replace(/\n/g, ""));
        var parsed = JSON.parse(decoded);

        if (!Array.isArray(parsed.books)) {
          parsed.books = [];
        }

        var duplicateIndex = parsed.books.findIndex(function (b) {
          return b.id === entry.id || b.url === entry.url;
        });

        var commitVerb;
        if (duplicateIndex !== -1) {
          parsed.books[duplicateIndex] = entry;
          commitVerb = "Update";
          logApiStatus("Found existing matching entry — it will be replaced.", true);
        } else {
          parsed.books.push(entry);
          commitVerb = "Add";
          logApiStatus("No existing match — appending as a new entry.", true);
        }

        parsed.updatedAt = new Date().toISOString();

        var commitMessage = commitVerb + " book: " + entry.title;
        logApiStatus("Committing to GitHub (" + commitMessage + ") …", true);

        return putUpdatedFile(owner, repo, branch, sessionToken, parsed, fileData.sha, commitMessage);
      })
      .then(function (result) {
        var commitSha = result && result.commit && result.commit.sha ? result.commit.sha.slice(0, 7) : "unknown";
        logApiStatus("Success. Commit " + commitSha + " pushed to " + branch + ".", true);
        logApiStatus(
          "Remember to revoke this token now if you no longer need it (GitHub → Settings → Developer settings → Personal access tokens).",
          true
        );
        existingBooksCache = null; // invalidate local dedupe cache
      })
      .catch(function (err) {
        logApiStatus("Error: " + (err && err.message ? err.message : String(err)), true);
      })
      .finally(function () {
        els.commitApiBtn.disabled = false;
        // Clear the in-memory token field/variable after the attempt.
        sessionToken = "";
        els.fieldToken.value = "";
      });
  }

  // ------------------------------------------------------------------------
  // Tag chip helper buttons
  // ------------------------------------------------------------------------

  function bindTagChipHelpers() {
    els.tagChipHelper.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-tag]");
      if (!btn) return;
      var tag = btn.getAttribute("data-tag");
      var current = parseTagsInput(els.fieldTags.value);
      if (current.indexOf(tag) === -1) {
        current.push(tag);
        els.fieldTags.value = current.join(", ");
      }
    });
  }

  // ------------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------------

  function cacheElements() {
    els.bookForm = document.getElementById("book-form");
    els.fieldTitle = document.getElementById("field-title");
    els.fieldUrl = document.getElementById("field-url");
    els.fieldAuthor = document.getElementById("field-author");
    els.fieldPublisher = document.getElementById("field-publisher");
    els.fieldYear = document.getElementById("field-year");
    els.fieldLicense = document.getElementById("field-license");
    els.fieldCategories = document.getElementById("field-categories");
    els.fieldTags = document.getElementById("field-tags");
    els.fieldNotes = document.getElementById("field-notes");

    els.errorTitle = document.getElementById("error-title");
    els.errorUrl = document.getElementById("error-url");
    els.errorYear = document.getElementById("error-year");

    els.snippetSection = document.getElementById("snippet-section");
    els.snippetOutput = document.getElementById("snippet-output");
    els.duplicateNotice = document.getElementById("duplicate-notice");
    els.copySnippetBtn = document.getElementById("copy-snippet-btn");
    els.clearFormBtn = document.getElementById("clear-form-btn");

    els.tagChipHelper = document.getElementById("tag-chip-helper");

    els.fieldOwner = document.getElementById("field-owner");
    els.fieldRepo = document.getElementById("field-repo");
    els.fieldBranch = document.getElementById("field-branch");
    els.fieldToken = document.getElementById("field-token");
    els.commitApiBtn = document.getElementById("commit-api-btn");
    els.apiStatusLog = document.getElementById("api-status-log");
  }

  function prefillRepoFieldsFromLocation() {
    // Best-effort guess for GitHub Pages URLs of the form
    // https://USERNAME.github.io/REPO/pages/books-config.html
    var host = window.location.hostname; // e.g. mmuthukumar462000.github.io
    var pathParts = window.location.pathname.split("/").filter(Boolean); // e.g. ["Bookshelf", "pages", "books-config.html"]

    if (host.endsWith(".github.io")) {
      var owner = host.replace(".github.io", "");
      els.fieldOwner.value = owner;
      if (pathParts.length > 0) {
        els.fieldRepo.value = pathParts[0];
      }
    }
  }

  function bindEvents() {
    els.bookForm.addEventListener("submit", handleGenerateSnippet);
    els.clearFormBtn.addEventListener("click", handleClearForm);
    els.copySnippetBtn.addEventListener("click", handleCopySnippet);
    els.commitApiBtn.addEventListener("click", handleCommitViaApi);
    bindTagChipHelpers();
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bindEvents();
    prefillRepoFieldsFromLocation();
  });

  // Clear any in-memory token if the page is hidden/unloaded, as a safety net.
  window.addEventListener("pagehide", function () {
    sessionToken = "";
  });
})();

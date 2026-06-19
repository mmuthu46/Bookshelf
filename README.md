# Bookshelf — Embedded Software & Motor Technology

A personal, static bookshelf for embedded software and motor control references.
No backend, no build step, no frameworks — just HTML/CSS/JS and a JSON data file,
designed to run on GitHub Pages.

- **Browse / search / filter:** `pages/bookshelf.html`
- **Add new entries:** `pages/books-config.html`
- **Data lives in:** `assets/books/books.json`

---

## 1. Repository layout

```
Bookshelf/
├── README.md
├── pages/
│   ├── bookshelf.html
│   └── books-config.html
├── css/
│   └── bookshelf.css
├── js/
│   ├── bookshelf.js
│   └── books-config.js
└── assets/
    └── books/
        └── books.json
```

---

## 2. Running locally

Because the pages use `fetch()` to load `books.json`, you need to serve the
files over HTTP — opening `bookshelf.html` directly as a `file://` URL will
fail in most browsers (fetch blocks local file access by default).

From the repo root, run a simple local server, for example:

```bash
# Python 3
python3 -m http.server 8000

# or Node (if you have it)
npx serve .
```

Then open:

```
http://localhost:8000/pages/bookshelf.html
```

---

## 3. Enabling GitHub Pages

1. Push this repository to GitHub (you already have
   `https://github.com/mmuthukumar462000/Bookshelf`).
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **`main`** and folder **`/ (root)`**, then **Save**.
5. After a minute or two, your site will be live at:

```
https://mmuthukumar462000.github.io/Bookshelf/pages/bookshelf.html
```

The configure page will be at:

```
https://mmuthukumar462000.github.io/Bookshelf/pages/books-config.html
```

---

## 4. Using the Bookshelf page

- **Search** — live, debounced search across title, author, publisher,
  categories, tags, and notes.
- **Categories / Tags** — multi-select filters (Ctrl/Cmd-click to select
  more than one). Leaving a filter empty means "show all."
- **Tag typeahead** — type into the tag search box above the tag list to
  narrow which tags are shown, then select from the filtered list.
- **Group by** — None, Year, or Category.
- **Sort by** — Title (A→Z), Year (newest first), or Recently Added
  (the order entries appear in `books.json`).
- Your last-used search/filter/group/sort settings are remembered in
  `localStorage` for next time you open the page. Use **Reset filters** to
  clear them.
- Each card title links out to the source `url` in a new tab.

---

## 5. Adding a new book entry

### Option A — Manual (recommended, always works)

1. Open `pages/books-config.html`.
2. Fill in the form (Title and URL are required).
3. Click **Generate JSON snippet**. The page will check whether an entry
   with the same `id` or `url` already exists and tell you so.
4. Copy the generated snippet (the **Copy to clipboard** button copies it
   with a trailing comma, ready to paste).
5. Open `assets/books/books.json` in the GitHub web editor or your local
   clone, paste the object into the `"books"` array, make sure the JSON is
   still valid (commas between objects, no trailing comma after the last
   item), and commit.
6. Refresh `bookshelf.html` — the cache-busting query string
   (`?cb=timestamp`) ensures you always see the latest data, not a cached
   copy.

### Option B — Optional: commit directly via the GitHub API

This lets you skip the manual copy/paste/commit step, at the cost of
needing a GitHub Personal Access Token (PAT) for one session.

1. On `books-config.html`, fill in the form as above.
2. Open the **"Advanced: Commit via GitHub API"** section.
3. Confirm/fill in **Repo owner**, **Repo name**, and **Branch** (these are
   pre-filled automatically when the page is served from
   `*.github.io/REPO/...`).
4. Create a token on GitHub:
   - Go to **GitHub → Settings → Developer settings → Personal access
     tokens → Fine-grained tokens**.
   - Scope it to **this repository only**.
   - Grant **Contents: Read and write** permission.
   - Set a short expiry (e.g. 1 day) since this is meant to be short-lived.
5. Paste the token into the **GitHub Personal Access Token** field.
6. Click **Commit via GitHub API**. The page will:
   - `GET` the current `assets/books/books.json` (to read its `sha`),
   - merge your new entry in memory (replacing any existing entry with the
     same `id` or `url`, otherwise appending),
   - `PUT` the updated file back to GitHub with a commit message like
     `Add book: <title>` or `Update book: <title>`.
7. Watch the status log under the button for progress and any errors.
8. **Revoke the token** from GitHub's Developer settings once you're done,
   even though it expires on its own.

**Token handling:** The PAT is stored only in a local JavaScript variable
for the lifetime of the page. It is never written to `localStorage`,
`sessionStorage`, or cookies, and it is only ever sent directly from your
browser to `api.github.com` over HTTPS. Reloading or closing the tab
discards it. After each commit attempt (success or failure), the in-memory
variable and the password field are cleared automatically.

---

## 6. Data model — `assets/books/books.json`

```json
{
  "updatedAt": "2026-06-19T00:00:00.000Z",
  "books": [
    {
      "id": "stable-slug-from-title",
      "title": "Required title",
      "url": "https://required-url.example.com",
      "author": "Optional author",
      "publisher": "Optional publisher",
      "year": 2024,
      "categories": ["Embedded", "Motor Control"],
      "tags": ["FOC", "SVPWM", "PMSM"],
      "license": "Link-only",
      "notes": "Optional short description."
    }
  ]
}
```

Field notes:

- `id` — lowercase, hyphenated slug derived from the title. Used for
  dedupe checks alongside `url`.
- `categories` — intended values: `Embedded`, `Motor Control`,
  `Power Electronics`, `Real-Time`, `Safety`, `AI-on-Embedded`. You can add
  more; just also add them as `<option>`s in both HTML pages if you want
  them to show up in the filter/category dropdowns.
- `tags` — free-form; the bookshelf page automatically collects every tag
  used across all entries to populate the tag filter and typeahead, so no
  separate tag list needs to be maintained.
- `license` — free text describing how the source may be used/linked
  (e.g. `Link-only`, `Open Access`, `CC-BY`).

---

## 7. Extending categories or tags

- **Tags** require no code changes — just use a new tag string on an
  entry and it will automatically appear in the bookshelf's tag filter.
- **Categories** are a fixed list in the UI (so they can be presented as
  clean checkboxes/multi-select rather than an open-ended list). To add a
  new category:
  1. Add a new `<option>` to the category `<select>` in
     `pages/bookshelf.html` (id `category-filter`).
  2. Add the same `<option>` to `pages/books-config.html` (id
     `field-categories`).
  3. Use the new category string in your `books.json` entries.

## 8. Customizing the look

All styling lives in `css/bookshelf.css`, using CSS variables defined at
the top of the file (`--bg`, `--card`, `--border`, `--text`, `--muted`,
`--accent`, …). Change the variable values to retheme the whole site
without touching any HTML or JS.

---

## 9. Troubleshooting

**"Could not load books.json" / fetch fails locally**
You're probably opening the HTML file directly (`file://...`) instead of
through a local web server. See [Section 2](#2-running-locally).

**Changes to `books.json` don't show up after committing**
The bookshelf page appends `?cb=<timestamp>` to the fetch URL specifically
to avoid browser/CDN caching, so this is usually a propagation delay on
GitHub Pages (can take a minute or two after a push) rather than a caching
problem on the client side. Hard-refresh and wait briefly.

**JSON syntax errors after manually editing `books.json`**
Common mistakes:
- Trailing comma after the last object in the array.
- Missing comma between two objects.
- Unescaped quotes inside a `notes` string.
Paste the file into any JSON validator (or run `python3 -m json.tool
assets/books/books.json` locally) to find the exact line.

**GitHub API commit fails with HTTP 401/403**
- The token may be expired, revoked, or missing the `Contents: Read and
  write` permission for this repository.
- Fine-grained tokens must be scoped to the correct repository — double
  check **Repo owner**/**Repo name** in the Advanced panel match exactly.

**GitHub API commit fails with HTTP 409 (conflict)**
Someone (or another tab) updated `books.json` between your `GET` and
`PUT`. Just click **Commit via GitHub API** again — it will re-fetch the
latest `sha` first.

**CORS errors referencing `raw.githubusercontent.com`**
This project does not use `raw.githubusercontent.com` at all — the
bookshelf page reads `books.json` from the same repository/site it's
served from (a relative path), and the optional commit flow talks to
`api.github.com` directly, which supports CORS for browser requests. If you
see a CORS error, double check you haven't changed `DATA_URL` in
`js/bookshelf.js` to point at a different host.

---

## 10. Security notes

- This is intended as a **single-user/admin** tool — there is no
  authentication on the bookshelf or configure pages themselves; anyone
  who can view the page can use the form. The only credential involved
  (the GitHub PAT) is supplied by you at runtime and never persisted.
- All text rendered from `books.json` is HTML-escaped before insertion
  into the page to avoid XSS via malicious data, and link `href`s are
  validated to be `http`/`https` before being rendered.
- Keep your PAT scoped narrowly (this repo only, contents read/write) and
  short-lived, and revoke it after use.

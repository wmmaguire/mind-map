# Contributing

## Commit messages (`.gitmessage`)

This repo includes a **commit template** (`.gitmessage`) with a short **subject**, optional **body**, and an **issue** line so commits stay easy to scan and link to GitHub.

### Per-repo (this clone only)

From the repository root:

```bash
git config commit.template .gitmessage
```

### Global (all repositories on this machine)

Git can use **one template file for every repo** via `commit.template` in your **global** config. The path must be **absolute** (not relative to each repo).

**1.** Put a shared copy where you keep dotfiles, e.g.:

```bash
mkdir -p ~/.config/git
cp /path/to/mind-map/.gitmessage ~/.config/git/commit-template.txt
```

**2.** Point Git at it globally:

```bash
git config --global commit.template ~/.config/git/commit-template.txt
```

**3.** Override per repo when needed:

```bash
cd /path/to/some-repo
git config commit.template .gitmessage   # local wins over global for this repo
```

When you run `git commit` (no `-m`), your editor opens with that template. **Only lines starting with `#` are dropped** from the saved message—write the real **subject on line 1**, optional **body** after a blank line, then a line such as `Refs: #42` or `Fixes: #42` (that issue line must **not** start with `#`).

- **`Refs:`** — links the commit to the issue.  
- **`Fixes:`** / **`Closes:`** / **`Resolves:`** — same link, and GitHub **closes** the issue when the commit lands on the default branch.

---

## GitHub issue templates (`.github/`)

Templates live in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). Each template asks for **Problem statement**, **Proposed solution**, **Validation steps**, and **Dependencies**.

### Can `.github` be global?

**No.** GitHub reads issue and PR templates only from **each repository’s** `.github` directory (on the default branch). There is no account-wide or org-wide “single `.github` folder” that replaces per-repo templates.

**Ways to reuse the same templates across repos:**

- **Copy** (or `rsync`) `.github/` when you bootstrap a new repo.  
- **Symlink** from a dotfiles repo (each clone resolves the symlink; contributors need the same layout or real files).  
- **Script** or **cookiecutter** that copies standard `.github` into new projects.  
- **Organization template repository** (GitHub feature for new repos only—“Use this template”—not automatic sync for existing repos).

Labels referenced in YAML (e.g. `bug fix`, `Priority Level- MEDIUM`) must **exist** on that GitHub repo or creation may warn or skip labels.

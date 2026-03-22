# Contributing

## Commit messages

This repo includes a **commit template** (`.gitmessage`) with a short **subject**, optional **body**, and an **issue** line so commits stay easy to scan and link to GitHub.

**Enable it once per clone:**

```bash
git config commit.template .gitmessage
```

When you run `git commit` (no `-m`), your editor opens with that template. **Only lines starting with `#` are dropped** from the saved message—write the real **subject on line 1**, optional **body** after a blank line, then a line such as `Refs: #42` or `Fixes: #42` (that issue line must **not** start with `#`).

- **`Refs:`** — links the commit to the issue.  
- **`Fixes:`** / **`Closes:`** / **`Resolves:`** — same link, and GitHub **closes** the issue when the commit lands on the default branch.

## Issues

Use the templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) when opening issues. Each template asks for **Problem statement**, **Proposed solution**, **Validation steps**, and **Dependencies**.

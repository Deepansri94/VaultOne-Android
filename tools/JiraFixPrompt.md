You are working on the VaultOne project (multi-file modular structure: index.html, iVault.html/js, FamilyVault.html/js, PasswordVault.html/js, shared.js, shared.css).

Read the Sprint issues from: jira_stories.json (filter by "sprint": "Sprint X")

For each issue in the sprint:
1. Create a git branch named: release/sprint-X (e.g. release/sprint-4)
2. Analyse all files for JavaScript errors (undefined variables, missing awaits, wrong DB references, null access) and HTML tag errors (unclosed tags, missing attributes, invalid nesting)
3. Fix each issue per its description and acceptance criteria
4. After fixing, run: git add . && git commit -m "fix(VO-XX): <title>"
5. Report: branch name, issues fixed, errors found and resolved

# Protect main during debugging

The adjacent [protect-main.json](protect-main.json) is an importable GitHub
branch ruleset. Importing the file prepares a rule; clicking Create activates
it. Merely adding this JSON to the repository does not activate protection.

This is a temporary freeze matching Cam's request to preserve the current
main branch while reviewing and transposing changes later.

| Setting | Effect |
| --- | --- |
| Target `refs/heads/main` | Applies only to main |
| Enforcement `active` | Enforces the rules after creation |
| Restrict updates | Blocks updates, including pull-request merges |
| Bypass list empty | No actor is granted a bypass by this ruleset |
| Restrict deletions | Prevents deleting main |
| Block force pushes | Prevents rewriting main through a force push |

Work can continue on other branches and in draft pull requests. To transpose
approved edits onto main later, an administrator will first need to deliberately
edit or disable the update restriction. Administrators can edit repository
rulesets, so this file does not make the repository owner unable to administer
the repository.

## Import

1. Download `protect-main.json`.
2. Open the repository's Settings → Rules → Rulesets.
3. Select New ruleset → Import a ruleset, then select the JSON file.
4. Review the main target, Active enforcement and empty bypass list.
5. Click Create when ready to activate the freeze.

Repository settings link:
https://github.com/cammaxwel-droid/CLANKv7/settings/rules

The JSON was checked for syntax and against the documented branch-ruleset
fields. It has not been imported into the live repository or server-validated.
The file uses no review counts, required check names, actor IDs or account-
specific bypass assumptions.

Official references:

- https://docs.github.com/en/rest/repos/rules
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository

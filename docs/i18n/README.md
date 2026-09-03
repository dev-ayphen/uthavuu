# Tamil review

The mobile app ships 697 Tamil strings. **None has been read by a Tamil speaker.**
They were machine-generated and matched against terms already used elsewhere in
the app, which makes them grammatical enough to look finished — the reason a
review is needed rather than a spot-check.

`libs-mobile/i18n/index.ts` carries the same warning at the code, plus the list
of strings that are English *on purpose*.

## Running a review

```bash
node scripts/i18n-review-export.mjs        # -> docs/i18n/tamil-review.csv
# send the CSV to the reviewer with the brief
node scripts/i18n-review-import.mjs reviewed.csv          # dry run, reports what would change
node scripts/i18n-review-import.mjs reviewed.csv --write  # apply
```

The export carries what the catalogues cannot: the English source, the screen
each string appears on (resolved for ~74% of keys by grepping `t()` call sites),
and a priority tier. The reviewer fills one column.

## Priority tiers

The rows are sorted so a partial review is still worth having.

| Tier | Count | What |
|---|---|---|
| `0-LEGAL-PRO` | 3 | Terms, privacy, guidelines. **Not for a general translator** — legal meaning, needs a legal translator. Left in English deliberately. |
| `1-SAFETY` | 257 | Accept, confirm, mission chat, phone reveal, expiry, cancel, report, block. Where a misreading changes what someone *does*. |
| `2-CORE` | 282 | Auth, posting a request, request details, the tabs. |
| `3-SECONDARY` | 155 | Settings, profile, tickets, invites. |

## Why the import is a script

A reviewer returns a spreadsheet; hand-copying 200 Tamil strings loses both
accuracy and EN/TA parity. The importer refuses anything that would break the
app rather than applying it:

- a `{{placeholder}}` dropped or renamed — the string would render with a literal gap;
- a key that no longer exists — reviews lag the code;
- English that changed since export — the reviewer translated a sentence the app
  no longer shows, so the row needs re-reviewing rather than importing.

It re-checks EN/TA key parity after writing and exits non-zero if it broke.
Dry run is the default; `--write` is explicit.

## Five strings are identical to English and correct

`common:charCount`, `tickets:charCount`, `tickets:ticketRef` and two `rowLabel`
accessibility strings are pure interpolation with no words in them. A `ta == en`
audit counts them as untranslated. With the three legal bodies, the expected
count for that audit is **8** — see `libs-mobile/i18n/index.ts`.

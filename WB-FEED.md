# Controlled official-source collection feed — not yet enabled

Collection notices appear on the existing daily page. Their pending count stays separate from reviewed policies and announcements. The initial snapshot and review list are empty. The offline HTML makes no remote-feed request. Presence of this workflow is not evidence of GitHub permission, a successful schedule, publication, formal acceptance or database registration.

## Fixed paths and authority

WB uses an independent new clone with its existing Git authentication. It may submit **only** `feed/submission.json` on `wb-feed-inbox`. The submit CLI supports dry-run by default; `--apply` initializes the independent data workspace, commits that one JSON blob and performs an ordinary fast-forward push. Existing paths, arbitrary remotes/refs, force pushes, system-secret extraction and code submission are not supported.

```
python3 tools/wb_feed_runtime.py submit /path/to/new-independent-clone /path/to/submission.json
python3 tools/wb_feed_runtime.py submit /path/to/new-independent-clone /path/to/submission.json --apply
```

These placeholders are local arguments, not demonstration data to publish. No production fixture is supplied. Tests inject synthetic HTML into Python functions; the production CLI has no simulation or skipped-network switch.

Trusted main runs the pinned workflow on its exact event SHA. Only `schedule` and main `workflow_dispatch` are eligible. Inbox data are read by commit/blob; **no data-branch checkout, import, script or workflow is executed**. Fixed regular-file trees are required. The job token is used only through the Git subprocess environment and is not written to credentials files. The worker commits only `feed/state.json` and `feed/live.json` to `wb-feed-live`, with ordinary pushes, concurrency rejection and remote commit readback. Branch rules and WB permissions still require independent live verification; code alone cannot restrict a broadly privileged account.

The front end reads only:
`https://raw.githubusercontent.com/xuqinnn/energy-storage-policy/wb-feed-live/feed/live.json`

## Submission contract

Top-level exact keys: `schema` (integer 1), `batch_id` (`WB-YYYYMMDD-NNN`), `mode` (`daily` or `backfill`), `created_at` (RFC3339 UTC or +08:00), `items` (1–4). Each item has exactly:

`id`, `category`, `title`, `issuer`, `source_url`, `published_date`, `publication_evidence`, `collected_at`, `source_sha256`, `source_excerpt`.

The ID is `wb_` plus the first 20 lowercase SHA256 digits of the canonical HTTPS source URL. Category is policy or notice. The visible publication date must be a full valid date with an explicit publication label, not an issuing/effective date, URL month or hidden metadata substitute. Daily means today, yesterday and the day before in Shanghai, **not rolling 72 hours**. Backfill permits date age at most 30 days and is visibly marked historical. Publication cannot follow collection; collection cannot follow batch creation or now. A receipt older than 48 hours goes to manual processing; never alter timestamps to claim punctual work.

Only official `gov.cn` HTTPS HTML is eligible initially. Every redirect and DNS answer is checked; private, loopback, link-local or mixed addresses, cross-host redirects, credentials/ports/fragments, compressed/non-HTML/oversize responses and login/challenge/error pages fail closed. Header/meta/BOM charset evidence is explicit; encoding is not guessed. A 200 response is insufficient. The exact document heading, issuing body, visible publication evidence and short excerpt must match. Whitespace/HTML-entity normalization is disclosed. Hidden/script/navigation text does not establish those facts. This parser is conservative and is not a browser CSS/visual proof; unsupported sites go to manual review.

The server records WB's source SHA and the actual fetched SHA separately. Different bytes can only produce a **pending** item when all listed facts still match; this is not an original-byte match or content acceptance. Input text with markup, controls, private paths or secret/company-internal markers is rejected. Unknown keys, duplicate keys, malformed dates, booleans posing as integers and duplicate IDs do not gain acceptance.

Trusted main original-source URLs and document titles prevent duplicate collection. A known URL with a different title is a manual identity conflict. Associated interpretations/reports are not promoted into original-source roles. Same title/body/date at another URL is flagged for duplicate/reprint review, including when the trusted snapshot has no verified issuer. Draft and formal documents with different titles/URLs remain distinct. This is a bounded identity gate, not a full national duplicate search.

At most 12 new IDs per Shanghai day; updates retain distinct record hashes and history. A separate daily ledger survives history truncation. Current records retain at most 90 calendar dates / 600 IDs; bounded history and receipts retain at most 2,400 entries. Identical batches/records are idempotent and do not refetch unchanged sources. Partial acceptance is reported per item; a failed item is never silently repaired or called accepted.

## Version-bound next-day review

Only trusted main owns `content/wb-feed-reviews.json`, exact schema `{schema:1,reviews:[]}`. Reviews bind `id` **and** `record_sha256`; old acceptance does not apply to new content. Status is accepted, corrected or withdrawn. Corrections need a plain-text note and a nonempty correction object restricted to title, issuer, publication date, category and excerpt. Source URL/record hash cannot be overwritten. Withdrawal needs a note and hides the old body. A formal ID link must already exist in trusted main data. A reviewed feed item still does not alter formal-policy counts or write the workbook.

Review scheduling, inbox credentials, one-time approved bootstrap and branch permissions are configured separately by the product owner. No existing schedule is modified by these scripts. Workbook registration remains independent-source review → propose/accept → health/mirror/site chain. Retrospective backlog is not presented as on-time execution.

## Reproduce / recover

```
python3 -m unittest discover -s tests -p 'test_wb_feed.py' -v
node tests/test_wb_feed.js
```

Tests use temporary bare repositories, explicit injected synthetic HTML and no external publication. Live GitHub authentication, branch rules, workflow permission, real page compatibility and browser CORS/network must be checked before enabling. If credentials or permissions fail, report blocked; do not extract a replacement secret or push another ref. To stop, disable the workflow; correct or withdraw through trusted main, or restore data by an ordinary reviewed commit. Never force-push or overwrite unrelated work.

GitHub schedule may be delayed; availability does not promise exact minute delivery. The pinned checkout is v7.0.1, not a claim of the latest version. See [checkout source](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1) and [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

If an ordinary push was attempted but confirmation is lost, the CLI fails closed with `publication_state=unknown`, nullable publication flags and the attempted commit. It does not report “not published”. Reconcile the fixed remote ref before retrying; an idempotent later run reports the observed live commit without claiming a new publication.

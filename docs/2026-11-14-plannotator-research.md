# Plannotator: research report

Date: 2026-11-14. Sources: official site + docs, GitHub repo (cloned at commit `e8e7523`, v0.28.64, 2026-11-13), GitHub API, HN (Algolia), Product Hunt, third-party reviews.

Legend: **[V]** verified from source/docs/API. **[I]** inferred.

Repo snapshot kept at `/private/tmp/claude-501/-Users-salezica-projects-tie/d94f12cb-1d6d-4104-b6b1-432855de6b7a/scratchpad/plannotator-src/repo` (file paths below are relative to it).

---

## 1. What it is

- **One-liner [V]:** local, browser-based review surface for coding agents. Agent proposes a plan / finishes work / produces HTML → UI opens → human annotates → structured feedback returns to the agent session.
- **Scope today [V]:** plan review (hooked), document annotation (md/mdx/txt/config files/URLs/folders/HTML), code review (git, GitButler, jj, p4, GitHub PR, GitLab MR), agent "last message" annotation, agent questions (cards), Inbox (async multi-agent message surface + MCP), Guided Reviews/Code Tours, Ask AI, VS Code / Zed / Obsidian / Bear / Octarine / Notion integrations, TUI variant (Herdr Annotate, `plannotator-tui`).
- **Target users [V/I]:** solo developers steering CLI agents; teams via waitlisted hosted "Workspaces".
- **History [V]:**
  - Dec 28 2025: repo created. Dec 29 2025: Show HN + Product Hunt ("Annotate, review, and share Claude Code plans. (Plugin/Hook)").
  - Jan 3 2026: author blog post (Mike Ramos, GitHub `backnotprop`, HN `ramoz`). Motivation: plan mode is the lever; plan UX "somewhat lacking". He also filed the Claude Code hooks feature request the tool relies on.
  - Early 2026: license moved BSL 1.1 → MIT OR Apache-2.0 (Product Hunt forum "Fully Open Source Licensed"; old BSL note still echoed on news.hada.io).
  - Feb 2026: plan diff. Apr 2026: annotate any doc/URL/folder. Jul 2026: code review launch. Oct–Nov 2026: Inbox.
- **Maintainers [V]:** `backnotprop` (Mike Ramos) lead; ~190 contributors (GitHub API pagination); org accounts `backnotprop-workspaces`, `ramos-plannotator`.
- **License [V]:** `MIT OR Apache-2.0` (package.json; LICENSE-APACHE + LICENSE-MIT). GitHub API reports Apache-2.0.
- **Pricing [V]:** OSS free. "Workspaces" hosted team layer: waitlist, no public pricing. HN comment: contributors get lifetime free access to paid tier.
- **Repo [V]:** https://github.com/backnotprop/plannotator. 10,529 stars, 790 forks, 212 open issues, pushed 2026-11-14. Release cadence: near-daily patch releases (v0.28.57–64 within Nov 9–13).
- **Tech stack [V]:** Bun monorepo (`apps/*`, `packages/*`), TypeScript, React + Vite + Tailwind, `@base-ui/react`, CodeMirror 6 (editing, `@codemirror/merge`), `@pierre/diffs` (diff rendering), `@plannotator/web-highlighter` (fork of web-highlighter for cross-element text selection), `marked`, `dompurify`, `katex`, `mermaid`, `@viz-js/viz` (Graphviz), `perfect-freehand` (image drawing), `diff` (line diffs), `motion`, `lucide-react`, `dockview-react`, `@anthropic-ai/claude-agent-sdk`, `@opencode-ai/sdk`. Compiled single binary `plannotator` (Bun). Playwright e2e. Quint (`spec/*.qnt`) formal specs for inbox lifecycle. ADRs under `adr/`.
- **Platforms [V]:** macOS, Linux, WSL, Windows (PowerShell installer; Codex hooks not on Windows).

## 2. Feature surface

### Plan review [V]
- Automatic: Claude Code `ExitPlanMode`; Copilot CLI `exit_plan_mode`; Gemini CLI `BeforeTool` on `exit_plan_mode`; Codex `Stop` hook (experimental); OpenCode `submit_plan` tool; Pi extension plan mode; DeepSeek Harness, Qwen Code, Mistral Vibe plugins. Amp / Droid / Kiro: manual commands only.
- Decisions: **Send Feedback** (request changes), **Approve**, **Approve with Notes** (where transport allows), **Close** (dismiss), **Cancel** (back to review).
- Approval can set Claude Code **permission mode** for execution (`updatedPermissions: setMode`).
- Revisions: each submission saved; resubmission shows `+N/-M` change badge; **Rendered** diff (green added / red strikethrough removed / yellow modified blocks, annotatable) and **Raw** (`+`/`-` lines); Version Browser to pick any base. Feedback on changed blocks tagged as diff content (`diffContext`).
- Plan grouping key: first heading + date + project → `~/.plannotator/history/<project>/<slug>/`. Decisions archive: `~/.plannotator/plans/`; `plannotator archive`.
- Non-blocking mode on Claude Code ≥ 2.1.287 ("the mod") and Pi: agent ends turn; decision arrives as a later message.
- `plannotator annotate plan.md --gate` adds Approve to any doc.

### Annotation types (documents/plans) [V]
- `COMMENT` (anchored to selected text), `DELETION` ("Remove this"), `GLOBAL_COMMENT` (sidebar, whole document), **Quick label** (preset chip; optional `tip` instruction injected into feedback), **Looks good** (👍 label), **Direct Markdown edit** (CodeMirror editor; exported as unified diff; `Cmd+S` saves eligible local files atomically and marks changes "already applied"), **Replies** (`inReplyTo`), **Image attachments** (paste/upload; draw pen/arrow/circle), **Image region comments**, **Diagram-part comments** (Mermaid/Graphviz node anchors), **Math** targets, **Pinpoint mode** (HTML: pick element by position; CSS selector + fingerprint anchor), **Question cards** (`:::question`, `:::question-multi`, `:::question-text` directives; answers exported first).
- Insert/replace as distinct types: **not** present (contrast open-plan-annotator which has strike/replace/insert/comment). Replacement = comment text or direct edit.
- Default quick labels (`packages/ui/utils/quickLabels.ts`): Clarify this, Missing overview, Verify this, Give me an example, Match existing patterns, Consider alternatives, Ensure no regression, Out of scope, Needs tests, Looks good. Stored in cookies (survive port changes).
- Conventional Comments labels/decorations typed for code review (`praise|nitpick|suggestion|issue|…`, `blocking|non-blocking|if-minor`).

### Code review [V]
- Launch: `/plannotator-review`, `plannotator review [--git|--gitbutler] [DIR|PR_URL] [--patch-file x.diff]`.
- Git default view "All changes" (merge-base vs working tree incl. untracked); other scopes: uncommitted, staged, unstaged, last commit, specific commit, HEAD files, branch. Stage/unstage, mark viewed, commit-history rail. jj views: Current/Last/Line/Evolution/All. p4 changelists. GitButler workspace/stack/branch.
- Annotations: `CodeAnnotation` scope `line|file|general`, type `comment|suggestion|concern`, `suggestedCode`, `side: new|old`. PR comment/thread annotations.
- Side-by-side or unified; file tree; search; semantic diff; Call Flow analysis; Ask AI on selection; AI review agents (local CLI, read-only, post findings as external annotations); Guided Review / Code Tour; PR artifacts gallery; post review to GitHub/GitLab instead of agent (Alt twice toggles destination).
- Feedback: "structured file and line references" + configurable denied suffix ("Validate each submitted finding against the code and report your verdict before changing anything.").

### Other [V]
- `/plannotator-annotate <file|dir|url> [--render-html|--markdown|--no-jina]`; `/plannotator-last`.
- Folders: file browser, linked `.md`/`[[wiki]]` navigation, combined feedback across files; `node_modules/dist/build` skipped. 2 MiB per-file cap. Bare `.env` and source files excluded.
- URL annotation via Jina Reader (public) or direct fetch + Turndown.
- HTML: sandboxed iframe; scripts run (network not blocked, warned); asset route restricted to file's directory, symlink escapes refused.
- Sharing (deprecated): small md → compressed URL fragment (unencrypted); large/HTML → AES-256-GCM in browser, ciphertext to paste service, key in fragment, 7-day expiry; self-hostable; `PLANNOTATOR_SHARE=disabled`.
- Inbox: `plannotator inbox`; threads per agent session grouped by project; question cards; files; guided reviews; MCP server `plannotator inbox mcp` (`wait_for_reply`, `read_thread`); Claude/Pi/OpenCode replies become next turn when idle; Tailscale Serve publishing.
- Editor/notes: VS Code extension (plans in editor tabs, diff view, selection → review via IPC registry `~/.plannotator/vscode-ipc.json`), Zed open, Obsidian/Bear/Octarine/Notion save with frontmatter/tags.
- Embedded agent terminal in annotate mode (WebTUI, xterm.js + node-pty via Node sidecar; ADR 0002), disabled in remote sessions.
- Vim controls (opt-in). Keyboard: `Cmd+Enter` submit, `Cmd+S` save/export, `Cmd+B` sidebar, `Esc`, label picker digits, `Shift Shift` terminal, `Alt` hold/twice for Select↔Pinpoint, code review `V` viewed, `A` stage, `J/K` files, `X/Z` collapse. ~30 themes (Catppuccin, Dracula, Nord, Gruvbox…).
- Mobile: dedicated phase work (Aug 2026 ADR research): phone shells for Plan and Code Review over Tailscale HTTPS; touch selection semantics were the hard part.
- Uninstall: `plannotator uninstall [--purge]`, extensive safety rules.

## 3. Agent protocol (exact)

### Claude Code plugin manifest [V] (`apps/hook/hooks/hooks.json`)
```json
{
  "modules": ["./mod/register.ts"],
  "hooks": {
    "PreToolUse": [{ "matcher": "EnterPlanMode",
      "hooks": [{ "type": "command", "command": "plannotator improve-context", "timeout": 5 }] }],
    "PermissionRequest": [{ "matcher": "ExitPlanMode",
      "hooks": [{ "type": "command", "command": "plannotator", "timeout": 345600 }] }],
    "SessionStart": [{ "matcher": "compact",
      "hooks": [{ "type": "command", "command": "<prints $PLANNOTATOR_INBOX_REMINDER>", "timeout": 5 }] }]
  }
}
```
- Timeout 345600 s = 4 days: the hook process is the wait.
- `PreToolUse` on `EnterPlanMode` returns `{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext": "..."}}` from `~/.plannotator/hooks/enterplanmode-improve` (user-authored plan-quality instructions) or exits 0 silently.
- Skills (`~/.claude/skills/plannotator-{review,annotate,last}`) are the slash commands; they call the binary. Binary is installed separately (`install.sh`).

### Classic (blocking) flow [V] (`apps/hook/server/index.ts` ~3395–3580)
1. `plannotator` with no args reads the hook event JSON from stdin. Detects harness: Gemini sends `plan_filename` (reads `<projectTempDir>/<session_id>/plans/<file>`); Qwen inline; Claude: `resolveClaudePlan(tool_input)` prefers `tool_input.planFilePath` (absolute `.md`, regular file ≤ 2 MiB) over inline `tool_input.plan` because the inline snapshot can be stale when the model edits the file and calls ExitPlanMode in the same message (fixed in CC 2.1.285).
2. `startPlannotatorServer({plan, origin, planFilePath, permissionMode, historyRoot: CLAUDE_PROJECT_DIR, ...})` → Bun HTTP server on random loopback port → opens browser → `registerCliSession()` writes `~/.plannotator/sessions/<pid>.json` `{pid, port, url, mode, project, startedAt, label, hostSession?, target?}`.
3. `await server.waitForDecision()` (promise resolved by `POST /api/approve` or `POST /api/deny`); `Bun.sleep(1500)` so the tab can render completion; `server.stop()`.
4. Output to stdout:
```jsonc
// approve
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{
  "behavior":"allow",
  "updatedInput": { ...tool_input, "plan": planContent },   // CC ≥2.1.199 drops an allow for ExitPlanMode without updatedInput
  "updatedPermissions":[{"type":"setMode","mode":"acceptEdits","destination":"session"}] // optional
}}}
// deny
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{
  "behavior":"deny",
  "message": "Revise the plan, address every item below, then call ExitPlanMode again.\n\n<feedback markdown>"
}}}
```
- Approval notes cannot ride a Claude Code allow (no message channel) → "Approve with Notes" unavailable in classic CC flow; UI warns before discarding unsent feedback.
- Plan review off: `PLANNOTATOR_PLAN_REVIEW=0` → hook exits 0 with no output → Claude's own dialog.

### The "mod" (non-blocking, CC ≥ 2.1.287) [V] (`apps/hook/hooks/mod/*`)
- A Claude Code **hooks module** (`modules` in hooks.json): JS loaded in-process with an engine object `$` exposing `on('tool.call'|'classic.PermissionRequest'|'command.run'|'prompt.submit'|'turn.start'|'turn.step'|'turn.complete'|'session.start'|'session.end'|'session.compact'|'tool.check'|'ui.render')`, `$.tool.register`, `$.prompt.submit({text})`, `$.process.run` (10-min cap), `$.fs`, `$.store`, `$.session.cwd()/version()`, `$.plugin.root`.
- `tool.call` on `ExitPlanMode` (main loop only; subagents keep classic):
  - `planCallAction(hash, state)` → `start` | `revise` | `pass-approved`.
  - `start`: returns `{deny: waitingDenyText}` immediately: *"Plan v1 is open in Plannotator for the user's review (url). It is NOT approved. Stay in plan mode and do not implement. End your turn. The user's decision will arrive as a message from the plannotator plugin. Until then you may answer questions, and you may revise the plan by calling ExitPlanMode again."* Then launches `plannotator claude-mod-plan` **detached** via a tiny shell wrapper (`nohup "$@" < dir/stdin > dir/stdout 2> dir/stderr &`), because `$.process.run` cannot hold a review open.
  - `revise`: writes `revision.json` into the launch dir; server picks it up, same tab updates, comments preserved; returns `revisedDenyText`.
  - `pass-approved`: plan hash equals approved text → `next(e)`; `classic.PermissionRequest` for that call answers `{behavior:'allow', updatedInput:{...,plan: approved}, updatedPermissions?}`.
- Launch directory protocol (`~/.plannotator/claude-code-mod/<session>/…`): files `stdin`, `ready` (`{url,isRemote,port,target?}`), `result.json` (`PLANNOTATOR_HOST_RESULT_FILE`, atomic temp+rename), `pid`, `exit`, `revision.json(.ack)`, `messages.json`, `watcher.json` (lease/heartbeat so one of several CC processes on the same session delivers), `settled/by` (mkdir claim), `feedback.md` (overflow when message > 12 KiB: Claude is told to read the file). **No listener: the mod polls these files on a timer.**
- Host result record (`apps/hook/server/host-result.ts`):
```ts
{ v:1, surface:'plan'|'review'|'annotate'|'annotate-last',
  decision:'approved'|'annotated'|'dismissed'|'denied'|'answered',
  message:string, noop:boolean, annotationCount?, withNotes?, approvedPlan?, permissionMode?,
  closedBy?:'agent', unsentAnnotations?, documents?, target? }
```
- Delivery: `$.prompt.submit({text: message})` (origin `plannotator`), which waits for the session to be idle — the decision becomes a **plugin turn**, never interrupting a running turn. Plan approval message appends: *"Call ExitPlanMode once more with the approved plan, without editing the plan file first; it will be allowed."*
- Also registers a `plannotator` **tool** (Claude can open annotate/review/last itself; returns "Opened …" immediately), takes over Bash calls of `plannotator annotate|review|last`, answers `/plannotator-*` commands itself, and runs "Ask this session" (reviewer's Ask AI question → `$.prompt.submit` → streams deltas back over a pull-bridge token; take-over semantics when a human types mid-answer).
- Edge: Team/Enterprise guard plugin `cc-plugin-sec-default` can bypass the mod's `classic.PermissionRequest`; the mod writes `plan-approvals/<tool_use>.json` (owner-only, ≤10 min) so the classic command hook can allow without opening a second review (#2007).
- Documented limitation: while review is open, Claude is not blocked; if the human exits plan mode manually, Claude may start editing. Review survives terminal close; `claude --continue` receives decision.

### Other harness formats [V]
- **Copilot CLI** `preToolUse` (`apps/copilot/hooks.json`, `timeoutSec: 345600`) → `plannotator copilot-plan` reads plan.md from session state → `{"permissionDecision":"allow"}` or `{"permissionDecision":"deny","permissionDecisionReason": msg}`.
- **Codex** `Stop` hook (`[features] hooks = true`, absolute binary path; `$CODEX_HOME/sessions/.../rollout-*.jsonl` parsed for last plan item/assistant message) → approve `{}`; feedback `{"decision":"block","reason": msg}` (continuation of the same turn).
- **Gemini CLI** `BeforeTool exit_plan_mode` → approve `{}` or `{"systemMessage": notes}`; deny `{"decision":"deny","reason": msg}`.
- **OpenCode** plugin `@plannotator/opencode`: registers `submit_plan` tool for `plan` agent (workflows `plan-agent|manual|user-managed|all-agents`); embedded server under Bun, CLI bridge otherwise (`plannotator opencode-plan` stdin `{plan,timeoutSeconds,sharingEnabled,agents}` → JSON); after approval can switch agent to `build`.
- **Generic CLI contracts** (`docs/.../reference/hooks.md`):
  - `--hook`: annotations → `{"decision":"block","reason":"<feedback>"}`; approve/close → empty.
  - `--gate --json`: `{"decision":"annotated","feedback":…}` | `{"decision":"approved"[,"feedback"]}` | `{"decision":"dismissed"}`.
  - `--require-approval --result-file`: exit 0 approved, 1 annotated/dismissed, 2 error; atomic result file, owner-only perms, refuses to overwrite.
  - plain: feedback text; approval prints "The user approved.".
- **External annotations API** (stable, for tools/linters/other agents): `POST /api/external-annotations` `{source, type: GLOBAL_COMMENT|COMMENT|DELETION, text, originalText (exact phrase; required for COMMENT/DELETION), author?}`; code review: `{source, scope: line|file|general, filePath, lineStart, lineEnd, side: new|old, type: comment|suggestion|concern, text|suggestedCode, originalCode?}`; `GET ?since=N` (304), SSE `/stream` (snapshot, add/update/remove/clear, 30 s heartbeat), `PATCH/DELETE ?id=`, `DELETE ?source=`.
- **Prompt templates** (`~/.plannotator/config.json` → `prompts.plan.{denied,approved,approvedWithNotes,autoApproved}`, `prompts.annotate.{fileFeedback,messageFeedback,approvedWithNotes}`, `prompts.review.{approved,denied}`, per-runtime overrides `prompts.<section>.runtimes.<runtime>.<key>`; placeholders `{{feedback}} {{toolName}} {{planFilePath}} {{planFileRule}} {{doneMsg}} {{proceedSuffix}} {{fileHeader}} {{filePath}} {{context}} {{contextBlock}}`). Reread per message.

## 4. UI

- **Layout [V]:** `[agent terminal (optional)] [TOC / folder sidebar] [document] [annotations / AI panel]`. Document action bar: Global comment, Images, Copy plan, Wide/Focus modes, Edit, Select/Pinpoint. Decision control bottom/top (`DecisionControl`, `ApproveDropdown` with permission-mode + agent-switch options). Code review: file tree, diff pane, review sidebar, commit rail.
- **Interaction [V]:** select text → floating `AnnotationToolbar` (Comment / Delete / Label / Looks good / Copy); `CommentPopover` composer (Cmd+Enter submit, image paste, `@` mentions when host supplies); `QuickLabelPicker` (digits apply labels, letters start comment). Vim mode optional. Touch toolbar placement logic for mobile.
- **Rendering [V]:** markdown → `Block[]` (`parseMarkdownToBlocks`: `paragraph|heading|blockquote|list-item|code|hr|table|html|directive|math`, each with `id`, `startLine`, `sourceLineCount`) → `BlockRenderer`; `data-block-id` on each block. Highlights via `@plannotator/web-highlighter` with `startMeta/endMeta {parentTagName,parentIndex,textOffset}` for cross-element ranges. Restoration for drafts/shares is **text-based** (search `originalText`), block ids legacy. Source-line labels computed from block `startLine` + offset of quote inside block content.
- **Feedback assembly [V]** (`packages/ui/utils/parser.ts: exportAnnotations`), built client-side, posted as `feedback` string to `/api/deny` (or `/api/approve` for notes):
```
# Plan Feedback

## Answers to your questions          (if :::question blocks answered)
...
## Reference Images                   (if global attachments)
Please review these reference images (use the Read tool to view):
1. [name] `path`

I've reviewed this plan and have N pieces of feedback:

## 1. (lines 12–14)                    <- source line label when resolvable; "[diff]" marker for changed blocks
Feedback on: "exact selected text"
> comment text

## 2.
Remove this
```
selected text
```

## 3.
[Needs tests] Feedback on: "…"
> <label tip, if any>

## 4.
General feedback
> whole-document comment

---
(label summary block)
```
  - Direct edits appended as unified diff; saved-to-disk edits marked already applied; linked/folder docs under their own headings; "Code File Feedback" section for code-file comments (`## 1. path (lines a-b)` + fenced original + `> text`).
  - Hardening: page-controlled strings pass `safeInline` (collapse whitespace, replace backtick runs) so content cannot inject markdown structure into the agent-read message.
  - Then wrapped by the harness template (`composePlanDeniedMessage`), e.g. "Revise the plan, address every item below, then call ExitPlanMode again.\n\n{{feedback}}".
- **Diff view [V]:** plan diff = line diff (`diff` pkg), consecutive removes+adds grouped into "modified"; rendered (colors) or raw. Code diffs via `@pierre/diffs`, side-by-side/unified, inline suggestion editor (CodeMirror).
- **Theme [V]:** light/dark + ~30 named themes; settings persisted in cookies/localStorage per origin+port (quick labels in cookies to survive random ports; dedicated `*.localhost` cookie hostname #2184).
- **Completion [V]:** after decision, tab shows completion overlay; Settings > Auto-close Tab.
- **Mobile [V]:** iPhone via Tailscale HTTPS validated; separate compact shells; touch multi-block selection was the hardest problem (SPIKE Aug 2026).

## 5. Architecture

- **Process model [V]:** one short-lived Bun HTTP server per review session, spawned by the hook/skill/tool; serves bundled React app (`apps/hook` plan/annotate app, `apps/review` code review app) + `/api/*`; exits after decision (or stays for `sessions --open` recovery). Inbox is the only long-lived server (`~/.plannotator/inbox/inbox.json` with pid/port; auto-started in background by agents).
- **Ports [V]:** local: random loopback port per session; remote: fixed `19432` (or range `PLANNOTATOR_PORT=19432-19463`). Session registry `~/.plannotator/sessions/<pid>.json`; `plannotator sessions [--open N] [--clean]`.
- **Browser opening [V]:** `packages/server/browser.ts`: VS Code IPC registry (`~/.plannotator/vscode-ipc.json`, longest-prefix cwd match → `GET http://127.0.0.1:<port>/open?url=`) → `PLANNOTATOR_BROWSER` (app name/path/script; `none` prints URL only) → `BROWSER` helper (devcontainers; no-op sentinels like `BROWSER=true` ignored) → platform default (`open`, WSL `wslview`/`cmd.exe`). QR code printed for `--tailscale`.
- **Persistence [V]** (`~/.plannotator` or `PLANNOTATOR_DATA_DIR` / XDG): `config.json`, `sessions/`, `drafts/<sha256[:16]>.json` (keyed by content hash, generation counter + tombstones, survive crashes), `history/<project>/<key>/` (versions, dedup identical), `plans/` (decision snapshots + annotations), `claude-code-mod/<session>/…` (launch dirs), `inbox/`, `hooks/` (improve-context), `vscode-ipc.json`, uploads as temp files.
- **Security [V]:**
  - Binds `127.0.0.1`; **no auth token in local or remote mode**. Remote binds `0.0.0.0` unauthenticated; docs say firewall it. `--tailscale` keeps loopback + Tailscale Serve HTTPS.
  - Guards present: same-origin check on mutating `/api` (`request-origin-guard.ts`), Host-header loopback check for "Ask this session" (DNS-rebinding defense, `loopback-host.ts`), server-session id in request bodies (409 on mismatch), stale-revision check, HTML asset route confined to file dir / no symlink escape, `/api/doc` symlink deny (#1437), 2 MiB caps, plan file trust gate (abs `.md`, regular file), feedback string defusing, host-result env var removed from child env, owner-only dirs, `safeSegment` for session ids.
  - Known exposure: embedded terminal = RCE for anyone reaching the page (disabled in remote by default); HTML sandbox iframe allows script network egress; update check to GitHub on every surface load (no opt-out); `git ls-remote origin` on review open (opt-out).
  - Releases: SHA256 sidecars + SLSA provenance (v0.17.2+). Private vulnerability reporting.
- **Agent-side detection [I/V]:** env tags `PLANNOTATOR_SESSION_TAG=claude-code:<session id>` and `PLANNOTATOR_SESSION_PROJECT` exported by the mod into every process the session spawns, so servers can be matched back to the originating session (V from register.ts header).

## 6. Prior art / alternatives

- **open-plan-annotator** (ndom91, MIT): same ExitPlanMode hook + ephemeral Bun server + React UI; annotation verbs strike (`d`), replace (`r`), insert (`s`), comment (`c`); Approve `Cmd+Enter`, Request changes `Cmd+Shift+Enter`; skip-file env to bypass. Smaller, closer to a minimal reference design.
- **UltraPlan** (Anthropic research preview, per SSW): inline comments + emoji reactions, outline sidebar, terminal stays free, approve → run on Claude Code web (auto-PR). CC-only, needs web account + GitHub.
- **Claude Code VS Code extension plan mode**: plan as markdown doc with inline comments; freeform feedback, no tracked resolution.
- **Cursor plan mode / Copilot Plan agent**: inline editable plan before approval; GitHub.com cloud agent iterates plan → PR.
- **AgentsRoom**: review inside an annotated document; intercepts plan step for Claude Code, Codex, OpenCode, Antigravity.
- **Pinpoint** (maferland): visual feedback on running UIs for agents (Show HN Jul 2026; details not fetched).
- **Code review layer:** Hunk (terminal diff viewer), Open Code Review, Paseo, Packmind, GitButler, CodeRabbit/Graphite (PR-stage, post-hoc). Plannotator positions itself *before the PR exists*.
- **Conceptual ancestors [I]:** Hypothesis/Google Docs anchored comments (quote + offset anchoring, fall back to text search); Conventional Comments (adopted as label taxonomy); PrivateBin (share encryption model); itty.bitty (URL-fragment payloads); Nygard ADRs.
- **"Human in the loop" MCP tools [I]:** Plannotator's Inbox MCP (`wait_for_reply`/`read_thread`) is this category; generic HITL MCP servers exist but none surfaced as direct competitor in searches.

## 7. Lessons for an in-app (Tie) design

**What users praise [V]:** closing the copy-paste loop; line-level precision over yes/no prompt; plan diff between iterations; works across agents; privacy (local). HN/PH threads are thin (≤5 points, ≤3 comments each) — adoption is via X/word of mouth; 10.5k stars.

**Pitfalls / gaps reported or evident [V unless marked]:**
- Integration depth varies per agent; hook semantics differ (PermissionRequest vs Stop vs BeforeTool), Windows gaps; frequent releases break hooks (reviewer: "test before team rollout").
- Approval cannot carry notes on Claude Code's PermissionRequest allow → a whole decision type ("Approve with Notes") is transport-dependent. Design the feedback channel independently of the gate channel.
- Stale inline `plan` vs file on disk (#1667) — anchor the review to the artifact the agent actually acted on.
- Blocking hook holds a process for days (4-day timeout); non-blocking needed an in-process module API + file-based IPC + leases to handle multiple CC processes per session. In Tie, you own both the terminal and the surface — you can skip all of this [I].
- Random ports break per-origin browser storage → they moved settings to cookies and a `*.localhost` hostname. Not an issue inside an Electron tile [I].
- Browser not opening (#551, top issue) in remote/devcontainer/dock-launched apps. Again moot in-app [I].
- Eager `submit_plan` in OpenCode (#328, #479) → manual-review mode added. Give users an explicit "review this" verb besides automatic interception.
- No auth on the local server; embedded terminal = RCE. In Tie the review surface should live in the UI realm or a sandboxed frame that posts *requests* to the host, never a network-reachable server [I].
- HTML artifacts: iframe sandbox doesn't stop egress; they warn rather than block. Tie already has `noNetwork`/CSP policy per kind [I].
- Direct-edit race/conflict on save (SPIKEs: source-edit race and conflict) → conflict check before atomic replace.
- Touch selection of multiple blocks is hard; desktop first.
- Reviewers found "startup announcements" noisy; the release-promo was cut back.

**Design moves worth copying [V]:**
- Three primitives + labels: `COMMENT(originalText)`, `DELETION(originalText)`, `GLOBAL_COMMENT`, plus quick labels with agent-facing `tip` text. Insert/replace handled by direct edit → unified diff.
- Anchor = exact quoted text + block id + offsets + DOM meta; restore by text search; export with source line labels. Anchors degrade gracefully (unanchored answers still sent).
- Feedback message = agent-facing markdown with numbered items, quote, request, line range, `[diff]` marker, label summary; wrapped by a per-harness template telling the agent exactly which tool to call next. Templates user-overridable.
- Decision vocabulary: `approved | annotated (request changes) | approved+notes | dismissed`, exit codes for automation, atomic result file.
- Version history keyed by (project, heading, day); rendered block diff; annotate the diff.
- Drafts keyed by content hash with generations; never lose annotations on crash.
- Agent-pushed revisions update the open review in place and keep comments.
- External annotations endpoint with SSE so linters/other agents can co-annotate.
- Questions-as-directives in markdown (`:::question`) rendered as cards; answers exported in a dedicated section.
- Non-blocking by default on capable hosts: deny-with-instructions ("end your turn, decision arrives as message") + later injected turn when idle. For Tie: the terminal is yours; a decision can be pasted as the next prompt via `pasteInto`, or a hook/MCP can gate [I].
- `EnterPlanMode` pre-hook injecting plan-quality context from a user file (cheap, high-leverage).

## 8. Agent-facing text format (exact)

Plain markdown, two layers. Verified: `packages/shared/prompts.ts`, `packages/ui/utils/parser.ts`.

### Wrapper (Claude Code deny message; `~/.plannotator/config.json prompts.plan.denied`)

```
YOUR PLAN WAS NOT APPROVED.

You MUST revise the plan to address ALL of the feedback below before calling ExitPlanMode again.

Rules:
- Your plan is saved at: /path/plan.md
  You can edit this file to make targeted changes, then pass its path to ExitPlanMode.
- Do not resubmit the same plan unchanged.
- Do NOT change the plan title (first # heading) unless the user explicitly asks you to.

{{feedback}}
```

- Placeholders: `{{toolName}}` per runtime (`ExitPlanMode`, `submit_plan`, `exit_plan_mode`…), `{{planFileRule}}` (empty when no file), `{{feedback}}`.
- Variants: approved with notes ("non-blocking guidance, do not revise"); answers-only ("fold answers into decisions, mark `- [x]`", no "NOT APPROVED"); code review denied suffix ("treat findings as unverified, verdict per finding, do not change code yet").

### Feedback body (`exportAnnotations`, built client-side)

```
# Plan Feedback

## Answers to your questions          <- only if :::question cards answered
...

## Reference Images                   <- only if global images
Please review these reference images (use the Read tool to view):
1. [name] `/tmp/path.png`

I've reviewed this plan and have 4 pieces of feedback:

## 1. (lines 12–14) Feedback on: "exact selected text"
> comment text
- **Reply (author):** reply text        <- threaded replies, indented, depth capped at 8

## 2. (lines 20–20) Remove this
```
selected text
```
> I don't want this in the plan.

## 3. (lines 31–33) [Needs tests] Feedback on: "exact selected text"
> <label tip, agent-facing instruction, if configured>

## 4. General feedback about the plan
> whole-document comment

---

## Label Summary
- Needs tests: 1
```

- Entries in document order, numbered.
- `(lines a–b)`: block `startLine` + offset of quote within block. `[In diff content]` replaces it for annotations made on the plan diff.
- Multi-page (folder/URL) exports group under `## Page: <url>` headings, entries one level deeper.
- HTML pinpoints append an element block (tag, selector, route). Image region comments: `Feedback on a region of the image <src>` + region lines.
- Direct markdown edits appended as unified diff; edits saved to disk marked "already applied".
- Quotes pass `safeInline`: whitespace collapsed, backtick runs replaced, truncated. Content cannot inject markdown structure.
- Mod path: body > 12 KiB written to `feedback.md`, agent told to read it.
- Empty: `No changes detected.`
- Design point: quote-anchored prose only. No ids, no JSON. Agent re-finds text itself.

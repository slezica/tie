# CLI and Socket Protocol

```
bin/tie → unix socket → main (socket.ts) → rpc:request → renderer (driver.ts) → ops
```

- Main waits for renderer ready. Timeout 10 s per call.
- Space: tile in `id`, `at` or `caller`, else visible tab. `list` runs outside `withSpace`.

## Help

- `tie --help` is the capability listing for agents (no separate docs needed): usage lines, then sections DESCRIPTION, TILE KINDS (file types, viewer behavior), TILE IDS, PLACEMENT, BEHAVIOR (focus, ping, close semantics), OUTPUT AND EXIT STATUS, ENVIRONMENT, EXAMPLES.
- Keep it in sync with commands, kinds and env: the `cli` scenario checks every section, command, kind and env var appears.
- `open` / `move` never take keyboard input (no activation) unless `--focus`. Empty board (nothing active): the new tile activates. UI opens (templates, splits, drops) always activate.

## Commands

| Command | Does |
|---|---|
| `tie list [--json]` | Tiles (+ tabs with `--json`) |
| `tie open terminal [opts]` | Open, print id |
| `tie open <path> [placement]` | Open a file in its kind (markdown, image, html by extension; else text or hex by content: `VIEWERS.md`), print id |
| `tie open <url>` / `tie open browser [url]` | Browser tile (`BROWSER.md`): `<url>` = `http(s)://...`; after `browser` also a bare host (→ `https://`); none = empty tile |
| `tie close [id]` | Close |
| `tie move [id] --at <id> [--side s] \| --float \| --shelve` | Move |
| `tie focus [id]` | Switch to its tab; expand + activate, or pin if shelved |
| `tie ping [id] [--clear]` | Attention mark (`LAYOUT.md`) |
| `tie title [id] <text>` / `tie icon [id] <emoji>` | Custom title / icon; `""` = automatic |
| `tie state` | Dev: internal state of the targeted space (not in `--help`) |
| `tie frames` | Dev: window frame tree, answered by main (not in `--help`) |
| `tie open probe [--cwd root]` | Dev builds: probe content tile (harness, `TILES.md`) |

- `open` options: `--cmd C`, `--cwd D` (relative to caller; default caller's cwd), `--title T`, `--at ID [--side l|r|t|b]`, `--float`, `--shelved`, `--focus`.
- `open <arg>`: `http(s)://...` → browser. A registered kind name → that kind (`./terminal` for a file named so; `browser` takes an optional URL after it: refused input → `Not a web address: <url> (http(s) only)`, exit 1). Else a path, resolved against the caller's cwd; main checks it: missing → `No such file: <path>`, folder → `Not a file: <path>`, over the kind's cap → `File too large: <path> (max N MB)` (all exit 1). Kinds showing a file can't open bare (`tie open markdown` → error).
- `--shelve` = `--shelved` (both commands).
- `[id]` defaults to `$TIE_TILE`.
- `title` / `icon` with 2+ args: first is `id`, rest joined (unquoted words ok).
- `--json`: full `TileInfo` instead of the id. Errors: stderr, exit 1.

## Placement (`open`, `move`)

1. `--shelve` → shelf, appended.
2. `--float` → float (keeps rect if already floating, else default).
3. Slot. Target: `--at`, else first slotted of caller, active, MRU (excluding the moved tile). None → root / first leaf.
4. Side: `--side`, else target's longer axis (`b` if taller, else `r`).

- `--at` not slotted → `not on board: <id>`. `move` needs `--at`, `--float` or `--shelve`.

## `tie list`

- Columns: `ID TAB STATE FLAGS TITLE`. TAB: 1-based position. FLAGS: `active`, `pinged`, `collapsed`, `zoomed`, `pinned`, `exit=N`.
- `--json`: `{board, tab (visible space id), tabs: [{id, title, current, active}], active, shelf (visible space), tiles: [TileInfo] (all spaces)}`.

`TileInfo` (also returned by `open`, `move`, `focus`, `ping`, `title`, `icon`):

- `id`, `kind`, `title`, `icon`, `state` (`slotted|floating|shelved`), `tab` (space id).
- `collapsed`, `zoomed`, `active`, `pinned`, `pinged`: from the tile's own space.
- `exit`, `error`: or null.
- `term: {cols, rows, pty: {cols, rows}}`: xterm vs last pty size (terminals).
- `doc: {path, rev, missing, history: {index, length}}` (file view kinds; null until open).
- `page: {path, url, ready, reloads, history: {index, length}}` (html).
- `web: {url, title, loading, ready, guest, back, forward}` (browser; `guest` = webContents id).
- `rect`: window px, rounded; null if not rendered (background tab).

## Socket protocol

- Newline-delimited JSON-RPC 2.0. One reply line per request, matched by `id`; several requests per connection ok.
- All errors: code `-32000`, `message` from the thrown error.

```json
→ {"jsonrpc":"2.0","id":1,"method":"open","params":{"caller":"t1","kind":"terminal","side":"b"}}
← {"jsonrpc":"2.0","id":1,"result":{"id":"t2", ...}}
← {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"no such tile: t9"}}
```

Methods = commands. Params: `open` {`kind`, `path` (absolute), `url`, `cmd`, `cwd`, `title`, `at`, `side`, `float`, `shelve`, `shelved`}; `move` {`id`, `at`, `side`, `float`, `shelve`, `shelved`}; `close`, `focus` {`id`}; `ping` {`id`, `clear`}; `title` {`id`, `text`}; `icon` {`id`, `emoji`}; `list`, `state` none. `close` returns `{id}`.

- `caller` (all methods): fallback for `id`, placement hint. `bin/tie` sends `$TIE_TILE`; for callers in a Tie terminal main replaces it (below).

### Callers

- Resolved once per connection (`socket.ts`, `@core/callers`): peer pid + uid from the kernel (`native/peer`: `LOCAL_PEERPID`, `LOCAL_PEERCRED` on the socket fd), then ancestors (`proc_pidinfo` ppid, ≤ 64 hops) up to a tile's pty (`pty.ts` `tiles()`: pid → tile).
- `tile`: same uid, descends from a pty. `params.caller` forced to that tile; a different claim (spoofed `TIE_TILE`) logged `[security] caller spoof`.
- `external`: same uid, no pty ancestor (scripts, other apps, the harness). Allowed only with setting `allowExternalControl` (default off), read per request; else error `External control is off (Settings → Security)`, logged `[security] refused external caller <pid>`.
- `refused`: other uid or unknown peer. Error, connection dropped.
- Same rule for every method, dev ones included. No fd or addon → external (logged). Resolution logged under `rpc`.

## Env (`bin/tie`)

- `TIE_SOCKET` (set in Tie shells), else `<state>/<TIE_INSTANCE or "default">.sock`. Outside Tie it targets the installed app unless `TIE_INSTANCE` is set. The socket is 0600 in a 0700 dir: the user's processes only; whoever connects can run commands as the user (`SECURITY.md`). Request lines over 1 MB drop the connection.
- `TIE_TILE`: caller (a hint: main uses the process lineage for callers in Tie terminals).

## Limitations

- No auth beyond the caller rule: processes in a Tie terminal (any descendant) act as that tile; with `allowExternalControl` on, any process of the user can connect.
- No events; poll `list`.
- No terminal I/O. Kinds: `terminal`; `markdown`, `text`, `image`, `hex`, `html` (by path); `browser` (by URL); `probe` in dev builds.
- No way to force a kind (e.g. hex of a PNG): the kind is the file's (extension, else content), from the CLI, drops and the file template alike.

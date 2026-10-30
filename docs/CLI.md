# CLI and Socket Protocol

```
bin/tie → unix socket → main (socket.ts) → rpc:request → renderer (driver.ts) → ops
```

- Main waits for renderer ready. Timeout 10 s per call.
- Space: tile in `id`, `at` or `caller`, else visible tab; `--tab`: the target tab. `list` runs outside `withSpace`.

## Help

- `tie --help` is the capability listing for agents (no separate docs needed): usage lines (+ an Aliases line), then sections DESCRIPTION, TILE KINDS (file types, viewer behavior), TILE IDS, PLACEMENT, BEHAVIOR (focus, ping, close semantics), OUTPUT AND EXIT STATUS, ENVIRONMENT, EXAMPLES.
- `add` and `replace` share one usage block (`tie add|replace ...`; placement flags marked `add:`).
- Keep it in sync with commands, kinds and env: the `cli` scenario checks every section, command, kind and env var appears.
- `add` / `move` never take keyboard input (no activation) unless `--focus`, nor switch the visible tab (`--tab`). Empty board (nothing active): the new tile activates. UI opens (templates, splits, drops) always activate.

## Commands

| Command | Does |
|---|---|
| `tie list [--json]` | Tiles (+ tabs with `--json`) |
| `tie add terminal [opts]` | Add a terminal, print id |
| `tie add <path> [placement]` | Add a file in its kind (markdown, image, html by extension; else text or hex by content: `VIEWERS.md`), print id |
| `tie add <url>` / `tie add browser [url]` | Browser tile (`BROWSER.md`): `<url>` = `http(s)://...`; after `browser` also a bare host (→ `https://`); none = empty tile |
| `tie replace <thing> [opts]` | Same things as `add`, no placement: the new tile takes the calling terminal's place, which closes once tie exits ("`replace`" below) |
| `tie close [--tile id]` | Close |
| `tie move [--tile id] --at <id> [--side s] \| --float \| --shelve` | Move |
| `tie move [--tile id] --tab <tab\|new>` | Into another tab (Placement) |
| `tie move [--tile id] --swap <id>` | Exchange places with a tile of the same tab (`swap`, `LAYOUT.md`) |
| `tie focus [--tile id]` | Switch to its tab; expand + activate, or pin if shelved |
| `tie ping [--tile id] [--clear]` | Attention mark (`LAYOUT.md`) |
| `tie set [--tile id] [--title T] [--icon E]` | Custom title / icon (given fields only; `""` = automatic) |
| `tie state` | Dev: internal state of the targeted space (not in `--help`) |
| `tie frames` | Dev: window frame tree, answered by main (not in `--help`) |
| `tie add probe [--cwd root]` | Dev builds: probe content tile (harness, `TILES.md`) |

- Aliases: `l a r c m f s p` = `list add replace close move focus set ping` (first letters, unique). Option flags have no single-letter forms (`--tab/--tile/--title` would collide).
- `add` options: `--cmd C`, `--cwd D` (relative to caller; default caller's cwd), `--title T`, `--icon E`, `--at ID [--side l|r|t|b]`, `--float`, `--shelved`, `--tab T|new`, `--focus`. `replace`: the same minus placement.
- `add` and `replace` share one parse in `bin/tie` (a `replace` boolean: method, held connection).
- `add <arg>` (and `replace <arg>`): `http(s)://...` → browser. A registered kind name → that kind (`./terminal` for a file named so; `browser` takes an optional URL after it: refused input → `Not a web address: <url> (http(s) only)`, exit 1). Else a path, resolved against the caller's cwd; main checks it: missing → `No such file: <path>`, folder → `Not a file: <path>`, over the kind's cap → `File too large: <path> (max N MB)` (all exit 1). Kinds showing a file can't open bare (`tie add markdown` → error).
- `--shelve` = `--shelved` (both commands).
- `--tile <id>` (`close`, `move`, `focus`, `ping`, `set`): the tile acted on. Default: the caller (`caller`, by lineage). No positional id: a stray argument → `unexpected argument: <arg>`. No `--tile` and no caller tile (external caller, or a stale `TIE_TILE`) → `no current tile: use --tile <id>`; an unknown `--tile` → `no such tile: <id>`.
- `set`: at least one of `--title` / `--icon` (else `set needs --title or --icon`); only the given fields change. `""` restores the automatic value (general rule for properties). Multi-word values need quotes.
- `--json`: full `TileInfo` instead of the id. Errors: stderr, exit 1.
- Unknown command (e.g. `open`, the old name of `add`): `unknown command: <cmd> (commands: ...; see tie --help)`, exit 1.

## Placement (`add`, `move`)

1. `--shelve` → shelf, appended.
2. `--float` → float (keeps rect if already floating, else default).
3. Slot. Target: `--at`, else first slotted of caller, active, MRU (excluding the moved tile). None → root / first leaf.
4. Side: `--side`, else target's longer axis (`b` if taller, else `r`).

- `--at` not slotted → `not on board: <id>`. `move` needs `--at`, `--float`, `--shelve`, `--tab` or `--swap`.

### `--tab <tab|new>` (`add`, `move`)

- `<tab>`: a space id (`s4mq8xe`, `list --json`) or a 1-based position (`list`'s TAB column; digits only, so never ambiguous). Else `no such tab: <tab>`. `new`: an empty tab inserted after the visible one, created only once every check passed (driver `addTab`; not `newTab`, which switches).
- No other placement: with `--at`, `--side`, `--float` or `--shelve` → `--tab takes no other placement (...)`. The tile goes beside the target's active tile (default split rule there; empty tab: root), as a drop onto a tab (`moveToSpace`, `TABS.md`).
- Visible target: placed, not activated (input stays). Hidden target: active there (the user meets it on switching).
- `--focus`: switch to the target tab first; the tile takes input (as `tie focus`).
- `move` without `--focus`, the tile being the last of the tab on screen: that tab closes; the user follows the tile to the target (not the tab before). Any other emptied tab just closes.
- `move` into its own tab: a board tile stays put; a shelved one comes back to the board (as `moveToSpace`).

### `--swap <id>` (`move`)

- `swap` op (`LAYOUT.md`): slots (sizes stay with the places), float rects, shelf indexes. The active tile stays active (onto the shelf: next one).
- Other tab → `not in the same tab: <id>`; unknown → `no such tile: <id>`; with any placement flag or `--tab` → `--swap takes no placement (...)`. Itself: no-op.
- `--focus`: the moved tile (`--tile`) takes input (its tab shown, as `tie focus`).

### `replace`

`tie replace <thing>`: the new tile takes the place of the terminal the command runs in; that terminal closes.

1. Tile callers only (lineage, Callers below). External → `no terminal to replace`.
2. tie must be a direct child of the tile's pty process (the shell): `parentOf(peer) === pty` (`@core/callers` `replaceBlock`). Else `tie runs under <proc>` (e.g. `vim`, `sh`). Packaged launcher `exec`s Electron; dev `bin/tie` runs via shebang (`env` execs node): both the same pid.
3. Shell idle: busy rule (`TERMINALS.md` "Busy"), tie's own pid ignored (`pty.ts` `busyIgnoring`). `--cmd` terminals: always busy. Else `A process is running: <proc>` (first other child's name, `native/peer` `nameOf`; unknown: `A process is running`).
4. Any placement (`--at`, `--side`, `--float`, `--shelve`, `--tab`) → `replace takes no placement (...)`. `--focus` ok.
5. Failure: nothing opened.
6. Timing (no race with the shell's death):
   - Request: checks 1–4 (main: 1–3, `socket.ts` `replaceTarget`; renderer: 4 + the usual `add` checks), then the tile opens on the caller's shelf, hidden (no reveal, no activation). Reply: its info.
   - `bin/tie` keeps the connection (`unref`, no `end`), prints the id, exits; the kernel closes the socket.
   - Connection closed after the reply was written → main calls the renderer's `replaced {old, id, focus}`. Closed before (tie killed mid-request) → no replace, the tile stays shelved (logged `[rpc] replace dropped`).
   - `replaceTile(old, id)` (`ops.ts`): `id` takes `old`'s leaf (`replaceLeaf`, `LAYOUT.md`), float rect + z-order, or shelf index, and its state there: active, zoomed, collapsed, pinned, revealed. Not custom title / icon. Then `closeTile(old)` (scripted: no question). `old` gone meanwhile, or `id` moved to another tab: nothing (logged).
7. Focus: the new tile activates iff the old one was active when tie exited, or `--focus` (shelved: pinned).
8. One `replace` per connection.

## Ids

- Tiles `t` + 6 chars, tabs (spaces) `s` + 6 chars: lowercase base32 without `0 1 l o` (`abcdefghijkmnpqrstuvwxyz23456789`), random (`crypto.getRandomValues`, `@core/ids` `randomId`). E.g. `t7f2kqa`, `s4mq8xe`.
- Never repeat, not even across runs: a script can't hit a reintroduced id. Live uniqueness check on generation (`state.ts` `newId`, `newSpace`: regenerate on collision).
- Never digits-only (the prefix): `--tab` digits are always a position.
- Opaque everywhere else (`S.tiles` key, `data-id`, `TIE_TILE`, socket params).

## `tie list`

- Columns: `ID TAB STATE FLAGS TITLE`. TAB: 1-based position. FLAGS: `active`, `pinged`, `collapsed`, `zoomed`, `pinned`, `exit=N`.
- `--json`: `{board, tab (visible space id), tabs: [{id, title, current, active}], active, shelf (visible space), tiles: [TileInfo] (all spaces)}`.

`TileInfo` (also returned by `add`, `replace`, `move`, `focus`, `ping`, `set`):

- `id`, `kind`, `title`, `icon` (custom icon; `""` = automatic), `glyph` (built-in icon name, `icons.ts` `GLYPH`), `state` (`slotted|floating|shelved`), `tab` (space id).
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
→ {"jsonrpc":"2.0","id":1,"method":"add","params":{"caller":"t7f2kqa","kind":"terminal","side":"b"}}
← {"jsonrpc":"2.0","id":1,"result":{"id":"tq3m8ze", ...}}
← {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"no such tile: tzzzzzz"}}
```

Methods = commands (full names, no aliases). Params: `add` {`kind`, `path` (absolute), `url`, `cmd`, `cwd`, `title`, `icon`, `at`, `side`, `float`, `shelve`, `shelved`, `tab`, `focus`}; `replace` {as `add`, no placement}; `move` {`id`, `at`, `side`, `float`, `shelve`, `shelved`, `tab`, `swap`, `focus`}; `close`, `focus` {`id`}; `ping` {`id`, `clear`}; `set` {`id`, `title?`, `icon?`}; `list`, `state` none. `close` returns `{id}`.

- `id`: `--tile`; absent → `caller`'s tile, else `no current tile: use --tile <id>`.
- No `title` / `icon` methods (replaced by `set`): `unknown method: title`.

- `replace`: the connection stays open after the reply; its close triggers the swap (`replace` above). No `open` method (old name): `unknown method: open`.
- `replaced` {`old`, `id`, `focus`}: renderer method, called only by main's socket layer on connection close. Refused from clients (`unknown method: replaced`): they must not close arbitrary tiles.
- `caller` (all methods): fallback for `id`, placement hint. `bin/tie` sends `$TIE_TILE`; for callers in a Tie terminal main replaces it (below).

### Callers

- Resolved once per connection (`socket.ts`, `@core/callers`): peer pid + uid from the kernel (`native/peer`: `LOCAL_PEERPID`, `LOCAL_PEERCRED` on the socket fd), then ancestors (`proc_pidinfo` ppid, ≤ 64 hops) up to a tile's pty (`pty.ts` `tiles()`: pid → tile).
- `tile`: same uid, descends from a pty. `params.caller` forced to that tile; a different claim (spoofed `TIE_TILE`) logged `[security] caller spoof`.
- `external`: same uid, no pty ancestor (scripts, other apps, the harness). Allowed only with setting `allowExternalControl` (default off), read per request; else error `External control is off (Settings → Security)`, logged `[security] refused external caller <pid>`.
- `refused`: other uid or unknown peer. Error, connection dropped.
- Same rule for every method, dev ones included. No fd or addon → external (logged). Resolution logged under `rpc`.

## Env (`bin/tie`)

- `TIE_SOCKET` (set in Tie shells), else `<state>/<TIE_INSTANCE or "default">.sock`. Outside Tie it targets the installed app unless `TIE_INSTANCE` is set. The socket is 0600 in a 0700 dir: the user's processes only; whoever connects can run commands as the user (`SECURITY.md`). Request lines over 1 MB drop the connection.
- `TIE_TILE`: caller (a hint: main uses the process lineage for callers in Tie terminals). Not a default for `--tile` by itself: an external caller's `TIE_TILE` naming no tile → `no current tile`.

## Limitations

- No auth beyond the caller rule: processes in a Tie terminal (any descendant) act as that tile; with `allowExternalControl` on, any process of the user can connect.
- No events; poll `list`.
- No terminal I/O. Kinds: `terminal`; `markdown`, `text`, `image`, `hex`, `html` (by path); `browser` (by URL); `probe` in dev builds.
- No way to force a kind (e.g. hex of a PNG): the kind is the file's (extension, else content), from the CLI, drops and the file template alike.

# CLI and Socket Protocol

```
bin/tie → unix socket → main (socket.ts) → rpc:request → renderer (driver.ts) → ops
```

- Main waits for renderer ready. Timeout 10 s per call.
- Space: tile in `id`, `at` or `caller`, else visible tab. `list` runs outside `withSpace`.

## Commands

| Command | Does |
|---|---|
| `tie list [--json]` | Tiles (+ tabs with `--json`) |
| `tie open terminal [opts]` | Open, print id |
| `tie close [id]` | Close |
| `tie move [id] --at <id> [--side s] \| --float \| --shelve` | Move |
| `tie focus [id]` | Switch to its tab; expand + activate, or pin if shelved |
| `tie ping [id] [--clear]` | Attention mark (`LAYOUT.md`) |
| `tie title [id] <text>` / `tie icon [id] <emoji>` | Custom title / icon; `""` = automatic |
| `tie state` | Dev: internal state of the targeted space (not in `--help`) |

- `open` options: `--cmd C`, `--cwd D` (relative to caller; default caller's cwd), `--title T`, `--at ID [--side l|r|t|b]`, `--float`, `--shelved`.
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
- `term: {cols, rows, pty: {cols, rows}}`: xterm vs last pty size.
- `rect`: window px, rounded; null if not rendered (background tab).

## Socket protocol

- Newline-delimited JSON-RPC 2.0. One reply line per request, matched by `id`; several requests per connection ok.
- All errors: code `-32000`, `message` from the thrown error.

```json
→ {"jsonrpc":"2.0","id":1,"method":"open","params":{"caller":"t1","kind":"terminal","side":"b"}}
← {"jsonrpc":"2.0","id":1,"result":{"id":"t2", ...}}
← {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"no such tile: t9"}}
```

Methods = commands. Params: `open` {`kind`, `cmd`, `cwd`, `title`, `at`, `side`, `float`, `shelve`, `shelved`}; `move` {`id`, `at`, `side`, `float`, `shelve`, `shelved`}; `close`, `focus` {`id`}; `ping` {`id`, `clear`}; `title` {`id`, `text`}; `icon` {`id`, `emoji`}; `list`, `state` none. `close` returns `{id}`.

- `caller` (all methods): fallback for `id`, placement hint. `bin/tie` sends `$TIE_TILE`.

## Env (`bin/tie`)

- `TIE_SOCKET` (set in Tie shells), else `<state>/<TIE_INSTANCE or "default">.sock`. Outside Tie it targets the installed app unless `TIE_INSTANCE` is set.
- `TIE_TILE`: caller.

## Limitations

- No auth: any local process of the user can connect.
- No events; poll `list`.
- No terminal I/O. Only `terminal` kind.

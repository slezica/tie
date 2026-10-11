# CLI and Socket Protocol

`tie` CLI and the driver socket behind it. For shells, scripts and agents inside Tie.

## Path of a call

```
bin/tie → unix socket ($TIE_SOCKET) → main (socket.ts) → IPC rpc:request → renderer (driver.ts) → ops
```

- Main waits for renderer ready. Timeout per call: 10 s.
- Renderer picks the space: tile in `id`, `at` or `caller`, else the visible tab (`TABS.md`).

## `tie` commands

| Command | Does |
|---|---|
| `tie list [--json]` | Tiles (and tabs with `--json`) |
| `tie open terminal [opts]` | Open terminal, print id |
| `tie close [id]` | Close tile |
| `tie move [id] --at <id> [--side s] \| --float \| --shelve` | Move tile |
| `tie focus [id]` | Switch to its tab; expand and activate, or pin if shelved |
| `tie title [id] <text>` | Custom title, `""` = automatic |
| `tie icon [id] <emoji>` | Custom icon, `""` = automatic |
| `tie state` | Dev: internal state dump of the targeted space (not in `--help`) |

`open` options: `--cmd C`, `--cwd D`, `--title T`, `--at ID [--side l|r|t|b]`, `--float`, `--shelved`.

- `--cwd`: resolved against the caller's cwd (relative ok). Default: caller's cwd.
- `--shelve` and `--shelved`: aliases, both in `open` and `move`.
- `[id]` defaults to `$TIE_TILE` (the calling terminal).
- `title` / `icon`: with 2+ args, first is `id`, the rest joined as value (unquoted words ok).
- `--json`: full tile info instead of the id.
- Errors: message on stderr, exit 1.

## Placement defaults (`open`, `move`)

1. `--shelve` / `--shelved` → shelf (appended).
2. `--float` → float. Keeps its rect if already floating, else default (45% of board, centered).
3. Slot. Target: `--at`, else first of caller, active, MRU that is slotted.
4. Side: `--side`, else target's longer axis (`b` if taller, else `r`).

- `--at` must be a slotted tile, else error `not on board`.
- `move` requires `--at`, `--float` or `--shelve`/`--shelved`.
- Empty board: tile becomes root.

## `tie list`

Plain output:

```
ID    TAB  STATE     FLAGS      TITLE
t1    1    slotted   active     zsh
```

FLAGS: `active`, `collapsed`, `zoomed`, `pinned`, `exit=N`.

`--json` shape:

```jsonc
{
  "board": {x, y, w, h},
  "tab": "s1",                          // visible space
  "tabs": [{id, title, current, active}],
  "active": "t1",                       // active tile of visible space
  "shelf": ["t3"],                      // visible space's shelf
  "tiles": [TileInfo]                   // all spaces
}
```

`TileInfo` (also returned by `open`, `move`, `focus`, `title`, `icon`):

| Field | Meaning |
|---|---|
| `id`, `kind`, `title`, `icon` | identity and display |
| `state` | `slotted` \| `floating` \| `shelved` |
| `tab` | space id |
| `collapsed`, `zoomed`, `active`, `pinned` | flags, from the tile's own tab |
| `exit` | exit code or null |
| `error` | start error or null |
| `term` | `{cols, rows, pty: {cols, rows}}`: xterm vs last pty size |
| `rect` | window px, rounded; null if not rendered (e.g. hidden tab) |

## Socket protocol

- Unix socket, `~/.tie/<instance>.sock`. Newline-delimited JSON-RPC 2.0.
- One request per line, one reply line each, matched by `id`. Several requests per connection allowed.

```json
→ {"jsonrpc":"2.0","id":1,"method":"open","params":{"caller":"t1","kind":"terminal","side":"b"}}
← {"jsonrpc":"2.0","id":1,"result":{"id":"t2", ...}}
← {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"no such tile: t9"}}
```

Methods and params:

| Method | Params |
|---|---|
| `list` | none |
| `open` | `kind`, `cmd`, `cwd`, `title`, `at`, `side`, `float`, `shelve`, `shelved` |
| `close` | `id` |
| `move` | `id`, `at`, `side`, `float`, `shelve`, `shelved` |
| `focus` | `id` |
| `title` | `id`, `text` |
| `icon` | `id`, `emoji` |
| `state` | none |

- `caller` (optional, all methods): fallback for `id`; placement hint. `bin/tie` sends `$TIE_TILE`.
- All errors use code `-32000`.

## Env

| Var | Use |
|---|---|
| `TIE_SOCKET` | socket path (set in Tie shells) |
| `TIE_INSTANCE` | fallback: `~/.tie/<instance>.sock` |
| `TIE_TILE` | caller tile id |

## Limitations

- No auth: any local process of the user can connect.
- No events/subscriptions; poll `list`.
- `rect` of tiles in background tabs is null.
- No terminal input/output access (by design).
- Only `terminal` kind.

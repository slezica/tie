# Daemon-Client Architecture (shelved)

Status: explored during brainstorming (2026-10-08), shelved 2026-10-09 to reduce initial complexity. Kept for later study.

## Core Idea

Split Tie into a headless **daemon** that owns all state and processes, and **clients** that render or script it. The UI is one client among many (CLI, MCP adapter, remote UIs). Everything that changes shared state is a message; purely visual concerns stay in clients.

## Rationale

- **Persistence / detach**: a daemon owning ptys can outlive the UI (tmux semantics). Retrofitting later is expensive: pty and state ownership move process, sync paths become async.
- **Agent integration**: agents, scripts and UI share one surface. No privileged path.
- **Clean architecture by constraint**: exploration requirement — *a client could be remote or headless*. Forces clear separation of model vs view, intent vs observation.
- **Prior art**: tmux/zellij (server + attached clients), VS Code pty host (`utilityProcess`).

## Exploration Requirement

Assumed, for reasoning, even if never built:

- Each tab could be a client on a different machine.
- Clients could be headless (no rendering).
- Everything is a message. UI-only concerns (drag, hover, previews) live in clients.

## Components

- **Daemon**
  - Node, launched as Electron `utilityProcess` for the PoC (dies with app; OS/Electron handles cleanup).
  - Never imports `electron`; moving to a detached process later = change spawn line (e.g. `ELECTRON_RUN_AS_NODE=1`, same native ABI for `node-pty`).
  - Owns ptys + layout state. Source of truth.
- **Spaces**: daemon term. Space = board + shelf + optional `cwd` default. "Tab" is UI vocabulary for a view of a space.
- **Clients**
  - App: multiplexing client. Tab bar = app chrome, unknown to daemon (like SSH unaware of tmux).
  - Each tab renderer (one `WebContentsView` per tab) = its own connection.
  - `tie` CLI.
  - MCP adapter: `tie mcp` over stdio, a client of the daemon (not embedded).
- **Transport**: WebSocket. Binary frames = pty data, text frames = control.
  - Renderers connect natively, sandbox stays on.
  - Network-capable for remote clients.
- **Control messages**: JSON-RPC (REST over WebSocket would reinvent it). Optional HTTP endpoints for `curl` later.
- **Driver**: high-level, transport-agnostic interface. See below.

## Model

- **Tile kind = model + view.**
  - Model: daemon-side, serializable state + commands.
  - View: client-side rendering. Headless client = no views.
- **Browser tile**: daemon owns *intent* (url to show); client reports *observed* (current url, title, history). Split unavoidable since the page runs client-side.
- **Active tile**: client concern, not daemon state.
  - Headless clients address tiles by id; clients resolve "current" to ids before sending.
  - Agents identify themselves via `TIE_TILE`; "active" is a poor signal (usually the agent's own terminal).
  - Possible later: client *presence* (focused tile, viewport), ephemeral, non-authoritative.
- **pty size**: the tab owning the tile sets size; other viewers adapt (tmux problem).
- **Floating coords**: relative units (0..1), since clients differ in screen size.

## Scoping

- **Connection ↔ space**: global connection. Space id per message, explicit `subscribe {space}`.
  - Alternative rejected for now: connection bound to `/spaces/<id>` — free scoping, but blocks cross-space ops and global tools.
  - Restricting agents to a space = auth concern (space-scoped tokens).
- **Env injection** into shells: `TIE_URL`, `TIE_TOKEN`, `TIE_SPACE`, `TIE_TILE`. Agents and their MCP processes inherit scope for free.

## Driver

- Callers use a high-level interface (`openTile`, `moveTile`, `shelve`...). Unaware whether it's a local call or a message to a daemon. No "send message" primitive exposed.
- Name kept as `Driver` (not "client") to avoid baking in client-server semantics.
- Proposed shape:
  - `Core`: state + models, no transport.
  - `LocalDriver(core)`: direct calls.
  - `Server(core)` ↔ `RemoteDriver`: WebSocket.
  - Conformance test suite run against both drivers enforces equivalence.
- Conditions to avoid leaks:
  - Async everywhere, even locally.
  - Failures (disconnect, timeout) typed from day one.
  - State changes observed only via events; commands return ack/ids.
  - No shared references: local driver copies/freezes (serialize in tests).
- Hot paths stay local: drag/resize previews in renderer, only drop sends command.

## Open Questions (unresolved when shelved)

- Optimistic updates: likely needed for layout. Implies client knows layout logic → commands as pure functions on state, shared daemon + client (reducer-style). Possibly overkill early.
- Tile kinds extending Driver: registry vs namespaced sub-interfaces (`terminal.write`, `browser.navigate`).
- Reattach cost: replay terminal state (headless xterm + serialize addon) + restore layout. Fidelity unknown, needs spike.
- Layout persistence across restarts: what to rehydrate.
- Agent HTML tiles: remote clients imply daemon serves files over HTTP.

## Concerns

- **Auth**: localhost WebSocket reachable by any web page, including our own browser tiles. Needs token + Origin check. Required for remote clients.

## Why Shelved

- Valuable reasoning exercise, but heavy for a first build.
- Pull back on complexity; learn from a simpler build first.
- Revisit when persistence, remote use or external drivers become real needs.

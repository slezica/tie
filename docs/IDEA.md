# Tie: Tiled Integrated Environment

Complete working environment, highly personalized, optimized for programming and writing for a user that does most of everything in a multiplexed terminal.

## Basic Concept

- Tabbed full-screen interface.
    - Each tab has a `Board` occupying most space.
    - Each tab has a `Shelf`, a column on the right side.

- `Board` is a configurable workspace.
    - Contains `Tile` objects.
    - Tiles are rectangular, resizable widgets.
    - Tiles are positioned in two ways inside the board:
        - Slotted, in A tree-like structure w/levels progressively sub-divided, like classic terminal splits
        - Floating, always-on-top, at arbitrary coordinates
    - Tiles can be collapsed, making them minimal with reveal on hover.
    - A board can be empty, otherwise there's always an active tile.

- `Shelf` is a temporary holding space for tiles.
    - Shelved tiles exist as small items vertically arranged in a column.
    - Shelved tiles are revealed on hover, with an overridden fixed size.
    - Shelved tiles can be dragged back and forth from the board.

- `Tile` is a widget of a fixed kind.
    - Tile kinds include `terminal`, `browser`, `chart`.
    - Tiles have title bars with actions such as close, collapse, shelve.
    - Each tile kind has a custom implementation for rendering and interactivity.
    - Each implementation can choose to manage external processes, etc.

- `Driver` is an interface that can subscribe to events and send commands to the envronment
    - Events have kinds that include `tile_open`, `tile_close`, `tile_shelve`, etc.
    - Events carry rich data, tailored so that drivers need not immediately query for more information.
    - Commands include tile management akin to Events
    - Drivers permit external scripting
    - The main driver envisioned at this point is an MCP for agents running inside the environment
    - This allows users to request visualizations, rich reports etc. that can be spawned and managed as tiles, ad-hoc.

- Actions can be taken via keyboard or cursor.
    - The `alt` key is associated with tile management, and can be held down to enable mouse and keyboard actions to move, resize, shift around, shelve tiles etc.
    - When a tile is dragged around while alt is held, the shape it will acquire when dropped is highlighted.
    - `Shift` makes the tab float, otherwise it drops in a slot on the board, taking half the space of the tile it is dropped over.
    - All these actions could be implemented as the users' default `Driver` probably.


## Stack

Undecided. Preliminary: Electron. Reasons:

- Rich library ecosystem, eg `xterm.js` (+ `node-pty` for shell?).
- Embedded browsers.
- Easy creation and management of custom tiles through ad-hoc HTML (or perhaps React)
- Easy provision of a tile library via web components (or React too).


## Prior art

Implementation will be from scratch to gain maximum control, especially over evolution.

- Wave Terminal: similar concept. 
- i3/sway: tree layout model.
- tmux/zellij: multiplexing, detach semantics.


## Notes

- Agent integration is a primary concern and design goal.
- The term `kind` is chosen to avoid confusion with language type-systems.
- Potentially: tabs could be associated with a CWD, and the way they expose themselves to drivers is via a unix socket at the location, locally held instead of a global service.
- This would naturally scope work and agents spawned from inside.

# Automation — implementation plan

Status: **plan only, nothing implemented yet** (branch `automation`). The decisions from the review are in §11.

Goal: let the user build rules of the form **trigger → conditions → actions** in a graphical node editor (in the style of Node-RED or Blender's node editor). The rules run on the server, so they keep working when no browser is open (the Pi runs 24/7).

Example rules:

- When **Input** changes to *Game*, and **Volume** ≥ −20 dB → set **Dialog Enhancer** to *Off* and **Sound mode** to *Stereo*.
- When **Decoder** changes, and the **input signal contains LFE** → set **Subwoofer level** to −2 dB.
- When **Input channels (count)** changes, and it is ≤ 3 (stereo, or stereo + LFE) → set **Sound mode** to *Multi Ch Stereo*.
- When **Decoder** changes, and input channels **C** and **FHL** are present → set **Dialog Enhancer** to *Medium*.
- When **Tuner preset** changes, and **Dialog Enhancer** is not *Off* → set **Cinema EQ** to *Off*.
- At **23:00 every day**, if the **Main zone** is on → set **Volume** to −35 dB (*only lower*) and **Dynamic Volume** to *Heavy*.

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Property** | Anything the app knows and can name: input, volume, mute, sound mode, decoder, sample rate, input channels, Dialog Enhancer, tuner preset, Zone 2 volume, HEOS play state, and so on. Every property is defined once in a shared **catalog** (§3). |
| **Automation** | One named, enable-able graph: one canvas in the editor. It has one or more trigger nodes. |
| **Trigger** | "Property P changed", optionally narrowed ("changed **to** X", "changed **from** X **to** Y", "rose above / fell below N"). |
| **Condition** | One or more comparisons of a property against a user value ("Volume ≥ −20 dB", "Dialog Enhancer is not Off", "Input channels C and FHL are present"), joined by **All of** (AND) or **Any of** (OR). It has a *true* and a *false* output. |
| **Action** | Set one property to a fixed value ("Sound mode = Stereo", "Volume = −30 dB"), or run an app action ("Apply speaker preset Movie", "Play HEOS favorite 2"). There are no relative actions ("Volume −3 dB"): a re-run would keep stacking them, and a fixed value is always predictable. |
| **Run** | One pass through the graph after a trigger fires. |

---

## 2. Graph model and semantics

Flow-based, like Node-RED: wires carry *execution*, not data. A trigger fires, and the run walks the wires from that trigger. This is easier to reason about than a Blender-style data-flow graph, where every value would be a node, and it still allows AND, OR and NOT without extra node types:

- **AND**: chain condition nodes, or use one condition node in *All of* mode.
- **OR**: one condition node in *Any of* mode, or several wires into the same node (it runs when any of them arrives).
- **NOT**: use the condition node's *false* output.

### Node types

| Node | Inputs | Outputs | Settings |
|---|---|---|---|
| `trigger` | — | `out` | `prop` (+ `param`, e.g. channel `C`), `when`: `change` \| `to` \| `from-to` \| `above` \| `below`, values, `settle` ms |
| `schedule` (trigger) | — | `out` | `at` (HH:MM) and `days` (Mon–Sun), or `every` N minutes; phase 4 |
| `condition` | `in` | `true`, `false` | `mode`: `all` \| `any`; `rows`: `[{ prop, param?, op, value }]` |
| `action` | `in` | `out` (after it was sent) | `prop` + `value` (fixed values only), or `app` action + args; volume actions also have `onlyLower` |
| `delay` | `in` | `out` | `ms` (max e.g. 10 min); can go anywhere in the graph |
| `wait-until` | `in` | `met`, `timeout` | condition rows (same editor as `condition`, channel picker included), `timeoutMs` (max e.g. 10 min), optional `checks` + `everyMs` |
| `comment` | — | — | text (documentation on the canvas) |

Later (phase 5): `restore` (put back the values an earlier action replaced).

### Delay and Wait until (instead of loops)

Values sometimes arrive late: the channel grid after an HDMI handshake, settings the receiver restores after an input change. Two nodes handle that:

- **Delay** pauses the run for a fixed time.
- **Wait until** is the safe form of a loop: it checks its condition when the run reaches it and **again on every change of the properties it uses**, until the condition is true (→ `met`) or the timeout ends (→ `timeout`). In the editor it reads as "check up to *N* times, every *S* seconds" or "wait up to *T* seconds", and both are stored as a timeout. Event-driven checking reacts at once and costs nothing while waiting. The "*N* times every *S* seconds" form also re-checks on that schedule, for values that change without an event.

  Example: "When Input changes to Blu-ray → **wait until** input channels C and FHL are present (up to 10 s) → `met`: Dialog Enhancer Medium · `timeout`: Dialog Enhancer Off".

There is no general loop node and no wire back to an earlier node. The graph stays acyclic, so every run ends: a wait always has a timeout, and the `concurrency` setting (`restart` by default) cancels a waiting run when its trigger fires again. Repeating something on a schedule is the job of the schedule trigger (phase 4).

### Stored format

```jsonc
// data/automations.json
{
  "version": 1,
  "automations": [{
    "id": "a7f3…",            // stable id, never reused
    "name": "Game night",
    "enabled": true,
    "concurrency": "restart",  // a new trigger cancels a pending run (delays) | "ignore" | "queue"
    "cooldownMs": 2000,
    "nodes": [
      { "id": "n1", "type": "trigger",   "x": 40,  "y": 80, "prop": "input", "when": "to", "to": "GAME" },
      { "id": "n2", "type": "condition", "x": 300, "y": 80, "mode": "all",
        "rows": [{ "prop": "volume", "op": ">=", "value": -20 }] },
      { "id": "n3", "type": "action",    "x": 560, "y": 40, "prop": "ps.DEH", "value": "OFF" },
      { "id": "n4", "type": "action",    "x": 560, "y": 140, "prop": "soundMode", "value": "STEREO" }
    ],
    "edges": [
      { "from": "n1", "out": "out",  "to": "n2" },
      { "from": "n2", "out": "true", "to": "n3" },
      { "from": "n3", "out": "out",  "to": "n4" }
    ]
  }]
}
```

### Run semantics

1. A trigger matches a change event (§4). Its `settle` delay starts (default from the catalog, e.g. 1.5 s after an input or power change, because the receiver restores per-input settings right after switching; see `POWER_ON_QUERIES` in index.ts). Another matching change during the delay restarts it.
2. After the delay, the run walks the graph from the trigger. **Conditions read the live state at the moment they're evaluated**, not the state at trigger time.
3. Actions are sent one at a time, in wire order. Fan-out (one output to several nodes) runs the branches in the order of their y position on the canvas, so the order is visible.
4. A node reached twice in the same run runs once.
5. The graph must be acyclic (validated on save), so a run always ends.

---

## 3. The property catalog

One server module, `server/automation-catalog.ts`, describes every property. The client never hard-codes property lists: it gets the catalog from `GET /api/automation/catalog`, so the editor's dropdowns, value pickers and units always match what the server accepts.

```ts
type PropDef = {
  id: string;                 // 'input', 'volume', 'ps.DEH', 'channel.level'
  label: string;              // 'Dialog Enhancer'
  group: string;              // palette group: 'Power', 'Volume', 'Input & signal', 'Audio', 'Video', 'Zone 2', 'Tuner', 'HEOS', …
  type: 'number' | 'enum' | 'bool' | 'text' | 'set';
  unit?: 'dB' | 'min' | 'ms' | 'MHz';
  min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[] | ((st) => …); // enums; dynamic for inputs (names, hidden ones left out), presets, quick selects
  param?: { label: string; options: … };                    // e.g. channel for 'channel.level'
  read: (ctx) => Value | null;   // from state / audioMap / nowPlaying / speaker presets; null = unknown
  write?: (value, ctx) => string[] | AppAction;              // telnet commands (still go through guard) or an app action
  settleMs?: number;             // default trigger settle delay
  needsZone?: boolean;           // action only makes sense with the main zone on
  needsInput?: string;           // e.g. tuner actions need input TUNER
};
```

Values are always in **human units**: dB numbers, enum ids with labels, booleans. Encodings (`MV375`, levels where 50 = 0 dB, `PSLFE 05` = −5 dB) stay inside `read` / `write`, reusing `volToDb`, `dbToVol`, `levelToDb`, `dbToLevel` from parse.ts.

### First version of the catalog

Option lists and ranges come from the existing panels (Seg options, Slider ranges), which already follow the manual.

| Group | Properties (trigger + condition) | Writable (action) |
|---|---|---|
| Power | Receiver power, Main zone power | both (`PW…`, `ZM…`) |
| Volume | Master volume (dB), Mute | volume set to a fixed value (capped, optional *only lower*, §6), mute |
| Input & signal | Input; Sound mode (raw text, "contains" comparisons); Quick Select; Decoder (`SYSDA`); Sample rate; Audio format (`3/2/.1`); **Input channels (count)**; **Input channel layout**; **Input channel** *X* (each channel); **Active speaker** *X* (each speaker); **Active speakers (count)**. See "Input channels and active speakers" below. | input, sound mode (the MS commands in docs/PROTOCOL.md), Quick Select recall |
| Video | Input / output resolution, HDR in / out, color space, pixel depth (decoded, `videoInfo`) | — |
| Audio | Audyssey (MultEQ, Dynamic EQ, Ref. level, Dynamic Volume); Dialog Enhancer; Subwoofer on/off and level; LFE; Cinema EQ; Tone control, bass, treble; DRC; Loudness management; Restorer; Audio delay; Neural:X; Center spread | all of them (`PS…`) |
| Speakers | Channel level (per channel, `CV`); Speaker preset (app preset) | channel level; **apply speaker preset** (app action, §6) |
| Zone 2 | Power, source, volume, mute | all (Zone 2 volume capped) |
| General | Sleep timer, ECO, Dimmer, Auto standby, All Zone Stereo, Bluetooth transmitter | all |
| Tuner | Band, frequency, **preset ("channel")** | band, frequency, preset (only with input TUNER; the guard enforces this) |
| HEOS | Play state, source, station, artist, title, album | play / pause / stop / next / previous; play favorite N |
| App | Receiver connected (telnet / HTTP / offline) | — |
| Time (phase 4) | Time of day, day of week (conditions only; schedules are their own trigger node) | — |

### Input channels and active speakers

Rules can test the number of channels in the input stream **and any single channel**, e.g. "if **C** and **FHL** are in the signal, then…". The receiver reports two grids of channels (the Status panel's signal view shows both):

- **Input signal:** which channels the source stream contains.
- **Active speakers:** which speakers are playing now (depends on the sound mode as well as the source).

| Property | Type | Examples |
|---|---|---|
| **Input channels (count)** | number, LFE counts as one | 1 mono · 2 stereo · 3 stereo + LFE (2.1) · 6 for 5.1 · 8 for 7.1 · 10 for 5.1.4 |
| **Input channel layout** | text, `main.lfe[.height]` | `2.0`, `2.1`, `5.1`, `7.1`, `5.1.4` |
| **Input channel** *X* | bool, one per channel (`param` = channel code) | "Input channel **C** is present", "Input channel **FHL** is not present" |
| **Active speaker** *X* | bool, one per speaker (`param` = channel code) | "Speaker **SW** is playing" |
| **Active speakers (count)** | number | |

Each per-channel property works as a trigger too ("when input channel FHL appears", "when speaker C stops").

**Channel picker in the editor.** Checking several channels with one row each would be clumsy, so the condition node has a **Channels** row type: a small speaker-layout grid of chips (the same layout as the Status panel's signal view), one per channel. Tapping a chip cycles it through *don't care* → *present* (green) → *absent* (red). "C and FHL present" is two taps. The row is true when every marked chip matches, and is stored as two plain lists (`present: ['C', 'FHL'], absent: []`), so the server evaluates it like any other row. The same picker, set to *Active speakers*, tests which speakers are playing. A trigger node can also use the picker: "when the set of input channels changes so that it matches …".

Source, in order of preference:

1. The audio map's input grid (`AppCommand0300.xml`, [audio-map.ts](../server/audio-map.ts)): the cells with `on: true` are the channels present in the signal, height channels included. This is what the Status panel's signal view shows.
2. When the grid isn't available yet (main zone just turned on, or the HTTP read failed): `audioFormat` (`SSINFAISFOR`, "front/surround/LFE", e.g. `3/2/.1` → 3 + 2 + 1 = 6). It gives the count and layout (without heights) but not the individual channels, so the per-channel properties are *unknown* (null) until the grid arrives, and conditions on them are false (§3, operators). The active-speaker properties come from the grid only.

Both are read again after every input, format and sound-mode change (index.ts already does this), and the trigger's default settle time for these properties is longer (about 3 s) because the format can flip while the HDMI handshake settles or at track starts.

Phase 1 checks on the receiver that the grid and `SSINFAISFOR` agree for stereo PCM, 5.1 Dolby Digital and an Atmos source, and records what each reports for 2.0 PCM over HDMI vs analog.

**Not in v1:** values that live only in the setup API (port 10443), such as Graphic EQ, Subwoofer Mode, or input assignment. The receiver doesn't push them, and reading them is slow and serialized (and some reads hang the receiver for 30 s), so they can't be triggers. Setup-API *actions* are a phase-5 option, limited to a small allowlist and still going through `setup.set` (backups, `ROOTS`, power-on volume cap).

### Comparison operators by type

| Type | Operators |
|---|---|
| number | `=` `≠` `<` `≤` `>` `≥` `between` |
| enum | `is` `is not` `is one of` `is none of` |
| bool | `is on` `is off` |
| text | `is` `is not` `contains` `doesn't contain` `starts with` |
| set | `contains` `doesn't contain` `contains any of` `contains all of` `is empty` |
| any | `is known` `is unknown` |

An unknown value (`null`) makes every comparison false except `is unknown`.

---

## 4. Server: detecting changes

Changes reach `state` from several places: telnet lines, the HTTP poller, the audio map fetch, HEOS events, speaker presets, settings. All of them end in `scheduleBroadcast()`. That is the one place to hook in:

1. In the broadcast timer (index.ts), before sending the snapshot, call `automation.observe(ctx)`.
2. `observe` reads every property in the catalog that some *enabled trigger* uses (only those, to keep it cheap), compares with the previous values, and turns each difference into a change event `{ prop, param, from, to }`.
3. Change events are matched against triggers.

This catches every source with one hook, and the 40 ms batching merges multi-line bursts (a CV run, a SYSDV pair) into one event per property.

**No triggers from startup noise.** Changes from `null` (unknown) to a value don't fire, so the server starting or telnet reconnecting (`REFRESH_QUERIES`) doesn't run every automation. Values read right after a reconnect become the new baseline (a short warm-up window after `telnet.on('status', true)`).

---

## 5. Server: the engine

New module `server/automation.ts`, kept free of I/O like `speaker-presets.ts`, with dependencies injected:

```ts
new Automations(dataDir, {
  catalog,
  read: () => ctx,                         // state, audioMap, nowPlaying, speakerPresets.summary(), conn
  cmd: (c, who) => sendCommand(c, who),    // the guarded path; who = 'automation: Game night'
  app: (action) => …,                      // speaker preset apply, HEOS transport / favorite
  now, setTimeout, clearTimeout,           // injectable so tests run on a fake clock
  log, changed: () => scheduleBroadcast(),
});
```

Responsibilities:

- Load, validate and save `data/automations.json` (write to a temp file, then rename).
- `observe(ctx)` → change events → trigger matching → settle timers → runs.
- Graph walk (pure function `step(graph, nodeId, ctx)`, unit-tested).
- Run bookkeeping: a ring buffer of the last ~200 runs `{ automationId, at, trigger: {prop, from, to}, path: [nodeId, result][], error? }`, kept in memory, sent to the editor for live feedback.
- **Verify actions:** about 2.5 s after an action, check that the property now has the value it was set to. If not, record "not applied by the receiver" in the run (the receiver silently ignores, for example, LFE with PCM or Dialog Enhancer in Direct; see `IGNORED` in web/src/lib/rules.js).
- **Skip needless actions:** if a set-action's property already has the target value, skip it. This removes most of the loops in §6 and avoids audible re-applies.

REST, in index.ts next to the speaker-presets routes:

| Route | |
|---|---|
| `GET /api/automation/catalog` | the catalog, with dynamic option lists filled in (input names, presets, quick select names) |
| `GET /api/automations` | all automations |
| `POST /api/automations` | `{ action: 'save', automation }` (create or replace, fully validated) \| `delete` \| `enable` \| `run` (manual "Run now") \| `test` (dry run: walk the graph against the current state and return the path and the actions it *would* send, sending nothing) |
| `GET /api/automations/runs` | recent runs |

The snapshot gets a small `automations` summary (`[{ id, name, enabled, lastRun, lastError }]`) so every device sees enable/disable changes and last-run status, the same way it gets `speakerPresets`. Full graphs are fetched only by the editor.

Server-side validation on save (never trust the client): known node types, known property ids, operators allowed for the type, values in the option lists or ranges, edges only between existing nodes and allowed ports, no cycles, at least one trigger, limits (e.g. 100 automations, 60 nodes each, delay ≤ 10 min, names ≤ 40 characters).

---

## 6. Safety (does not weaken the existing layer)

- **Every telnet action goes through `sendCommand` → `guard()`.** Same allowlist, same `BLOCKED` list, same volume cap (`effectiveCap`) for Main and Zone 2, same "tuner commands need input TUNER" rule. The audit log line names the automation.
- The catalog's `write` only builds commands for listed properties; there is no "raw command" action. (A "Console command" action could come later, still guarded.)
- **Volume:** only fixed values (`MV<n>`, `Z2<n>`): no `MVUP` / `MVDOWN` or relative steps from automations. The guard clamps the value to the cap, the same as for the UI. The action has an **Only lower, never raise** switch: with it on, the action is skipped when the current volume is already at or below the value, so a rule can act as a ceiling ("at 23:00, at most −35 dB").
- **Loops:** automation A sets X, which triggers B, which sets Y, which triggers A…
  - Skipping needless actions (§5) breaks most loops: the second pass finds nothing to change.
  - Per-automation cooldown (default 2 s) and a rate limit: more than 10 runs in 60 s **disables the automation**, with a log line and an error in the summary that the UI shows.
  - Chain depth: change events within ~3 s of an automation's own action are tagged as caused by it. A run started by such an event is depth + 1, and depth > 3 stops.
- **Speaker presets:** `apply()` is already serialized (`busy`). The Amp Assign confirmation can't be answered by an automation. The editor asks for it when the action is created (stored as `confirmAmp` on the action, as docs/SPEAKER-PRESETS.md suggests), or the server refuses to save the rule.
- **Power:** actions that need the main zone (`needsZone`) are skipped with a note when it's off, rather than sent to be ignored. A "Main zone power off" action is allowed (it's what the power button does). "Receiver power on" is allowed too; it's the obvious use for schedules later.
- Runs never call the setup API in v1.

---

## 7. Frontend: the node editor

### Where it lives

- One panel, **Automation** (`id: 'automation'`, `section: 'setup'`, `tab: 'app'` in [panels/index.js](../web/src/panels/index.js)), in the existing **App & Info** tab next to "This app". **No new Setup tab** and no new page: the Setup tab bar and the phone tab bar stay as they are. (Every Setup panel must belong to an existing tab, because [Section.svelte](../web/src/pages/Section.svelte) filters by `tab`.) It's a normal panel, so it can also be pinned to Home for quick enable / disable.
- The panel is the only way into the editor: **Edit** on a rule, or **New automation**. The editor opens full screen over the app at `#setup/app/rule/<id>` (`/rule/new` for a new one), so the browser's back button closes it. `fromHash()` in App.svelte passes the rest of the hash on to the panel.

### The Automation panel (list view)

Rows, one per automation: name, enable switch, a one-line plain-language summary generated from the graph ("When Input changes to Game · if Volume ≥ −20 dB · set Dialog Enhancer Off, Sound mode Stereo"), last run time and result, and buttons for **Edit**, **Run now**, **Duplicate**, **Delete** (with a confirmation). Tapping the row also opens the editor. A **New automation** button opens an empty canvas with one trigger node. Rows that the server disabled (loop protection, §6) show the reason.

### Editor

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Game night          [● Enabled]   Test   Undo Redo   Save              │
├────────────┬─────────────────────────────────────────────────────────────┤
│ TRIGGERS   │   ┌───────────────┐      ┌──────────────────┐     ┌────────┐│
│  Input     │   │ ⚡ Input       │      │ ? All of         │     │ ▶ Dialog││
│  Volume    │   │ changes to    ●─────▶● Volume ≥ −20 dB  │true │ Enhancer││
│  Decoder…  │   │ [Game     ▾]  │      │ + condition      ●────▶● [Off ▾] ●┐
│ CONDITIONS │   │ now: Blu-ray  │      │ now: ✔ −32 dB    │     └────────┘│
│ ACTIONS    │   └───────────────┘      │            false ●              ││
│ FLOW       │                          └──────────────────┘   ┌──────────┘│
│  Delay     │                                                 ▼          │
│  Comment   │                                     ┌───────────────┐      │
│            │                                     │ ▶ Sound mode  │      │
│            │                                     │ [Stereo ▾]    │      │
│            │                                     └───────────────┘      │
└────────────┴─────────────────────────────────────────────────────────────┘
```

- **Canvas:** pan (drag background, two-finger drag), zoom (wheel, pinch, buttons), snap to grid, a "fit" button, and a mini-map on large screens.
- **Nodes** are app-styled cards (`--card`, the accent color per node kind: trigger, condition, action, flow) with inline editors that reuse the existing controls: `Seg` for short enums, a select for long ones, `Slider` for dB values with the same ranges as the panels.
- **Ports and wires:** drag from an output port to an input port; wires are SVG bezier curves. Only valid connections snap (no wire into a trigger, no cycles). Tap a wire to delete it.
- **Palette:** a sidebar on wide screens and a bottom sheet on phones, grouped like the catalog (Power, Volume, Input & signal, …), with search. Drag (or tap) to add.
- **Live values:** every node shows the property's current value ("now: Blu-ray"), and condition rows show ✔ / ✘ against the live state, evaluated in the browser from `avr.state` with the same operator code (a small shared module, see §8). This makes it easy to see why a rule would or wouldn't run.
- **Run feedback:** when a run of this automation happens, its path lights up briefly (nodes and wires pulse in the order they ran; actions that weren't applied show a warning). The data comes from a `{ type: 'automation-run' }` WebSocket message.
- **Test:** dry run against the current state (`action: 'test'`); highlights the path and lists the actions that would be sent, without sending anything.
- **Editing:** multi-select (box select / shift-click), delete, duplicate, copy/paste, undo/redo (a snapshot stack of the graph), keyboard shortcuts on desktop. Unsaved changes warn on leave.
- **Validation** in the editor mirrors the server's (missing values, unconnected actions, unreachable nodes) and marks the faulty node in red; the server's answer is still final.

### Library: Svelte Flow (decided)

Comparison kept for reference:

| | [Svelte Flow](https://svelteflow.dev) (`@xyflow/svelte`, MIT) | Hand-built |
|---|---|---|
| Pan, zoom, pinch, mini-map, connection dragging, selection | built in, touch-tested | ~800–1200 lines to write and test on phones |
| Custom nodes | Svelte components (our panels' controls fit directly) | same |
| Styling | its CSS variables, themed to `app.css` | full control |
| Cost | one more runtime dependency (the app has two), larger bundle, only on the Automation page (lazy-loaded with `import()`) | none |

**Svelte Flow**, lazy-loaded (the editor is imported with `import()` when it opens) so the rest of the app doesn't grow. Check at implementation time that the current version supports Svelte 5 runes (1.x does) and works with Vite 8.

---

## 8. Files

| File | Purpose |
|---|---|
| `server/automation-catalog.ts` | property catalog (read/write/encode), operators |
| `server/automation.ts` | engine: storage, validation, change detection, runs, safety limits |
| `server/automation.test.ts` | tests (§9) |
| `server/index.ts` | wiring: hook in the broadcast timer, REST routes, snapshot summary, run messages |
| `web/src/lib/automation/ops.js` | operator evaluation shared by the editor's live ✔/✘ (keep in step with the server; the test checks both against the same cases) |
| `web/src/lib/automation/store.svelte.js` | catalog, list, editor state, undo stack |
| `web/src/panels/Automation.svelte` | the Automation panel (list view) in Setup › App & Info, registered in `panels/index.js` |
| `web/src/App.svelte` | pass `#setup/app/rule/<id>` through to the panel |
| `web/src/lib/automation/ChannelPicker.svelte` | the tri-state channel chip grid (§3) |
| `web/src/lib/automation/Editor.svelte` + `nodes/*.svelte` | full-screen canvas and node components (lazy-loaded) |
| `docs/AUTOMATION.md` | this document, updated to describe what was built |
| `CLAUDE.md` | short section on the engine and "if you add a state field, add it to the catalog" |

---

## 9. Testing

Unit tests (`node --test`, no receiver), in the style of `speaker-presets.test.ts` with a fake receiver and fake clock:

- Catalog: `read` from sample states, `write` produces commands the guard accepts, every enum option round-trips. Input channels: count, layout and each channel from sample audio-map grids (2.0, 2.1, 5.1, 7.1, 5.1.4); count and layout from the `audioFormat` fallback, with per-channel values unknown; Channels rows (present / absent lists) against those grids.
- Volume: no relative commands can be produced; *only lower* skips when the volume is already at or below the value.
- Schedules (phase 4): fires once per matching minute, not on missed minutes after a restart, across a DST change.
- Operators: every operator × type, including `null`.
- Change detection: one event per property per batch; no events from `null`; the reconnect baseline.
- Runs: trigger narrowing (`to`, `from-to`, `above`), settle restart, AND / OR / false branch, fan-out order, delay with `restart` / `ignore`, wait-until (met on a later change, met on a timed re-check, timeout, cancelled by a new trigger), needless-action skip, verify ("not applied").
- Safety: volume above the cap is clamped; tuner action rejected unless input is TUNER; loop detection disables an automation; chain depth stops.
- Validation: cycles, bad ports, unknown props, out-of-range values, limits.

Live testing on the receiver follows the standing rule: **automations may lower or mute the volume, never raise it**, during tests.

---

## 10. Phases

Each phase ends with a commit that works on its own.

1. **Engine without UI.** Catalog (Power, Volume, Input & signal including the input-channel properties, Audio groups first), change detection hook, engine, storage, REST, tests. Usable by posting JSON, which proves the model.
2. **Panel and editor basics.** Automation panel in Setup › App & Info (list, enable, run, edit, delete, new), full-screen Svelte Flow editor, trigger / condition / action / **delay / wait-until** nodes, the channel picker, palette, save and validation. (The engine side of delay and wait-until is built in phase 1.)
3. **Live feedback.** Current values and ✔/✘ on nodes, run highlighting, Test (dry run), run history.
4. **Rest of the catalog, and time.** Zone 2, Tuner, HEOS, speaker presets (with the Amp Assign confirmation), General, video properties; Comment node; duplicate, copy/paste, undo/redo. **Schedule trigger** ("at 23:00 on weekdays", "every 15 minutes") and **time conditions** ("time is between 22:00 and 07:00", "day is Sat or Sun"). These come after the rest of the engine is proven because they need only a 1-minute timer in the engine and no new receiver interface. Times use the server's local time zone (the Pi's), shown in the editor so it's never a surprise; a missed minute (server down) is not run later.
5. **Later, if wanted.** `restore` node, a small allowlist of setup-API actions, templates ("Night mode", "Movie with Atmos"), import/export as JSON.

---

## 11. Decisions

Made on 2026-11-13:

1. **Editor library:** Svelte Flow (`@xyflow/svelte`), lazy-loaded.
2. **Placement:** one **Automation** panel in Setup › App & Info that lists every rule, with buttons to edit and delete them and to create a new one; the editor opens full screen from there (§7). No new Setup tab, no new page.
3. **Volume:** actions set fixed values only, never relative steps; still capped by the guard, with an optional *Only lower, never raise* switch (§6).
4. **"Channel number"** means the number of channels in the input stream (2 = stereo, 3 = stereo + LFE, 6 = 5.1, …), and rules must also be able to test **individual channels** ("if C and FHL then…"): the per-channel properties and the channel picker in §3. The tuner preset is still in the catalog as its own property.
5. **Date / time:** schedule triggers and time conditions in phase 4 (§10).

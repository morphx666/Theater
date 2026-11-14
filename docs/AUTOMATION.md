# Automation — implementation plan

Status: **phase 1 (engine, no UI) done** on branch `automation`: tested against a fake receiver, not yet on the real one. Phase 2 (panel and editor) is next. Decisions are in §11.

Goal: let the user build rules of the form **when (trigger) → if (conditions) → do (actions)** in a graphical, **Scratch-style block editor**. The rules run on the server, so they keep working when no browser is open (the Pi runs 24/7).

Example rules:

- When **Input** changes to *Game*: if **Volume** ≥ −20 dB → set **Dialog Enhancer** to *Off* and **Sound mode** to *Stereo*.
- When **Input channels (count)** changes: if it is ≤ 3 (stereo, or stereo + LFE) → set **Sound mode** to *Multi Ch Stereo*.
- When **Decoder** changes: if input channels **C** and **FHL** are present → set **Dialog Enhancer** to *Medium*, else *Off*.
- When **Input** changes to *Blu-ray*: **wait until** input channels C and FHL are present (up to 10 s) → set **Dialog Enhancer** to *Medium*.
- At **23:00 every day** (phase 4): if the **Main zone** is on → set **Volume** to −35 dB (*only lower*) and **Dynamic Volume** to *Heavy*.

---

## 1. Concepts

| Term | Meaning | Scratch equivalent |
|---|---|---|
| **Property** | Anything the app knows and can name: input, volume, mute, sound mode, decoder, input channels, Dialog Enhancer, tuner preset, Zone 2 volume, HEOS play state… Each is defined once in a shared **catalog** (§3). | variables / sensing |
| **Automation** | One named rule that can be turned on and off: a *when* block with a script under it. | one script |
| **Trigger** | The *when* block: "when P changes", narrowed with *from* / *to*, or "when ⟨condition⟩ becomes true". Several triggers can share one script ("when A … or when B …"). | hat block |
| **Condition** | A true/false block: a comparison ("Volume ≥ −20 dB", "Dialog Enhancer is not Off"), a channel check ("C and FHL present"), or **all of** / **any of** / **not** around other conditions. | boolean reporter (hexagon) |
| **Action** | "Set P to value": always a fixed value, never relative ("Volume −3 dB" would stack on every re-run). Phase 4 adds app actions (apply a speaker preset, play a HEOS favorite). | "set … to …" |
| **Control** | *if / else*, *wait N seconds*, *wait until ⟨condition⟩ (up to N s)*, *stop*. | control blocks |
| **Run** | One pass through the script after a trigger fires. | |

---

## 2. Model and semantics

A rule is a **tree**, not a graph: a script is a list of blocks, and an *if* holds two more lists. Because there are no wires there are no loose ends, no unreachable blocks and no cycles; every run ends by construction.

### Stored format

```jsonc
// data/automations.json
{
  "version": 1,
  "automations": [{
    "id": "k3x9f2a1",              // stable id, never reused
    "name": "Blu-ray dialog",
    "enabled": true,
    "concurrency": "restart",     // a new trigger cancels a running script | "ignore" (drop new triggers while running)
    "when": [                     // any of these starts the script
      { "type": "change", "prop": "input", "to": "BD" }
    ],
    "script": [
      { "type": "waitUntil", "timeoutMs": 10000, "onTimeout": "continue",
        "cond": { "type": "channels", "of": "input", "present": ["C", "FHL"], "absent": [] } },
      { "type": "if",
        "cond": { "type": "all", "items": [
          { "type": "channels", "of": "input", "present": ["C", "FHL"], "absent": [] },
          { "type": "cmp", "prop": "volume", "op": "le", "value": -20 } ] },
        "then": [ { "type": "set", "prop": "ps.DEH", "value": "MED" } ],
        "else": [ { "type": "set", "prop": "ps.DEH", "value": "OFF" } ] }
    ]
  }]
}
```

### Blocks

| Block | Fields | Notes |
|---|---|---|
| **Triggers** (`when`) | | |
| `change` | `prop`, `param?` (e.g. channel `C`), `from?`, `to?`, `settleMs?` | "when Input changes", "… to Game", "… from Game to Blu-ray" |
| `becomes` | `cond`, `settleMs?` | "when ⟨Volume > −20 dB⟩ becomes true", "when ⟨C and FHL present⟩ becomes true" |
| `schedule` | `at` (HH:MM), `days` | phase 4 |
| **Script** | | |
| `set` | `prop`, `param?`, `value`, `onlyLower?` (volume) | fixed values only |
| `if` | `cond`, `then[]`, `else[]` | |
| `wait` | `ms` (≤ 10 min) | |
| `waitUntil` | `cond`, `timeoutMs` (≤ 10 min), `onTimeout`: `continue` \| `stop` | re-checks on every change of the state and once a second |
| `stop` | | ends the run |
| **Conditions** | | |
| `cmp` | `prop`, `param?`, `op`, `value?` | operators per type (§3) |
| `channels` | `of`: `input` \| `speakers`, `present[]`, `absent[]` | the channel picker (§3) |
| `all` / `any` | `items[]` | AND / OR, any number of items |
| `not` | `item` | |

Later (phase 5): `restore` (put back the values the script replaced).

### Run semantics

1. A trigger matches (§4). Its **settle** time starts (default from the catalog, e.g. 1.5 s after an input change because the receiver restores per-input settings right after switching, about 3 s for input channels because the format can flip during the HDMI handshake). Another match during the settle time restarts it. When it ends, the trigger is checked again ("still Blu-ray?"); if it no longer holds, nothing runs.
2. The script runs top to bottom. **Conditions read the live state when they're evaluated**, not the state at trigger time.
3. Actions are sent one at a time, in order, through the guarded command path (§6).
4. `wait until` is the safe kind of loop: it re-checks its condition whenever the state changes and once a second, until it's true or the timeout ends. `onTimeout: continue` carries on (an *if* below can then branch on the same condition); `stop` ends the run.
5. `concurrency: restart` (default): a new trigger cancels a running script (for example one that is waiting) and starts again. `ignore`: new triggers are dropped while the script runs.

---

## 3. The property catalog

One server module, [server/automation-catalog.ts](../server/automation-catalog.ts), describes every property. The client never hard-codes property lists: it gets the catalog from `GET /api/automation/catalog`, so the editor's menus, value pickers and units always match what the server accepts.

```ts
type PropDef = {
  id: string;                 // 'input', 'volume', 'ps.DEH', 'channel.level', 'input.channel'
  label: string;              // 'Dialog Enhancer'
  group: string;              // 'Power', 'Volume', 'Input & signal', 'Audio', 'Speakers', …
  type: 'number' | 'enum' | 'bool' | 'text' | 'set';
  unit?: 'dB' | 'ms' | 'min' | 'MHz';
  min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[];   // enums; filled from the state for inputs and Quick Select names
  param?: { label: string; options: … };          // e.g. the channel for 'channel.level' and 'input.channel'
  read(ctx, param?): Value | null;                // null = unknown
  write?(value, param?): string[];                // telnet commands, still guarded
  settleMs?: number;
  needsZone?: boolean;                            // the action is skipped while the main zone is off
  onlyLower?: boolean;                            // the action supports "only lower, never raise"
};
```

Values are always in **human units**: dB numbers, enum ids with labels, booleans. Encodings (`MV375`, levels where 50 = 0 dB, `PSLFE 05` = −5 dB) stay inside `read` / `write`, reusing `volToDb`, `dbToVol`, `levelToDb`, `dbToLevel` from parse.ts. Option lists and ranges are the same as the panels', which follow the manual.

| Group | Properties (trigger + condition) | Writable (action) | Phase |
|---|---|---|---|
| Power | Receiver power, Main zone power | both | 1 |
| Volume | Master volume (dB), Mute | volume (fixed value, capped, optional *only lower*), mute | 1 |
| Input & signal | Input; Sound mode (text); Quick Select; Decoder; Sample rate; Audio format (`3/2/.1`); Input channels (count, layout, each channel, list); Active speakers (count, each speaker, list) | input; sound mode (Pure Direct, Direct, Stereo, Multi Ch Stereo, Auto); Quick Select recall | 1 |
| Audio | MultEQ, Dynamic EQ, Ref. level, Dynamic Volume; Dialog Enhancer; Subwoofer on/off and level; LFE; Cinema EQ; Tone control, bass, treble; Loudness management; Dynamic compression; Restorer; Audio delay; Neural:X; Center spread | all | 1 |
| Speakers | Channel level (per channel) | channel level | 1 |
| Speakers | Speaker preset (app preset) | apply speaker preset | 4 |
| Video | Resolution, HDR, color space, pixel depth (in / out) | — | 4 |
| Zone 2 | Power, source, volume, mute | all (Zone 2 volume capped) | 4 |
| General | Sleep timer, ECO, Dimmer, Auto standby, All Zone Stereo, Bluetooth transmitter | all | 4 |
| Tuner | Band, frequency, preset | all (only with input TUNER; the guard enforces this) | 4 |
| HEOS | Play state, source, station, artist, title, album | transport, play favorite N | 4 |
| Time | Time of day, day of week | — | 4 |

Sound mode actions are limited to modes that name one mode. *Movie*, *Music* and *Game* cycle through a category on each press, so they can't be "set" reliably.

**Not in v1:** values that live only in the setup API (port 10443), such as Graphic EQ or Subwoofer Mode. The receiver doesn't push them, and reading them is slow and serialized (some reads hang the receiver for 30 s), so they can't be triggers. Setup-API *actions* are a phase-5 option, limited to a small allowlist and still going through `setup.set`.

### Input channels and active speakers

Rules can test the number of channels in the input stream **and any single channel**: "if **C** and **FHL** are in the signal, then…". The receiver reports two grids (the Status panel's signal view shows both): the **input signal** (which channels the source contains) and the **active speakers** (which speakers are playing, which also depends on the sound mode).

| Property | Type | Examples |
|---|---|---|
| **Input channels (count)** | number, LFE counts as one | 1 mono · 2 stereo · 3 stereo + LFE · 6 for 5.1 · 8 for 7.1 · 10 for 5.1.4 |
| **Input channel layout** | text, `main.lfe[.height]` | `2.0`, `2.1`, `5.1`, `7.1`, `5.1.4` |
| **Input channel** *X* | bool, `param` = channel code | "Input channel C is present" |
| **Input channels** | set of channel codes | used by triggers ("when the input channels change") |
| **Active speaker** *X*, **Active speakers (count)**, **Active speakers** | as above, from the output grid | "Speaker SW is playing" |

**Channel picker.** The `channels` condition is edited as a small speaker-layout grid of chips (the layout of the Status panel's signal view). Tapping a chip cycles *don't care* → *present* (green) → *absent* (red), so "C and FHL present" is two taps. It is true when every marked chip matches.

Source, in order of preference:

1. The audio map's input grid (`AppCommand0300.xml`, [audio-map.ts](../server/audio-map.ts)): cells with `on: true` are the channels in the signal, height channels included.
2. Before the grid arrives (zone just turned on, or the HTTP read failed): `audioFormat` (`SSINFAISFOR`, "front/surround/LFE", `3/2/.1` → 6). It gives the count and layout (no heights) but not the individual channels, so the per-channel properties are *unknown* until the grid arrives, and conditions on them are false.

Still to check on the receiver: the grid and `SSINFAISFOR` agree for stereo PCM, 5.1 Dolby Digital and an Atmos source.

### Comparison operators by type

| Type | Operators (`op`) |
|---|---|
| number | `eq` `ne` `lt` `le` `gt` `ge` `between` (value `[lo, hi]`) |
| enum | `is` `isNot` `in` `notIn` (value list) |
| bool | `isOn` `isOff` |
| text | `is` `isNot` `contains` `notContains` `startsWith` (case-insensitive) |
| set | `has` `hasNot` `hasAny` `hasAll` `empty` `notEmpty` |
| any | `known` `unknown` |

An unknown value (`null`) makes every comparison false except `unknown`.

---

## 4. Server: detecting changes

Changes reach `state` from several places: telnet lines, the HTTP poller, the audio map fetch, HEOS, speaker presets. All of them end in `scheduleBroadcast()`. That is the one hook:

1. In the broadcast timer (index.ts), before sending the snapshot, call `automations.observe()`.
2. `observe` reads the properties that enabled triggers and waiting `wait until` blocks use (only those), compares them with the previous values, and turns each difference into a change event `{ key, from, to }`. `becomes` triggers re-evaluate their condition and fire on false → true.
3. The 40 ms batching merges multi-line bursts (a CV run, a SYSDV pair) into one event per property.

**No triggers from startup noise.** Changes from unknown (`null`) to a value don't fire, and neither does anything during a short warm-up after telnet (re)connects and `REFRESH_QUERIES` fills the state.

---

## 5. Server: the engine

[server/automation.ts](../server/automation.ts), free of I/O like `speaker-presets.ts`, with dependencies injected so tests run on a fake clock:

```ts
new Automations(dataDir, {
  ctx: () => ({ state, audioMap }),       // what the catalog reads
  cmd: (c, who) => sendCommand(c, who),    // the guarded path; who = 'automation: Blu-ray dialog'
  clock: { now, setTimeout, clearTimeout },
  log, changed: () => scheduleBroadcast(), run: (r) => broadcast({ type: 'automation-run', run: r }),
});
```

- Load, validate and save `data/automations.json` (temp file, then rename).
- `observe()` → change events → triggers → settle → runs.
- Runs keep a record: `{ id, automation, trigger, at, status, steps: [{ path, what, result }] }`; the last 100 are kept in memory for the editor (phase 3).
- **Skip needless actions:** if the property already has the value, the action is skipped. This breaks most loops (§6) and avoids audible re-applies.
- **Verify actions:** about 2.5 s after an action, check the property took the value; if not, the run records "not applied by the receiver" (it silently ignores, for example, LFE with PCM, or Dialog Enhancer in Direct).
- **Dry run** (`test`): walk the script against the current state and list what *would* be sent, sending nothing.

REST, in index.ts next to the speaker-presets routes:

| Route | |
|---|---|
| `GET /api/automation/catalog` | the catalog, with option lists filled in from the state |
| `GET /api/automations` | `{ automations, runs }` |
| `POST /api/automations` | `{ action: 'save', automation }` (create or replace; fully validated) · `delete` · `enable` · `run` (run now) · `test` (dry run) |

The snapshot gets a small `automations` summary (`[{ id, name, enabled, disabled, lastRun }]`) so every device sees on/off changes and last results.

Server-side validation on save (never trust the client): known block types, known property ids, operators allowed for the type, values in the option lists or ranges, `param` valid, read-only properties not used in `set`, limits (100 automations, 8 triggers and 100 blocks each, nesting ≤ 8, waits ≤ 10 min, names ≤ 40 characters).

---

## 6. Safety (does not weaken the existing layer)

- **Every action goes through `sendCommand` → `guard()`.** Same allowlist, same `BLOCKED` list, same volume cap (`effectiveCap`), same tuner rule. The log line names the automation.
- The catalog's `write` only builds commands for listed properties; there is no raw-command action.
- **Volume:** fixed values only (`MV<n>`); automations never send `MVUP` / `MVDOWN`. The guard clamps to the cap. **Only lower, never raise** skips the action when the volume is already at or below the value, so a rule can act as a ceiling.
- **Loops** (A sets X, which triggers B, which sets Y, which triggers A…):
  - Needless actions are skipped (§5), so a second pass usually finds nothing to change.
  - A rule that runs more than 10 times in 60 s **turns itself off**, with a log line and a reason the UI shows.
  - Chain depth: changes within 3 s of an automation's action count as caused by it; a run caused by a run caused by a run… stops at depth 3.
- **Power:** actions that need the main zone are skipped (with a note in the run) while it's off. Power actions themselves are allowed.
- **Speaker presets** (phase 4): `apply()` is serialized. The Amp Assign confirmation is asked when the action is created (stored as `confirmAmp`), or the server refuses the rule.
- Runs never call the setup API in v1.

---

## 7. Frontend: the block editor

### Where it lives

- One panel, **Automation** (`id: 'automation'`, `section: 'setup'`, `tab: 'app'` in [panels/index.js](../web/src/panels/index.js)), in the existing **App & Info** tab. No new Setup tab, no new page. Like any panel it can be pinned to Home.
- The panel lists every rule: name, on/off switch, a one-line summary ("When Input changes to Blu-ray · wait until C, FHL · if … set Dialog Enhancer Medium"), last run and result, and **Edit**, **Run now**, **Duplicate**, **Delete**. **New automation** starts an empty rule. A rule the server turned off (loop protection) shows why.
- The editor opens full screen over the app at `#setup/app/rule/<id>` (`/rule/new`), so the browser's back button closes it.

### Editor

```
┌──────────────────────────────────────────────────────────────┐
│ ← Blu-ray dialog          [● On]   Test   ↶ ↷   Save         │
├───────────┬──────────────────────────────────────────────────┤
│ ● Events  │ ╭ when  [Input ▾]  changes to  [Blu-ray ▾] ─────╮ │
│ ● Control │ │ + or when …                                   │ │
│ ● Checks  │ ╰───────────────────────────────────────────────╯ │
│ ● Audio   │ ┃ wait until ⟨ input  [C] [FHL] ⟩  up to [10] s  │
│ ● Volume  │ ┃ ┌ if ⟨ all of ⟨ input [C] [FHL] ⟩                │
│ ● Input   │ ┃ │            ⟨ Volume [≤ ▾] [−20] dB ✔ ⟩  + ⟩    │
│ ● Speakers│ ┃ │   set [Dialog Enhancer ▾] to [Medium ▾]        │
│           │ ┃ ├ else                                           │
│ [search]  │ ┃ │   set [Dialog Enhancer ▾] to [Off ▾]           │
│           │ ┃ └──────                                          │
└───────────┴──────────────────────────────────────────────────┘
```

- **Blocks look like Scratch's**: a rounded *when* hat on top, stacked command blocks that snap under each other, C-shaped *if / else* and *wait until* blocks that wrap their contents, and hexagon-shaped condition blocks that drop into the hexagon slots. Colors per category (events, control, checks, and one per property group), from `app.css` tokens so they follow the theme.
- **Palette**: categories on the left (a bottom sheet on phones), with search. Drag a block into the script, or tap it to insert at the selected gap (on phones, tap a gap in the script first).
- **Fields inside the blocks**: property menu (grouped, searchable), operator menu, and a value field that fits the property: `Seg` or a select for enums, a number stepper or `Slider` for dB values (the panels' ranges), a switch for booleans, the **channel picker** for channels.
- **Moving and editing**: drag a block (with what's inside it) to reorder or nest; each block's ⋯ menu has duplicate, delete, move up / down (the keyboard and accessibility alternative to dragging). Undo / redo. Unsaved changes warn on leave.
- **Live state** (phase 3): every condition shows ✔ / ✘ against the current state, set-blocks show the current value, and the blocks glow in order while a run executes (like a running Scratch script), from the `automation-run` WebSocket message. **Test** does a dry run and highlights the path.
- **Validation** mirrors the server's and outlines the faulty block in red; the server's answer is final.
- It's a vertical stack: no canvas, no pan or zoom, so it works the same on a phone.

**Built by hand in Svelte**, no new dependency. The pieces are a recursive block component, a palette, pointer-event drag-and-drop with drop gaps, and the field editors. Blockly (the library behind Scratch's editor) was considered and left out: it's large and wouldn't look like the rest of the app.

---

## 8. Files

| File | Purpose |
|---|---|
| `server/automation-ops.ts` | operator evaluation, no dependencies (shared with the editor's live ✔/✘ in phase 3) |
| `server/automation-catalog.ts` | property catalog (read / write / encode) |
| `server/automation.ts` | engine: storage, validation, change detection, runs, safety limits |
| `server/automation.test.ts` | tests (§9) |
| `server/index.ts` | wiring: hook in the broadcast timer, REST routes, snapshot summary, run messages |
| `web/src/panels/Automation.svelte` | the list panel (Setup › App & Info) |
| `web/src/lib/automation/Editor.svelte`, `Block.svelte`, `Palette.svelte`, `ChannelPicker.svelte`, fields | the block editor (lazy-loaded) |
| `web/src/lib/automation/store.svelte.js` | catalog, rule being edited, undo stack |
| `web/src/App.svelte` | pass `#setup/app/rule/<id>` on to the panel |
| `CLAUDE.md` | short section on the engine, and "when you add a state field, add it to the catalog" |

---

## 9. Testing

Unit tests (`node --test`, no receiver), with a fake clock:

- Operators: every operator × type, including unknown values.
- Catalog: `read` from sample states; every `write` produces commands the guard accepts; enum options round-trip; input channels (count, layout, each channel) from sample grids (2.0, 2.1, 5.1, 5.1.4) and from the `audioFormat` fallback with per-channel values unknown.
- Change detection: one event per property per batch; nothing from unknown; warm-up.
- Runs: `from` / `to` triggers, `becomes`, settle restart and re-check, if / else, all / any / not, channels, wait, wait until (met later, timeout + continue / stop, cancelled by a new trigger), `restart` / `ignore`, needless-action skip, *only lower*, zone-off skip, verify ("not applied").
- Safety: volume above the cap is clamped by the guard; rate limit turns a rule off; chain depth stops.
- Validation: unknown types and props, wrong operators, out-of-range values, read-only props in `set`, limits.

Live testing on the receiver follows the standing rule: **automations may lower or mute the volume, never raise it**, during tests.

---

## 10. Phases

Each phase ends with a commit that works on its own.

1. **Engine without UI.** Operators, catalog (Power, Volume, Input & signal with the channel properties, Audio, channel levels), change detection, engine (triggers, if/else, wait, wait until, stop, set), storage, REST, safety limits, tests. Usable by posting JSON.
2. **Panel and editor.** Automation panel (list, on/off, run, edit, duplicate, delete, new); full-screen block editor with palette, drag-and-drop, field editors, the channel picker, undo / redo, save and validation.
3. **Live feedback.** ✔ / ✘ and current values in the blocks, run highlighting, Test (dry run), run history.
4. **Rest of the catalog, and time.** Zone 2, Tuner, HEOS, speaker presets (with the Amp Assign confirmation), General, video properties. **Schedule trigger** ("at 23:00 on weekdays") and **time conditions** ("time is between 22:00 and 07:00", "day is Sat or Sun"), in the Pi's local time zone (shown in the editor); a missed time (server down) is not run later. Block comments.
5. **Later, if wanted.** `restore` block, a small allowlist of setup-API actions, templates ("Night mode", "Movie with Atmos"), import / export as JSON.

---

## 11. Decisions

Made on 2026-11-13:

1. **Editor:** Scratch-style blocks, built by hand in Svelte (no dependency). This replaces the first choice, a Node-RED-style node editor with Svelte Flow: the rules work like Scratch scripts (events, if / else, wait, wait until, set), not like Node-RED's data flows, and a vertical block stack works better on a phone than a canvas with wires.
2. **Placement:** one **Automation** panel in Setup › App & Info that lists every rule, with buttons to edit and delete them and to create a new one; the editor opens full screen from there. No new Setup tab, no new page.
3. **Volume:** actions set fixed values only, never relative steps; still capped by the guard, with an optional *Only lower, never raise* switch.
4. **"Channel number"** means the number of channels in the input stream (2 = stereo, 3 = stereo + LFE, 6 = 5.1, …), and rules can also test **individual channels** ("if C and FHL then…") with the channel picker.
5. **Date / time:** schedule triggers and time conditions in phase 4.
6. **Waiting:** *wait* and *wait until* (with a timeout) instead of a general loop block; every run ends.

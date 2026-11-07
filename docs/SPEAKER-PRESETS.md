# Speaker presets

The receiver has two Speaker Presets (slots). The app lets the user keep as many presets as they want. Code: [server/speaker-presets.ts](../server/speaker-presets.ts) (engine), [web/src/panels/SpeakerPresetManager.svelte](../web/src/panels/SpeakerPresetManager.svelte) (add, rename, delete), [web/src/panels/SpeakerPresets.svelte](../web/src/panels/SpeakerPresets.svelte) (Home switcher), [web/src/lib/PresetPicker.svelte](../web/src/lib/PresetPicker.svelte) (dropdown in Quick settings and Speaker setup).

## What a preset holds

A receiver slot stores (manual p.197): Amp Assign, speaker config, distances, levels, crossovers, bass, **MultEQ XT data** and Manual EQ data. Its setup pages also carry Audyssey settings and Front Speaker A/B (they show the per-preset marker, see [SETUP-API.md](SETUP-API.md) §1.10).

The MultEQ XT calibration can't be read or written through any interface, so each app preset is **based on one slot** (`slot: 1 | 2`) and uses that slot's calibration. Everything else is stored in the preset, in groups (`PresetValues`):

| group | read from | written with |
|---|---|---|
| `ampAssign` | speakers/2 | speakers/2 (needs confirmation, see below) |
| `speakerConfig` | speakers/3 | speakers/3, one speaker at a time |
| `bass` | speakers/7 | speakers/7 |
| `crossovers` | speakers/6 | speakers/6 |
| `distances` | speakers/4 | speakers/4 |
| `levels` | speakers/5 | speakers/5 |
| `frontSpeaker` | speakers/8 | speakers/8 (only when Amp Assign = Front B) |
| `audyssey` | audio/9 | telnet `PSMULTEQ:` / `PSDYNEQ` / `PSREFLEV` / `PSDYNVOL` (audio/9 writes return HTTP 500) |
| `graphicEq` | audio/10, plus one read per channel (`opt1`) | audio/10 |

`GROUPS` lists them in apply order: Amp Assign and speaker config come first because they decide which channels the other pages have. Each group writes only values that differ from the receiver, only for channels the receiver currently offers as editable (`display="3"`), and only values in the receiver's own option lists. All writes go through `setup.set` (allowlist, payload validation, backup) or the telnet guard.

Channel Level Adjust (telnet `CV`, the Channel levels panel) is **not** part of a preset: the receiver stores it per input (manual p.111).

To store more settings later (for example tone or sound mode), add an optional group to `PresetValues` and `GROUPS`. Old files load fine because every group is optional, and applying a preset skips groups it doesn't have.

## Slots and ownership

`data/speaker-presets.json` keeps the presets plus:

- `slotOwner`: which preset's values were last written into each slot.
- `active`: the preset whose values are in the receiver's current slot.
- `incomplete`: a preset whose apply failed part-way. Its slot holds a mix, so auto-save is off until it is applied again.

On first run the app creates "Preset 1" and "Preset 2" for the two slots and reads in the active one. The other one is read the first time the receiver switches to it, because switching is audible.

Applying preset P (`apply`):

1. If P changes Amp Assign compared with the receiver now, refuse with `409 { confirm: { kind: 'amp', from, to } }` unless `confirmAmp` is set. The UI shows the wiring warning ([PresetConfirm.svelte](../web/src/lib/PresetConfirm.svelte)) and retries.
2. Read the outgoing preset back from the receiver (catches changes made on the receiver itself).
3. If P owns its slot, just switch slots. That is exactly what the native presets do, and it takes about 9 s, mostly the receiver settling.
4. Otherwise mute the main zone (if it was unmuted), switch slots if needed, save the slot owner's values first if they were never read, write P's values group by group, then unmute. Volume is never touched.

The receiver switching slot by itself (remote, front panel, telnet `SPPR`) is followed: `active` becomes that slot's owner. If the owner was deleted, `active` is null and the UI offers "New preset", which saves the receiver's current settings.

## Auto-save

Like the native presets, edits go into the active preset. After a successful `POST /api/setup/<section>/<type>`, or a telnet change of an Audyssey setting, `noteWrite` marks the affected groups (`groupsForPage`) stale. 2.5 s later they are read back into the active preset, as long as the receiver is still on that preset's slot. Changes made on the receiver's own menus are picked up when the app next reads the preset (power-on, slot switch, before switching away).

## Future: automatic switching

Preset selection is meant to be automated later, by input (one or more inputs select a preset) and by audio format (for example Atmos). The engine is built for that:

- Presets have stable ids, so rules can refer to them after renames. Store rules beside the presets (for example `rules: [{ when: { input: ['BD', 'GAME'] } | { format: 'ATMOS' }, preset: id }]` in the same file) and drop a rule when its preset is deleted.
- `SpeakerPresets.apply()` is server-side and serialised (`busy`), so the telnet `line` handler in index.ts can call it on `SI…` or `SSINFAISFOR…` / `SYSDA…` changes. Debounce format changes, since streams flip format at track starts.
- Automation can't answer the Amp Assign confirmation. Ask for it when the rule is created, and pass `confirmAmp` from the rule. Or refuse rules whose preset changes Amp Assign.
- An apply that writes values mutes for about 2–10 s. For format triggers, prefer presets that own their slot (plain switch), or accept the mute.

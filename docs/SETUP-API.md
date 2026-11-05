# Denon AVR-X1700H setup web API: write spec (from the official web UI)

I worked this out by reading the receiver's own setup web app (`webapp/`: minified jQuery) and the GET responses captured in `cfg/`. **I made no requests to the receiver.** The JS shows what the official UI *sends*. The firmware's behaviour beyond that is inferred and marked as such.

Base URL: `https://192.168.1.50:10443`. The certificate is self-signed.

## Contents
0. [Transport and common conventions](#0-transport-and-common-conventions)
1. [Globals](#1-globals-ajaxglobals) (power, input select, setup lock, speaker preset, …)
2. [Audio](#2-audio-ajaxaudio)
3. [Inputs](#3-inputs-ajaxinputs)
4. [Speakers](#4-speakers-ajaxspeakersget_config-ajaxspeakersset_config)
5. [Video / Network / General / HEOS Account](#video)
6. [Advanced (hidden "CI Menu") and HDMI Diagnostics](#6-advanced-hidden-ci-menu-ajaxadvanced)
7. [control/zone.html (McIntosh zone control)](#7-controlzonehtml-mcintosh-only-ajaxcontrol)
8. [Danger list](#8-consolidated-danger-list)
9. [Quirks and bugs in the official JS that matter for a re-implementation](#9-quirks-in-the-official-js-to-reproduce-or-avoid)

### Which config types this unit supports
Based on the captured `cfg/<section>_<type>.xml` files. An empty file means the request timed out, so the type is unsupported.

| section | supported (non-empty) | unsupported (empty or timed out) | not captured |
|---|---|---|---|
| globals | 1,2,3,4,5,6,7,8,9,10,11 | – | – |
| home | 1 | – | – |
| audio | 3 SubwooferLevel, 4 SurroundParameter, 5 Restorer, 7 Volume, 9 Audyssey, 10 GraphicEQ | 2 CenterLevel, 6 AudioDelay, 8 Bilingual, 11 BassSync, 12 DialogLevel, 13 DACFilter | 14 DiracLive (the X1700H has no Dirac) |
| inputs | 2 InputAssign, 3 SourceRename, 4 HideSources, 5 SourceLevel, 6 InputSelect | – | 1 (menu) |
| speakers | 2,3,4,5,6,7,8,10,11,18 | 9 (2ch Playback) | 12–17, 19 |
| video, network, general, account, advanced, control | – | – | **nothing captured**; documented from the JS only |

`deviceinfo.xml` (the separate AppCommand/HEOS descriptor) lists these menus for this model. Audio: SubwooferLevel, SurroundParameter, Restorer, Audyssey, GraphicEQ. Video: HdmiSetup. Inputs: SourceRename, HideSources, InputSelect. Speakers: SpeakerAB. Network: NetworkInfo. General: ECO, BTTX, ZoneRename, QuickSelectName, FrontDisplay, FirmwareUpdate, SetupLock. The audio list matches the cfg results exactly.

---

## 0. Transport and common conventions

### 0.1 Read
```
GET /ajax/<section>/get_config?type=N[&extra params]&_=<ms timestamp>
```
`globalsServerInterface.getConfig(type, cb, ctx, path, extra)` builds `{type:N}` and then `$.extend`s it with `extra`, the optional 5th argument. `cache:false` adds `_=`. The timeout is 30 s. The response is `text/xml`.

**Calls that pass extra GET params (the 5th argument).** I searched the whole web app; these are the only ones:

| call | params | meaning |
|---|---|---|
| `audio.getGraphicEQ` (when the user picks a channel in the "Adjust EQ" dropdown) | `opt1=<channel code>&opt2=0` | Returns the 9-band curve for that channel. The plain GET returns the curve for `AdjustEQ/Channel`. The channel codes are in §2.6. |
| `general` Firmware (type 11) | `opt1=1` | **Check for update** (network access, 30 s spinner) |
| `general` Firmware (type 11) | `opt1=2` | ⚠⚠⚠ **START FIRMWARE UPDATE**, even though it is a GET to `get_config` |
| `advanced` Log/EDID (type 9) | `opt1=0` | top menu (status) |
| `advanced` Log/EDID (type 9) | `opt1=1` | ⚠ start EDID/log capture (to USB or server) |

`audio.getAudyssey(cb, extra)` also accepts an extra argument, and `AudioServerInterface` defines `CONFIG_OPTION_AUDYSSEY_SETUP=1, _MULTEQ=2, _DYNAMICEQ=3, _DYNAMICVOLUME=4, _LFC=5` and `CONFIG_OPTION_GRAPHICEQ_SPEAKER_SLELECION=1, _SLELECTABLE_SPEAKERS=2, _SLELECTABLE_CHANNEL=3`. **No caller ever passes them.** Audyssey is always fetched with a plain `?type=9`. **SpeakerPreset is never a GET parameter.** Every section reads and writes the *currently active* speaker preset (see §1.10).

### 0.2 Write: `setConfig` (used by almost everything)
```
GET /ajax/<section>/set_config?type=N&data=<encodeURIComponent(xml)>&_=<ts>
```
The JS builds the query string by hand: `"type="+N+"&data="+encodeURIComponent(xml)`. It is passed as jQuery `data` with no `type:` option, so the method is **GET**. The XML is a bare fragment: no `<?xml?>` prolog and no single fixed root. Each setter decides whether to wrap in the section root element, and **many don't**. Copy the exact payloads given per setting. The UI ignores the response body. It waits a fixed delay (0.5–5 s) and then re-GETs the page. Use the same pattern: write, then re-read.

### 0.3 Write: `setPostConfig` (only HEOS sign-in in this build)
```
POST /ajax/<section>/set_post_config/<type>
Content-Type: application/xml
body: encodeURIComponent(xml)      <- URL-encoded, NOT raw XML
```

### 0.4 XML builders (reproduce these exactly)
- `xmlWrap(tag, inner, attrs)` → `<tag a1="v1" a2="v2">inner</tag>`. Attribute values are **not** escaped. A tag that is passed as a one-element array, like `["Source"]`, is stringified to `Source`. A function passed in the attrs slot has `.length==0`, so it adds no attributes; the inputs SourceLevel setter relies on this.
- `setFunctionConfig(value, [t1,t2,…], type, path, cb)` → `<t1><t2>escaped(value)</t2></t1>`, with `t1` outermost.
- `xmlEscape` escapes `& " ' < >`. The JS escapes almost every value. Exceptions: the HEOS password and username, network static IP fields, Crestron fields, and the speaker levels and distances, which are numbers anyway.
- Text names: with `GuiType=1` (this unit) `checkNameForm` removes every character outside printable ASCII `0x20–0x7E`.

### 0.5 Errors and locks
- **HTTP 423 Locked** on any get or set means **Setup Lock is ON**. The UI then shows only a Setup Lock On/Off selector, which still works. See §1.8.
- Any other error: `alert("Failed to set config…")`.
- On the home page, when **MainZone Power ≠ 1** the whole setup menu is greyed out (`LEFT_MENU_GRAY_HOME`). The official UI never lets you change settings with the main zone off. Expect the firmware to refuse, or behave oddly, if you try.
- When `globals System/MenuLock == 1`, only Network and General stay clickable. Inside those, items are downgraded to grey.
- When `globals BtHeadphonesSingleUsed == 1`, the Audio menu is greyed out.

### 0.6 `display` attribute: confirmed from the JS constants
`globalsSettings`: `MENU_UNDEFINED:"0", MENU_NOT_AVAILABLE:"1", MENU_GRAYOUT:"2", MENU_SELECTABLE:"3", MENU_TITLE:"4"`.

| display | meaning | how the UI renders it |
|---|---|---|
| `0` | undefined | hidden |
| `1` | **not available** | hidden; the feature doesn't exist in the current configuration |
| `2` | **grey-out** | the current value is shown as a read-only label. It is not editable right now because of the input signal, the sound mode, another setting, and so on |
| `3` | **selectable** | an editable control |
| `4` | title | used only in setup-menu lists |

The same codes are used for menu-list entries (`listSetupMenu/<Item>` text) and for flag strings such as GraphicEQ `SelectableSpeaker/LR` (one digit per channel).

**The `gray="N"` attribute** (seen in Audyssey: `DynamicEQ gray="0"`, `ReferenceLevelOffset gray="4"`, `DynamicVolume gray="0"`) is **never read by the JS**. It is probably a reason code explaining why the item is greyed. For example, RefLevelOffset `gray="4"` appears together with DynamicEQ off and MultEQ Off. Ignore it, or display it for debugging only.

### 0.7 Common enums
- On/Off: `1`=On, `2`=Off (`SETTING_ON/OFF`). Exceptions: SurroundParameter booleans use **`0`=Off, `1`=On**. Video ScreenSaver/OSD Info use 0/1. General Notifications use 1/0.
- dB×10 ("X10" encoding): `globalsSettings.X10DecToFloat(v)` = `v/10`, and `FloatToX10Dec(f)` = `(10*f).toFixed(0)`. For example, `-30` = −3.0 dB.
- Labels: `languageStrings.getString(id, lang)` uses table `hashStrings_adv` when `GuiType==1` (this unit), and `hashStrings_hd` for `W_*` ids or HD-GUI. The language index is `globals Language` (1 = English) minus 1. All labels in this document are the English strings resolved from `LanguageStrings.js`.

---

## 1. Globals (`/ajax/globals/…`)

`GET /ajax/globals/get_config?type=N`, `GET /ajax/globals/set_config?type=N&data=…`. Every page loads types 1,2,3,4,5,6,7,9,10,11 at startup (`globalsSettings.getAllConfig`).

| type | const | captured value (X1700H) | writable from the UI? |
|---|---|---|---|
| 1 | BRAND | `<Brand>1</Brand>` (1 Denon, 2 Marantz, 3 McIntosh) | no |
| 2 | LANGUAGE | `<Language group="0">1</Language>` | (the UI writes it via general type 2) |
| 3 | FRIENDLYNAME | `<FriendlyName>Home Theater</FriendlyName>` | setter exists (`setDeviceName`) but is unused; the UI uses network type 6 |
| 4 | ZONEPOWER | `<listGlobals><MainZone><Power>1</Power></MainZone><Zone2><Power>3</Power></Zone2></listGlobals>` | **yes** |
| 5 | MODELTYPE | `<ModelType>1</ModelType>` (1 AVR, 2 AVP, 3 AVC, 4 HiFi, 5 Mini, 6 2ch-AVR) | no |
| 6 | ZONE_RENAME | `<ZoneRename><MainZone>MAIN ZONE</MainZone><Zone2>ZONE2</Zone2></ZoneRename>` | (written via general type 6) |
| 7 | SOURCE_LIST | see 1.7 | **yes (input select)** |
| 8 | SETUPLOCK | `<SetupLock>2</SetupLock>` (2 = Off) | **yes** |
| 9 | BTSINGLEUSED | `<BtHeadphonesSingleUsed>0</BtHeadphonesSingleUsed>` (1 = BT headphones exclusive, which greys out the Audio menu) | no |
| 10 | SPEAKER_PRESET | `<SpeakerPreset>1</SpeakerPreset>` (0 = feature absent, 1/2 = active preset) | no (write via speakers type 11) |
| 11 | SYSTEM | `<System><AdvancedMode>1</AdvancedMode><CIMode>2</CIMode><MenuLock>2</MenuLock><GuiType>1</GuiType><HEOSSignIn>3</HEOSSignIn><WebUIType>3</WebUIType><ProductType>258</ProductType></System>` | no |

### 1.4 Zone power (type 4): confirmed encoding
Constants: `POWER_ON:"1", POWER_STANDBY:"2", POWER_OFF:"3"`.
- **`1` = On, `3` = Off (standby)**. Your guess was correct. `2` ("standby") exists as a constant and the UI treats it as "off" for its icon (`[ "", on.png, off.png, off.png ]`), but the UI **never sends `2`**.
- Toggle logic (`homeSettings.handleZonePowerClick`): `new = (current == "1") ? "3" : "1"`.
- Payload. `setZonePower(zone, value)` → `xmlWrap(zone, xmlWrap("Power", value))`. There is no `listGlobals` wrapper:
```
<MainZone><Power>3</Power></MainZone>
GET /ajax/globals/set_config?type=4&data=%3CMainZone%3E%3CPower%3E3%3C%2FPower%3E%3C%2FMainZone%3E
<Zone2><Power>1</Power></Zone2>
GET /ajax/globals/set_config?type=4&data=%3CZone2%3E%3CPower%3E1%3C%2FPower%3E%3C%2FZone2%3E
```
Zone element names: `MainZone`, `Zone2`, `Zone3`, `Zone4`. The X1700H has only MainZone and Zone2.
⚠ **Home page gotcha:** for Denon and Marantz, *clicking a zone row on index.html immediately toggles that zone's power*. It is not a navigation link. For McIntosh the row links to `control/zone.html?id=<Zone>` instead (§7). After a write the UI optimistically updates its cached state and does not re-read.

### 1.7 Source list and input select (type 7)
GET (captured):
```xml
<SourceList>
 <Zone zone="1" index="1">            <!-- zone 1 = Main; index = CURRENT source index -->
  <Source index="1"><Name>Fire TV Stick</Name></Source>   ... 5 Kodi, 3 I-HDMI, 4 Game, 7 AUX1, 8 AUX2, 6 TV Audio, 10 Phono, 11 Tuner, 13 HEOS Music
 </Zone>
 <Zone zone="2" index="19">           <!-- Zone2 current = 19 ("Source" = follow main zone; home_1 shows SourceName "Source") -->
  <Source index="10">Phono</Source> <Source index="11">Tuner</Source> <Source index="13">HEOS Music</Source>
 </Zone>
</SourceList>
```
The list contains only *non-hidden* sources, in display order. Source-index → factory name, from inputs type 3 `<Default>`: 1 CBL/SAT, 3 Blu-ray, 4 Game, 5 Media Player, 6 TV Audio, 7 AUX1, 8 AUX2, 10 Phono, 11 Tuner, 13 HEOS Music. 19 = "Source" (Zone2 follows main), as observed.

**Select input.** This is the footer dropdown on every page (`globalsSettings.createFooter` → `setSource("", ["Source"], attrs)`). The element is *empty*, and the zone and source are given as attributes:
```
<Source zone="1" index="5"></Source>
GET /ajax/globals/set_config?type=7&data=%3CSource%20zone%3D%221%22%20index%3D%225%22%3E%3C%2FSource%3E
```
`zone`: 1 Main, 2 Zone2, 3 Zone3. After the write the UI does `window.location.reload()`.

### 1.8 Setup Lock (type 8)
`setGlobalsConfig(v, ["SetupLock"])` → `<SetupLock>1</SetupLock>` (1 = On/locked, 2 = Off).
```
GET /ajax/globals/set_config?type=8&data=%3CSetupLock%3E2%3C%2FSetupLock%3E   (unlock)
```
⚠ Once the lock is on, every other get or set returns **HTTP 423**. The official UI recovers by showing the selector and sending `2`. Implement that recovery path *before* you ever expose "lock". There is no password in the web flow; on the unit itself, Setup Lock normally needs a PIN. Labels: A_4079 "Lock", A_1540 "General/Setup Lock", A_0612 "Protects access to the setup menus".

### 1.10 Speaker Preset (read here, write via speakers type 11)
`globals type 10` gives `<SpeakerPreset>1</SpeakerPreset>`. If it is ≠ `0`, the UI shows a "[Preset 1]"/"[Preset 2]" badge (A_7325/A_7326) on these pages: audio Audyssey(9), GraphicEQ(10), DiracLive(14); speakers types 2–10, 12, 15–18. These pages hold **per-preset data**, and the responses contain `<SpeakerPreset display="3"/>` as a marker. The JS never reads that marker. To edit preset 2 you must **switch the active preset** (speakers type 11), which changes the sound immediately.

### 1.11 System flags (type 11)
- `AdvancedMode` = 1 here. This is *not* `MENU_SELECTABLE` (3), so the "CI Menu" link to `advanced/advanced.html` is **not shown** on index.html (it is shown only when AdvancedMode == "3"). The page still exists and can be opened directly (§6).
- `CIMode` 1 On / 2 Off (custom-installer mode).
- `MenuLock` 1 = On: the UI greys out every menu except Network and General.
- `GuiType` 1 = ADV (classic) GUI. This selects the label table and the name charset.
- `HEOSSignIn`: 1 = HEOS menu not available (label "HEOS"); otherwise "HEOS Account".
- `WebUIType` 3 = WEBUI_10. If it were 4 (WEBUI_20), index.html would redirect to `../index.html`.

### 1.12 Home menu (`/ajax/home/get_config?type=1`)
`<listHomeMenu><MainZone><ZoneName>MAIN ZONE</ZoneName><SourceName>Fire TV Stick</SourceName></MainZone><Zone2><ZoneName>ZONE2</ZoneName><SourceName>Source</SourceName></Zone2></listHomeMenu>`. This is read-only; the home path has no `set_config`.

---

## 2. Audio (`/ajax/audio/…`)

`GET /ajax/audio/get_config?type=N`, `GET /ajax/audio/set_config?type=N&data=…`. Type 1 is the setup-menu list (`listSetupMenu` with child elements CenterLevelAdjust, DialogLevelAdjust, SubwooferLevelAdjust, BassSync, SurroundParameter, Restorer, AudioDelay, Volume, BilingualMode, Audyssey, DiracLive, GraphicEQ, DACFilter, each holding a display code).

### 2.3 Subwoofer Level Adjust (type 3): supported
GET: `<SubwooferLevelAdjust><SubwooferType><MaxNumber>1</MaxNumber><CurrentNumber>4</CurrentNumber><Mode>0</Mode><Layout>0</Layout></SubwooferType><SubwooferLevel1 display="3">-30</SubwooferLevel1></SubwooferLevelAdjust>`

- `SubwooferLevelN`: dB×10, range **−120 … +120 in steps of 5** (−12.0 … +12.0 dB, 0.5 dB). The current value is −30, i.e. −3.0 dB. Label "Subwoofer" (because MaxNumber = 1; see `getSubwooferDisplayName`).
- On this unit the trim is the *same* value as speakers Levels index 30 (−30). They are probably the same register. **Inferred.**
- Write. There is **no wrapper**:
```
<SubwooferLevel1>-25</SubwooferLevel1>
GET /ajax/audio/set_config?type=3&data=%3CSubwooferLevel1%3E-25%3C%2FSubwooferLevel1%3E
```
  `SubwooferLevel2/3/4` work the same way on multi-sub models.
- Optional on/off (absent here): `<Adjust>1|2</Adjust>` ("Subwoofer Level Adjust" On/Off), sent via `setFunctionConfig(v,["Adjust"])`. No wrapper.

### 2.4 Surround Parameter (type 4): supported
GET (captured):
```xml
<SurroundParameter><CinemaEQ display="3">0</CinemaEQ><LoudnessManagement display="3">0</LoudnessManagement>
<DynamicCompression display="2" mode="drc_auto">1</DynamicCompression><DialogControl display="1"/>
<LowFrequencyEffects display="1"/><CenterSpread display="3">0</CenterSpread><SpeakerVirtualizer display="1"/>
<DTSNeuralX display="1"/><IMAX display="1" mode="ver100"/><IMAXAudioSettings display="1"/>
<HighPassFilter display="1"><Value/><List><Value>40</Value>…<Value>250</Value></List></HighPassFilter>
<LowPassFilter display="1"><Value/><List><Value>80</Value>…<Value>250</Value></List></LowPassFilter>
<SubwooferMode display="1"/><SubwooferOutput display="1"/><CenterImage display="1"/><Panorama display="1"/>
<Dimension display="1"/><CenterWidth display="1"/><AuroMatic3DPreset display="1"/><Auro3DPresetListMovie>1</Auro3DPresetListMovie>
<AuroMatic3DStrenght display="1"/><Auro3DMode display="1"/><DelayTime display="1"/><EffectLevel display="1"/>
<RoomSize display="1"/><SpeakerSelect display="1"/><Subwoofer display="1"/><ChannelExpander display="1"/></SurroundParameter>
```
Which items are available depends on the **current sound mode and input signal**, so re-GET after any sound-mode change. Right now only CinemaEQ, LoudnessManagement and CenterSpread are editable, and DynamicCompression is greyed.

**Every write is wrapped in `<SurroundParameter>`:**
```
<SurroundParameter><CinemaEQ>1</CinemaEQ></SurroundParameter>
GET /ajax/audio/set_config?type=4&data=%3CSurroundParameter%3E%3CCinemaEQ%3E1%3C%2FCinemaEQ%3E%3C%2FSurroundParameter%3E
```
After a write the UI re-GETs type 4 (after 3 s for IMAX and SetDefaults).

| element | label (EN) | values (raw → meaning) | notes |
|---|---|---|---|
| `CinemaEQ` | Cinema EQ | `0` Off, `1` On | **0/1, not 1/2** |
| `LoudnessManagement` | Loudness Management | `0` Off, `1` On | Dolby |
| `DynamicCompression` | Dynamic Compression | `1` Off, `2` Low, `3` Medium, `4` High, `5` Auto (offered only if `mode="drc_auto"`) | captured: `1` Off, greyed |
| `DialogControl` | Dialog Control | `0`…`6` (dB, step 1) | DTS:X |
| `LowFrequencyEffects` | Low Frequency Effects | if `mode="expect_mode71ch"`: `-10`…`0` (dB, step 1). If `mode="mode71ch"`: `0`,`5`,`10`,`15` (dB, 7.1CH IN) | |
| `CenterSpread` | Center Spread | `0` Off, `1` On | Dolby upmixer |
| `SpeakerVirtualizer` | Speaker Virtualizer | `0` Off, `1` On | |
| `DTSNeuralX` | (DTS Neural:X) | `0` Off, `1` On | |
| `IMAX` | IMAX | `ver051`: `1` Off, `2` On, `3` Auto. `ver100` (this unit): `1` Off, `3` Auto | |
| `IMAXAudioSettings` | IMAX Audio Settings | `1` Auto, `2` Manual | |
| `HighPassFilter` | -High Pass Filter | Hz, from `<List><Value>`: 40,60,(70),80,90,100,110,120,150,(180),200,250 | IMAX manual |
| `LowPassFilter` | -Low Pass Filter | Hz, from list: (70),80…250 | IMAX manual |
| `SubwooferMode` | -Subwoofer Mode | `0` Off, `1` On | IMAX |
| `SubwooferOutput` | Subwoofer Output | `1` LFE, `2` LFE+Main | |
| `CenterImage` | Center Image | 0.0…1.0 step 0.1, **sent ×10** (`0`…`10`) | Neo:6 |
| `Panorama` | Panorama | `0` Off, `1` On | PLII Music |
| `Dimension` | Dimension | `0`…`6` | |
| `CenterWidth` | Center Width | `0`…`7` | |
| `AuroMatic3DPreset` | Auro-Matic 3D Preset | `1` Small, `2` Medium, `3` Large, `4` Speech, `5` Movie (Movie only if `Auro3DPresetListMovie==2`; it is `1` here) | |
| `AuroMatic3DStrenght` (sic) | Auro-Matic 3D Strength | `1`…`16`. With mode `auro3dv3`/`auro3dv3_delete3d`: `0`…`15` | |
| `Auro3DMode` | Auro-3D Mode | `1` Channel Expansion, `2` Direct | |
| `DelayTime` | Delay Time | ms: 0,3,6,…,57,60 (step 3), then 70,80,…,300 (step 10) | Matrix mode |
| `EffectLevel` | Effect Level | `1`…`15` | |
| `RoomSize` | Room Size | `1` Small, `2` Medium small, `3` Medium, `4` Medium large, `5` Large | |
| `SpeakerSelect` | Speaker Select | `1` Floor, `2` Floor & Height | |
| `Subwoofer` | Subwoofer | `0` Off, `1` On | |
| `ChannelExpander` | – | (in the GET, but the JS never reads or writes it) | |
| `DynamicCompression_dthd` | – | a tag constant exists but is unused | |

**Set Defaults** ⚠ (resets every surround parameter): `<SurroundParameter><SetDefaults>1</SetDefaults></SurroundParameter>` (type 4).

### 2.5 Restorer (type 5): supported
GET `<Restorer>1</Restorer>`. Values: `1` Off, `2` Low, `3` Medium, `4` High. Denon label "Restorer" (A_0217); Marantz "M-DAX", McIntosh "DFR". Help text: "Restores compressed audio signals". The item is only shown and active for compressed sources and some sound modes.
```
<Restorer>3</Restorer>
GET /ajax/audio/set_config?type=5&data=%3CRestorer%3E3%3C%2FRestorer%3E
```

### 2.7 Volume (type 7): supported
GET `<Volume><Scale>2</Scale><Limit mode="linear">99</Limit><PowerOnLevel>99</PowerOnLevel><MuteLevel>1</MuteLevel></Volume>`

Writes are **bare leaves with no `<Volume>` wrapper**, type 7. The UI re-reads after each one.

| element | values |
|---|---|
| `Scale` | `1` = "0-98" (relative scale), `2` = "-79.5dB - 18.0dB" (absolute dB scale; current) |
| `Limit` (mode="linear", this unit) | `99` = Off (current). `60`…`80` in steps of 1, in volume-scale units (display = value with Scale 1, or value−80 dB with Scale 2; so 60 = −20 dB, 80 = 0 dB). HD-GUI models allow 40…80 |
| `Limit` (non-linear mode, other models) | `1` Off, `2` 60/−20 dB, `3` 70/−10 dB, `4` 80/0 dB |
| `PowerOnLevel` | `99` = Last (current), `0` = Mute, `1`…max (max = 98 if the limit is Off, otherwise the limit value); display value or value−80 dB |
| `MuteLevel` | `1` Full (current), `2` −20 dB, `3` −40 dB (`VOLUME_MUTELEVEL_20dB:"2"`, `_40dB:"3"`) |

Example: `<Limit>70</Limit>`, i.e. `GET /ajax/audio/set_config?type=7&data=%3CLimit%3E70%3C%2FLimit%3E` caps volume at −10 dB. ⚠ `PowerOnLevel` combined with a high fixed value is a "loud surprise" risk. Clamp it in your UI.

### 2.9 Audyssey (type 9): supported, per speaker preset
GET (captured): `<Audyssey><Setup>2</Setup><SpeakerPreset display="3"/><MultEQ group="2" display="3">4</MultEQ><LRBypass>2</LRBypass><DynamicEQ display="2" gray="0">2</DynamicEQ><ReferenceLevelOffset display="2" gray="4">0</ReferenceLevelOffset><DynamicVolume display="2" gray="0">4</DynamicVolume><AudysseyLFC display="1">0</AudysseyLFC></Audyssey>`

- No extra GET params are ever sent (see §0.1).
- `Setup`: `1` = Audyssey calibration completed, `2` = not completed. It is **2 on this unit**. The JS defines the constants but never uses them.
- `MultEQ@group`: `1` "MultEQ", `2` "MultEQ XT" (this unit), `3` "MultEQ XT32". The group is used as the row label.
- `LRBypass`: `2` = enable, meaning the "L/R Bypass" option is offered in MultEQ; `1` = disabled.

Writes are **bare leaves, no `<Audyssey>` wrapper**, type 9, via `setAudioConfig(v,[tag])`:

| element | values | captured |
|---|---|---|
| `MultEQ` | `1` Reference, `2` L/R Bypass (only if LRBypass=2), `3` Flat, `4` Off | `4` Off |
| `DynamicEQ` | `1` On, `2` Off | `2`, greyed (because MultEQ is Off) |
| `ReferenceLevelOffset` | `0`, `5`, `10`, `15` (dB) | `0`, greyed (needs Dynamic EQ on) |
| `DynamicVolume` | `1` Heavy, `2` Medium, `3` Light, `4` Off | `4`, greyed |
| `AudysseyLFC` | `1` On, `2` Off | display 1, so not available |
| `Containmentamount` (sic) | `1`…`7` | not present (LFC models) |
| `SurroundLevelCompensation` | `1` Heavy, `2` Medium, `3` Light, `4` Off (it reuses the Dynamic Volume list) | not present |
```
<MultEQ>1</MultEQ>
GET /ajax/audio/set_config?type=9&data=%3CMultEQ%3E1%3C%2FMultEQ%3E
```
The interdependencies are handled by the firmware: after a write, re-GET to see the new `display` values. Without a completed Audyssey calibration (`Setup=2`), MultEQ Reference/Flat probably either have no effect or are refused. **Inferred.**

### 2.10 Graphic EQ (type 10): supported, per speaker preset
GET (captured):
```xml
<GraphicEQ><Headphone><Inserted>2</Inserted><Enable>2</Enable><SpeakerPreset display="3"/></Headphone>
<Enable>1</Enable><SpeakerPreset display="3"/><SpeakerSelection display="3">3</SpeakerSelection>
<SelectableSpeaker><LR>33311111111131111</LR></SelectableSpeaker>
<AdjustEQ display="3"><Channel display="3">0</Channel><Eq63Hz>0</Eq63Hz><Eq125Hz>0</Eq125Hz><Eq250Hz>0</Eq250Hz>
<Eq500Hz>0</Eq500Hz><Eq1kHz>0</Eq1kHz><Eq2kHz>0</Eq2kHz><Eq4kHz>10</Eq4kHz><Eq8kHz>30</Eq8kHz><Eq16kHz>60</Eq16kHz></AdjustEQ>
<CurveCopy display="1"/></GraphicEQ>
```
- `Enable`: `1` On (current), `2` Off. When `Headphone/Inserted==1` (headphones plugged in; `2` = not inserted), the UI shows **"Headphone EQ"** using `Headphone/Enable`, but the write payload is the same `<Enable>`.
- `SpeakerSelection`: `1` All, `3` Left/Right (current), `2` Each.
- Band gains: **dB×10, −200 … +60, step 5** (the HTML slider has `min=-20 max=6 step=0.5` and the UI sends `10*slider`). Captured: 4 kHz = +1.0, 8 kHz = +3.0, 16 kHz = +6.0 dB on Front L/R.
- **Dolby (height/up-firing) channels:** the UI hides 2k/4k/8k/16k and forces them to `"0"` when the channel is Front/Surround/Back Dolby. For this unit that means Front Dolby L/R: only 63–1k bands are adjustable.

**Channel codes** (`AdjustEQ/Channel`, and `opt1` of the per-channel GET). The meaning depends on SpeakerSelection:

| code | SpeakerSelection = 3 (Left/Right) | SpeakerSelection = 2 (Each) |
|---|---|---|
| 0 | Front L/R | Front L |
| 1 | Center | Front R |
| 2 | Surround L/R | Center |
| 3 | Surround Back L/R | Surround L |
| 4 | Front Wide L/R | Surround R |
| 5 | Front Height L/R | Surround Back L |
| 6 | Top Front L/R | Surround Back R |
| 7 | Top Middle L/R | Surround Back (single) |
| 8 | Top Rear L/R | Front Wide L |
| 9 | Surround Height L/R | Front Wide R |
| 10 | Top Surround | Front Height L |
| 11 | Rear Height L/R | Front Height R |
| 12 | **Front Dolby L/R** | Top Front L |
| 13 | Surround Dolby L/R | Top Front R |
| 14 | Back Dolby L/R | Top Middle L |
| 15 | Surround Back (single) | Top Middle R |
| 16 | Center Height | Top Rear L |
| 17 | – | Top Rear R |
| 18 | – | Surround Height L |
| 19 | – | Surround Height R |
| 20 | – | Top Surround |
| 21 | – | Rear Height L |
| 22 | – | Front Dolby L |
| 23 | – | Front Dolby R |
| 24 | – | Rear Height R |
| 25 | – | Surround Dolby L |
| 26 | – | Surround Dolby R |
| 27 | – | Back Dolby L |
| 28 | – | Back Dolby R |
| 29 | – | Center Height |

`SelectableSpeaker/LR` (or `/Each` in Each mode) is a digit string: **position i holds the display code of channel code i** (3 = selectable). The captured `33311111111131111` means Front L/R (0), Center (1), Surround L/R (2) and Front Dolby L/R (12) are selectable. That matches the 5.1.2 Front-Dolby layout. With SpeakerSelection = 1 (All), `Channel` comes back `display="2"` and the UI shows "All". Missing `Channel` is sent as `"0"`.

**Per-channel read.** When the user picks a channel, the UI does *not* write anything. It re-GETs:
```
GET /ajax/audio/get_config?type=10&opt1=<channel code>&opt2=0
```
and shows that channel's curve. (The firmware then reports `AdjustEQ/Channel` = that code. Inferred.)

**Writes** (type 10, all **wrapped in `<GraphicEQ>`**):
```
Enable:            <GraphicEQ><Enable>2</Enable></GraphicEQ>
Speaker selection: <GraphicEQ><SpeakerSelection>2</SpeakerSelection></GraphicEQ>
Curve (Set btn):   <GraphicEQ><AdjustEQ><Channel>0</Channel><Eq63Hz>0</Eq63Hz><Eq125Hz>0</Eq125Hz><Eq250Hz>0</Eq250Hz><Eq500Hz>0</Eq500Hz><Eq1kHz>0</Eq1kHz><Eq2kHz>0</Eq2kHz><Eq4kHz>10</Eq4kHz><Eq8kHz>30</Eq8kHz><Eq16kHz>60</Eq16kHz></AdjustEQ></GraphicEQ>
Curve copy:        <GraphicEQ><CurveCopy>1</CurveCopy></GraphicEQ>      (display="1" on this unit, so not available)
Set Defaults ⚠:    <GraphicEQ><SetDefaults>1</SetDefaults></GraphicEQ>   (flattens the EQ curves)
```
Example: `GET /ajax/audio/set_config?type=10&data=%3CGraphicEQ%3E%3CAdjustEQ%3E%3CChannel%3E0%3C%2FChannel%3E%3CEq63Hz%3E0%3C%2FEq63Hz%3E…%3C%2FAdjustEQ%3E%3C%2FGraphicEQ%3E`.
Always send all 9 bands plus `Channel`, in that order. After Enable, Selection, Defaults or CurveCopy the UI waits 2 s and re-GETs. After a curve Set it waits only 1 s and does not re-GET.

### 2.x Unsupported on X1700H (empty cfg), payloads for reference only
| type | write |
|---|---|
| 2 Center Level | `<CenterLevel>` dB×10 (−120…120, step 5) |
| 6 Audio Delay | `<AutoLipSync>1/2</AutoLipSync>`, `<Adjust>0…500</Adjust>` ms |
| 8 Bilingual | `<BilingualMode>` 1 Main, 2 Sub, 3 Main/Sub, 4 Main+Sub |
| 11 Bass Sync | `<BassSync>0…16</BassSync>` ms |
| 12 Dialog Level | `<Adjust>1/2</Adjust>`, `<Level>` dB×10 −120…120 step 5 |
| 13 DAC Filter | `<DACFilter>1/2</DACFilter>` (Filter 1/2) |
| 14 Dirac Live | `<DiracLive>v</DiracLive>`: 1 Off, slot index+2 (2,3,4) |

---

## 3. Inputs (`/ajax/inputs/…`)

Source index → factory name (from type 3 `<Default>`): **1 CBL/SAT, 3 Blu-ray, 4 Game, 5 Media Player, 6 TV Audio, 7 AUX1, 8 AUX2, 10 Phono, 11 Tuner, 13 HEOS Music**. Indices 2, 9 and 12 are not on this model.

### 3.2 Input Assign (type 2): supported
GET (abridged):
```xml
<InputAssign><Contents><HDMI>3</HDMI><Digital>3</Digital><Analog>3</Analog><Comp>1</Comp><Video>3</Video><InputMode>3</InputMode></Contents>
 <Source index="1"><Name>Fire TV Stick</Name><HDMI display="3">3</HDMI><Digital display="3">1</Digital><Analog display="3">1</Analog><Video display="3">1</Video><InputMode display="3">3</InputMode></Source>
 … <Source index="6"><Name>TV Audio</Name><HDMI display="2">2</HDMI>…<InputMode display="2">1</InputMode></Source>
 <SelectionList>
  <HDMI><List><Item index="1">-</Item><Item index="3">1</Item><Item index="4">2</Item><Item index="5">3</Item><Item index="6">4(8K)</Item><Item index="7">5(8K)</Item><Item index="8">6(8K)</Item></List></HDMI>
  <Digital><List><Item index="1">-</Item><Item index="5">COAX</Item><Item index="3">OPT1</Item><Item index="4">OPT2</Item></List></Digital>
  <Analog><List><Item index="1">-</Item><Item index="3">1</Item><Item index="4">2</Item></List></Analog>
  <Video><List><Item index="1">-</Item><Item index="3">VIDEO1</Item><Item index="4">VIDEO2</Item></List></Video>
  <InputMode><Source index="1"><List><Item index="3"/></List></Source>…<Source index="6"><List><Item index="1"/></List></Source></InputMode>
 </SelectionList></InputAssign>
```
- `Contents/<Col>`: 3 means that column is shown. Comp = 1, so there is no component column on this unit.
- Cell value = the `Item@index` of the selection list. **HDMI:** 1 "–" (none), 3 HDMI1, 4 HDMI2, 5 HDMI3, 6 HDMI4 (8K), 7 HDMI5 (8K), 8 HDMI6 (8K). **Digital:** 1 –, 3 OPT1, 4 OPT2, 5 COAX. **Analog:** 1 –, 3 "1" (Analog 1), 4 "2" (Analog 2). **Video:** 1 –, 3 VIDEO1, 4 VIDEO2. Value `2` with `display="2"` (TV Audio's HDMI) means fixed/ARC and is shown as "---".
- Current mapping: CBL/SAT "Fire TV Stick" = HDMI1, Media Player "Kodi" = HDMI2, Blu-ray "I-HDMI" = HDMI3, Game = HDMI4, AUX1 = HDMI5, AUX2 = HDMI6.
- `InputMode` per source: 1 "–" (no input), 2 AUTO, 3 HDMI, 4 DIGITAL, 5 ANALOG, 6 ARC, 7 7.1CH IN, 8 eARC. The per-source list in `SelectionList/InputMode` contains only one item for every source here, so the UI shows all of them as read-only labels (a list with one item or fewer is forced to grey).
- `HDMI/List8K` (absent here) is used instead of `List` for the one source named in `List8K/Source@index`.

**Write.** The element is the **column name**, the attribute is the **source index**, and there is no wrapper:
```
<HDMI index="4">7</HDMI>            (Game -> HDMI5)
GET /ajax/inputs/set_config?type=2&data=%3CHDMI%20index%3D%224%22%3E7%3C%2FHDMI%3E
<Digital index="6">3</Digital>      (TV Audio -> OPT1)
<InputMode index="1">2</InputMode>
```
⚠ **Set Defaults** (resets all input assignments): `<SetDefaults></SetDefaults>` (type 2).
The firmware probably auto-unassigns a connector already used by another source. Re-GET after 0.5 s, as the UI does.

### 3.3 Source Rename (type 3): supported
GET: `<SourceRename><CharacterMax>16</CharacterMax><Source index="1"><Default>CBL/SAT</Default><Rename>Fire TV Stick</Rename><Auto>Fire TV Stick</Auto></Source>…</SourceRename>`. `Auto` is the name reported over HDMI CEC, offered as a suggestion.
- Write **one source per request**. The UI sends the changed ones sequentially, each after the previous callback:
```
<Source index="5">Kodi</Source>
GET /ajax/inputs/set_config?type=3&data=%3CSource%20index%3D%225%22%3EKodi%3C%2FSource%3E
```
- Maximum length is `CharacterMax` (16). Characters must be printable ASCII. An empty name is sent as `" "` (a single space). The text is XML-escaped.
- ⚠ Set Defaults (resets all names): `<SetDefaults></SetDefaults>` (type 3).
- After renaming, the UI re-reads `globals type 7`, because the names in the source list change.

### 3.4 Hide Sources (type 4): supported
GET: `<HideSources><Source display="2" index="1"><Hide>3</Hide><Name>Fire TV Stick</Name></Source><Source display="3" index="5"><Hide>1</Hide><Name>Kodi</Name></Source>…</HideSources>`
- Values you can write: `1` Show, `2` Hide.
- Values you can only read, shown when `display="2"`, which explain why the source can't be hidden: `3` = in use by MAIN ZONE (current source; this is why Fire TV Stick is `3`), `4` = in use by ZONE2, `5` = in use by ZONE3, `7` = "Select Source" (A_0109), `8` = "Video Select" (A_0133), `0` = blank.
- Write. The element is `Hide`, with a source-index attribute and no wrapper:
```
<Hide index="7">2</Hide>
GET /ajax/inputs/set_config?type=4&data=%3CHide%20index%3D%227%22%3E2%3C%2FHide%3E
```
Afterwards the UI re-reads `globals type 7`, because hidden sources drop out of the source list.

### 3.5 Source Level (type 5): supported. Applies to the **currently selected source**
GET `<SourceLevels><SourceLevel display="3">0</SourceLevel></SourceLevels>`
- Value: **plain integer dB, −12 … +12, step 1. Not ×10.** The help text reads "Adjusts the input level for the current source".
- Write (no wrapper, no index):
```
<SourceLevel>-2</SourceLevel>
GET /ajax/inputs/set_config?type=5&data=%3CSourceLevel%3E-2%3C%2FSourceLevel%3E
```
- Variant on other models: `<AnalogInputs>` / `<DigitalInputs>`, same range, sent with the element name from the GET.
- To set it for another source, first switch input (`globals type 7`) and then write.

### 3.6 Input Select / Input Mode (type 6): supported. Applies to the **current source**
GET `<InputSelect><InputMode>3</InputMode><List><Auto>1</Auto><HDMI>3</HDMI><Digital>1</Digital><Analog>1</Analog><No>1</No><ARC>1</ARC><Ch7_1IN>1</Ch7_1IN></List></InputSelect>`
- Values: `1` No Input, `2` Auto, `3` HDMI, `4` Digital, `5` Analog, `6` ARC, `7` 7.1CH IN. Only the entries whose `List/<name>` == 3 are offered. Here that is HDMI only.
- Write: `setFunctionConfig(v,["InputMode"])` gives `<InputMode>2</InputMode>`, i.e. `GET /ajax/inputs/set_config?type=6&data=%3CInputMode%3E2%3C%2FInputMode%3E`.


---

## 4. Speakers (`/ajax/speakers/get_config`, `/ajax/speakers/set_config`)

Source: `speakers/SpeakersServerInterface.js`, `speakers/SpeakersSettings.js`, `speakers/speakers.html`.

### Transport (applies to every write below)

* **Read:** `GET /ajax/speakers/get_config?type=N&_=<cache-buster>`. No speakers getter passes extra query params (the 5th `getConfig` argument is never used in this section, and `SpeakerPreset` is **not** a GET parameter here).
* **Write:** every speakers write goes through `globalsServerInterface.setConfig`, which is a **GET** (jQuery default) to `/ajax/speakers/set_config` with the query string built by hand: `type=N&data=<encodeURIComponent(xml)>` (jQuery also appends `&_=<timestamp>` because `cache:false`). The speakers section never uses `setPostConfig`.
* Request timeout is 30 s. An HTTP **423** response means Setup Lock is on (the UI then shows the Setup Lock screen).
* The XML fragment is built with `xmlWrap(tag, value, attrs)`, which gives `<tag a="v">value</tag>`. `setFunctionConfig(value, [t1,t2,...])` nests the tags with `t1` outermost. Values are passed through `xmlEscape` except in `setLevels`/`setDistances`, which use raw numbers.
* **The root element is not consistent.** Some writes are wrapped in the section root (`<AmpAssign>`, `<Distances>`), but most send only the bare child element. Copy the exact payloads below.
* **Reading the response:** the UI ignores the response body. After a write it waits 0.5–5 s and then re-GETs the page.

### `display` / `gray` attribute semantics (`globalsSettings.MENU_*`)

| value | constant | meaning in UI |
|---|---|---|
| `0` | MENU_UNDEFINED | not rendered |
| `1` | MENU_NOT_AVAILABLE | not rendered (feature absent or not applicable) |
| `2` | MENU_GRAYOUT | shown read-only as a label (no `<select>`) |
| `3` | MENU_SELECTABLE | shown and editable |
| `4` | MENU_TITLE | (setup-menu lists only) section title |

The `<SpeakerPreset display="3"/>` child that shows up inside many speaker responses (`Distances`, `Levels`, `Crossovers`, `FrontSpeaker`, `LFEDistribution`) is **not read by the JS**. It only marks the data as belonging to the currently active Speaker Preset. Every read and write acts on the active preset. To edit preset 2 you must first switch to it (type 11 below). The UI shows a "[Preset 1]"/"[Preset 2]" badge on the pages for types 2,3,4,5,6,7,8,9,10,12,15,16,17,18. It uses `globalsSettings.mSpeakerPreset`, which comes from `GET /ajax/globals/get_config?type=10`.

A root attribute `mode="diracmenulock"` on `Distances`/`Levels`/`Crossovers` disables every control (Dirac filter active). On this unit it is `mode="normal"` and `<Dirac display="1"/>`, so there is no Dirac.

### Config types

| type | const | X1700H cfg |
|---|---|---|
| 1 | setup menu (`listSetupMenu`) | not captured |
| 2 | AMPASSIGN | yes |
| 3 | SPEAKERCONFIG | yes |
| 4 | DISTANCES | yes |
| 5 | LEVELS | yes |
| 6 | CROSSOVERS | yes |
| 7 | BASS | yes |
| 8 | FRONTSPEAKER | yes |
| 9 | 2CHPLAYBACK | empty, unsupported |
| 10 | 2CH_RECEIVER_SUBWOOFER (`<Subwoofer>`) | yes (answers, but this is the 2-ch-receiver page and probably not in this model's menu) |
| 11 | SPEAKER_PRESET | yes |
| 12 | XLR_OUTPUT_ASSIGN | not captured (high-end only) |
| 13 | TACTILE_TRANSDUCER | not captured |
| 14 | DIRAC_LIVE_SETUP | static help page, no GET |
| 15 | SPEAKER_LAYOUT | not captured (newer "Speaker Layout" UI used instead of Amp Assign when the setup menu reports `AdvancedSetup` = 4/1) |
| 16 | SUBWOOFER_OUTPUT | not captured |
| 17 | LPF_FOR_LFE | not captured |
| 18 | LFE_DISTRIBUTION | yes (empty list) |
| 19 | ADVANCED_SETUP | the getter references the undefined callback `getAdvancedSetupCallback`, so it is broken or unused |

---

### Speaker / channel index tables (they differ per config type)

There are **four separate index spaces**. Do not mix them up.

#### A. `Levels` (type 5) `<Speaker index>` (label array in `createLevels`)

| idx | channel | idx | channel |
|---|---|---|---|
| 0 | Front L | 18 | Back Dolby R |
| 1 | Center | 19 | Back Dolby L |
| 2 | Front R | 20 | Rear Height L |
| 3 | Front Wide R | 21 | Surround Height L |
| 4 | Surround R | 22 | Top Rear L |
| 5 | Surround Back R | 23 | Surround Dolby L |
| 6 | Surround Back (single) | 24 | Top Middle L |
| 7 | Surround Back L | 25 | Top Front L |
| 8 | Surround L | 26 | Front Dolby L |
| 9 | Front Wide L | 27 | Front Height L |
| 10 | Front Height R | 28 | Center Height |
| 11 | Front Dolby R | 29 | Top Surround |
| 12 | Top Front R | 30 | Subwoofer 1 (named "Subwoofer" when MaxNumber=1) |
| 13 | Top Middle R | 31 | Subwoofer 2 |
| 14 | Surround Dolby R | 32 | Subwoofer 1+2 (gang +/- buttons, not a stored level) |
| 15 | Top Rear R | 33 | Subwoofer 3 |
| 16 | Surround Height R | 34 | Subwoofer 4 |
| 17 | Rear Height R | 35 | All Subwoofers (gang +/- buttons) |

The order runs clockwise from FL through the right side to the back, then up the left side, then the heights.

X1700H current: 0 FL=0, 1 C=+3.0, 2 FR=0, 4 SR=+4.0, 8 SL=+4.0, 11 FDR=+4.0, 26 FDL=+4.0, 30 SW=-3.0 dB.

#### B. `Distances` (type 4) `<List><Speaker index>` (label array in `createDistances`)

| idx | channel | idx | channel |
|---|---|---|---|
| 0 | Front L | 17 | Front Dolby R |
| 1 | Front R | 18 | Top Front L |
| 2 | Center | 19 | Top Front R |
| 3 | Subwoofer 1 | 20 | Top Middle L |
| 4 | Subwoofer 2 | 21 | Top Middle R |
| 5 | Subwoofer 3 | 22 | Surround Dolby L |
| 6 | Subwoofer 4 | 23 | Surround Dolby R |
| 7 | Surround L | 24 | Top Rear L |
| 8 | Surround R | 25 | Top Rear R |
| 9 | Surround Back L | 26 | Surround Height L |
| 10 | Surround Back R | 27 | Surround Height R |
| 11 | Surround Back (single) | 28 | Rear Height L |
| 12 | Front Wide L | 29 | Rear Height R |
| 13 | Front Wide R | 30 | Back Dolby L |
| 14 | Front Height L | 31 | Back Dolby R |
| 15 | Front Height R | 32 | Center Height |
| 16 | Front Dolby L | 33 | Top Surround |

`<DolbySpeakerSetup><Speaker index>`: 0 = Front Dolby, 1 = Surround Dolby, 2 = Back Dolby. This value is the speaker-to-ceiling distance used by Dolby-enabled (up-firing) modules.

X1700H current: 0 FL=228, 1 FR=228, 2 C=216, 3 SW=225, 7 SL=204, 8 SR=204, 16 FDL=228, 17 FDR=228, Dolby[0]=174.

#### C. `Crossovers` (type 6) `<List><Speaker index>`, also Subwoofer-Output "Bass Extraction LPF" (type 16) — speaker *groups* (L/R pairs)

| idx | group | idx | group |
|---|---|---|---|
| 0 | Front | 8 | Top Middle |
| 1 | Center | 9 | Surround Dolby |
| 2 | Surround | 10 | Top Rear |
| 3 | Surround Back | 11 | Surround Height |
| 4 | Front Wide | 12 | Rear Height |
| 5 | Front Height | 13 | Back Dolby |
| 6 | Front Dolby | 14 | Center Height |
| 7 | Top Front | 15 | Top Surround |

X1700H current: 0 Front=80, 1 Center=100, 2 Surround=90, 6 Front Dolby=80 Hz.

#### D. `SpeakerConfig` (type 3) `<Speaker index>` = speaker KIND (groups)

| idx | kind | idx | kind |
|---|---|---|---|
| 0 | Front | 9 | Top Front |
| 1 | Center | 10 | Top Middle |
| 2 | Subwoofer | 11 | Surround Dolby |
| 3 | Surround | 12 | Top Rear |
| 4 | Surround Back | 13 | Surround Height |
| 5 | (number of SB, unlabeled) | 14 | Rear Height |
| 6 | Front Wide | 15 | Back Dolby |
| 7 | Front Height | 16 | Center Height |
| 8 | Front Dolby | 17 | Top Surround |

LFE Distribution (types 7 and 18) uses yet another table: 0 Front, 1 Center, 2 unused, 3 Surround, 4 Surround Back, 5 unused, 6 Front Wide.

---

### Type 2: Amp Assign (`<AmpAssign>`) — **DANGEROUS**

**cfg:** `<AmpAssign><AmpType mode="0" display="3">3</AmpType><AssignMode mode="1">10</AssignMode><SpeakerFor display="1"/><FloorLayout display="1"/><HeightSpeaker display="1"/><ThreeTiersHeightLayout display="1"/><CustomSettings display="1"/><HeightLayout display="1"/><Preout display="1"/><TopSurrOut display="1"/></AmpAssign>`

**Write.** The payload *is* wrapped in `<AmpAssign>`:
```
setAmpAssign(v, ["AmpAssign","AssignMode"])  ->  <AmpAssign><AssignMode>10</AssignMode></AmpAssign>
GET /ajax/speakers/set_config?type=2&data=%3CAmpAssign%3E%3CAssignMode%3E10%3C%2FAssignMode%3E%3C%2FAmpAssign%3E
```
The other sub-fields use the same shape, with `<SpeakerFor>`, `<FloorLayout>`, `<HeightSpeaker>`, `<HeightLayout>`, `<Preout>` or `<TopSurrOut>` in place of `AssignMode`. All of these are `display="1"` on this unit. JS bug: ThreeTiersHeightLayout is sent with the tag name `"ThreeTiersHeightLayout "` (trailing space), which produces malformed XML. Custom mode uses `<AmpAssign><CustomSettings><Terminal index="N">v</Terminal></CustomSettings></AmpAssign>` (13/15-ch models only). After a write the UI waits 2 s and reloads everything.

**AmpType** (read-only): 1=2ch, 2=5ch, **3=7ch (X1700H)**, 4=7ch-DER, 5=9ch+Z2, 6=9ch+Z3, 7=11ch, 8=Pre11ch, 9=13ch, 10=Pre13ch, 11=11ch(max13), 12=15ch, 13=Pre15ch, 14/15=9ch 6-height. `mode="1"` means pre-amp mode is available.

**AssignMode** options for AmpType 3 (the `default:` branch of `getAmpAssignList`):

| value | label |
|---|---|
| 1 | Surround Back |
| 2 | ZONE2 |
| 7 | Bi-Amp |
| 6 | Front B |
| 5 | Front Height |
| 8 | Top Front |
| 9 | Top Middle |
| **10** | **Front Dolby** (current) |
| 11 | Surround Dolby |

The full enum, for reference: 0 unknown, 3 Zone3, 4 Zone mono, 12 "11ch"-style normal, 13 Zone2+3, 14 Bi-Amp+Z2, 15 Full Bi-Amp, 16 Custom, 17 Pre-Amp, 18 Max Audio. The `AssignMode mode="1"` attribute (MAXAUDIO) only matters for 9ch/Pre11 models.

⚠ Changing AssignMode **re-routes the power amp channels**. Speakers wired for Front Dolby would be driven as SB, Zone2, Bi-Amp, and so on. It also changes which channels appear in Levels, Distances and Crossovers, and it resets channel availability. If ZONE2 or Bi-Amp is chosen with speakers wired differently, full-range signal may be sent to tweeters or bi-amp terminals. Treat this as a "setup wizard" action and put it behind a confirmation.

Other enums, for completeness (all `display="1"` on X1700H):
* SpeakerFor: 1 HEIGHT 1, 2 HEIGHT 2, 3 HEIGHT 3, 4 SURROUND BACK.
* FloorLayout: 1 5ch, 2 5ch+SB, 3 5ch+FW, 4 5ch+SB+FW.
* HeightLayout: 1 None, 2 Front Height, 3 Top Front, 4 Top Middle, 5 Top Rear, 6 Rear Height, 7 FH+TM, 8 FH+TR, 9 FH+RH, 10 FH+SH, 11 TF+TR, 12 TF+RH, 13 TM+RH, 14 FH+SH+TS, 15 FH+RH+TS, 16 Front Dolby, 17 Surround Dolby, 18 Back Dolby, 19 FD+TR, 20 FD+RH, 21 FH+SD, 22 TF+SD, 23 FH+BD, 24 TF+BD, 25 FD+SD, 26 FD+BD.
* Preout: 1 Front, 2 Height2, 3 Height3, 4 Surround Back L.
* TopSurrOut: 1 Subwoofer 2, 2 Surr. Back L.

A dropdown is shown only when the element has a `<List><Value>` children list; otherwise the value is shown as a label.

### Type 3: Speaker Config (`<SpeakerConfig>`) — **semi-dangerous**

**cfg:**
```xml
<SpeakerConfig>
 <Speaker index="0"><Value>2</Value><List>2</List><List>3</List></Speaker>   Front  = Small   (opts Small/Large)
 <Speaker index="1"><Value>2</Value><List>1</List><List>2</List></Speaker>   Center = Small   (opts None/Small)
 <Speaker index="2"><Value>4</Value><List>5</List><List>4</List></Speaker>   Subwoofer = Yes  (opts No/Yes)
 <Speaker index="3"><Value>2</Value><List>1</List><List>2</List></Speaker>   Surround = Small (opts None/Small)
 <Speaker index="8"><Value>2</Value><List>1</List><List>2</List></Speaker>   Front Dolby = Small (opts None/Small)
</SpeakerConfig>
```
Indices use table D. The valid values per speaker are exactly its `<List>` entries.

**Value enum:** 0 (unknown), 1 None, 2 Small, 3 Large, 4 Yes, 5 No, 6 1 spkr, 7 2 spkrs, 8 3 spkrs, 9 4 spkrs. Subwoofer count uses 4/5 or 6–9 on multi-sub models.

**Write.** There is no root wrapper:
```
setSpeakerConfig(v, ["Speaker"], [{index:N}])  ->  <Speaker index="1">1</Speaker>
GET /ajax/speakers/set_config?type=3&data=%3CSpeaker%20index%3D%221%22%3E1%3C%2FSpeaker%3E     (Center -> None)
```
Multi-sub models also have `<SwMode index="2">1|2</SwMode>` (1 Standard, 2 Directional) and `<SwLayout index="2">1|2</SwLayout>` (1 Left/Right, 2 Front/Rear; 3 FL/FR/Rear and 4 FL/FR/RL/RR are labels only). These appear only when the GET has `<SwModeLayout>`, which this unit does not have.

The UI reloads after 0.5 s. ⚠ Setting Front=Small with Subwoofer=No, or turning off speakers, changes the bass management and the available channels. Setting the Subwoofer to No sends LFE to the fronts.

### Type 4: Distances (`<Distances>`)

**cfg:** `<Distances mode="normal"><Unit>2</Unit><MsecMax>50</MsecMax><Step>1</Step><SubwooferType>…</SubwooferType><SpeakerPreset display="3"/><M2FConvertRatio>3000</M2FConvertRatio><Dirac display="1"/><List><Speaker index="0" display="3">228</Speaker>…</List><DolbySpeakerSetup display="3"><Speaker index="0" display="3">174</Speaker></DolbySpeakerSetup></Distances>`

**Raw encoding:** the integer is always **centimetres** (meters×100) when Unit is 1 or 2, and **0.1 ms** when Unit = 3 (msec, Dirac-type units). The JS ignores `<Step>` and `<MsecMax>`.

| Unit | meaning | display | UI min / max / step |
|---|---|---|---|
| 1 | Meters | raw/100 (`toFixed(2)`) | 0–18.00 m, step 0.01 |
| 2 | Feet (current) | `MeterToFeet(raw, ratio)` | 0–60.0 ft (59.1 if ratio = 3.048), step 0.1 |
| 3 | msec (read-only label "msec") | raw/10 | 0–50.0 ms, step 0.1 |

`ratio = M2FConvertRatio/1000`. Denon uses **3.000** (0.1 ft = 3 cm exactly, so 1 ft = 30 cm). Some models use 3.048 (true feet).
* Feet from raw (ratio 3): `raw' = raw - (raw % 3)`, then `ft = floor(raw'/30 * 10)/10`. Example: 228 → 7.6 ft; 216 → 7.2; 225 → 7.5; 204 → 6.8; 174 → 5.8. With ratio 3.048: `ft = (raw/30.48).toFixed(1)`.
* Raw from feet: `raw = round(ft/10 * ratio * 100)`. That is `FeetToMeter(ft, ratio) = (ft/10*ratio).toFixed(2)` metres, then ×100 and `toFixed(0)`, capped at 1800. Example: 7.6 ft → 2.28 m → `228`.
* Raw from metres: `raw = m*100`. Raw from msec: `raw = ms*10`.
* Dolby Speaker Setup range: 0.90–3.30 m (3.0–11.0 ft, 10.8 at ratio 3.048), same encoding.
* UI validation (ADV GUI, not msec): every speaker's distance must be within **6 m / 20 ft** of every other speaker's. Otherwise the input reverts. The firmware likely enforces a similar rule.

**Write (Set button).** The UI sends only the changed values, with the `<Distances>` wrapper:
```
<Distances><List><Speaker index="0">231</Speaker><Speaker index="1">231</Speaker></List><DolbySpeakerSetup><Speaker index="0">180</Speaker></DolbySpeakerSetup></Distances>
GET /ajax/speakers/set_config?type=4&data=%3CDistances%3E%3CList%3E%3CSpeaker%20index%3D%220%22%3E231%3C%2FSpeaker%3E…
```
(`<List>` is omitted if no main distance changed, and `<DolbySpeakerSetup>` is omitted if no Dolby distance changed.)

**Unit change.** There is no wrapper: `<Unit>1</Unit>` (`type=4`). Only 1 or 2 can be chosen.

**Set Defaults.** `<SetDefaults></SetDefaults>` (`type=4`). ⚠ This resets all distances of the active preset to factory values, which overwrites Audyssey-measured distances.

### Type 5: Levels (`<Levels>`)

**cfg:** `<Levels mode="normal"><SubwooferType><MaxNumber>1</MaxNumber><CurrentNumber>4</CurrentNumber><Mode>0</Mode><Layout>0</Layout></SubwooferType><Dirac display="1"/><SpeakerPreset display="3"/><List><Speaker index="0" display="3">0</Speaker><Speaker index="1" display="3">30</Speaker>…<Speaker index="30" display="3">-30</Speaker></List></Levels>`

**Encoding:** dB × 10, signed integer. The range is **-120 … +120** (−12.0 to +12.0 dB) in steps of **5** (0.5 dB). For example, `30` = +3.0 dB and `-30` = −3.0 dB. Indices use table A.

**Write (Set button).** The UI sends only the changed channels. The payload is wrapped in `<List>` only; there is **no** `<Levels>` root:
```
setLevels(Map{"1"->35}) -> <List><Speaker index="1">35</Speaker></List>
GET /ajax/speakers/set_config?type=5&data=%3CList%3E%3CSpeaker%20index%3D%221%22%3E35%3C%2FSpeaker%3E%3C%2FList%3E
```
Value is `10*sliderValue` (a JS number, for example `-5` or `35`). Index 32 (SW1+2) and index 35 (All SW) are not stored. They are UI buttons that move indices 30, 31, 33 and 34 together by 0.5 dB, and are blocked if any of them would leave ±12.

**Set Defaults.** `<SetDefaults></SetDefaults>` (`type=5`). ⚠ This resets all channel levels (including Audyssey-calibrated trims) to 0 dB.

`SubwooferType`: MaxNumber 1=1 sub, 2=2, 3=4. CurrentNumber 4=Yes (single), 6..9 = 1..4 subs. Mode 1 Standard, 2 Directional. Layout 1 L/R, 2 F/R. These only affect the subwoofer labels (`globalsSettings.getSubwooferDisplayName`).

### Type 6: Crossovers (`<Crossovers>`)

**cfg:** `<Crossovers mode="normal"><SpeakerPreset display="3"/><Selection display="3">2</Selection><All display="2">80</All><List><Speaker index="0" display="3">80</Speaker><Speaker index="1" display="3">100</Speaker><Speaker index="2" display="3">90</Speaker><Speaker index="6" display="3">80</Speaker></List><SelectableValue><List><Item>40</Item>…<Item>250</Item></List></SelectableValue></Crossovers>`

**Values:** frequency in Hz, taken from `SelectableValue`. This unit offers **40, 60, 80, 90, 100, 110, 120, 150, 180, 200, 250**. `0` means "Full Band" when it is offered, under these rules: always for Front (idx 0); for other groups only if Front is 0; for idx 3 (SB) and idx 4 (FW), Surround (idx 2) must also be 0. This unit's list does not include 0.

**Selection** (Speaker Selection): 1 = **All** (one crossover for every small speaker, using `<All>`), 2 = **Individual** (per-group `<List>`). With Selection=2, `All` comes back `display="2"` (grayed). With Selection=1, the per-speaker entries are expected to become grayed.

**Writes.** All of them have no root wrapper:
```
Selection:       <Selection>1</Selection>                 type=6   (UI shows spinner, then re-GETs)
All:             <All>80</All>                            type=6
Per speaker:     <Speaker index="2">80</Speaker>          type=6   (index = table C)
```
Example: `GET /ajax/speakers/set_config?type=6&data=%3CSpeaker%20index%3D%221%22%3E120%3C%2FSpeaker%3E` sets Center to 120 Hz. Only speakers configured "Small" appear in the list, so the list membership depends on type 3.

### Type 7: Bass (`<Bass>`)

**cfg:** `<Bass><SubwooferMode display="3">1</SubwooferMode><LPFforLFE display="3">120</LPFforLFE><SelectableValue><LPFforLFE><List><Item>80</Item>…<Item>250</Item></List></LPFforLFE></SelectableValue></Bass>`

* **SubwooferMode:** 1 = LFE, 2 = LFE+Main. Some models report `<SubwooferOutput>` (same enum) instead. Write: `<SubwooferMode>2</SubwooferMode>` (`type=7`, no wrapper).
* **LPFforLFE** (Hz): **80, 90, 100, 110, 120, 150, 180, 200, 250** on this unit. Write: `<LPFforLFE>120</LPFforLFE>` (`type=7`, no wrapper). Example: `GET /ajax/speakers/set_config?type=7&data=%3CLPFforLFE%3E150%3C%2FLPFforLFE%3E`. JS bug: the grayed-out label uses the undefined constant `LPFFORLFE_250`.
* **LFE Distribution** (only if the Bass GET contains `<LFEDistribution display="3">`, which it does not here): the "LFE Distribution" button re-GETs type 7 and lists `<List><Speaker index="i">`. The index is 0 Front, 1 Center, 3 Surround, 4 SB, 6 Front Wide. The value is `99` = Off, or `-20,-18,…,-2,0` (dB, step 2). Write, sent to **type 7** with no wrapper: `<Speaker index="0">-10</Speaker>`.

### Type 8: Front Speaker (`<FrontSpeaker>`)

**cfg:** `<FrontSpeaker>1<SpeakerPreset display="3"/></FrontSpeaker>` (text = 1).

The values are 1 = A, 2 = B, 3 = A+B. Write: `<FrontSpeaker>2</FrontSpeaker>` (`type=8`). For example, `GET /ajax/speakers/set_config?type=8&data=%3CFrontSpeaker%3E2%3C%2FFrontSpeaker%3E`. This is only meaningful when Amp Assign = Front B (6). Today the unit is on Front Dolby, so B would have no amp. It is not dangerous, but choosing B with nothing assigned silences the fronts.

### Type 10: "Subwoofer" (2-ch receiver subwoofer page, `<Subwoofer>`)

**cfg:** `<Subwoofer><Value display="3">4</Value><LPF display="3">80</LPF><SelectableValue><List><Item>40</Item>…<Item>250</Item></List></SelectableValue></Subwoofer>`

This page was designed for 2-ch receivers (`ModelType` 6). The X1700H answers it, but it probably mirrors SpeakerConfig[2] and the subwoofer LPF. Prefer types 3 and 6 instead.
* Value: 4 = Yes, 5 = No. Write: `<Value>5</Value>` (`type=10`, no wrapper).
* LPF (Hz, from list 40–250). Write: `<LPF>80</LPF>` (`type=10`).

### Type 11: Speaker Preset (`<SpeakerPreset>`)

**cfg:** `<SpeakerPreset>1</SpeakerPreset>`. This is also readable from `globals` type 10. `0` means the feature is absent (no badge shown).

The values are 1 = Preset 1, 2 = Preset 2. A preset stores the complete speaker setup plus Audyssey calibration. Write: `<SpeakerPreset>2</SpeakerPreset>`, for example `GET /ajax/speakers/set_config?type=11&data=%3CSpeakerPreset%3E2%3C%2FSpeakerPreset%3E`. The UI then waits **5 s** before re-reading. ⚠ Switching the preset instantly changes every speaker setting (config, distances, levels, crossovers, Audyssey). It is not destructive, but it is audible.

### Type 18: LFE Distribution (`<LFEDistribution>`)

**cfg:** `<LFEDistribution><List/><SpeakerPreset display="3"/></LFEDistribution>` (empty list, so the feature is effectively unavailable). The UI would render it with the same code as the Bass sub-page and write `<Speaker index="i">v</Speaker>` to **type 7** (not type 18). The values are 99 = Off and −20…0 dB in steps of 2. Do not expose this on the X1700H.

### Types not on X1700H (brief)

* **9, 2ch Playback** (`<Playback2Ch>`). Writes (`type=9`, no wrapper): `<Setting>1|2</Setting>` (Auto/Manual), `<Front>`, `<Subwoofer>`, `<SubwooferMode>1|2</SubwooferMode>`, `<Crossover>`, `<BassExtractionLPF>`, `<LfeDistribution>`, `<DistanceList><Speaker index>cm</Speaker>…</DistanceList>`, `<LevelList><Speaker index>dBx10</Speaker>…</LevelList>`.
* **12, XLR Output Assign** (`<SwXLROutputAssign>`). Write: `<Speaker index="0..3">v</Speaker>`, with v = 1 Subwoofer, 2 FL, 3 FR, 4 Center, 5 None.
* **13, Tactile Transducer** (`<TactileTransducerSetup>`). Writes: `<TactileTransducer>1|0</TactileTransducer>` (1 = enable, 0 = disable), `<Level>dB×10, −120…120</Level>`, `<LowPassFilter>40|60|70|80|90|100|110|120|150|180|200|250</LowPassFilter>`.
* **14, Dirac Live Setup.** A static help text. There is no API.
* **15, Speaker Layout** (`<SpeakerLayout>`, newer models). Writes: `<Config index="N">v</Config>` and `<Conn index="N">v</Conn>` (Conn: 1 Speaker+PreOut, 2 PreOut). The N indices are the `SPEAKER_LAYOUT_*` rows (1 AmpAssign, 2 Front, 3 Center, … 23 Zone2/3). Same danger level as Amp Assign.
* **16, Subwoofer Output.** Writes: `<SubwooferOutput>1|2</SubwooferOutput>` and Bass Extraction LPF `<Speaker index="(table C)">Hz</Speaker>`, both `type=16`.
* **17, LPF for LFE.** Write: `<LPFforLFE>Hz</LPFforLFE>` (`type=17`).

### Dangerous / destructive operations in this section (summary)

| operation | payload | risk |
|---|---|---|
| Amp Assign mode | type 2 `<AmpAssign><AssignMode>n</AssignMode></AmpAssign>` | re-routes amplifier channels; wrong wiring means bad or unsafe output and a changed channel set |
| Custom amp assign / Speaker Layout | type 2 `<CustomSettings><Terminal>` / type 15 | same |
| Speaker Config | type 3 `<Speaker index>` | changes bass management and the channel set; may invalidate calibration |
| Distances Set Defaults | type 4 `<SetDefaults></SetDefaults>` | wipes calibrated distances (active preset) |
| Levels Set Defaults | type 5 `<SetDefaults></SetDefaults>` | wipes calibrated trims (active preset) |
| Speaker Preset switch | type 11 | swaps the whole speaker and Audyssey configuration |

The speakers section has no test-tone command. The web UI cannot start test tones.

---

<a id="video"></a>
## 5. Video, Network, General, HEOS Account

<!-- Part: Video / Network / General / HEOS Account. Static analysis of webapp/*/ *.js only. -->

> **Data caveat:** no `cfg/video_*`, `cfg/network_*`, `cfg/general_*` or `cfg/account_*` responses were captured, so everything below comes from the JS alone. The XML shapes are what the JS **reads** and **writes**. Whether a given type exists on the X1700H can't be confirmed from these files. To check, run `GET /ajax/<section>/get_config?type=1` (the section's `listSetupMenu`). Each child element holds a display code (0 undefined, 1 not available, 2 grayed, 3 selectable). The JS shows only menu items whose code is 2 or 3.
> `cfg/deviceinfo.xml` describes the separate HEOS/AppCommand API, not this one. It lists Video→`HdmiSetup`, Network→`NetworkInfo`, General→`ECO`, `BTTX`, `ZoneRename`, `QuickSelectName`, `FrontDisplay`, `FirmwareUpdate` and `SetupLock`. It also shows Auto-Standby lists of Main 0/15/30/60 min and Zone2 0/120/240/480 min. Treat that as a hint about which web types exist. Its `CmdNo` numbers are **not** the web-API enum values.

### Transport recap (applies to every row below)
- **`setConfig`** sends `GET <SET_PATH>?type=N&data=<encodeURIComponent(xml)>`, using jQuery's default GET method. It also adds `&_=<timestamp>` because of `cache:false`. Some requests take 5–30 s to return.
- **`setPostConfig`** sends `POST <SET_POST_PATH>/<type>` with `Content-Type: application/xml`. The body is `encodeURIComponent(xml)`: the XML is URL-encoded, not sent raw. In these four sections only the HEOS sign-in uses it.
- **`setFunctionConfig(value, [t1,t2,…])`** builds `<t1><t2>value</t2></t1>`, nesting from the first tag (outermost) to the last. The value is XML-escaped. **Many setters send only the leaf tag, with no `<SectionRoot>` wrapper.** The exact XML is shown in each row.
- **`xmlWrap(tagArray, …)`** gets called with a one-element array as the tag name, which JS converts to that string, so `["Control"]` becomes `<Control>`. Some callers pass a callback function in the attribute slot. A function has `.length` 0, so it adds no attributes.
- An HTTP **423** response means Setup Lock is on (see General → Setup Lock).
- `display` attribute: `0` undefined/hidden, `1` not available/hidden, `2` grayed out (read-only label), `3` selectable. When `globals System/MenuLock==1`, the Network and General menus downgrade every `3` to `2`.
- On/Off convention, unless noted otherwise: `1`=On, `2`=Off. **Exceptions:** Video ScreenSaver and OSD Info/21:9 use `0`=Off/`1`=On, and General Notifications Alerts uses `1`=On/`0`=Off.

---

### 5.1 Video

Paths: `GET /ajax/video/get_config?type=N`, `GET /ajax/video/set_config?type=N&data=…`. All writes use setConfig (GET). No getConfig call in this section passes extra parameters.

| type | Name (label) | Root element on GET |
|---|---|---|
| 1 | setup menu | `listSetupMenu` with children `PictureAdjust, HDMISetup, OutputSettings, ComponentVideo, AnalogVideoOut, OnScreenDisplay, FourKSignalFormat, FourKEightKSignalFormat, FourKEightKSignalFormatPerInput, TVFormat, HDCPSetup, ScreenSaver, HDMIScaler` |
| 2 | Picture Adjust | `PictureAdjust` |
| 3 | **HDMI Setup** (the only one deviceinfo lists for the X1700H) | `HDMISetup` |
| 4 | Output Settings | `OutputSettings` |
| 5 | Component Video | `ComponentVideo` |
| 6 | Analog Video Out | `AnalogVideoOut` |
| 7 | On Screen Display | `OnScreenDisplay` |
| 8 | 4K Signal Format | `FourKSignalFormat` |
| 9 | TV Format | `TVFormat` |
| 10 | 4K/8K Signal Format | the JS reads it with the type-8 parser, so the root element is `FourKSignalFormat` with `mode="fourk_eightk"` |
| 11 | HDCP Setup | `HDCPSetup` |
| 12 | Screen Saver | `ScreenSaver` |
| 13 | HDMI Upscaler | `HDMIScaler` |
| 14 | 4K/8K Signal Format (per input) | `FourKEightKSignalFormatPerInput` |

### type 3 – HDMI Setup (`HDMISetup`)
GET returns children that each carry a `display` attribute. **SET sends the bare leaf element, with no `<HDMISetup>` wrapper.** After each set, the UI re-reads the whole page.

| Element | Data sent (example) | Values |
|---|---|---|
| `HDMIAudioOut` | `<HDMIAudioOut>1</HDMIAudioOut>` | 1 = AVR (amp), 2 = TV |
| `VerticalStretch` | `<VerticalStretch>2</VerticalStretch>` | 1 On / 2 Off |
| `HDMIPassThrough` ("HDMI Pass Through", i.e. standby pass-through) | `<HDMIPassThrough>1</HDMIPassThrough>` | 1 On / 2 Off |
| `PassThroughSource` | `<PassThroughSource>1</PassThroughSource>` | 1 Last, 2 HDMI1, 3 HDMI2, 4 HDMI3, 5 HDMI4, 6 HDMI5, 7 HDMI6, 8 HDMI7, 9 Front. Only the entries present as children of `PassThroughSource/List/<Last/HDMI1…>` are offered; each child's text is its display name. On GET the current value is `PassThroughSource/Source`. |
| `RCSelect` (RC Source Select) | `<RCSelect>1</RCSelect>` | 1 Power On + Source, 2 Source Select Only |
| `HDMIControl` (CEC) | `<HDMIControl>1</HDMIControl>` | 1 On / 2 Off |
| `ARC` | `<ARC>1</ARC>` | 1 On / 2 Off |
| `TVAudioSwitching` | `<TVAudioSwitching>1</TVAudioSwitching>` | 1 On / 2 Off |
| `PowerOffControl` | `<PowerOffControl>1</PowerOffControl>` | 1 All, 2 Video, 3 Off |
| `PowerSaving` | `<PowerSaving>2</PowerSaving>` | 1 On / 2 Off |
| `SmartMenu` | `<SmartMenu>1</SmartMenu>` | 1 On / 2 Off |

Example: `GET /ajax/video/set_config?type=3&data=%3CARC%3E1%3C%2FARC%3E`

⚠ **Use care here:** `HDMIControl`, `ARC` and `PowerOffControl` can make the TV power the AVR off, or the AVR power the TV off. `HDMIAudioOut=2` sends audio to the TV, which mutes the AVR speakers.

### Other video types (probably not on the X1700H; documented for completeness)
| type | SET data the JS builds | Values |
|---|---|---|
| 2 Picture Adjust | `<PictureAdjust><PictureMode>2</PictureMode></PictureAdjust>`; likewise for `Contrast`, `Brightness`, `Saturation` (−50…+50, step 1), `NoiseReduction` (1 Off, 2 Low, 3 Medium, 4 High), `Enhancer` (0…12) | PictureMode: 1 Off, 2 Standard, 3 Movie, 4 Vivid, 5 Streaming, 6 Custom, 7 ISF Day, 8 ISF Night. Values 7 and 8 appear only when `SupportISFMode==3`. The custom fields are shown only when the mode is 6. |
| 4 Output Settings | bare leaf: `<HDMIVideoOutput>`, `<VideoMode>`, `<HDMIUpscaler>`, `<VideoConversion>`, `<IpScaler>`, `<Resolution>`, `<ResolutionAnalog>`, `<ResolutionHDMI>`, `<Sharpness>`, `<ProgressiveMode>`, `<AspectRatio>` | HDMIVideoOutput: 1 Auto(Dual), 2 Monitor1/TV1, 3 Monitor2/TV2 (`mode="monitor"` switches the label). VideoMode: 1 Auto, 2 Game, 3 Movie, 4 Bypass (only when `group="2"`). HDMIUpscaler: 1 Auto, 10 Off. VideoConversion: 1 On, 2 Off. IpScaler depends on `group`: g1 → 1 Analog&HDMI, 2 Analog, 3 Off; g2 → 1 HDMI, 3 Off; g3 → 2 Analog, 3 Off; g4 → 1 On, 3 Off. Resolution*: 1 Auto, 2 480p/576p, 3 1080i, 4 720p, 5 1080p, 6 1080p:24Hz, 7 4K, 8 4K(60/50), 9 8K, filtered by `group` (1 = no 4K60/8K; 2 = no 8K; 3 = 8K-enable list; 4 = 4K-enable list; 5 = Auto/4K/8K; 6 = Auto/4K) and by `mode` (an HDMI-diag max-res code: 3 = 1080p, 4 = 720p, 5 = 480p). Sharpness: 1 On, 2 Off. ProgressiveMode: 1 Auto, 2 Video, 3 Video and Film. AspectRatio: 1 16:9, 2 4:3. |
| 5 Component Video | `<ComponentVideo>1</ComponentVideo>` | 1 MAIN ZONE, 2 ZONE2 |
| 6 Analog Video Out | `<AnalogVideoOut><Component>1</Component></AnalogVideoOut>` and `<AnalogVideoOut><Video>1</Video></AnalogVideoOut>` | 1 Main, 2 Zone2, 3 Zone3 |
| 7 OSD | `<OnScreenDisplay><Volume>1</Volume></OnScreenDisplay>`; likewise `Info`, `NowPlaying`, `WideCinematicDisplay` | Volume: 1 Bottom, 2 Top, 3 Off. Info: **0 Off / 1 On**. NowPlaying: 1 Always On, 2 Auto Off. WideCinematicDisplay ("21:9 Mode"): 0/1 |
| 8 / 10 4K(/8K) Signal Format | `<Format>2</Format>` (no wrapper) | 1 Standard, 2 Enhanced, 4 8K Enhanced (only with `mode="fourk_eightk"`), 3 Custom (only when `MaxResolution==1`) |
| 14 4K/8K per input | `<Format index="<srcIndex>">2</Format>` | same values as above; one `Source index=… display=…` per input, with `Name`, `Format`, `MaxResolution` |
| 9 TV Format | `<TVFormat>1</TVFormat>` | 1 NTSC, 2 PAL |
| 11 HDCP Setup | `<Value index="<srcIndex>">1</Value>` | 1 Auto, 2 1.4, 3 2.3, 4 Custom (only when that source's `Limit==1`) |
| 12 Screen Saver | `<ScreenSaver>1</ScreenSaver>` | **0 Off / 1 On** |
| 13 HDMI Upscaler | `<HDMIScaler>1</HDMIScaler>` | 1 Auto, 10 Off |

⚠ The 4K/8K Signal Format and HDCP settings can break video handshakes with sources or the display.
HDMI diagnostics are not on this page; they live in `advanced/` (`CONFIG_HDMI_DIAG_MENU`), which is covered in the advanced section.

---

### 5.2 Network

Paths: `/ajax/network/get_config`, `/ajax/network/set_config`. All writes use setConfig (GET). No extra GET parameters. When `MenuLock==1`, every network item except Information is grayed out.

| type | Name | GET root |
|---|---|---|
| 1 | setup menu | `listSetupMenu`: `Information, Connection, Settings, NetworkControl, FriendlyName, Diagnostics, AirPlay, SpotifyConnect, RoonReady, TidalConnect, QobuzConnect, CrestronConnected` |
| 2 | Information (read-only) | `Information`: `FriendlyName`, `Connection` (1 none, 2 connecting, 3 Wired, 4 Wireless), `SSID@display`, `DHCP` (1 On / 2 Off), `IPAddress`, `MacAddress/Ethernet`, `MacAddress/WiFi` |
| 3 | Connection | no web UI (the JS does nothing) |
| 4 | Settings (DHCP/IP) | `Settings`: `DHCP`, `IPAddress`, `SubnetMask`, `DefaultGateway`, `DNS` |
| 5 | Network Control | `NetworkControl/Control@display` |
| 6 | Friendly Name | `FriendlyName`: `CurrentName`, `DefaultName` |
| 7 | Diagnostics (read-only) | `Diagnostics`: `Connection`, `RouterAccess` / `InternetAccess` (1 OK / 2 Error) |
| 8 | Crestron Connected | `CrestronConnected`: `AddressName`, `HostName`, `IPID`, `Port` |
| 9 | AirPlay | `AirPlay`: `Value@display`, optional `InHome`, `Name` |
| 10 | Spotify Connect | `SpotifyConnect/Value@display` |
| 11 | Roon Ready | `RoonReady/Value@display` |
| 12 | TIDAL Connect | `TidalConnect/Value@display` |
| 13 | Qobuz Connect | `QobuzConnect/Value@display` |

| type | SET data (exact) | Values / notes |
|---|---|---|
| 4 DHCP on | `<Settings><DHCP>1</DHCP></Settings>` | ⚠⚠ **DANGEROUS: can drop connectivity.** The UI notes: "NOTE: The network connection will reset if you change and save any network setting. Please wait 60 seconds then reload this web page." |
| 4 DHCP off / static | `<Settings><DHCP>2</DHCP><IPAddress>192.168.1.50</IPAddress><SubnetMask>255.255.255.0</SubnetMask><DefaultGateway>192.168.1.1</DefaultGateway><DNS>192.168.1.1</DNS></Settings>` | ⚠⚠ **DANGEROUS.** The element order is exactly as shown. Values are **not** XML-escaped. Each octet goes through `parseInt` (leading zeros stripped) and is clamped to 0–255. The network stack restarts. A wrong value makes the unit unreachable over IP until it is fixed on the OSD or front panel. |
| 5 Network Control | `<Control>1</Control>` | 1 Always On, 2 Off In Standby. ⚠ Setting 2 means the web UI and IP control are **unreachable while the unit is in standby**, so you can no longer power it on over IP. |
| 6 Friendly Name | `<EditName>Home Theater</EditName>` | max 30 characters. `checkNameForm` strips anything outside printable ASCII 0x20–0x7E when GuiType=1. Empty strings are not sent. The UI re-reads after 1 s. Presets in the dropdown: "", DefaultName, Home Theater, Living Room, Family Room, Guest Room, Kitchen, Dining Room, Master Bedroom, Bedroom, Den, Office. The same name is also writable at globals type 3 (`<FriendlyName>`). |
| 6 Set Defaults | `<SetDefaults>{DefaultName}</SetDefaults>` | The text sent is the `DefaultName` from the last GET. |
| 8 Crestron | `<CrestronConnected><AddressName>0</AddressName><HostName>192.168.001.010</HostName><IPID>03</IPID><Port>41794</Port></CrestronConnected>` | AddressName 0 = IP Address, 1 = Host Name. The IP form zero-pads each octet to 3 digits (`000.000.000.000` becomes `192.168.000.000`). A host name is right-padded with spaces to exactly 38 characters. IPID is 2 hex digits in 0x03–0xFE (default 3). Port is 0–64999 (default 41794). **Not XML-escaped.** |
| 9 AirPlay | `<AirPlay>1</AirPlay>` | 1 On / 2 Off |
| 10 Spotify Connect | `<SpotifyConnect>1</SpotifyConnect>` | 1 On / 2 Off |
| 11 Roon Ready | `<RoonReady>1</RoonReady>` | 1 On / 2 Off |
| 12 TIDAL Connect | `<TidalConnect>1</TidalConnect>` | 1 On / 2 Off |
| 13 Qobuz Connect | `<QobuzConnect>1</QobuzConnect>` | 1 On / 2 Off |

The JS has no Wi-Fi/SSID setter: the Connection type does nothing in the web UI.

---

### 5.3 General

Paths: `/ajax/general/get_config`, `/ajax/general/set_config`. All writes use setConfig (GET). When `MenuLock==1`, everything except Owner's Manual and Information is grayed out.

| type | Name | GET root |
|---|---|---|
| 1 | setup menu | `listSetupMenu`: `Language, OwnerManual, ECO, ZONE2Setup, ZONE3Setup, ZONERename, QuickSelectNames, QuickSelectOptions, TriggerOut1, TriggerOut2, TriggerOut3, AutoStandby, FrontDisplay, FrontPanel, Firmware, Information, RemoteID, UsageData, SetupLock, Reset` |
| 2 | Language | `Language@group` (region bitmask index) |
| 3 | ECO | `ECO`: `Mode`, `PowerOnDefault`, `OnScreenDisplay`, `AutoStandby@group` with `MainZone`, `Zone2`, `Zone3` |
| 4 / 5 | ZONE2 / ZONE3 Setup | `ZoneSetup@index` (2 or 3) |
| 6 | Zone Rename | `ZoneRename/Zone@index@display/Rename` |
| 7 | Quick Select Names | `QuickSelectNames/Item@index/Name` |
| 8 / 9 / 20 | Trigger Out 1 / 2 / 3 | `TriggerOut@index@mode`, `Item@index@group/Name/Enable` |
| 10 | Front Display | `FrontDisplay@mode`: `Dimmer`, `Channel@display` |
| 11 | Firmware | `Firmware`: `Update`, `AutoUpdate`, `AllowUpdate`, `UpgradeNotification` |
| 12 | Information (status page) | `Information`: `Audio`, `Video`, `Zone`, `Firmware`, `Notifications` |
| 13 | Remote ID | no web UI |
| 14 | Usage Data | `UsageData/Send@display` |
| 15 | Setup Lock | the UI actually uses **globals type 8** (see below) |
| 16 | Reset | **no web UI**: the JS does nothing and `#func_reset` is empty |
| 17 | Auto Standby (AVP variant) | `AutoStandby@group` |
| 18 | Front Panel | `FrontPanel`: `DisplaysBrightness`, `DisplaysChannel`, `IlluminationBrightness` |
| 19 | Owner's Manual | `OwnerManual`: `ModelName`, `Path` |
| 21 | Quick Select Options | `QuickSelectOptions/Select@index/List/Item@index@display` |

### SET payloads

| type | data (exact) | Values |
|---|---|---|
| 2 Language | `<Language>1</Language>` | 1 English, 2 Deutsch, 3 Français, 4 Italiano, 5 Español, 6 Nederlands, 7 Svenska, 8 Japanese, 9 Chinese, 10 Polski, 11 Russian. The list offered is filtered by region `1<<group`: AMERICA=1 (EN/FR/ES), EUROPE=2, JAPAN=4, CHINA=8. On this unit `globals_2` has `group="0"`, which gives AMERICA, i.e. English/French/Spanish. The same setting is also available at globals type 2. |
| 3 ECO Mode | `<Mode>1</Mode>` (**no `<ECO>` wrapper**) | 1 On, 2 Auto, 3 Off |
| 3 Power On Default | `<PowerOnDefault>3</PowerOnDefault>` | 3 Last, 1 On, 2 Auto, 4 Off |
| 3 ECO OSD | `<OnScreenDisplay>1</OnScreenDisplay>` | 1 Always On, 2 Auto, 3 Off |
| 3 Auto Standby | `<AutoStandby><MainZone>2</MainZone></AutoStandby>`, `<AutoStandby><Zone2>1</Zone2></AutoStandby>`, `<AutoStandby><Zone3>…</Zone3></AutoStandby>` | MainZone: 1 = 15 min, 2 = 30 min, 3 = 60 min, 4 = Off. Zone2/Zone3: 1 = 2 h, 2 = 4 h, 3 = 8 h, 4 = Off. `AutoStandby@group`: 1 = single (only MainZone is shown, labelled "Auto Standby"), 2 = multi-zone (Main, Z2, Z3), 3 = forced single (MainZone only). ⚠ This setting can put the unit into standby. |
| 17 Auto Standby (AVP) | the same `<AutoStandby><MainZone|Zone2|Zone3>…` sent on type 17 | same values |
| 4/5 Zone Setup | bare leaf, sent on type 4 (Zone2) or 5 (Zone3): `<Bass>-2</Bass>`, `<Treble>3</Treble>`, `<HighPassFilter>1</HighPassFilter>`, `<LchLevel>0</LchLevel>`, `<RchLevel>0</RchLevel>`, `<Channel>1</Channel>`, `<HDMIAudio>1</HDMIAudio>` (Zone2 only), `<VolumeLevel>99</VolumeLevel>`, `<VolumeLimit>1</VolumeLimit>`, `<PowerOnVolume>99</PowerOnVolume>`, `<MuteLevel>1</MuteLevel>` | Bass/Treble: plain signed dB integers −10…+10, step 1. The UI strips the "dB" suffix; a `+` sign survives, e.g. `+3`. Lch/RchLevel: −12…+12 dB, step 1. HPF: 1 On / 2 Off. Channel: 1 Stereo / 2 Mono. HDMIAudio: 1 Through / 2 PCM. VolumeLevel: 99 = Variable, 1…98 = fixed level. When `Scale==2` (dB scale) the UI labels a value as value−80 dB; with Scale 1 it shows the raw number. VolumeLimit: 1 Off, 2 = 60 (−20 dB), 3 = 70 (−10 dB), 4 = 80 (0 dB). PowerOnVolume: 99 Last, 0 Mute, 1…max, where max depends on VolumeLimit (Off → 98, 60/70/80). MuteLevel: 1 Full, 2 −20 dB, 3 −40 dB. Each element carries `display`. After Channel, VolumeLevel or VolumeLimit changes, the UI re-reads after 500 ms. |
| 6 Zone Rename | `<List><Zone index="1">MAIN ZONE</Zone><Zone index="2">ZONE2</Zone></List>` | Sends only the zones that changed. An empty name is sent as a single space. Max 10 characters, printable ASCII. index 1 = Main, 2 = Zone2, 3 = Zone3. Values are XML-escaped. |
| 6 Set Defaults | `<SetDefaults></SetDefaults>` | ⚠ resets the zone names |
| 7 Quick Select Names | `<List><Item index="0">…</Item>…</List>` | index 0–3 = Quick Select 1–4. Max 16 characters. Only changed items are sent; empty becomes " ". |
| 7 Set Defaults | `<SetDefaults></SetDefaults>` | |
| 21 Quick Select Options | `<Select index="<qs#>"><Item index="<opt#>">1</Item></Select>` | qs# 0–3. opt#: 1 Name (the value is the new name string, max 16), 2 Input Source, 3 Master Volume, 4 Sound Mode, 5 Channel Level, 6 Balance, 7 Subwoofer, 8 Audyssey Parameters, 9 Restorer (M-DAX/DFR on other brands), 10 HDMI Video Output, 11 Playback Content, 12 Speaker Preset, 13 All Zone Stereo, 14 TV Audio Sharing, 15 Dirac Live, 16 Dialog Enhancer. For options 2–16 the value is 1 Enabled / 2 Disabled (whether that QS slot memorises the item). **Set Defaults for one slot:** `<Select index="<qs#>"><Item index="99">99</Item></Select>`. |
| 8/9/20 Trigger Out | `<Enable index="<itemIdx>" group="<grp>">1</Enable>` | 1 On, 2 Off (shown as "---" unless the TriggerOut has `mode="symbol_off"`). group: 1 Zone (index 0 Main, 1 Z2, 2 Z3), 2 Input (index = source index), 3 HDMI Monitor (0 Monitor1, 1 Monitor2). The root `TriggerOut@index` value 1 means a single "Trigger Out" and 2 means Trigger Out 1. |
| 10 Front Display | `<Dimmer>1</Dimmer>`; `<Channel>1</Channel>` | Dimmer (labelled "Brightness" when `mode="brightness"`): 1 Bright, 2 Dim, 3 Dark, 4 Off. Channel Indicators: 1 Input, 2 Output. |
| 18 Front Panel | `<DisplaysBrightness>1</DisplaysBrightness>`, `<DisplaysChannel>1</DisplaysChannel>`, `<IlluminationBrightness>1</IlluminationBrightness>` | DisplaysBrightness: 1 Bright, 2 Dim, 3 Dark, 4 Off. DisplaysChannel: 1 Input, 2 Output. Illumination: 1 Auto, 2 Bright, 3 Dim, 4 Dark, 5 Off. |
| 11 Firmware settings | `<AutoUpdate>1</AutoUpdate>`, `<TimeZone>28</TimeZone>`, `<AllowUpdate>1</AllowUpdate>`, `<UpgradeNotification>1</UpgradeNotification>` | 1 On / 2 Off for the three switches. Note that GET nests the value as `AutoUpdate/Enable`, `AutoUpdate/TimeZone`, `AllowUpdate/Enable` and `UpgradeNotification/Enable`, but SET sends the bare tag. TimeZone: 1 Sync with device (offered only when it is the current value), 2 Kiritimati +14, 3 Samoa +13, 4 NZ/Fiji +12, 5 Solomon +11, 6 AEST +10, 7 Vladivostok +10, 8 ACST +9.5, 9 JST +9, 10 KST +9, 11 Yakutsk +9, 12 China +8, 13 AWST +8, 14 Irkutsk +8, 15 Krasnoyarsk +7, 16 Myanmar +6.5, 17 Omsk +6, 18 Nepal +5.75, 19 India +5.5, 20 Sri Lanka +5.5, 21 Yekaterinburg +5, 22 Afghanistan +4.5, 23 Samara/Baku +4, 24 Iran +3.5, 25 Moscow +3, 26 Kaliningrad +2, 27 EET +2, 28 CET +1, 29 GMT 0, 30 WET 0, 31 Azores −1, 32 −2, 33 Brasilia −3, 34 Newfoundland −3.5, 35 Atlantic −4, 36 Eastern −5, 37 Central −6, 38 Mountain −7, 39 Pacific −8, 40 Alaska −9, 41 Hawaii −10, 42 −11, 43 −12. |
| 12 Notifications | `<Notifications><Alerts>1</Alerts></Notifications>` | **1 On / 0 Off** |
| 14 Usage Data | `<Send>1</Send>` | 1 Yes / 2 No |

### Firmware update and check: ⚠⚠ DANGEROUS, and both are **GET requests to get_config**
- **Check for update:** `GET /ajax/general/get_config?type=11&opt1=1`. This is the getConfig 5th-argument extra parameter. The UI shows a spinner for 30 s.
- **START UPDATE:** `GET /ajax/general/get_config?type=11&opt1=2`. ⚠⚠⚠ This **starts the firmware update immediately**. The UI text says: "Execute update. Do not turn power off until update is finished. After starting update, note that GUI will shutdown." **Never send `opt1=2` from a read path or a prefetch.** A plain `get_config?type=11` (no opt1, i.e. opt1 = 0, the top menu) is safe.
- Fields in the type-11 response: `Update@display` containing `CheckForUpdate` (button), or `ExecuteUpdate` (an update is in progress), or `FirmwareUpdate` with 1 Latest, 2 Update available, 3 Check error, 4 Upgrade available. It may also contain `Feature` (1 adds features, 2 improvements, 3 stability), `List/Item` and `EstimatedTime` (minutes).

### Setup Lock ⚠ (General menu entry → globals type 8)
`GET /ajax/globals/set_config?type=8&data=<SetupLock>1</SetupLock>`, where 1 = On (locks) and 2 = Off. While the lock is on, setup GET/SET calls return **HTTP 423**. The official UI then shows only the Setup Lock On/Off selector, which still works and sends the same request with `2` to unlock, so this is recoverable over the API. The current value is in `cfg/globals_8.xml` (`2` = Off).

### Reset / Remote ID
No web implementation: `getAllConfig` does a `break` for `CONFIG_RESET` (16) and `CONFIG_REMOTEID` (13), and their divs are empty. Do not guess payloads for type 16.

### Information (type 12)
Read-only apart from the Notifications setting. The UI polls it with a spinner of about 3 s. Useful fields:
- `Zone/MainZone`: `SelectSource`, `Name`, `SoundMode`, `InputMode` (1 No input, 2 Auto, 3 HDMI, 4 Digital, 5 Analog, 6 ARC, 7 7.1CH IN), `ECOMode`, `VideoSelect`, HDMI limitation fields (`HDMILimitationMode@mode`, `LimitMaxRes`, `LimitDeepColor`/`LimitHDCP`/`LimitHDR`/`LimitDolbyVision`/`LimitDTSX`/`LimitAtmos`/`LimitPCM2ch`, where 1 = limited and 2 = no limit), `HDCPSetup`, `VideoMode`, `ContentType` (1 none, 2 Graphics, 3 Photo, 4 Cinema, 5 Game).
- `Zone/Zone2`: `SelectSource`, `Volume`.
- `Audio`: `SoundMode`, `InputSignal`, `SampleRate`, `Format`, `Flag`, `Offset`.
- `Video`: `HDMISignalInfo` with `Resolution`, `HDR`, `ColorSpace`, `PixelDepth`, `ALLM`, `QMS`, `QFT`, `FRLRate`; also `HDMIMonitor[1|2]` with `Interface`, `Resolutions/Value`, `Features`, `MaxFRLRate`.
- `Firmware/Version`, `DTSVersion`.
- `Notifications/Alerts`, `Status` (1 nothing, 2 message present, 3 error), `Message` (`&nl;` marks a newline).

---

### 5.4 HEOS Account

**Note the path: `/ajax/account/…`, not `heosaccount`.** GET uses `/ajax/account/get_config`, SET uses `/ajax/account/set_config`, and POST uses `/ajax/account/set_post_config/<type>`. The menu is hidden for McIntosh. When `globals System/HEOSSignIn==1` the left-menu label becomes "HEOS" and a "not signed in" message is shown instead.

| type | Name | Notes |
|---|---|---|
| 1 | setup menu | `listSetupMenu`: `HaveAccount, CreateAccount, ForgotPassword, ChangeLocation, ChangePassword, DeleteAccount, SignOut, NotSignedInMsg` |
| 2 | Sign in ("I have an account") | **POST** (the only setPostConfig use in these sections) |
| 3 / 4 / 5 / 6 | Create account, Forgot password, Change location, Change password | **no web implementation** (break) |
| 7 | Delete Account | ⚠ **no web implementation** (break; `#func_delete_account` is empty). Do not invent a payload. |
| 8 | Sign Out | GET setConfig |
| 9 | Account status | `AccountStatus`: `SignedIn` (0 signed out / 1 signed in), `Username`, `Error` (0 none/unknown, 1 invalid credentials, 2 user not found) |

- **Sign in:** `POST /ajax/account/set_post_config/2` with `Content-Type: application/xml`. The body is `encodeURIComponent("<Account><Username>user@example.com</Username><Password>secret</Password></Account>")`. ⚠ The JS does **not** XML-escape the username or password: it computes the escape and then discards it. Escape them yourself. Max 254 characters each. Afterwards re-read type 9 and check `Error`. The UI first checks `SignedIn==0`.
- **Sign out:** `GET /ajax/account/set_config?type=8&data=%3CSignOut%3E%3C%2FSignOut%3E` (data = `<SignOut></SignOut>`). ⚠ This **signs the AVR out of HEOS**, which affects HEOS favourites and streaming services. The UI only sends it after confirming `SignedIn==1`.

---

## 6. Advanced: hidden "CI Menu" (`/ajax/advanced/…`)

Page: `advanced/advanced.html`. index.html links to it only when `globals System/AdvancedMode == 3`. **On this unit it is `1`, so the link is hidden.** The page itself does not check that flag.
- The landing screen shows warning W_0179: "The CI Menu is intended for use only by authorized Denon custom installation professionals… Continue at your own risk", with a **Continue** button. There is also a password variant (`handleSetPasswordChange`) whose "password" is simply the **model name** returned in `listSetupMenu/ModelName` (for example `AVR-X1700H`). That check is client-side only, so it is not a security boundary.
- Paths: `GET /ajax/advanced/get_config`, `GET /ajax/advanced/set_config`. `SET_POST_PATH /ajax/advanced/set_post_config` is defined but never used.
- None of these types were captured, so the payloads below come from the JS only.

| type | const | GET root |
|---|---|---|
| 1 | setup menu | `listSetupMenu` (includes `ModelName`) |
| 2 | ADVANCED_SUB_MENU | `ListAdvancedSubMenu`: `Settings`, `HDMIDiag` (display codes) |
| 3 | ADVANCED_SETTINGS | `AdvancedMenu` |
| 4 | HDMI_DIAG_MENU | `ListHDMIDiagMenu`: `VideTest` (sic), `AudioTest`, `CableTest`, `LimitMode`, `LogEDID`, `Status` |
| 5 | HDMI_DIAG_VIDEO_TEST | `HDMIDiagVideoTest` (`Status`, `Url`, …) |
| 6 | HDMI_DIAG_AUDIO_TEST | `HDMIDiagAudioTest` |
| 7 | HDMI_DIAG_CABLE_TEST | `HDMIDiagCableTest` (results per 8K40G/8K32G/8K24G/4K18G/4K9G/1080p: 1 pass, 2 fail) |
| 8 | HDMI_DIAG_LIMIT_MODE | `HDMIDiagLimitMode@mode` with `Setting/Item`, `Source@index/Name`, `List/Item@index@display` |
| 9 | HDMI_DIAG_LOG_EDID | `HDMIDiagLogEDID`: `Status`, `USB`, `Server`, `FileName`, `Logid`. **Requires `opt1`** (see §0.1) |

### 6.1 CI Menu / Settings (type 3)
`AdvancedMenu` children, each with `display`: `CIMode`, `AirPlay`, `Spotify`, `Roon`, `Tidal`, `Qobuz`, `Bluetooth`, `HEOSApp`, `RemoteApp`, `HDMIControl`, `NetworkControl`, `AutoStandby`, `AllowUpdate`, `UsageData`, `MenuLock`, `PanelLock`, `RemoteLock`. Read-only fields: `IPAddress`, `Ethernet`, `WiFi`, `SerialNumber`.

**Write.** Bare leaf, no wrapper (`setAdvancedMenu(v, tag)` gives `<tag>v</tag>`), type 3:

| element | values |
|---|---|
| `CIMode`, `AirPlay`, `Spotify`, `Roon`, `Tidal`, `Qobuz`, `Bluetooth`, `HEOSApp`, `RemoteApp`, `HDMIControl`, `AllowUpdate`, `MenuLock`, `RemoteLock` | `1` On, `2` Off |
| `NetworkControl` | `1` Always On, `2` Off In Standby ⚠ (the unit becomes unreachable over IP while in standby) |
| `AutoStandby` | `1` 15 min, `2` 30 min, `3` 60 min, `4` Off |
| `UsageData` | `1` Yes, `2` No |
| `PanelLock` | `1` Off, `2` Front Panel, `3` Front Panel & Volume Knob |
| `CIModeReset` ⚠ | `<CIModeReset>1</CIModeReset>`: resets the CI settings |
| `Reboot` ⚠⚠ | `<Reboot>1</Reboot>`: **reboots the AVR immediately** |

Example: `GET /ajax/advanced/set_config?type=3&data=%3CReboot%3E1%3C%2FReboot%3E`.
⚠ Several of these can lock you out. `RemoteApp=2` probably disables network control apps (inferred). `RemoteLock` disables the IR remote. `PanelLock=3` locks the front-panel buttons and the volume knob. `MenuLock=1` greys out most of the setup UI.

### 6.2 HDMI Diagnostics (types 4–9): ⚠ actively drives hardware
- **Just opening the HDMI Diagnostics menu sends a write.** `getAllConfig` for screen 4 calls `setHDMIDiag("0", 4)`, which sends `GET /ajax/advanced/set_config?type=4&data=<value>0</value>` (TEST_START). That starts a **hardware self-check**. The UI then polls type 4 while `Status`=2 ("Checking hardware..."). `Status`=3 means pass. Values 4–19 are error codes H1-01 to H1-16. When finished it sends `<value>1</value>` (TEST_NORMAL) to return to normal.
- Generic payload: `setHDMIDiag(v, type)` → `<value>v</value>`, where `v` = `0` start or `1` back to normal.
  - Video test: type 5 `<value>0</value>` start (outputs a test pattern to the TV), `<value>1</value>` stop.
  - Audio test: type 6, same values (plays a test signal).
  - Cable test: type 7 `<value>0</value>`. Results are reported per bandwidth.
- **Limit Mode** (type 8) caps per-source HDMI capabilities: `<Source index="S"><Item index="I">V</Item></Source>`.
  - Item index: 1 EDID copy/preset, 2 Max Resolution, 3 HDCP, 4 HDR, 5 Deep Color, 6 Dolby Vision, 7 DTS:X, 8 Dolby Atmos, 9 PCM 2ch.
  - EDID values: 1 Default, 2 Copy M1, 3 Copy M2, 4 Copy Z2, 5–16 presets P1–PC (1080p … 8K40G, either "PCM/DOLBY/DTS" or "HD Audio").
  - Max-resolution values: 1 No Limit, 2 4K(3G), 3 1080p, 4 720p, 5 480p, 6 4K18G, 7 4K9G.
  - HDCP values: 1 Limit, 2 No Limit, 3 2.3, 4 1.4.
  - Other items: 1 Limit, 2 No Limit.
  - Reset one source ⚠: `<Source index="S"><Item index="99">1</Item></Source>`. Reset all ⚠: `<ResetAllSettings>1</ResetAllSettings>` (type 8).
  - ⚠ Wrong values break video and audio handshakes.
- **Log/EDID** (type 9). `GET …?type=9&opt1=1` starts logging to a USB stick or to the Denon server (30 s spinner). `opt1=0` is the status view.

Do **not** expose HDMI diagnostics in a casual UI. At minimum, never auto-open screen 4.

---

## 7. `control/zone.html` (McIntosh only, `/ajax/control/…`)
This page is reachable only when `Brand == 3` (McIntosh). Clicking a zone on index.html opens `control/zone.html?id=MainZone|Zone2|Zone3`. On Denon, clicking a zone toggles power instead (§1.4). The X1700H firmware might not implement `/ajax/control` at all. **Untested.** It is still a useful reference for a "remote" page.

- Read: `GET /ajax/control/get_config?type=1` (MainZone), `type=2` (Zone2), `type=3` (Zone3). The page polls **every 1 s**. The root is `<MainZone>`, `<Zone2>` or `<Zone3>`, with the fields `Power`, `Source`, `Volume`, `VolumeScale`, `VolumeLevel`, `VolumeLimit`, `Mute`, `SoundMode`.
- Write: `setFunctionConfig(v,[tag])` gives a bare leaf, `GET /ajax/control/set_config?type=<1|2|3>&data=…`:

| element | values |
|---|---|
| `Volume` | absolute ×10 with 0 = −80 dB, so dB = (v−800)/10. Max 980 (+18 dB) or the limit (600/700/800 for VolumeLimit 2/3/4). The UI steps ±5 (0.5 dB) in the Main zone and ±10 in other zones. It refuses to change volume while `VolumeLevel` ≠ 99 (fixed-level zone). |
| `Mute` | `1` On, `2` Off (the UI toggles) |
| `QuickSelect` | `1`…`4` (recalls Quick Select 1–4) |
| `SoundMode` | `1` MOVIE, `2` MUSIC, `3` GAME, `4` PURE (Main zone only) |

  Note: in ControlSettings `VOLUME_SCALE_ABS:"1"` and `VOLUME_SCALE_REL:"2"` are named the opposite way round from AudioSettings, but the behaviour agrees. `VolumeScale==2` shows dB (`(Volume-800)/10`) and `1` shows the 0–98 scale (`Volume/10`).
- Power on this page uses globals type 4 (§1.4), and source uses globals type 7 (§1.7).

---

## 8. Consolidated danger list

| severity | what | request |
|---|---|---|
| ⚠⚠⚠ | **Firmware update starts on a GET** | `GET /ajax/general/get_config?type=11&opt1=2`. Never let a generic "fetch config" helper add `opt1` |
| ⚠⚠ | Firmware check (network access, may prompt) | `GET /ajax/general/get_config?type=11&opt1=1` |
| ⚠⚠ | Reboot | advanced type 3 `<Reboot>1</Reboot>` |
| ⚠⚠ | Static IP / DHCP change, which drops the connection (reload after about 60 s) | network type 4 `<Settings><DHCP>…` |
| ⚠⚠ | Network Control = Off In Standby, after which the unit can't be woken over IP | network type 5 `<Control>2</Control>`, advanced type 3 `<NetworkControl>2</NetworkControl>` |
| ⚠⚠ | Setup Lock On: every call returns 423 until unlocked | globals type 8 `<SetupLock>1</SetupLock>` (unlock with `2`) |
| ⚠⚠ | Menu / Panel / Remote lock | advanced type 3 `<MenuLock>`, `<PanelLock>`, `<RemoteLock>` |
| ⚠⚠ | Amp Assign: re-routes amplifier channels | speakers type 2 `<AmpAssign><AssignMode>n</AssignMode></AmpAssign>` |
| ⚠⚠ | HDMI diagnostics: hardware self-test that starts merely by opening the menu, plus video/audio test signals, cable test, Limit Mode (EDID/HDCP caps), Log capture | advanced types 4–9 |
| ⚠ | HEOS sign-out (no web "delete account" exists) | account type 8 `<SignOut></SignOut>` |
| ⚠ | Set Defaults: Surround Parameter, Graphic EQ, Input Assign, Source Rename, Zone Rename, Quick Select, Distances, Levels | `<SurroundParameter><SetDefaults>1</SetDefaults></SurroundParameter>` (audio 4), `<GraphicEQ><SetDefaults>1</SetDefaults></GraphicEQ>` (audio 10), `<SetDefaults></SetDefaults>` (inputs 2/3, general 6/7, speakers 4/5) |
| ⚠ | Speaker Config / Speaker Preset switch | speakers types 3, 11 |
| ⚠ | Zone power toggle: one click on a home-page row | globals type 4 |
| ⚠ | HDMI Control / ARC / Power-Off Control / HDMI Audio Out = TV | video type 3 |
| ⚠ | Auto Standby / ECO | general type 3, advanced type 3 |
| ⚠ | Volume Power-On Level / Limit (loudness) | audio type 7 |
| info | Factory **Reset** (general type 16) and HEOS **Delete Account** (account type 7) are **not implemented** in this web UI. No payload exists to copy, so don't guess one. | – |

---

## 9. Quirks in the official JS to reproduce (or avoid)
1. Writes are **GET** requests with URL-encoded XML in `data=`. Only HEOS sign-in uses POST, and its body is URL-encoded too.
2. **Wrapper inconsistency.** These **are wrapped**: audio SurroundParameter (`<SurroundParameter>`), audio GraphicEQ (`<GraphicEQ>`), speakers AmpAssign and Distances, zone power (`<MainZone><Power>`), network Settings, Crestron, and some video types. These **are not**: audio Volume (`<Scale>`, `<Limit>`…), Audyssey (`<MultEQ>`…), Restorer, SubwooferLevel, every inputs write, speakers Levels (`<List>` only), Crossovers, Bass, and most general and video leaves. Follow the per-setting payloads exactly.
3. Attribute values are not escaped. Use numeric indices only.
4. Different value encodings across pages:
   - SurroundParameter booleans use 0/1, while most other On/Off settings use 1/2.
   - Levels, subwoofer level and EQ use dB×10.
   - SourceLevel and Zone bass/treble/levels use plain dB.
   - Distances are in cm, with feet derived via ratio 3.0.
   - Main volume (control page) is ×10 with an offset of 800 for 0 dB.
5. Each speakers page has its **own channel index table** (Levels ≠ Distances ≠ Crossovers ≠ SpeakerConfig ≠ GraphicEQ codes). See the Speakers section and §2.10.
6. The GraphicEQ channel view is a **GET with `opt1=<channel>&opt2=0`**, not a write.
7. The response bodies of writes are ignored. The UI uses fixed delays (0.5–5 s) and then re-GETs. Your re-implementation should re-GET too, because `display` values cascade (for example, MultEQ Off greys Dynamic EQ).
8. Bugs:
   - The `ThreeTiersHeightLayout ` tag has a trailing space, which produces malformed XML.
   - The HEOS credentials escape is computed and then discarded.
   - `getAdvancedSetupCallback` and `LPFFORLFE_250` are undefined.
   - LFE Distribution writes go to speakers type 7, not 18.
   - `getSurrondParameterCallback` reads `HighPassFilter.Value[#text]`, which is undefined when `<Value/>` is empty. It is harmless because those items have `display="1"`.

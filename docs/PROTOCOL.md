# Denon AVR-X1700H — control protocol notes

Findings from probing the receiver at `192.168.1.50` (firmware AVR D400-9123-9071-9031, HEOS 3.139.173)
plus community research. Everything here was verified read-only on the actual unit unless marked *(unverified)*.

The receiver exposes **four** interfaces:

| Port | Protocol | Used for | Notes |
|---|---|---|---|
| 23 | Telnet (raw TCP, `\r`-terminated ASCII) | Real-time control + push status | **One client at a time.** ≥50 ms between commands. |
| 8080 | HTTP `/goform/*` | Control + status (what the Denon AVR Remote app uses) | Fallback when telnet is busy. |
| 10443 | HTTPS `/ajax/*` (self-signed) | The official *Setup* web UI | Unauthenticated XML get/set of setup menu. |
| 1255 | HEOS CLI (TCP, JSON lines) | Now playing, album art, transport, events | Up to 32 sockets. |

---

## 1. Telnet (port 23)

Send `CMD\r`. Queries end in `?` (some need a space: `PSDYNEQ ?`). The receiver also **pushes** every state
change, so a persistent socket gives an instant live view.

### Core
```
PWON / PWSTANDBY / PW?            ZMON / ZMOFF / ZM?          (main zone)
MV? -> "MV375" (= 37.5 → -42.5 dB; dB = n - 80) , "MVMAX 91"
MVUP / MVDOWN / MV40 / MV405       MUON / MUOFF / MU?
SI? -> SISAT/CBL ; SI<src>  src ∈ SAT/CBL DVD BD GAME MPLAY TV AUX1 AUX2 CD PHONO TUNER NET BT
MS? -> MSDOLBY AUDIO-DSUR ; MSMOVIE / MSMUSIC / MSGAME (cycle in category), MSDIRECT, MSPURE DIRECT,
       MSSTEREO, MSAUTO, MSMCH STEREO, MSVIRTUAL, MSDOLBY DIGITAL, MSDTS SURROUND, MSNEURAL:X
MSQUICK1..4 (recall) ; MSQUICK1 MEMORY (save) ; MSQUICK ? -> MSQUICK0
```

### Audio parameters (PS…)
```
PSTONE CTRL ON|OFF   PSBAS 50 / PSTRE 50   (44..56 = -6..+6 dB)   current: BAS 53 (+3), TRE 56 (+6), CTRL OFF
PSMULTEQ:AUDYSSEY|BYP.LR|FLAT|OFF   PSDYNEQ ON|OFF   PSREFLEV 0|5|10|15   PSDYNVOL OFF|LIT|MED|HEV
PSCINEMA EQ.ON|OFF   PSDRC AUTO|LOW|MID|HI|OFF   PSLFE 00..10 (0..-10 dB)   PSSWL 50 (38..62)   PSSWR ON|OFF
PSDEH OFF|LOW|MED|HIGH (Dialog Enhancer)   PSRSTR OFF|LOW|MED|HI (Restorer)   PSLOM ON|OFF (Loudness Mgmt)
PSDEL 000..200 (ms, audio delay)   PSNEURAL ON|OFF   PSCES ON|OFF (Center Spread)   PSDIC 00
PSLFC ON|OFF   PSCNTAMT 01..07 (Audyssey LFC)
```

### Channel levels (current listening adjustment)
```
CV? -> CVFL 50, CVFR 50, CVC 50, CVSW 50, CVSL 50, CVSR 50, CVFDL 50, CVFDR 50, CVEND
CVFL 52 / CVC UP / CVZRL (reset all)   38..62 = -12..+12 dB; 3 digits = half-step (505 = +0.5)
```
This unit is **5.1.2** with front Dolby-enabled speakers (`FDL`/`FDR`).

### Undocumented `SS…` status queries (great for the UI)
```
SSFUN ?          -> SSFUNSAT/CBL Fire TV Stick   (input renames, END-terminated list)
SSSOD ?          -> SSSODSAT/CBL USE             (USE / DEL = shown / hidden inputs)
SSQSNZMA ?       -> SSQSNZMAQS1 Fire TV Stick    (Quick Select names)
SSLEV ?          -> SSLEVC 53 ...                (Audyssey/setup speaker levels, 50 = 0 dB)
SSVCTZMA ?       -> LIM OFF / PON LAS / DIS REL / MLV MUT  (volume limit, power-on level, display, mute level)
SSINFAISFSV ?    -> 48K                          (input sample rate)
SSINFFRM ?       -> firmware versions
SSINFAISFOR ?    -> 3/2/.1                       (source channel format: front/surround/LFE)
SYSDV ?          -> SYSDVIN 4K24, SYSDVOUT 4K24, SYSDV END   (HDMI resolution in/out)
SSINFSIGHDR ?    -> SSINFSIGHDR IHDR10, SSINFSIGHDR OHDR10   (HDR in/out; "---" = SDR)
SSINFSIGCOS ?    -> 99                           (color space code, input digit + output digit; 9 = BT.2020)
SSINFSIGPIX ?    -> 22                           (pixel depth code, input + output; 2 = 10 bits)
SSINFSIGFRL ?    -> SSINFSIGFRL I---, O---       (HDMI 2.1 FRL rate in/out)
SSINFSIGGMS ?    -> 00000000                     (game flags: ALLM / QMS / QFT, layout unconfirmed)
SYMO             -> AVR-X1700HUSA
```
These are the same lines the receiver emits while building its **Information** web page (setup API general type 12).
That page itself takes **~32 s** to load, and the receiver's whole setup server (port 10443) answers nothing
else meanwhile, so the app queries these over telnet instead. `SSINFSIG ?` alone returns nothing; query each one.
The COS/PIX codes are undocumented: the app ships with the confirmed ones and learns new ones by reading the
Information page once (at most every 10 min) and saving them to `data/signal-codes.json`.
`GetVideoInfo` on `AppCommand0300.xml` also works (params `videooutput`, `hdmisigin`, `hdmisigout`; resolution only).
Unprompted info lines are also pushed: `SYSMI <sound mode text>`, `SYSDA <decoded format>`, `SSINFAISSIG <signal>`,
`OPINFASP <active speaker map>`, `OPINFINS ...`.

### Misc
```
Z2ON|OFF  Z2<src>  Z240  Z2UP|DOWN  Z2MUON|OFF  Z2?
SLPOFF|SLP030   ECOON|AUTO|OFF   DIM BRI|DIM|DAR|OFF   STBY15M|30M|60M|OFF   SPPR 1|2   BTTX ON|OFF
TFAN009490 (tuner 94.90 FM)  TMANFM|AM  TPAN01..  TFANUP/DOWN  TPANUP/DOWN
TPANMEM01..56   store the current station in that preset (official protocol). Bare TPANMEM opens the
                receiver's own memory prompt instead; the app blocks it.
OPTPN ?         -> OPTPN01<8-char name>009210 ... OPTPN56   (whole preset list; names blank unless set)
TFANCMP         unprompted "tuning complete" status after tuning: not a frequency
MNMEN ON|OFF  MNCUP MNCDN MNCLT MNCRT MNENT MNRTN MNOPT MNINF  (on-screen menu remote)
MNZST ON|OFF (All Zone Stereo)   NS9A play  NS9B pause  NS9C stop  NS9D next  NS9E prev
```

### ⚠️ Never send
`SYRST` (factory reset), `NSRBT` (network reboot), `SYPANEL LOCK ON` (front panel lock), absolute `MV` above the safe cap.

---

## 2. HTTP (port 8080)

```
GET  /goform/formMainZone_MainZoneXmlStatusLite.xml   -> Power, InputFuncSelect, MasterVolume, Mute
GET  /goform/Deviceinfo.xml                           -> model + capability tree (see deviceinfo-X1700H.xml)
GET  /goform/formiPhoneAppDirect.xml?<TELNET CMD>     -> fire-and-forget telnet command (URL-encode spaces); reply empty
POST /goform/AppCommand.xml      (max 5 <cmd> per <tx>)
POST /goform/AppCommand0300.xml  (Audyssey get/set, slow)
```
**Quirk:** AppCommand bodies must be newline-separated XML — a single-line body returns an empty `<rx>`.
```xml
<?xml version="1.0" encoding="utf-8"?>
<tx>
<cmd id="1">GetAllZonePowerStatus</cmd>
<cmd id="1">GetAllZoneVolume</cmd>
</tx>
```

---

## 3. Setup web API (port 10443)

```
GET /ajax/<section>/get_config?type=N           -> XML
GET /ajax/<section>/set_config?type=N&data=<url-encoded XML>
```
Sections & types (★ = not supported on X1700H, request hangs ~20–30 s — avoid):

- **globals**: 1 Brand, 2 Language, 3 FriendlyName, 4 ZonePower (`1`=on `3`=off), 5 ModelType, 6 ZoneRename,
  7 SourceList, 8 SetupLock, 9 BT headphones, 10 SpeakerPreset, 11 System
- **audio**: 3 SubwooferLevel, 4 SurroundParameter, 5 Restorer, 7 Volume, 9 Audyssey, 10 GraphicEQ (2, 6, 8, 11–13 empty)
- **speakers**: 2 AmpAssign, 3 SpeakerConfig, 4 Distances, 5 Levels, 6 Crossovers, 7 Bass, 8 FrontSpeaker,
  10 Subwoofer, 11 SpeakerPreset, 18 LFEDistribution (★ 15, 16, 17)
- **inputs**: 2 InputAssign, 3 SourceRename, 4 HideSources, 5 SourceLevels, 6 InputSelect
- **video / network / general**: see `docs/SETUP-API.md`
- **advanced** (hidden page `advanced/advanced.html`): Settings + HDMI Diagnostics (EDID log, cable test…)

Unsafe on this API: `general` type 11 (firmware), 15 (setup lock), 16 (reset), HEOS account delete/sign-out,
`advanced` HDMI diag tests, `network` connection/settings writes (can drop the receiver off the LAN).

---

## 4. HEOS CLI (port 1255)

```
heos://player/get_players   -> [{"name":"Home Theater","pid":1053223856,"model":"Denon AVR-X1700H",...}]
heos://player/get_now_playing_media?pid=…   (song, artist, album, image_url)
heos://player/set_play_state?pid=…&state=play|pause|stop   play_next / play_previous
heos://system/register_for_change_events?enable=on   (events: player_now_playing_changed, player_state_changed, …)
```
Avoid `system/reboot` and `player/check_update`.

---

## 5. Safety notes

- The receiver does **not** auto-limit output when channel levels are raised; the only cap is
  *Setup → Audio → Volume → Limit* (−20 / −10 / 0 dB / Off; currently **Off** on Main Zone, −10 dB on Zone 2).
- For control while in standby, *Setup → Network → Network Control* must be **Always On**.
- Space commands ≥ 50 ms; bursts can hang the network module.

## Sources
- ol-iver/denonavr (used by Home Assistant): https://github.com/ol-iver/denonavr
- HEOS CLI Protocol Spec 1.17: https://rn.dmglobal.com/usmodel/HEOS_CLI_ProtocolSpecification-Version-1.17.pdf
- Web API reverse engineering: https://blog.abbey1.org.uk/index.php/technology/reverse-engineering-the-denon-amplifier-web-api
- X1700H manual: https://manuals.denon.com/avrx1700h/eu/en/GFNFSYwrfimgdw.php

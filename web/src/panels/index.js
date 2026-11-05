// Registry of every panel in the app. Pages render their section's panels in this order;
// Home renders the user's chosen list (see lib/layout.svelte.js).
import Status from './Status.svelte';
import Volume from './Volume.svelte';
import Inputs from './Inputs.svelte';
import SoundMode from './SoundMode.svelte';
import QuickSelect from './QuickSelect.svelte';
import Favorites from './Favorites.svelte';
import Audyssey from './Audyssey.svelte';
import DialogBass from './DialogBass.svelte';
import Tone from './Tone.svelte';
import Processing from './Processing.svelte';
import ChannelLevels from './ChannelLevels.svelte';
import SpeakerSetup from './SpeakerSetup.svelte';
import Zone2 from './Zone2.svelte';
import AllZoneStereo from './AllZoneStereo.svelte';
import OsdPad from './OsdPad.svelte';
import Tuner from './Tuner.svelte';
import QuickSettings from './QuickSettings.svelte';
import Console from './Console.svelte';
import InputsTable from './InputsTable.svelte';
import SourceLevel from './SourceLevel.svelte';
import VolumeMain from './VolumeMain.svelte';
import VolumeZone2 from './VolumeZone2.svelte';
import GraphicEq from './GraphicEq.svelte';
import Names from './Names.svelte';
import PowerEco from './PowerEco.svelte';
import DisplayPrivacy from './DisplayPrivacy.svelte';
import AppSettings from './AppSettings.svelte';
import ReceiverInfo from './ReceiverInfo.svelte';
import Backups from './Backups.svelte';
import HdmiSetup from './HdmiSetup.svelte';
import VideoOutput from './VideoOutput.svelte';
import HdcpSetup from './HdcpSetup.svelte';
import OnScreen from './OnScreen.svelte';
import NetworkInfo from './NetworkInfo.svelte';
import NetworkControl from './NetworkControl.svelte';
import StreamingServices from './StreamingServices.svelte';
import HeosAccount from './HeosAccount.svelte';
import Language from './Language.svelte';

/** section = page it lives on; tab = Setup sub-tab; wide = spans the full row. */
export const PANEL_LIST = [
  { id: 'status', title: 'Now playing', section: 'home', comp: Status },
  { id: 'volume', title: 'Volume', section: 'home', comp: Volume },
  { id: 'inputs', title: 'Input', section: 'home', comp: Inputs },
  { id: 'sound-mode', title: 'Sound mode', section: 'home', comp: SoundMode },
  { id: 'quick-select', title: 'Quick Select', section: 'home', comp: QuickSelect },
  { id: 'favorites', title: 'HEOS favorites', section: 'home', comp: Favorites },

  { id: 'audyssey', title: 'Audyssey', section: 'sound', comp: Audyssey },
  { id: 'dialog-bass', title: 'Dialog & bass', section: 'sound', comp: DialogBass },
  { id: 'tone', title: 'Tone', section: 'sound', comp: Tone },
  { id: 'processing', title: 'Processing', section: 'sound', comp: Processing },

  { id: 'channel-levels', title: 'Channel levels', section: 'speakers', comp: ChannelLevels },
  { id: 'speaker-setup', title: 'Speaker setup', section: 'speakers', comp: SpeakerSetup },

  { id: 'zone2', title: 'Zone 2', section: 'zones', comp: Zone2 },
  { id: 'all-zone-stereo', title: 'All Zone Stereo', section: 'zones', comp: AllZoneStereo },

  { id: 'osd', title: 'On-screen menu', section: 'remote', comp: OsdPad },
  { id: 'tuner', title: 'Tuner', section: 'remote', comp: Tuner },
  { id: 'quick-settings', title: 'Quick settings', section: 'remote', comp: QuickSettings },
  { id: 'console', title: 'Console', section: 'remote', comp: Console },

  { id: 'setup-inputs', title: 'Inputs (rename, hide, assign)', section: 'setup', tab: 'inputs', comp: InputsTable, wide: true },
  { id: 'source-level', title: 'Source level', section: 'setup', tab: 'inputs', comp: SourceLevel },
  { id: 'volume-main', title: 'Volume — Main Zone', section: 'setup', tab: 'audio', comp: VolumeMain },
  { id: 'volume-zone2', title: 'Volume — Zone 2', section: 'setup', tab: 'audio', comp: VolumeZone2 },
  { id: 'graphic-eq', title: 'Graphic EQ', section: 'setup', tab: 'audio', comp: GraphicEq, wide: true },
  { id: 'hdmi-setup', title: 'HDMI setup', section: 'setup', tab: 'video', comp: HdmiSetup },
  { id: 'video-output', title: 'Video output', section: 'setup', tab: 'video', comp: VideoOutput },
  { id: 'on-screen', title: 'On-screen display', section: 'setup', tab: 'video', comp: OnScreen },
  { id: 'hdcp', title: 'HDCP', section: 'setup', tab: 'video', comp: HdcpSetup },
  { id: 'network-info', title: 'Network', section: 'setup', tab: 'network', comp: NetworkInfo },
  { id: 'network-control', title: 'Network control', section: 'setup', tab: 'network', comp: NetworkControl },
  { id: 'streaming', title: 'Streaming services', section: 'setup', tab: 'network', comp: StreamingServices },
  { id: 'heos-account', title: 'HEOS account', section: 'setup', tab: 'network', comp: HeosAccount },
  { id: 'names', title: 'Names', section: 'setup', tab: 'general', comp: Names },
  { id: 'power-eco', title: 'Power & ECO', section: 'setup', tab: 'general', comp: PowerEco },
  { id: 'display-privacy', title: 'Display & privacy', section: 'setup', tab: 'general', comp: DisplayPrivacy },
  { id: 'language', title: 'Language', section: 'setup', tab: 'general', comp: Language },
  { id: 'app-settings', title: 'This app', section: 'setup', tab: 'app', comp: AppSettings },
  { id: 'receiver-info', title: 'Receiver', section: 'setup', tab: 'app', comp: ReceiverInfo },
  { id: 'backups', title: 'Setup backups', section: 'setup', tab: 'app', comp: Backups },
];

export const PANELS = Object.fromEntries(PANEL_LIST.map((p) => [p.id, p]));

export const SECTION_LABELS = { home: 'Home', sound: 'Sound', speakers: 'Speakers', zones: 'Zone 2', remote: 'Remote', setup: 'Setup' };

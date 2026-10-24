/*
 * Starting setup. Everything here can be changed from the Settings screen on the TV,
 * so you only need to edit this file if you want different defaults after a reset.
 *
 * appId values are Samsung Tizen app IDs. "match" is used to find the app on the TV by
 * name when the ID is missing or wrong, so new apps work without knowing their ID.
 */
var TVHUB_DEFAULTS = {
  version: 2,

  apps: [
    { id: 'netflix', name: 'Netflix',     appId: '3201907018807', match: '^netflix',        color: '#e50914', text: '#ffffff', hotkey: 'red' },
    { id: 'disney',  name: 'Disney+',     appId: '3201901017640', match: '^disney',         color: '#113ccf', text: '#ffffff', hotkey: 'blue' },
    { id: 'prime',   name: 'Prime Video', appId: '3201910019365', match: 'prime video',     color: '#00a8e1', text: '#0f171e', hotkey: 'green' },
    { id: 'now',     name: 'NOW',         appId: '',              match: '^now( tv)?$|^now\\b', color: '#14d3b4', text: '#0a0a0a', hotkey: null },
    { id: 'youtube', name: 'YouTube',     appId: '111299001912',  match: '^youtube$',       color: '#ff0000', text: '#ffffff', hotkey: 'yellow' },
    { id: 'rte',     name: 'RTÉ Player',  appId: '',              match: 'rt[eé] ?player',  color: '#00857c', text: '#ffffff', hotkey: null },
    { id: 'virgin',  name: 'Virgin Media Player', appId: '',      match: 'virgin media',    color: '#c4002b', text: '#ffffff', hotkey: null },
    { id: 'appletv', name: 'Apple TV',    appId: '3201807016597', match: '^apple tv',       color: '#1d1d1f', text: '#ffffff', hotkey: null, hidden: true },
    { id: 'spotify', name: 'Spotify',     appId: '3201606009684', match: '^spotify',        color: '#1db954', text: '#000000', hotkey: null, hidden: true }
  ],

  // Live channels row. Satellite channels have a "major" channel number (what you'd type on
  // the remote); use Settings > Import channels from TV to replace these with the real list.
  // "player" channels are streamed through an app (RTÉ Player, Virgin Media Player) and show
  // what's on now from the online TV guide.
  channels: [
    { name: 'RTÉ One',          kind: 'player', guide: 'rte-one' },
    { name: 'RTÉ2',             kind: 'player', guide: 'rte2' },
    { name: 'Virgin Media One', kind: 'player', guide: 'vm-one' },
    { name: 'Virgin Media Two', kind: 'player', guide: 'vm-two' },
    { name: 'BBC One',   major: 101, minor: 0 },
    { name: 'BBC Two',   major: 102, minor: 0 },
    { name: 'ITV1',      major: 103, minor: 0 },
    { name: 'Channel 4', major: 104, minor: 0 },
    { name: 'Channel 5', major: 105, minor: 0 }
  ],

  // Channels available inside the player apps, with where their TV guide comes from.
  playerChannels: {
    'rte-one':   { name: 'RTÉ One',            app: 'rte',    source: 'tvireland', id: '81/rte-one' },
    'rte2':      { name: 'RTÉ2',               app: 'rte',    source: 'tvireland', id: '82/rte2' },
    'rte-jr':    { name: 'RTÉjr',              app: 'rte',    source: 'tvireland', id: '1649/rte-jr' },
    'rte-news':  { name: 'RTÉ News',           app: 'rte',    source: 'tvireland', id: '1650/rte-news' },
    'vm-one':    { name: 'Virgin Media One',   app: 'virgin', source: 'virgin',    id: 'one' },
    'vm-two':    { name: 'Virgin Media Two',   app: 'virgin', source: 'virgin',    id: 'two' },
    'vm-three':  { name: 'Virgin Media Three', app: 'virgin', source: 'virgin',    id: 'three' },
    'vm-more':   { name: 'Virgin Media More',  app: 'virgin', source: 'virgin',    id: 'vm_more' }
  },

  // Sport row: Sky Sports channels (watched through NOW). "sid" is Sky's channel ID in its
  // TV guide; these are the Irish versions. Hide any you don't want in Settings.
  sportApp: 'now',
  sportChannels: [
    { key: 'ss-main',     name: 'Sky Sports Main Event',     short: 'Main Event',     sid: '1309' },
    { key: 'ss-pl',       name: 'Sky Sports Premier League', short: 'Premier League', sid: '1312' },
    { key: 'ss-football', name: 'Sky Sports Football',       short: 'Football',       sid: '3840' },
    { key: 'ss-f1',       name: 'Sky Sports F1',             short: 'F1',             sid: '1306' },
    { key: 'ss-action',   name: 'Sky Sports Action',         short: 'Action',         sid: '1333' },
    { key: 'ss-golf',     name: 'Sky Sports Golf',           short: 'Golf',           sid: '1324' },
    { key: 'ss-cricket',  name: 'Sky Sports Cricket',        short: 'Cricket',        sid: '1302' },
    { key: 'ss-tennis',   name: 'Sky Sports Tennis',         short: 'Tennis',         sid: '1285' },
    { key: 'ss-mix',      name: 'Sky Sports Mix',            short: 'Mix',            sid: '4091' },
    { key: 'ss-news',     name: 'Sky Sports News',           short: 'News',           sid: '1319' }
  ],

  // Shows you're following: [{ tvmazeId, name, app }]. Add them from the home screen.
  shows: [],

  options: {
    smartOrder: true,          // put the apps you use most first
    livePreview: true,         // show the live channel behind the home screen
    // Used only when the TV doesn't let this app tune channels itself.
    tvViewerAppId: 'org.tizen.tv-viewer'
  }
};

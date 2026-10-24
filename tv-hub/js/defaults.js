/*
 * Starting setup. Everything here can be changed from the Settings screen on the TV,
 * so you only need to edit this file if you want different defaults after a reset.
 *
 * appId values are Samsung Tizen app IDs. "match" is used to find the app on the TV by
 * name when the ID is missing or wrong, so new apps work without knowing their ID.
 */
var TVHUB_DEFAULTS = {
  version: 5,

  apps: [
    { id: 'netflix', name: 'Netflix',     appId: '3201907018807', match: '^netflix',        color: '#e50914', text: '#ffffff', hotkey: 'red' },
    { id: 'disney',  name: 'Disney+',     appId: '3201901017640', match: '^disney',         color: '#113ccf', text: '#ffffff', hotkey: 'blue' },
    { id: 'prime',   name: 'Prime Video', appId: '3201910019365', match: 'prime video',     color: '#00a8e1', text: '#0f171e', hotkey: 'green' },
    { id: 'now',     name: 'NOW',         appId: '',              match: '^now( tv)?$',     color: '#14d3b4', text: '#0a0a0a', hotkey: null },
    { id: 'youtube', name: 'YouTube',     appId: '111299001912',  match: '^youtube$',       color: '#ff0000', text: '#ffffff', hotkey: 'yellow' },
    { id: 'rte',     name: 'RTÉ Player',  appId: '',              match: '^rt[eé] ?player', color: '#00857c', text: '#ffffff', hotkey: null },
    { id: 'virgin',  name: 'Virgin Media Player', appId: '',      match: '^virgin media play', color: '#c4002b', text: '#ffffff', hotkey: null },
    { id: 'appletv', name: 'Apple TV',    appId: '3201807016597', match: '^apple tv',       color: '#1d1d1f', text: '#ffffff', hotkey: null, hidden: true },
    { id: 'spotify', name: 'Spotify',     appId: '3201606009684', match: '^spotify',        color: '#1db954', text: '#000000', hotkey: null, hidden: true }
  ],

  // Your satellite channels: { name, major, minor } where "major" is the number you'd type on
  // the remote. Empty to start with: the first run asks you to import them from the TV, because
  // channel numbers depend on how the TV was tuned.
  channels: [],

  // Channels watched through the player apps, shown in the "On now" row with what's live.
  // Keys from playerChannels below; add or remove them in Settings.
  online: ['rte-one', 'rte2', 'vm-one', 'vm-two'],

  // Channels available inside the player apps. Each has listings sources in order of
  // preference: if one fails or has nothing for right now, the next is tried.
  playerChannels: {
    'rte-one':  { name: 'RTÉ One',            app: 'rte',    feeds: [['tvireland', '81/rte-one'], ['tvireland', '1856/rte-one-hd'], ['entie', 'rte-one']] },
    'rte2':     { name: 'RTÉ2',               app: 'rte',    feeds: [['tvireland', '82/rte2'], ['tvireland', '1648/rte2-hd'], ['entie', 'rte2']] },
    'rte-jr':   { name: 'RTÉjr',              app: 'rte',    feeds: [['tvireland', '1649/rte-jr'], ['entie', 'rte-jr']] },
    'rte-news': { name: 'RTÉ News',           app: 'rte',    feeds: [['tvireland', '1650/rte-news']] },
    'vm-one':   { name: 'Virgin Media One',   app: 'virgin', feeds: [['virgin', 'one'], ['entie', 'virgin-media-one']] },
    'vm-two':   { name: 'Virgin Media Two',   app: 'virgin', feeds: [['virgin', 'two'], ['entie', 'virgin-media-two']] },
    'vm-three': { name: 'Virgin Media Three', app: 'virgin', feeds: [['virgin', 'three'], ['entie', 'virgin-media-three']] },
    'vm-more':  { name: 'Virgin Media More',  app: 'virgin', feeds: [['virgin', 'vm_more'], ['entie', 'virgin-media-more']] }
  },

  // Sport: Sky Sports channels (watched through NOW). "sid" is Sky's channel ID in its TV guide;
  // these are the Irish versions. Channels marked hidden start switched off in Settings.
  sportApp: 'now',
  sportChannels: [
    { key: 'ss-main',     name: 'Sky Sports Main Event',     short: 'Main Event',     sid: '1309' },
    { key: 'ss-pl',       name: 'Sky Sports Premier League', short: 'Premier League', sid: '1312' },
    { key: 'ss-f1',       name: 'Sky Sports F1',             short: 'F1',             sid: '1306' },
    { key: 'ss-action',   name: 'Sky Sports NFL',            short: 'NFL',            sid: '1333' },
    { key: 'ss-football', name: 'Sky Sports Football',       short: 'Football',       sid: '3840', hidden: true },
    { key: 'ss-golf',     name: 'Sky Sports Golf',           short: 'Golf',           sid: '1324', hidden: true },
    { key: 'ss-cricket',  name: 'Sky Sports Cricket',        short: 'Cricket',        sid: '1302', hidden: true },
    { key: 'ss-tennis',   name: 'Sky Sports Tennis',         short: 'Tennis',         sid: '1285', hidden: true },
    { key: 'ss-mix',      name: 'Sky Sports Mix',            short: 'Mix',            sid: '4091', hidden: true },
    { key: 'ss-news',     name: 'Sky Sports News',           short: 'News',           sid: '1319', hidden: true }
  ],

  // Sports you follow. Live events matching these, on any Sky Sports channel, are listed in
  // "My sport" (today and the next few days) and live ones also appear in "On now".
  // "match" is tested against the programme title; "not" excludes look-alikes.
  sports: [
    { key: 'f1',      name: 'Formula 1',      match: '\\b(f1|formula 1|formula one|grand prix)\\b', not: 'f1 academy|formula 2|formula 3|motogp' },
    { key: 'nfl',     name: 'NFL',            match: '\\bnfl\\b|super bowl' },
    { key: 'pl',      name: 'Premier League', match: 'premier league', not: 'darts|netball|rugby|snooker' },
    { key: 'efl',     name: 'EFL & other football', match: '\\befl\\b|championship|carabao|scottish premiership|la liga|serie a|bundesliga', not: 'darts|golf|snooker|rugby|open championship|world championship' },
    { key: 'golf',    name: 'Golf',           match: 'golf|\\bpga\\b|ryder cup|the open' },
    { key: 'cricket', name: 'Cricket',        match: 'cricket|test match|\\bt20\\b|the hundred|\\bashes\\b' },
    { key: 'tennis',  name: 'Tennis',         match: 'tennis|\\batp\\b|\\bwta\\b' },
    { key: 'rugby',   name: 'Rugby',          match: 'rugby' },
    { key: 'boxing',  name: 'Boxing',         match: 'boxing|fight night' },
    { key: 'darts',   name: 'Darts',          match: 'darts' }
  ],
  mySports: ['f1', 'nfl', 'pl'],

  // Shows you're following: [{ tvmazeId, name, app }]. Add them from the home screen.
  shows: [],

  // Towns for the weather in the top bar (choose yours in Settings).
  towns: [
    ['Dublin', 53.35, -6.26], ['Cork', 51.90, -8.47], ['Galway', 53.27, -9.05], ['Limerick', 52.66, -8.63],
    ['Waterford', 52.26, -7.11], ['Kilkenny', 52.65, -7.25], ['Wexford', 52.34, -6.46], ['Sligo', 54.27, -8.47],
    ['Athlone', 53.42, -7.94], ['Dundalk', 54.00, -6.40], ['Drogheda', 53.72, -6.35], ['Letterkenny', 54.95, -7.73],
    ['Tralee', 52.27, -9.70], ['Ennis', 52.84, -8.98], ['Castlebar', 53.86, -9.30], ['Mullingar', 53.53, -7.34],
    ['Navan', 53.65, -6.68], ['Naas', 53.22, -6.66], ['Carlow', 52.84, -6.93], ['Clonmel', 52.36, -7.70],
    ['Belfast', 54.60, -5.93], ['Derry', 55.00, -7.32]
  ],

  options: {
    smartOrder: false,         // put the apps you use most first
    town: 'Dublin',            // weather
    alertLive: true,           // banner when an event in My sports goes live
    alertSoon: true,           // and 10 minutes before it starts
    ambientMins: 10,           // screensaver after this many idle minutes on the home screen (0 = off)
    spotifyKey: null,          // colour button that plays/pauses Spotify
    livePreview: true,         // show the live channel behind the home screen
    // Used only when the TV doesn't let this app tune channels itself.
    tvViewerAppId: 'org.tizen.tv-viewer'
  }
};

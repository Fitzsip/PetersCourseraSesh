/*
 * Starting setup. Everything here can be changed from the Settings screen on the TV,
 * so you only need to edit this file if you want different defaults after a reset.
 *
 * appId values are Samsung Tizen app IDs. If one does not launch on your TV, open
 * Settings > Add an installed app, which lists the real IDs found on your TV.
 */
var TVHUB_DEFAULTS = {
  apps: [
    { id: 'netflix', name: 'Netflix',     appId: '3201907018807', color: '#e50914', text: '#ffffff', hotkey: 'red' },
    { id: 'disney',  name: 'Disney+',     appId: '3201901017640', color: '#113ccf', text: '#ffffff', hotkey: 'blue' },
    { id: 'prime',   name: 'Prime Video', appId: '3201910019365', color: '#00a8e1', text: '#0f171e', hotkey: 'green' },
    { id: 'youtube', name: 'YouTube',     appId: '111299001912',  color: '#ff0000', text: '#ffffff', hotkey: 'yellow' },
    { id: 'appletv', name: 'Apple TV',    appId: '3201807016597', color: '#1d1d1f', text: '#ffffff', hotkey: null, hidden: true },
    { id: 'spotify', name: 'Spotify',     appId: '3201606009684', color: '#1db954', text: '#000000', hotkey: null, hidden: true }
  ],

  // Your free-to-air satellite channels. "major" is the channel number you'd type on
  // the remote. Use Settings > Import channels from TV to replace these with the real list.
  channels: [
    { name: 'BBC One',   major: 101, minor: 0 },
    { name: 'BBC Two',   major: 102, minor: 0 },
    { name: 'ITV1',      major: 103, minor: 0 },
    { name: 'Channel 4', major: 104, minor: 0 },
    { name: 'Channel 5', major: 105, minor: 0 }
  ],

  options: {
    smartOrder: true,          // put the apps you use most first
    livePreview: true,         // show the live channel behind the home screen
    // Used only when the TV doesn't let this app tune channels itself.
    tvViewerAppId: 'org.tizen.tv-viewer'
  }
};

/*
 * Default settings. Everything here can also be changed on the TV from the
 * Settings screen (press OK); those changes are saved on the TV and win over
 * these defaults.
 */
var APP_VERSION = '1.1.2';
var CHANGELOG = [
  ['1.1.2', 'Test popups are clearly labelled so they are not mistaken for real planes'],
  ['1.1.1', 'Eircode search checks the result really matches, falls back to Photon, ' +
            'and accepts coordinates or a Google Maps link'],
  ['1.1.0', 'Phone push via ntfy, Eircode lookup, adsb.fi with automatic fallback, ' +
            '"over the house in" countdown, wider private-jet alert radius, airport pins'],
  ['1.0.0', 'Radar, overhead popups, private jet flag, FlightAware history, demo mode']
];

var DEFAULT_CONFIG = {
  // Your house. Leave as null to be asked on first launch.
  // Tip: in Google Maps, right-click your roof and click the coordinates to copy them.
  homeLat: null,
  homeLon: null,
  homeName: 'Home',


  // Find the house from an Eircode/postcode or address in Settings.
  address: '',
  lookupCountry: 'Ireland',

  // Data source: 'auto' tries adsb.fi, then airplanes.live, then adsb.lol (all free, no key).
  // 'opensky' also works, but anonymous use is limited to ~400 requests a day.
  provider: 'auto',

  alertRadiusKm: 2.5,      // a plane within this distance counts as "overhead"
  maxAltitudeFt: 20000,    // ignore planes higher than this (private jets excepted)
  jetAlertRadiusKm: 10,    // private jets alert from further out
  watchRadiusKm: 30,       // range of the radar screen
  lookaheadSeconds: 30,    // alert early if a plane will be overhead within this time
  pollSeconds: 5,          // how often to ask the API for positions
  popupSeconds: 25,        // how long a popup stays on screen
  cooldownMinutes: 20,     // don't re-announce the same aircraft within this time

  units: 'metric',         // 'metric' (m, km/h, km) or 'imperial' (ft, mph, mi)
  sound: true,
  showRoutes: true,        // look up origin/destination (adsb.lol route API)
  showPhotos: true,        // look up an aircraft photo (planespotters.net)
  alertFilter: 'all',      // 'all' or 'private jets' (radar still shows everything)

  // Phone pushes via the free ntfy app. Pick a unique, hard-to-guess topic name.
  ntfyTopic: '',
  pushFor: 'private jets', // 'private jets' or 'all alerts'
  quietHours: true,        // no pushes between 22:00 and 08:00

  demo: false,             // simulated planes, handy for testing indoors

  // Optional FlightAware AeroAPI key. Adds where each plane took off, how long it has
  // been flying and which countries it has been to today. See README for setup.
  flightawareKey: ''
};

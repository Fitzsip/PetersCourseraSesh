/* Small lookup tables for friendlier popups. Unknown codes just show the raw code. */
var AIRLINES = {
  AAL: 'American Airlines', UAL: 'United Airlines', DAL: 'Delta Air Lines', SWA: 'Southwest',
  JBU: 'JetBlue', ASA: 'Alaska Airlines', NKS: 'Spirit', FFT: 'Frontier', AAY: 'Allegiant',
  HAL: 'Hawaiian Airlines', SKW: 'SkyWest', RPA: 'Republic Airways', ENY: 'Envoy',
  EDV: 'Endeavor Air', JIA: 'PSA Airlines', PDT: 'Piedmont', ASH: 'Mesa Airlines',
  SCX: 'Sun Country', MXY: 'Breeze Airways', ACA: 'Air Canada', JZA: 'Air Canada Jazz',
  WJA: 'WestJet', TSC: 'Air Transat', POE: 'Porter', AMX: 'Aeromexico', VOI: 'Volaris',
  VIV: 'VivaAerobus', FDX: 'FedEx', UPS: 'UPS', GTI: 'Atlas Air', ABX: 'ABX Air',
  BAW: 'British Airways', SHT: 'British Airways', VIR: 'Virgin Atlantic', EZY: 'easyJet',
  EJU: 'easyJet Europe', EZS: 'easyJet Switzerland', RYR: 'Ryanair', RUK: 'Ryanair UK',
  EXS: 'Jet2', TOM: 'TUI', LOG: 'Loganair', EIN: 'Aer Lingus', EAI: 'Emerald Airlines',
  DLH: 'Lufthansa', CLH: 'Lufthansa CityLine', EWG: 'Eurowings', CFG: 'Condor',
  AFR: 'Air France', KLM: 'KLM', KLC: 'KLM Cityhopper', IBE: 'Iberia', VLG: 'Vueling',
  AEA: 'Air Europa', TAP: 'TAP Air Portugal', SWR: 'Swiss', AUA: 'Austrian', BEL: 'Brussels Airlines',
  SAS: 'SAS', NAX: 'Norwegian', NOZ: 'Norwegian', FIN: 'Finnair', ICE: 'Icelandair',
  LOT: 'LOT Polish', WZZ: 'Wizz Air', WUK: 'Wizz Air UK', ITY: 'ITA Airways', AEE: 'Aegean',
  THY: 'Turkish Airlines', PGT: 'Pegasus', ELY: 'El Al', UAE: 'Emirates', QTR: 'Qatar Airways',
  ETD: 'Etihad', SVA: 'Saudia', GFA: 'Gulf Air', OMA: 'Oman Air', ETH: 'Ethiopian',
  KQA: 'Kenya Airways', SAA: 'South African', RAM: 'Royal Air Maroc', MSR: 'EgyptAir',
  AIC: 'Air India', SIA: 'Singapore Airlines', CPA: 'Cathay Pacific', QFA: 'Qantas',
  ANZ: 'Air New Zealand', VOZ: 'Virgin Australia', JST: 'Jetstar', ANA: 'ANA', JAL: 'Japan Airlines',
  KAL: 'Korean Air', AAR: 'Asiana', CCA: 'Air China', CES: 'China Eastern', CSN: 'China Southern',
  EVA: 'EVA Air', CAL: 'China Airlines', THA: 'Thai Airways', MAS: 'Malaysia Airlines',
  GIA: 'Garuda Indonesia', PAL: 'Philippine Airlines', LAN: 'LATAM', TAM: 'LATAM Brasil',
  AVA: 'Avianca', CMP: 'Copa Airlines', AZU: 'Azul', GLO: 'Gol', ARG: 'Aerolineas Argentinas',
  CLX: 'Cargolux', BCS: 'DHL', DHK: 'DHL', DHX: 'DHL', BOX: 'AeroLogic', ABW: 'AirBridgeCargo',
  NJE: 'NetJets Europe', EJA: 'NetJets', LXJ: 'Flexjet', VJT: 'VistaJet', RCH: 'US Air Force (AMC)',
  RRR: 'Royal Air Force', NPT: 'West Atlantic', CKS: 'Kalitta Air', SOO: 'Southern Air'
};

var AIRCRAFT_TYPES = {
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
  A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  A332: 'Airbus A330-200', A333: 'Airbus A330-300', A338: 'Airbus A330-800', A339: 'Airbus A330-900',
  A343: 'Airbus A340-300', A346: 'Airbus A340-600', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
  A388: 'Airbus A380', BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300',
  B712: 'Boeing 717', B733: 'Boeing 737-300', B734: 'Boeing 737-400', B737: 'Boeing 737-700',
  B738: 'Boeing 737-800', B739: 'Boeing 737-900', B37M: 'Boeing 737 MAX 7', B38M: 'Boeing 737 MAX 8',
  B39M: 'Boeing 737 MAX 9', B3XM: 'Boeing 737 MAX 10', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  B752: 'Boeing 757-200', B753: 'Boeing 757-300', B762: 'Boeing 767-200', B763: 'Boeing 767-300',
  B764: 'Boeing 767-400', B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B773: 'Boeing 777-300',
  B77W: 'Boeing 777-300ER', B778: 'Boeing 777-8', B779: 'Boeing 777-9', B788: 'Boeing 787-8',
  B789: 'Boeing 787-9', B78X: 'Boeing 787-10', MD11: 'McDonnell Douglas MD-11',
  E135: 'Embraer ERJ-135', E145: 'Embraer ERJ-145', E170: 'Embraer E170', E75L: 'Embraer E175',
  E75S: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195', E290: 'Embraer E190-E2',
  E295: 'Embraer E195-E2', CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700',
  CRJ9: 'Bombardier CRJ900', CRJX: 'Bombardier CRJ1000', DH8A: 'Dash 8-100', DH8C: 'Dash 8-300',
  DH8D: 'Dash 8 Q400', AT43: 'ATR 42', AT45: 'ATR 42-500', AT72: 'ATR 72', AT75: 'ATR 72-500',
  AT76: 'ATR 72-600', SF34: 'Saab 340', SB20: 'Saab 2000', C172: 'Cessna 172', C182: 'Cessna 182',
  C152: 'Cessna 152', C150: 'Cessna 150', C208: 'Cessna Caravan', C25A: 'Cessna Citation CJ2',
  C25B: 'Cessna Citation CJ3', C56X: 'Cessna Citation Excel', C68A: 'Cessna Citation Latitude',
  C700: 'Cessna Citation Longitude', PA28: 'Piper Cherokee', PA32: 'Piper Saratoga',
  PA34: 'Piper Seneca', P28A: 'Piper Cherokee', SR20: 'Cirrus SR20', SR22: 'Cirrus SR22',
  SF50: 'Cirrus Vision Jet', BE20: 'Beech King Air 200', BE35: 'Beech Bonanza', BE36: 'Beech Bonanza',
  PC12: 'Pilatus PC-12', PC24: 'Pilatus PC-24', DA40: 'Diamond DA40', DA42: 'Diamond DA42',
  CL30: 'Challenger 300', CL35: 'Challenger 350', CL60: 'Challenger 600', GL5T: 'Global 5000',
  GLEX: 'Global Express', GL7T: 'Global 7500', GLF4: 'Gulfstream IV', GLF5: 'Gulfstream V',
  GLF6: 'Gulfstream G650', G280: 'Gulfstream G280', LJ45: 'Learjet 45', LJ75: 'Learjet 75',
  E55P: 'Embraer Phenom 300', E50P: 'Embraer Phenom 100', F2TH: 'Falcon 2000', FA7X: 'Falcon 7X',
  H25B: 'Hawker 800', C130: 'Lockheed C-130 Hercules', C30J: 'C-130J Super Hercules',
  C17: 'Boeing C-17 Globemaster', K35R: 'KC-135 Stratotanker', A400: 'Airbus A400M',
  EC35: 'Airbus H135 helicopter', EC45: 'Airbus H145 helicopter', EC30: 'Airbus H130 helicopter',
  EC55: 'Airbus H155 helicopter', AS50: 'Airbus AS350 helicopter', A139: 'AW139 helicopter',
  A109: 'AW109 helicopter', A169: 'AW169 helicopter', R44: 'Robinson R44 helicopter',
  R22: 'Robinson R22 helicopter', R66: 'Robinson R66 helicopter', B06: 'Bell 206 helicopter',
  B407: 'Bell 407 helicopter', B429: 'Bell 429 helicopter', S76: 'Sikorsky S-76 helicopter',
  S92: 'Sikorsky S-92 helicopter', H60: 'Black Hawk helicopter', BALL: 'Balloon', GLID: 'Glider'
};

function airlineFor(callsign) {
  if (!callsign || !/^[A-Z]{3}\d/.test(callsign)) return '';
  return AIRLINES[callsign.substr(0, 3)] || '';
}

function aircraftTypeName(a) {
  if (a.type && AIRCRAFT_TYPES[a.type]) return AIRCRAFT_TYPES[a.type];
  if (a.desc) return titleCase(a.desc);
  return a.type || '';
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
}

// ---- Private jet detection ----

// ICAO type codes of business jets.
var BIZJET_TYPES = {};
('C500 C501 C510 C525 C25A C25B C25C C25M C550 C551 C55B C560 C56X C650 C680 C68A C700 C750 ' +
 'E50P E55P E545 E550 E35L LJ31 LJ35 LJ40 LJ45 LJ55 LJ60 LJ70 LJ75 LJ85 ' +
 'CL30 CL35 CL60 CL64 GL5T GLEX GL6T GL7T GL8T ' +
 'GLF2 GLF3 GLF4 GLF5 GLF6 GA5C GA6C GA7C GA8C G150 G200 G280 GALX ASTR ' +
 'FA10 FA20 FA50 FA5X FA6X FA7X FA8X F900 F2TH ' +
 'H25A H25B H25C HA4T BE40 PRM1 HDJT SF50 EA50 PC24 MU30 WW24').split(' ').forEach(function (t) { BIZJET_TYPES[t] = true; });
// Airliner types are only "private" when flown by a private-jet operator (e.g. a Boeing Business Jet).
var AIRLINER_TYPES = { B737: true, B738: true, B739: true, B38M: true, A318: true, A319: true, A320: true };

// Callsign prefixes of private-jet charter and fractional operators.
var BIZJET_OPERATORS = {
  NJE: 'NetJets Europe', EJA: 'NetJets', VJT: 'VistaJet', LXJ: 'Flexjet', AOJ: 'Avcon Jet',
  JFA: 'Jetfly', XOJ: 'XOJET', TWY: 'Solairus', GAC: 'Global Jet', JCB: 'JCB'
};

function classifyAircraft(a) {
  var prefix = /^[A-Z]{3}\d/.test(a.callsign) ? a.callsign.substr(0, 3) : '';
  if (a.dbFlags & 1) return { kind: 'military', label: 'Military' };
  if (BIZJET_OPERATORS[prefix]) return { kind: 'private-jet', label: 'Private jet', operator: BIZJET_OPERATORS[prefix] };
  if (BIZJET_TYPES[a.type]) return { kind: 'private-jet', label: 'Private jet' };
  // A business-jet-sized airliner flying under its registration instead of an airline callsign.
  var reg = (a.reg || '').replace('-', '');
  if (AIRLINER_TYPES[a.type] && reg && a.callsign.replace('-', '') === reg) {
    return { kind: 'private-jet', label: 'Private jet' };
  }
  if (/helicopter/.test(AIRCRAFT_TYPES[a.type] || '') || a.category === 'A7') {
    return { kind: 'helicopter', label: 'Helicopter' };
  }
  if (reg && a.callsign.replace('-', '') === reg) return { kind: 'private', label: 'Private flight' };
  return { kind: '', label: '' };
}

// ---- Countries from ICAO airport codes (first two letters, or first one for a few large countries) ----
var ICAO_COUNTRIES = {
  EI: 'Ireland', EG: 'United Kingdom', LF: 'France', ED: 'Germany', ET: 'Germany', EH: 'Netherlands',
  EB: 'Belgium', EL: 'Luxembourg', LS: 'Switzerland', LO: 'Austria', LI: 'Italy', LE: 'Spain',
  GC: 'Spain', GE: 'Spain', LP: 'Portugal', LX: 'Gibraltar', LN: 'Monaco', EK: 'Denmark', EN: 'Norway',
  ES: 'Sweden', EF: 'Finland', BI: 'Iceland', BG: 'Greenland', EP: 'Poland', LK: 'Czechia',
  LZ: 'Slovakia', LH: 'Hungary', LR: 'Romania', LB: 'Bulgaria', LG: 'Greece', LT: 'Turkey',
  LC: 'Cyprus', LM: 'Malta', LJ: 'Slovenia', LD: 'Croatia', LY: 'Serbia', LQ: 'Bosnia',
  LW: 'North Macedonia', LA: 'Albania', LU: 'Moldova', EY: 'Lithuania', EV: 'Latvia', EE: 'Estonia',
  UK: 'Ukraine', UM: 'Belarus', UB: 'Azerbaijan', UG: 'Georgia', UD: 'Armenia', UA: 'Kazakhstan',
  LL: 'Israel', OJ: 'Jordan', OL: 'Lebanon', OM: 'UAE', OT: 'Qatar', OB: 'Bahrain', OE: 'Saudi Arabia',
  OK: 'Kuwait', OO: 'Oman', OI: 'Iran', OR: 'Iraq', OS: 'Syria', HE: 'Egypt', GM: 'Morocco',
  DA: 'Algeria', DT: 'Tunisia', HL: 'Libya', FA: 'South Africa', HK: 'Kenya', HA: 'Ethiopia',
  HT: 'Tanzania', DN: 'Nigeria', DG: 'Ghana', GO: 'Senegal', FM: 'Madagascar', FI: 'Mauritius',
  FS: 'Seychelles', GV: 'Cape Verde', VA: 'India', VE: 'India', VI: 'India', VO: 'India',
  OP: 'Pakistan', VC: 'Sri Lanka', VR: 'Maldives', VT: 'Thailand', WS: 'Singapore', WM: 'Malaysia',
  WI: 'Indonesia', WA: 'Indonesia', RP: 'Philippines', RJ: 'Japan', RO: 'Japan', RK: 'South Korea',
  RC: 'Taiwan', VH: 'Hong Kong', VM: 'Macau', VV: 'Vietnam', NZ: 'New Zealand', MM: 'Mexico',
  MK: 'Jamaica', MY: 'Bahamas', MU: 'Cuba', MD: 'Dominican Republic', MT: 'Haiti', TJ: 'Puerto Rico',
  TX: 'Bermuda', TN: 'Caribbean Netherlands', TB: 'Barbados', TF: 'French Caribbean', TT: 'Trinidad',
  MW: 'Cayman Islands', TU: 'British Virgin Islands', MP: 'Panama', MR: 'Costa Rica', MG: 'Guatemala',
  SB: 'Brazil', SD: 'Brazil', SN: 'Brazil', SW: 'Brazil', SA: 'Argentina', SC: 'Chile', SK: 'Colombia',
  SP: 'Peru', SE: 'Ecuador', SU: 'Uruguay', SV: 'Venezuela', PA: 'United States', PH: 'United States',
  PG: 'Guam'
};
var ICAO_COUNTRIES_1 = { K: 'United States', C: 'Canada', Y: 'Australia', Z: 'China', U: 'Russia' };

function countryForIcao(code) {
  if (!code || code.length !== 4) return '';
  return ICAO_COUNTRIES[code.substr(0, 2)] || ICAO_COUNTRIES_1[code.charAt(0)] || '';
}

// Approximate specs for EVs common in Ireland. Figures are typical real-world
// values, not official ratings, and every one can be overridden in the profile.
//
// kwh:   usable battery capacity
// use:   typical consumption, kWh per 100 km (mixed driving, mild weather)
// dc:    peak DC charging power, kW (0 = no rapid charging)
// ac:    max AC charging power, kW
// plug:  DC connector family ('CCS' | 'CHAdeMO' | null)
// years: [first, last] model years for this variant (last = null: still sold)

export const VEHICLES = [
  { make: 'Audi', model: 'Q4 e-tron 40', years: [2021, null], kwh: 77, use: 19, dc: 135, ac: 11, plug: 'CCS' },
  { make: 'BMW', model: 'i3 (120Ah / 42 kWh)', years: [2019, 2022], kwh: 37.9, use: 15, dc: 50, ac: 11, plug: 'CCS' },
  { make: 'BMW', model: 'i3 (94Ah / 33 kWh)', years: [2016, 2018], kwh: 27.2, use: 15, dc: 50, ac: 7.4, plug: 'CCS' },
  { make: 'BMW', model: 'i4 eDrive40', years: [2022, null], kwh: 81, use: 17, dc: 205, ac: 11, plug: 'CCS' },
  { make: 'BMW', model: 'iX3', years: [2021, null], kwh: 74, use: 19, dc: 150, ac: 11, plug: 'CCS' },
  { make: 'BYD', model: 'Atto 3', years: [2022, null], kwh: 60.5, use: 17.5, dc: 88, ac: 11, plug: 'CCS' },
  { make: 'BYD', model: 'Dolphin (60 kWh)', years: [2023, null], kwh: 60.4, use: 16, dc: 88, ac: 11, plug: 'CCS' },
  { make: 'Citroën', model: 'ë-C4 (50 kWh)', years: [2021, null], kwh: 46.3, use: 17, dc: 100, ac: 7.4, plug: 'CCS' },
  { make: 'Cupra', model: 'Born (58 kWh)', years: [2021, null], kwh: 58, use: 16.5, dc: 120, ac: 11, plug: 'CCS' },
  { make: 'Dacia', model: 'Spring', years: [2021, null], kwh: 25, use: 14, dc: 30, ac: 7, plug: 'CCS' },
  { make: 'Fiat', model: '500e (42 kWh)', years: [2021, null], kwh: 37.3, use: 14.5, dc: 85, ac: 11, plug: 'CCS' },
  { make: 'Ford', model: 'Mustang Mach-E Extended Range', years: [2021, null], kwh: 91, use: 20, dc: 150, ac: 11, plug: 'CCS' },
  { make: 'Ford', model: 'Mustang Mach-E Standard Range', years: [2021, null], kwh: 70, use: 19.5, dc: 115, ac: 11, plug: 'CCS' },
  { make: 'Hyundai', model: 'IONIQ Electric (38 kWh)', years: [2019, 2022], kwh: 38.3, use: 13.5, dc: 44, ac: 7.2, plug: 'CCS' },
  { make: 'Hyundai', model: 'IONIQ Electric (28 kWh)', years: [2016, 2019], kwh: 28, use: 13, dc: 70, ac: 6.6, plug: 'CCS' },
  { make: 'Hyundai', model: 'IONIQ 5 (77 kWh)', years: [2021, null], kwh: 74, use: 19, dc: 230, ac: 11, plug: 'CCS' },
  { make: 'Hyundai', model: 'IONIQ 5 (58 kWh)', years: [2021, null], kwh: 58, use: 18.5, dc: 175, ac: 11, plug: 'CCS' },
  { make: 'Hyundai', model: 'IONIQ 6 (77 kWh)', years: [2022, null], kwh: 74, use: 15.5, dc: 230, ac: 11, plug: 'CCS' },
  { make: 'Hyundai', model: 'Kona Electric (64 kWh)', years: [2018, 2023], kwh: 64, use: 15.5, dc: 77, ac: 11, plug: 'CCS' },
  { make: 'Hyundai', model: 'Kona Electric (39 kWh)', years: [2018, 2023], kwh: 39.2, use: 15, dc: 50, ac: 7.2, plug: 'CCS' },
  { make: 'Hyundai', model: 'Kona Electric (65 kWh, 2nd gen)', years: [2023, null], kwh: 64.8, use: 16, dc: 102, ac: 11, plug: 'CCS' },
  { make: 'Kia', model: 'e-Niro / Niro EV (64 kWh)', years: [2019, null], kwh: 64, use: 16, dc: 77, ac: 11, plug: 'CCS' },
  { make: 'Kia', model: 'EV3 (81 kWh)', years: [2024, null], kwh: 78, use: 16, dc: 128, ac: 11, plug: 'CCS' },
  { make: 'Kia', model: 'EV6 (77 kWh)', years: [2021, null], kwh: 74, use: 19, dc: 230, ac: 11, plug: 'CCS' },
  { make: 'Kia', model: 'EV9', years: [2023, null], kwh: 96, use: 23, dc: 210, ac: 11, plug: 'CCS' },
  { make: 'Mercedes-Benz', model: 'EQA 250', years: [2021, null], kwh: 66.5, use: 18, dc: 100, ac: 11, plug: 'CCS' },
  { make: 'MG', model: 'MG4 Long Range (64 kWh)', years: [2022, null], kwh: 61.7, use: 17, dc: 135, ac: 11, plug: 'CCS' },
  { make: 'MG', model: 'MG4 Standard (51 kWh)', years: [2022, null], kwh: 50.8, use: 16.5, dc: 117, ac: 6.6, plug: 'CCS' },
  { make: 'MG', model: 'MG5 Long Range', years: [2022, null], kwh: 57.4, use: 17, dc: 87, ac: 11, plug: 'CCS' },
  { make: 'MG', model: 'ZS EV Long Range (72 kWh)', years: [2022, null], kwh: 68.3, use: 18, dc: 92, ac: 7, plug: 'CCS' },
  { make: 'MG', model: 'ZS EV (44.5 kWh)', years: [2019, 2021], kwh: 44.5, use: 18, dc: 76, ac: 7, plug: 'CCS' },
  { make: 'Nissan', model: 'Leaf e+ (62 kWh)', years: [2019, null], kwh: 59, use: 17, dc: 70, ac: 6.6, plug: 'CHAdeMO' },
  { make: 'Nissan', model: 'Leaf (40 kWh)', years: [2018, null], kwh: 37, use: 16, dc: 46, ac: 6.6, plug: 'CHAdeMO' },
  { make: 'Nissan', model: 'Leaf (30 kWh)', years: [2016, 2017], kwh: 28, use: 15, dc: 50, ac: 6.6, plug: 'CHAdeMO' },
  { make: 'Nissan', model: 'Leaf (24 kWh)', years: [2013, 2016], kwh: 21, use: 15, dc: 50, ac: 3.6, plug: 'CHAdeMO' },
  { make: 'Peugeot', model: 'e-208 (50 kWh)', years: [2020, 2023], kwh: 46.3, use: 16, dc: 100, ac: 7.4, plug: 'CCS' },
  { make: 'Peugeot', model: 'e-2008 (50 kWh)', years: [2020, 2023], kwh: 46.3, use: 17.5, dc: 100, ac: 7.4, plug: 'CCS' },
  { make: 'Polestar', model: '2 Long Range', years: [2020, null], kwh: 75, use: 18, dc: 155, ac: 11, plug: 'CCS' },
  { make: 'Renault', model: 'Megane E-Tech (60 kWh)', years: [2022, null], kwh: 60, use: 16.5, dc: 130, ac: 22, plug: 'CCS' },
  { make: 'Renault', model: 'Zoe R110/R135 (ZE50)', years: [2019, 2024], kwh: 52, use: 16, dc: 50, ac: 22, plug: 'CCS' },
  { make: 'Renault', model: 'Zoe (ZE40)', years: [2017, 2019], kwh: 41, use: 16, dc: 0, ac: 22, plug: null },
  { make: 'Skoda', model: 'Elroq 60', years: [2025, null], kwh: 59, use: 16.5, dc: 165, ac: 11, plug: 'CCS' },
  { make: 'Skoda', model: 'Enyaq 80 (77 kWh)', years: [2021, null], kwh: 77, use: 18.5, dc: 135, ac: 11, plug: 'CCS' },
  { make: 'Skoda', model: 'Enyaq 60 (58 kWh)', years: [2021, null], kwh: 58, use: 17.5, dc: 120, ac: 11, plug: 'CCS' },
  { make: 'Tesla', model: 'Model 3 Long Range', years: [2019, null], kwh: 75, use: 15.5, dc: 250, ac: 11, plug: 'CCS' },
  { make: 'Tesla', model: 'Model 3 RWD / Standard Range', years: [2019, null], kwh: 57.5, use: 14.5, dc: 170, ac: 11, plug: 'CCS' },
  { make: 'Tesla', model: 'Model Y Long Range', years: [2022, null], kwh: 75, use: 17, dc: 250, ac: 11, plug: 'CCS' },
  { make: 'Tesla', model: 'Model Y RWD', years: [2022, null], kwh: 57.5, use: 16.5, dc: 170, ac: 11, plug: 'CCS' },
  { make: 'Toyota', model: 'bZ4X', years: [2022, null], kwh: 64, use: 18, dc: 150, ac: 11, plug: 'CCS' },
  { make: 'Volkswagen', model: 'e-Golf (35.8 kWh)', years: [2017, 2020], kwh: 32, use: 15, dc: 40, ac: 7.2, plug: 'CCS' },
  { make: 'Volkswagen', model: 'ID.3 Pro (58 kWh)', years: [2020, null], kwh: 58, use: 16.5, dc: 120, ac: 11, plug: 'CCS' },
  { make: 'Volkswagen', model: 'ID.3 Pure (45 kWh)', years: [2020, null], kwh: 45, use: 16, dc: 100, ac: 11, plug: 'CCS' },
  { make: 'Volkswagen', model: 'ID.4 Pro (77 kWh)', years: [2021, null], kwh: 77, use: 18.5, dc: 135, ac: 11, plug: 'CCS' },
  { make: 'Volvo', model: 'EX30 Extended Range', years: [2024, null], kwh: 64, use: 17, dc: 153, ac: 11, plug: 'CCS' },
  { make: 'Volvo', model: 'XC40 / EX40 Recharge (75 kWh)', years: [2020, null], kwh: 75, use: 21, dc: 150, ac: 11, plug: 'CCS' },
];

export const MAKES = [...new Set(VEHICLES.map((v) => v.make))];

export function modelsFor(make, year) {
  return VEHICLES.filter(
    (v) => v.make === make && (!year || (year >= v.years[0] && (v.years[1] == null || year <= v.years[1]))),
  );
}

export function findVehicle(make, model) {
  return VEHICLES.find((v) => v.make === make && v.model === model) || null;
}

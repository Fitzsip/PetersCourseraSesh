import json, urllib.request

ids = ["9502", "11610", "9482", "9500", "5850", "9756"]  # or your full league list

with urllib.request.urlopen("https://api.sleeper.app/v1/players/nfl") as r:
    players = json.load(r)

for pid in ids:
    p = players.get(pid)
    print(pid, "→", p["full_name"], p["position"], p["team"]) if p else print(pid, "→ not found")

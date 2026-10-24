# TV Hub

One home screen for your Samsung TV. Your streaming apps, the shows you're following, your free-to-air satellite channels, RTÉ and Virgin Media channels, and live Sky Sports all sit together, so you switch between them with a click instead of digging through separate menus.

It's an ordinary Samsung (Tizen) app that you install with Samsung's own **Developer Mode**. No jailbreak or firmware hacks, and nothing is changed on the TV.

## What it does

| | |
|---|---|
| **On now** | The first row. What's on RTÉ One, RTÉ2, Virgin Media One and Two right now, always first and in your order. Then up to two live events from the sports you follow (tagged **LIVE**), then your last satellite channel. |
| **My shows** | The shows you're following, with posters and a **NEW EPISODE** flag when one came out in the last week, or the date of the next one. Press OK and it opens the right app. Shows with new episodes come first, then your own order. |
| **Your apps** | Big tiles for Netflix, Disney+, Prime Video, NOW, YouTube, RTÉ Player and Virgin Media Player. Add any app installed on the TV, and hide or reorder tiles. |
| **Colour buttons** | Red, green, yellow and blue on the remote open an app straight away, from the home screen or while you watch TV. You choose which app goes on each button. |
| **Satellite TV** | Your free-to-air channels. Highlight one and it plays in the preview window; press OK to watch full screen. CH ▲▼ flicks through them. |
| **My sport** | Live and upcoming events for the sports you follow, set to **F1, NFL and Premier League** to start with. They come from Sky's guide for the next few days, on whichever Sky Sports channel shows them, e.g. *LIVE · Premier League: Arsenal v Spurs · Main Event · Premier League* or *Sun 18:00 · NFL: Chiefs v Bills*. After them come tiles for your Sky Sports channels: Main Event, Premier League, F1 and NFL, with the others switched on in Settings. OK opens NOW. |
| **Type a number** | Type `102` on the remote and it jumps to that satellite channel. The number box shows the channel's name before it switches. `1` to `9` also open your 1st to 9th satellite channels. |
| **Settings** | The INFO button opens it. Everything is set up with the remote: the sports you follow, show, hide and reorder apps; assign colour buttons; choose channels; add or remove online channels and Sport channels. Remove and Reset ask you to press OK twice. |

## Try it on your computer first

Open `index.html` in Chrome. It starts in **demo mode** with fake channels and programme info.

| Remote | Keyboard |
|---|---|
| Arrows / OK | Arrow keys / Enter |
| Back | Backspace or Esc |
| Red / Green / Yellow / Blue | R / G / Y / B |
| CH ▲ / CH ▼ | Page Up / Page Down |
| Numbers | 0–9 |

## Install it from an Android phone (no computer needed)

[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) is a free, open-source installer for Samsung TVs. Its Android app does what Tizen Studio does: it finds the TV, makes the Samsung certificate and installs the app.

1. **Turn on Developer Mode on the TV.**
   1. Open **Apps**.
   2. Type `1 2 3 4 5` on the remote.
   3. Switch it **On** and enter your **phone's** IP address. On Android it's in Settings → About phone → Status, or under your Wi-Fi network's details.
   4. Turn the TV off at the wall and back on.
2. **Install Apps2Samsung on the phone.** Take the `-android.apk` from its [releases page](https://github.com/Apps2Samsung/Apps2Samsung/releases), or add it through F-Droid or Obtainium as its README explains. Install it only from there.
3. **Download TV Hub to the phone.** That's the file `tv-hub/dist/TVHub.wgt` from this repository. If it's out of date, rebuild it with `./make-wgt.sh`.
4. **Install it.**
   1. In Apps2Samsung, choose your TV.
   2. Choose **your own package** and pick `TVHub.wgt`.
   3. Sign in to your Samsung account when it asks; that's how it makes the certificate.
   4. Install.
5. **Back up from Apps2Samsung.** Use its **Backup** feature, and keep the file in Google Drive or email it to yourself. It holds the signing certificate, so you can update TV Hub later without losing your settings.

Then carry on with **First-time setup** below. On iPhone, Apps2Samsung is a beta that needs a computer once to set up, so the computer method below may be simpler.

## Or install it from a computer (one-off, about 30–45 minutes)

You need a Windows, Mac or Linux computer on the same Wi-Fi or network as the TV. Apps2Samsung's desktop version also works and is quicker than these steps.

1. **Find your computer's IP address.** On Windows, run `ipconfig`. On a Mac, go to System Settings → Network.
2. **Turn on Developer Mode on the TV.**
   1. Open **Apps** on the TV.
   2. Type `1 2 3 4 5` on the remote's number pad. A Developer Mode box appears.
   3. Switch it **On** and enter your computer's IP address.
   4. Turn the TV fully off at the wall, then back on.
3. **Install Tizen Studio** (free) from <https://developer.tizen.org/development/tizen-studio/download>.
   1. Open its **Package Manager**.
   2. Under *Extension SDK*, install **TV Extensions** and **Samsung Certificate Extension**.
4. **Connect to the TV.**
   1. In Tizen Studio, open **Tools → Device Manager → Remote Device Manager**.
   2. Add your TV's IP address (on the TV: Settings → General → Network → Network Status → IP Settings).
   3. Switch it to connected.
5. **Make a Samsung certificate.** Samsung TVs only install apps signed with one, and it's free.
   1. Open **Tools → Certificate Manager → + → Samsung → TV**.
   2. Follow the steps and sign in with your Samsung account when asked.
   3. Give the profile a name, for example `peter`.
6. **Build and install.** Use whichever option suits you:
   - **In Tizen Studio:**
     1. Choose *File → Import → Tizen → Tizen Project* and pick this `tv-hub` folder.
     2. Right-click the project and choose **Run As → Tizen Web Application**.
   - **From a terminal:**
     ```bash
     ./build.sh peter 192.168.1.50   # your certificate profile name, then the TV's IP address
     ```
7. On the TV, **TV Hub** now appears in Apps.
   1. Move it to the **first position** of the bottom app bar: highlight it, press Down, choose *Move*.
   2. Optional: turn on *Settings → General → Smart Features → Autorun Last App* (the name varies by model). The TV then opens TV Hub at power-on if TV Hub was the last thing you used.
8. **Back up your certificate before you hand the computer back.** This matters if you don't have your own computer:
   - **Why:** updating TV Hub later must use the *same* certificate. With a different one, the TV makes you uninstall TV Hub first, which wipes your shows, channels and settings.
   - **How:** `./build.sh` does this for you. It saves `tv-hub-certificate-backup.zip` next to this README.
   - **Without the script:** zip the `tizen-studio-data/keystore` and `tizen-studio-data/profile` folders yourself. They're in your home folder, or `C:\tizen-studio-data` on Windows.
   - **Then:** email the zip to yourself, or put it in Google Drive or iCloud, and keep a note of the certificate password.
   - **Next time:** on a borrowed computer, install Tizen Studio, unzip the backup into the same places, then build as usual.

## First-time setup (on the TV)

1. Install **NOW**, **RTÉ Player** and **Virgin Media Player** from Samsung's app store if you haven't already. TV Hub finds them by name.
2. In the **Satellite TV** row, choose **+ Add your satellite channels** and tick the ones you watch. They come from the TV's own channel scan, so the numbers are right for your TV. If the TV doesn't share its list, use **Settings → Add by number**.
3. Check each app tile opens. If one doesn't, or opens the wrong thing:
   1. Go to **Settings → Apps → Change app** on that tile.
   2. Pick the right app from the list of apps installed on your TV.

   This keeps the tile's links to My shows, On now and Sport. Don't remove the tile and add the app again.
4. Choose which app goes on each colour button.
5. Add your shows: highlight **+ Add a show**, type the name with the on-screen keyboard, pick the right result, then choose which app you watch it on. TV Hub suggests one.

## Good to know

- **Streaming apps don't share what you're watching.** Netflix, Disney+, Prime and NOW keep viewing history private, so nothing outside those apps can read your "Continue watching" list. That's why you add shows to **My shows** yourself. TV Hub then keeps them up to date using TVmaze, a free TV database.
- **Online channels and Sport open the app, not the exact channel.** Samsung gives apps no way to jump straight into a specific live channel inside another app. Pressing OK on *RTÉ One* opens RTÉ Player, and you pick RTÉ One under *Live*. The message on screen tells you which channel to choose.
- **Where the listings come from.** These are the same public TV-guide pages the open-source [iptv-org/epg](https://github.com/iptv-org/epg) project uses:
  - **Virgin Media:** virginmediatelevision.ie
  - **RTÉ:** tvireland.ie
  - **Sky Sports:** Sky's own TV-guide service (the Irish versions of the channels)

  None of them is an official API, so one could change without warning.
  - **If one breaks:** its tiles say **"Listings unavailable"**, and OK still opens the app.
  - **Retries:** TV Hub tries again every 10 minutes, not constantly.
  - **Fixing it:** needs an update to TV Hub, which needs a computer.
- **Sport listings show what Sky is broadcasting.** What you can actually watch depends on your NOW membership.

- **Samsung's Home button still opens Samsung's own menu.** Only a jailbreak can replace that, so TV Hub works as your "first app" instead. Putting it in the first slot of the app bar makes it one press away.
- **Live TV inside the app.** Older Samsungs normally allow apps to tune channels and show the picture (the `tv.channel` and `tv.window` permissions). If yours doesn't:
  - **The install fails with a "privilege" error:** delete the two `tv.channel` / `tv.window` lines in `config.xml` and install again.
  - **Live TV still won't play in the app:** pressing OK on a channel opens the TV's own live-TV screen and tells you which channel to choose. Highlighting a channel never leaves TV Hub. If the TV's live-TV screen doesn't open, use the remote's **Source** button and choose **TV**.
- **Coming back after watching Netflix and the rest:** press **Home** on the remote, then **TV Hub**. TV Hub remembers which tile you were on.
- **Where your settings are kept:** on the TV.
  - They survive updates signed with the same certificate (see install step 8).
  - They don't survive an uninstall or a factory reset.
- To change the default apps or channels, edit `js/defaults.js`.

## Files

```
tv-hub/
  config.xml       Samsung app manifest (name, permissions)
  index.html       Screen layout
  css/style.css    Look and feel (designed for 1920×1080)
  js/defaults.js   Starting apps, channels and options
  js/platform.js   Talks to the TV (launch apps, tune channels, remote keys, web requests)
  js/guide.js      Online TV guide for RTÉ, Virgin Media and Sky Sports
  js/shows.js      "My shows" info from TVmaze
  js/app.js        Home screen, live TV, sport, shows, settings and navigation
  build.sh         Package, sign and install with Tizen Studio from the command line
  make-wgt.sh      Make the unsigned dist/TVHub.wgt for Apps2Samsung
  dist/TVHub.wgt   The packaged app, ready to install
```

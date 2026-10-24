# TV Hub

One home screen for your Samsung TV. All your streaming apps and your free-to-air satellite channels sit side by side, so you switch between them with a click instead of digging through separate menus.

It's an ordinary Samsung (Tizen) app that you install with Samsung's own **Developer Mode**. No jailbreak or firmware hacks, and nothing is changed on the TV.

## What it does

| | |
|---|---|
| **Apps row** | Big tiles for Netflix, Disney+, Prime Video and YouTube. Add any app installed on the TV from a list, then hide or reorder tiles. |
| **Most-used first** | Apps you open often move to the front automatically. You can turn this off. |
| **Colour buttons** | Red, green, yellow and blue on the remote open an app straight away, from the home screen or while you watch TV. You choose which app goes on each button. |
| **Live channels row** | Your satellite channels with *Now/Next* programme info. A tile tagged **LAST** marks the channel you watched most recently. |
| **Live preview** | Highlight a channel and it plays in the preview window on the home screen. Press OK to watch it full screen. |
| **Type a number** | Type `102` on the remote from anywhere in TV Hub and it jumps to that channel. `1` to `9` also open your 1st to 9th channels. |
| **CH ▲▼** | Flicks through your channels while you watch. |
| **Settings** | Everything is set up with the remote: show or hide apps, assign buttons, import channels from the TV, add a channel by number, and reset. |

## Try it on your computer first

Open `index.html` in Chrome. It starts in **demo mode** with fake channels and programme info.

| Remote | Keyboard |
|---|---|
| Arrows / OK | Arrow keys / Enter |
| Back | Backspace or Esc |
| Red / Green / Yellow / Blue | R / G / Y / B |
| CH ▲ / CH ▼ | Page Up / Page Down |
| Numbers | 0–9 |

## Install it on the TV (one-off, about 30–45 minutes)

You need a Windows, Mac or Linux computer on the same Wi-Fi or network as the TV.

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

## First-time setup (on the TV)

1. Open **Settings → Import channels from TV** and tick the satellite channels you want. If the TV doesn't share its list, use **Add by number**.
2. Check each app tile opens. If one doesn't, remove it and use **+ Add an installed app**. That list shows the exact app IDs on *your* TV.
3. Choose which app goes on each colour button.

## Good to know

- **Samsung's Home button still opens Samsung's own menu.** Only a jailbreak can replace that, so TV Hub works as your "first app" instead. Putting it in the first slot of the app bar makes it one press away.
- **Live TV inside the app.** Older Samsungs normally allow apps to tune channels and show the picture (the `tv.channel` and `tv.window` permissions). If yours doesn't:
  - **The install fails with a "privilege" error:** delete the two `tv.channel` / `tv.window` lines in `config.xml` and install again.
  - **Live TV still won't play in the app:** pressing a channel opens the TV's own live-TV screen instead. If that doesn't open either, find the correct app ID in Settings → *Add an installed app* and put it in `tvViewerAppId` in `js/defaults.js`.
- Your settings are stored on the TV. They survive reinstalls of the same app but not a factory reset.
- To change the default apps or channels, edit `js/defaults.js`.

## Files

```
tv-hub/
  config.xml       Samsung app manifest (name, permissions)
  index.html       Screen layout
  css/style.css    Look and feel (designed for 1920×1080)
  js/defaults.js   Starting apps, channels and options
  js/platform.js   Talks to the TV (launch apps, tune channels, remote keys)
  js/app.js        Home screen, live TV, settings and navigation
  build.sh         Package and install from the command line
```

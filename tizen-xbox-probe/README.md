# Xbox Probe (Samsung Tizen TV)

A small test app that checks whether a Samsung TV's web engine can run a
custom Xbox Remote Play client. It doesn't stream anything. It reports whether
the TV supports what streaming needs.

## Checks

| Check | Why it matters |
|---|---|
| WebRTC, data channels, H.264 in WebRTC (required) | Xbox Remote Play sends video over WebRTC and takes controller input over a data channel |
| Gamepad API (required) | Reads the Bluetooth Xbox controller paired to the TV |
| Opus, ICE/STUN, WebCrypto, MSE | Audio, connections outside your home network, and sign-in helpers |
| login.live.com / xhome | Whether the app can talk to Microsoft directly or is blocked by CORS |

The right-hand panel shows the controller's buttons and sticks live, so you
can confirm the TV reads your controller. It also shows the TV's model and
firmware.

## Install

1. Build: `./build.sh` (or use the prebuilt `dist/XboxProbe.wgt`).
2. Copy `dist/XboxProbe.wgt` to your phone.
3. In Apps2Samsung, choose **Custom WGT / TPK**, pick the file, and install
   it to the TV. The TV must be in Developer Mode with your phone's IP set.
4. Open **Xbox Probe** on the TV, pair your controller, press a few buttons,
   and photograph the screen.

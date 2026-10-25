# Xbox Remote (Samsung Tizen TV)

Streams your own Xbox to a Samsung TV with Xbox Remote Play. It signs in to
your Microsoft account, goes through the Xbox Live and Remote Play sign-in
steps, then starts a session and plays the console's video with your
controller's input sent back. The streaming protocol is reverse-engineered
(as in open-source clients such as Greenlight), so each stage logs on screen.

## One-time setup: your own app ID

1. At https://portal.azure.com (personal accounts may first need the free
   sign-up at https://signup.azure.com to get a directory), open
   **App registrations → New registration**:
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI: leave empty
2. Copy the **Application (client) ID**.
3. Under **Authentication**:
   - **Add a platform → Single-page application**, redirect URI `https://localhost`.
     Needed because the TV's web engine sends an Origin header; without it
     sign-in fails with `AADSTS90023`.
   - **Allow public client flows: Yes**.

The Single-page application setting means Microsoft keeps the TV signed in
for only 24 hours, so expect a new sign-in code about once a day.

## Build and install

```sh
./build.sh <application-client-id>   # writes src/config.js, builds dist/XboxRemote.wgt
```

Install `dist/XboxRemote.wgt` with Apps2Samsung → **Custom WGT / TPK**.
On the Xbox, turn on **Settings → Devices & connections → Remote features**
and set the power mode to **Sleep**.

## Controls

Menu:
- **A** or **OK**: start streaming
- **Y** or the **red** remote button: sign out and get a new code
- **BACK**: exit

While streaming, the controller goes to the Xbox:
- **BACK** on the TV remote: stop streaming
- **Green** remote button: show or hide the connection log

## Third-party code

`src/vendor/qrcode.js` is [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 by Kazuhiko Arase (MIT license).

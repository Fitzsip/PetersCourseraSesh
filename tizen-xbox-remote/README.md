# Xbox Remote (Samsung Tizen TV)

Signs in to your Microsoft account from a Samsung TV, then goes through the
Xbox Live and Remote Play sign-in steps and lists your consoles. Streaming is
the next stage; this app shows how far the sign-in gets.

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

- **Y** on the controller or the **red** remote button: sign out and get a new code
- **BACK**: exit

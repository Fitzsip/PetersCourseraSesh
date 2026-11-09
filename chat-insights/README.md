# Chat Insights

A private, offline analyser for a WhatsApp conversation. It is one HTML file: open it in a
browser, drop in your chat export, and explore.

## Privacy

- **Nothing leaves your computer.** There is no server and no third-party code. The page's
  Content-Security-Policy blocks *every* network request (`default-src 'none'`), so even a bug
  couldn't upload anything.
- To check for yourself, turn off Wi-Fi, then open the file. It works exactly the same.
- Nothing is stored. Close the tab and the chat is gone from memory.
- **Don't commit your chat export to this repo.** `.gitignore` here ignores `*.txt` and `*.zip`.

## Use it

1. Download `index.html` (or clone the repo) onto your laptop.
2. Double-click it to open it in Chrome, Edge, Firefox or Safari.
3. Drag your export (`.zip` or `.txt`) onto the page.

Click **"try it with made-up demo data"** to see what it does before using your real chat.

## Exporting the chat from WhatsApp

**iPhone:** open the chat → tap her name at the top → scroll down → **Export Chat** →
**Without Media** → *Save to Files* (or AirDrop it to your Mac).

**Android:** open the chat → **⋮** → **More** → **Export chat** → **Without media** → save to
Drive / email it to yourself / save to the phone.

### If it's stuck on "Initializing…" (common with long chats)

A chat with many years of history can take **several minutes** to prepare. It often looks
frozen when it isn't.

- Always pick **Without Media**. With media, a 14-year chat can be many GB and fail.
- Keep WhatsApp **open and in the foreground** with the screen on. Locking the phone or
  switching apps usually cancels it. Plug in the charger and wait 5–15 minutes.
- Make sure the phone has a few GB of **free storage**, and WhatsApp is **up to date**.
- If it still never finishes: force-close WhatsApp, restart the phone, and try again.
- Choose a plain destination (*Save to Files* on iPhone, or Google Drive on Android) rather than
  email or another chat app. Those can choke on a big attachment.
- WhatsApp's built-in export is widely reported to include only the **most recent ~40,000
  messages** (about 10,000 with media), with no warning. After loading, check the **first
  message date** in the Overview. For a long relationship it will likely be recent, not the
  real start.

### Getting the full history (beyond ~40,000 messages)

WhatsApp's own export can't do it, and it has no way to pick a date range. The full history is
in the phone's WhatsApp database, which you can read from a backup on your own computer with the
open-source [WhatsApp Chat Exporter](https://github.com/KnugiHK/Whatsapp-Chat-Exporter). It runs
locally, so the chat stays private.

- **iPhone:** make a Finder/iTunes backup of the phone to your Mac/PC, then run the exporter in
  iOS mode against that backup. Encrypted backups are supported.
- **Android:** in WhatsApp turn on **end-to-end encrypted backup** using the **64-digit key**
  option (write the key down), let it back up, copy `msgstore.db.crypt15` from the phone to your
  computer, and run the exporter with that key.

Follow the exporter's README for the exact commands. It outputs HTML and JSON.

## What it shows

- **Overview:** total messages, words, daily average, longest daily streak, longest silence,
  busiest day, typical reply time, and a "who does what" split (messages, words, conversations
  started, last word, questions, emoji, affection, laughs, media, voice notes, links, deleted).
- **Over time:** stacked message volume per person, plus a calendar of every day. For long
  histories this is a compact strip with one row per year, so seasonal patterns stand out.
- **When you talk:** weekday × hour heatmap, and an hour-of-day profile per person.
- **Conversation dynamics:** who starts conversations, median reply time, message length, and a
  rough mood (net positivity) line, all over time.
- **Love & laughs:** share of messages that are affectionate or laughing, per person, over time.
- **Words & emoji:** top words, each person's *signature* words (statistically more theirs than
  the other's), favourite emoji, and catchphrases (common 2–3 word phrases).
- **Topics over time:** editable topic lists (e.g. `Holidays: holiday, flight, hotel, beach*`)
  plotted as a share of messages. There's also "each year in words", the words that set each
  year apart from the others.
- **Milestones:** first message, first "love you" (and how long until it was said back), longest
  conversation, night owl / early bird, fastest replier, chattiest year and more.
- **Search:** find any word or phrase, see when it came up, and read the matching messages.

Toolbar controls: year range, group by week / month / quarter / year (auto picks quarters for
6+ years), how long a silence starts a new conversation, smoothing, a date-format override, and
**Save CSV** to download the period-by-period numbers (also local).

## Performance

Tested on a synthetic 14-year chat (~508,000 messages, 44 MB) in headless Chromium on a modest
cloud CPU. It took about 12 s to load; changing the grouping takes about 1 s, and searching is
instant. A typical laptop is faster.

## Supported formats

iPhone and Android exports, with day/month or month/day dates (auto-detected, with a manual
override), 2- or 4-digit years, 24-hour or 12-hour clocks, multi-line messages, edited/deleted
messages, and media placeholders in English. Non-English exports still parse, but the
"media omitted" lines and the word lists (stop words, mood, affection) are English. Add your
own words to ignore in the *Words & emoji* section.

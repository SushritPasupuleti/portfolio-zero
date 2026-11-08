# Zerodha Kite Personal setup

## Use a Personal app

For this private, single-user portfolio dashboard, choose **Personal** in the Kite Developer Console. Personal is intended for personal account APIs: holdings, positions, funds, and reports. It excludes the separate market-data services (live quotes, WebSockets, and historical chart data). That market-data limitation does not prevent the app from retrieving account holdings; the plan uses a separate EOD source for stock prices.

Zerodha's forum announcement describes Personal as giving free access to personal account features, including positions and holdings, without market data. The official API docs list GET reads for equity holdings/positions and Coin mutual-fund holdings/SIPs. Do not select Personal expecting `/quote`, KiteTicker/WebSocket, or historical candles. Confirm the required account read endpoints against your own Personal app when the connector is implemented.

## Create the app

1. Sign in to the [Kite Developer Console](https://developers.kite.trade/).
2. Create a new app and select **Personal** (the option shown in the app-type selector screenshot).
3. Enter an app name, your Zerodha Client ID, and the exact local redirect URL:

   ```text
   http://127.0.0.1:5173/
   ```

   **Use the alphanumeric Zerodha Client ID for the account that will authorize
   the app.** Do not enter a numeric account identifier, and remove any leading
   or trailing spaces. A Kite app is bound to the client ID configured when the
   app is created; the account signed into Kite during authorization must be
   that same account.

4. Keep the generated API key and API secret private. Do not put the API secret in React, a public URL, Git, screenshots, or chat.

## Generate today's access token

1. From the repository root, install dependencies if needed:

   ```sh
   make setup
   ```

2. Start the local backend and React app in separate terminals:

   ```sh
   make api
   make web
   ```

3. Open <http://127.0.0.1:5173> and go to **Settings → Zerodha connection**. Save your API key and secret once; they are stored in the local secret store and prefilled on future visits. The Kite login URL is generated and displayed automatically. Set the redirect URL in the Developer Console to the exact URL shown in Settings.
4. Select **Continue to Zerodha**, sign in, and complete 2FA. When Kite redirects back with `request_token`, the dashboard automatically exchanges it with the local API, saves the expiring access token, shows a toast, and removes the query string from the address bar.

The redirect must exactly match the React app URL shown in Settings (normally `http://127.0.0.1:5173/`). If the token field is not filled after login, check that the app's configured redirect URL matches the active host and port, then start a fresh login flow. Do not reuse an old request token.

Kite's request token is short-lived and should be exchanged promptly. The access token normally expires at 6:00 AM the following day, so expect to complete this login flow daily. The app must show a clear reauthentication state when the token expires or is invalidated.

## Troubleshooting: “The user is not enabled for the app”

This error is generally an account/app binding mismatch. Zerodha's [Kite Connect
FAQ](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs)
and [developer forum guidance](https://kite.trade/forum/discussion/14241/the-user-is-not-enabled-for-the-app)
recommend checking that the app's configured Zerodha Client ID exactly matches
the account being used. Check these items in order:

1. Open the app details in the Kite Developer Console and compare its **Zerodha
   Client ID** with the alphanumeric Client ID shown in the Zerodha account
   profile. Do not use a numeric identifier, and remove spaces.
2. If the app was created with the wrong Client ID, correct the app configuration
   if the console permits it, or create a new app linked to the correct account.
   Use the API key from that same app in this UI.
3. If you have multiple Zerodha accounts, sign out of Kite in the browser used
   for the generated login URL. Sign back in with the account linked to the app,
   then retry. A separate browser profile or private window can help avoid a
   stale session for another account.
4. Retry the login URL shown by this UI. Do not reuse an old `request_token`.

This message is not caused by choosing **Personal** instead of **Connect**.
Personal apps are for the linked user's account APIs; the separate market-data
limitations do not enable or disable the login account. Do not switch to a paid
app just to work around this error. If the Client ID and browser account are
certainly correct and it persists, contact Zerodha support with the app ID and
Client ID through their private support channel; never share the API secret or
access token.

## Current implementation/security status

The React setup page stores the API key and access token through the local secret-store layer, separate from the portfolio rows. Treat the files under `backend/data/` as sensitive: keep them local and out of backups or sync services you do not trust. Docker Compose mounts this directory into the API container so the API can read the saved token and retain local portfolio snapshots. The older `make token-ui` Streamlit helper remains available for the legacy `:8501` redirect flow.

When the React dashboard opens, it uses the backend to sync equity holdings, net positions, Coin mutual-fund holdings, and SIP schedules. You can run another read-only sync with **Sync Zerodha** or **Refresh**. A successful sync replaces the previous Zerodha snapshot; a failed sync keeps the last successful local snapshot and shows a redacted error. The UI uses the last prices returned by Kite and the NAV date returned for mutual funds; it does not call Kite's quote, WebSocket, or historical-candle APIs.

Never implement the exchange in browser code. Zerodha explicitly warns against embedding the API secret in a client-side application. See the official [authentication flow](https://www.kite.trade/docs/connect/v3/user/), [Personal app announcement](https://kite.trade/forum/discussion/14868/introducing-kite-connect-personal-apis-free-apis-for-personal-use), [portfolio API](https://www.kite.trade/docs/connect/v3/portfolio/), and [mutual-funds API](https://kite.trade/docs/connect/v3/mutual-funds/).

## Read-only boundary

The app will request only account/portfolio reads needed for the dashboard: profile/session validation, holdings, positions, mutual-fund holdings, and SIP status. It will not call order placement/modification/cancellation, position conversion, holdings authorization, or SIP create/modify/cancel methods. Keep the access token private: it can authorize more than the reads this app intends to use.

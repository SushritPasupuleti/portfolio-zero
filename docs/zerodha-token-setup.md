# Zerodha Kite Personal setup

## Use a Personal app

For this private, single-user portfolio dashboard, choose **Personal** in the Kite Developer Console. Personal is intended for personal account APIs: holdings, positions, funds, and reports. It excludes the separate market-data services (live quotes, WebSockets, and historical chart data). That market-data limitation does not prevent the app from retrieving account holdings; the plan uses a separate EOD source for stock prices.

Zerodha's forum announcement describes Personal as giving free access to personal account features, including positions and holdings, without market data. The official API docs list GET reads for equity holdings/positions and Coin mutual-fund holdings/SIPs. Do not select Personal expecting `/quote`, KiteTicker/WebSocket, or historical candles. Confirm the required account read endpoints against your own Personal app when the connector is implemented.

## Create the app

1. Sign in to the [Kite Developer Console](https://developers.kite.trade/).
2. Create a new app and select **Personal** (the option shown in the app-type selector screenshot).
3. Enter an app name, your Zerodha Client ID, and the exact local redirect URL:

   ```text
   http://127.0.0.1:8501
   ```

4. Keep the generated API key and API secret private. Do not put the API secret in React, a public URL, Git, screenshots, or chat.

## Generate today's access token

1. From the repository root, install dependencies if needed:

   ```sh
   make setup
   ```

2. Start the local token setup page:

   ```sh
   make token-ui
   ```

3. Open <http://127.0.0.1:8501>, enter the API key, and open the generated Kite login URL.
4. Sign in to Zerodha and complete the account's 2FA.
5. After redirect, copy only the `request_token` query parameter value from the browser address bar. Paste it into the token setup page along with the API secret. The secret and request token inputs are masked.
6. Select **Generate token and save locally**. The helper exchanges the short-lived request token through the official `kiteconnect` Python SDK and stores the access token locally. The UI now reports success without displaying the full access token.

Kite's request token is short-lived and should be exchanged promptly. The access token normally expires at 6:00 AM the following day, so expect to complete this login flow daily. The app must show a clear reauthentication state when the token expires or is invalidated.

## Current implementation/security status

The Streamlit helper currently stores the API key and access token in the local SQLite `app_settings` table. That database is not encrypted at rest yet. Treat `backend/data/portfolio_puffin.db` as a credential file: keep it local, do not sync or share it, and remove it using the app's local-data delete flow if needed. Moving token material to the OS keychain or an encrypted local store is a release prerequisite before direct portfolio sync ships.

The API currently checks whether a token is configured, but it does **not yet call Kite to fetch holdings, positions, mutual-fund holdings, or SIPs**. A saved token is not evidence that the dashboard is connected to a Zerodha portfolio. Direct read-only account sync is the next main implementation phase.

Never implement the exchange in browser code. Zerodha explicitly warns against embedding the API secret in a client-side application. See the official [authentication flow](https://www.kite.trade/docs/connect/v3/user/), [Personal app announcement](https://kite.trade/forum/discussion/14868/introducing-kite-connect-personal-apis-free-apis-for-personal-use), [portfolio API](https://www.kite.trade/docs/connect/v3/portfolio/), and [mutual-funds API](https://kite.trade/docs/connect/v3/mutual-funds/).

## Read-only boundary

The app will request only account/portfolio reads needed for the dashboard: profile/session validation, holdings, positions, mutual-fund holdings, and SIP status. It will not call order placement/modification/cancellation, position conversion, holdings authorization, or SIP create/modify/cancel methods. Keep the access token private: it can authorize more than the reads this app intends to use.

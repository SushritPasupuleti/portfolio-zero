from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st
from kiteconnect import KiteConnect


def _kite_error_message(exc: Exception) -> str:
    message = str(exc)
    lower = message.lower()
    if "user is not enabled for the app" in lower:
        return (
            "Kite did not enable the account currently signed into the browser for this app. "
            "In the Developer Console, verify the app's Zerodha Client ID exactly matches "
            "the alphanumeric Client ID of the account you are signing into (not a numeric "
            "ID, and no leading/trailing spaces). If you have multiple accounts, sign out of "
            "Kite in that browser and sign back in with the app-linked account, then retry. "
            "Use the API key belonging to that same app. This is an account/app binding issue, "
            "not the Personal app's lack of market-data access."
        )
    if "invalid request token" in lower or "request token" in lower:
        return (
            "The request token is expired, already used, or not from the current login flow. "
            "Re-open the Kite login URL and copy a fresh request_token from the redirect."
        )
    if "api key" in lower or "api secret" in lower:
        return (
            "The API key or API secret does not match the Kite app. Confirm both values from "
            "the exact app you created and keep the redirect URL aligned."
        )
    return message

if __package__ in (None, ""):
    backend_root = Path(__file__).resolve().parent.parent
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))
    from app.storage import get_zerodha_token, save_zerodha_token
else:
    from .storage import get_zerodha_token, save_zerodha_token


def main() -> None:
    st.set_page_config(
        page_title="Portfolio Puffin token setup",
        page_icon="🦊",
        layout="wide",
    )

    # Kite redirects back with the short-lived request_token in the query string.
    # Capture it into the form state, then remove it from the visible URL/history.
    redirected_request_token = st.query_params.get("request_token")
    if redirected_request_token:
        st.session_state["kite_request_token"] = redirected_request_token
        st.session_state["kite_redirect_notice"] = True
        st.query_params.clear()

    existing = get_zerodha_token()
    st.title("Portfolio Puffin — Zerodha token setup")
    st.caption(
        "Generate, refresh, and save a local access token for read-only Kite portfolio sync."
    )

    with st.expander("Setup instructions", expanded=True):
        st.markdown(
            """
            1. In the Kite Developer Console, create a new app and choose the
               `Personal` app type. It provides account APIs; the separate live
               and historical market-data APIs are not included.
            2. Set the redirect URL to `http://127.0.0.1:8501` (or
               `http://localhost:8501` if you prefer that host) and keep the
               API key and API secret private.
            3. Confirm the app's configured Zerodha Client ID is the exact
               alphanumeric Client ID of the account you will sign into. Do not
               use a numeric account identifier or include spaces.
            4. Open the generated login URL and complete Zerodha login + 2FA.
               Kite redirects back here; the request token is captured into the
               form automatically and removed from the address bar.
            5. Enter the API secret and select **Generate token and save locally**.
               The token UI currently stores the resulting token in local SQLite;
               the React dashboard can then sync read-only holdings and SIP data.

            If Kite displays `The user is not enabled for the app`, see
            [Zerodha's Kite Connect FAQ](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs)
            for the account-mismatch checklist. In short: verify the configured Client ID,
            then sign out of other Zerodha accounts in the browser and retry with
            the account linked to this app. Personal apps support personal account
            APIs; this error does not mean you need the paid market-data app.

            > Kite access tokens normally expire daily. Refresh them and save the
            newest token here when the app says setup is required.
            """
        )

    if existing.get("access_token"):
        st.success("A token is already saved in SQLite. Update it below when you need a fresh one.")
        st.caption("A token is saved locally. It is hidden here for safety.")

    if st.session_state.pop("kite_redirect_notice", False):
        st.success(
            "Kite login succeeded and the request token was captured. Enter your API secret "
            "below, then select ‘Generate token and save locally’ to finish."
        )

    api_key = st.text_input(
        "Kite API key",
        value=existing.get("api_key", ""),
        help="This is stored locally in SQLite for the app to read.",
    )

    if api_key:
        st.markdown("### Kite login URL")
        st.code(KiteConnect(api_key).login_url())

    with st.form("token_form"):
        api_secret = st.text_input(
            "Kite API secret",
            type="password",
            help="This is used only to exchange the request token in the local session.",
        )
        request_token = st.text_input(
            "Request token (filled after Kite login)",
            type="password",
            help=(
                "Captured automatically from Kite's successful redirect. "
                "It is removed from the address bar."
            ),
            key="kite_request_token",
        )
        submitted = st.form_submit_button("Generate token and save locally")

    if submitted:
        if not api_key or not api_secret or not request_token:
            st.warning(
                "Provide the API key, API secret, and request token before "
                "generating the token."
            )
        else:
            try:
                kite = KiteConnect(api_key)
                session = kite.generate_session(request_token, api_secret=api_secret)
                access_token = session.get("access_token")
                if not access_token:
                    raise ValueError("No access_token returned by Kite.")
                save_zerodha_token(access_token, api_key)
                st.success(
                    "Token saved locally. Open the portfolio dashboard to sync Zerodha "
                    "holdings and SIPs."
                )
            except Exception as exc:  # pragma: no cover - UI error handling
                st.error(f"Token generation failed: {_kite_error_message(exc)}")

    with st.sidebar:
        st.header("Local status")
        status = "Configured" if existing.get("access_token") else "Missing"
        st.metric("Token status", status)
        st.caption("The app checks for this token before rendering the dashboard.")


if __name__ == "__main__":
    main()

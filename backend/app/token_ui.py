from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st
from kiteconnect import KiteConnect

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

    existing = get_zerodha_token()
    st.title("Portfolio Puffin — Zerodha token setup")
    st.caption("Generate, refresh, and save a local access token for the planned Kite sync.")

    with st.expander("Setup instructions", expanded=True):
        st.markdown(
            """
            1. In the Kite Developer Console, create a new app and choose the
               `Personal` app type. It provides account APIs; the separate live
               and historical market-data APIs are not included.
            2. Set the redirect URL to `http://127.0.0.1:8501` (or
               `http://localhost:8501` if you prefer that host) and keep the
               API key and API secret private.
            3. Open the generated login URL, complete Zerodha login + 2FA, and
               copy only the `request_token` value from the redirect URL.
            4. Paste the request token below to generate a fresh `access_token`.
            5. Save it locally. The token UI currently stores it in local SQLite;
               direct Kite holdings sync is still under development.

            > Kite access tokens normally expire daily. Refresh them and save the
            newest token here when the app says setup is required.
            """
        )

    if existing.get("access_token"):
        st.success("A token is already saved in SQLite. Update it below when you need a fresh one.")
        st.caption("A token is saved locally. It is hidden here for safety.")

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
            "Request token from the redirected URL",
            type="password",
            help="Use only the token value from the `request_token` query parameter.",
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
                    "Token saved to local SQLite. Direct Kite portfolio sync is not wired up yet."
                )
            except Exception as exc:  # pragma: no cover - UI error handling
                st.error(f"Token generation failed: {exc}")

    with st.sidebar:
        st.header("Local status")
        status = "Configured" if existing.get("access_token") else "Missing"
        st.metric("Token status", status)
        st.caption("The app checks for this token before rendering the dashboard.")


if __name__ == "__main__":
    main()

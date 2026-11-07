# Manual SIP schedules

Manual SIP schedules track recurring investments made through an outside broker
or app. They are stored separately from manual holdings and the read-only SIP
snapshot received from Zerodha. Nothing here submits or changes a broker SIP.

## Configure a schedule

On the dashboard, use **Manual SIP schedules** to enter the fund name, source,
installment amount, frequency, trigger weekday or day of month, start date, and
optional end date. Dates use `Asia/Kolkata`. Monthly days 29, 30, and 31 clamp
to the last calendar day in shorter months. Weekly trigger weekdays run Monday
through Sunday.

Schedules and their entries persist in SQLite. Use **Edit** to change schedule
details. Turn **Enabled** off to pause generation. Pausing does not delete the
schedule or its history; re-enabling resumes future generation.

## Generated installment entries

At API startup and when SIP data is loaded, the app checks each enabled manual
schedule and inserts one entry for its most recent trigger interval that is due
and within the schedule's date range. It does not backfill multiple missed
intervals. Monthly keys use the calendar month; weekly keys use the ISO week.
SQLite enforces one entry per schedule and interval, so repeated loads and
concurrent requests cannot duplicate an installment.

Every generated entry starts as **scheduled/unconfirmed**. This is a local
reminder, not evidence that money was invested. Use **Confirm paid** only after
verifying the transaction, or **Skip** if it did not happen. Confirmed and
skipped entries remain stored. These local records are not counted as executed
cash flows or sent to Zerodha.

The existing SIP table continues to show schedules reported by Zerodha Coin.
Manual schedules and entries have their own SQLite tables and API routes.

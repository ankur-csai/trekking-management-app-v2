# tasks.py — the three background jobs required by the spec.
# Each task needs Flask's app context to use the database (db.session etc),
# since Celery runs in a separate process that doesn't have Flask's request
# context automatically. We push an app context manually in each task.

import csv
import os
from datetime import date, datetime

from celery_app import celery


def _get_flask_app():
    # Imported lazily (inside functions) to avoid a circular import:
    # app.py imports tasks.py (for user_export), and tasks.py needs app.py's
    # `app`/`db`/models — importing at module load time would deadlock.
    from app import app, db, User, Trek, Booking
    return app, db, User, Trek, Booking


# -----------------------------------------------------------------------
# JOB A — Scheduled: Daily Reminders
# Sends a reminder for treks starting soon. Spec allows email/SMS/webhook;
# here we "send" by writing to a log file, which stands in for a real
# G-Chat webhook / SMTP call — swap send_webhook_message() for a real
# requests.post(webhook_url, json=...) call in production.
# -----------------------------------------------------------------------
@celery.task(name='tasks.send_daily_reminders')
def send_daily_reminders():
    app, db, User, Trek, Booking = _get_flask_app()
    with app.app_context():
        upcoming = Trek.query.filter(Trek.status == 'Open').all()
        sent = 0
        os.makedirs('reports', exist_ok=True)
        with open('reports/reminders_log.txt', 'a') as f:
            for trek in upcoming:
                bookings = [b for b in trek.bookings if b.status == 'Booked']
                for b in bookings:
                    line = (f"[{datetime.now()}] Reminder to {b.user.email}: "
                           f"Your trek '{trek.name}' starts on {trek.start_date}. "
                           f"Location: {trek.location}. Pack accordingly!\n")
                    f.write(line)
                    sent += 1
        return f'Sent {sent} reminders'


# -----------------------------------------------------------------------
# JOB B — Scheduled: Monthly Activity Report (HTML, "emailed" to admin)
# -----------------------------------------------------------------------
@celery.task(name='tasks.generate_monthly_report')
def generate_monthly_report():
    app, db, User, Trek, Booking = _get_flask_app()
    with app.app_context():
        total_treks = Trek.query.count()
        total_users = User.query.filter_by(role='trekker').count()
        popular = db.session.query(Trek.name, db.func.count(Booking.id).label('c')) \
            .join(Booking).group_by(Trek.id).order_by(db.desc('c')).limit(5).all()

        html = f"""
        <h2>Monthly Trekking Activity Report — {date.today().strftime('%B %Y')}</h2>
        <p>Total treks conducted: {total_treks}</p>
        <p>Total users participated: {total_users}</p>
        <h3>Popular Treks</h3>
        <ul>{''.join(f'<li>{n}: {c} bookings</li>' for n, c in popular)}</ul>
        """
        os.makedirs('reports', exist_ok=True)
        filename = f"reports/monthly_report_{date.today().strftime('%Y_%m')}.html"
        with open(filename, 'w') as f:
            f.write(html)

        # "Email to admin" — stand-in for smtplib.sendmail(). Swap in a real
        # SMTP call here; for the demo we log that it would have been sent.
        admin = User.query.filter_by(role='admin').first()
        with open('reports/email_log.txt', 'a') as f:
            f.write(f"[{datetime.now()}] Emailed monthly report to {admin.email}: {filename}\n")
        return filename


# -----------------------------------------------------------------------
# JOB C — User-triggered: Export Booking History as CSV
# This is the async job kicked off from user_export() in app.py. The
# frontend polls /api/user/export/status/<task_id> until this finishes.
# -----------------------------------------------------------------------
@celery.task(name='tasks.export_booking_history_csv')
def export_booking_history_csv(user_id):
    app, db, User, Trek, Booking = _get_flask_app()
    with app.app_context():
        user = User.query.get(user_id)
        bookings = Booking.query.filter_by(user_id=user_id).all()

        os.makedirs('exports', exist_ok=True)
        filename = f"booking_history_{user_id}_{int(datetime.now().timestamp())}.csv"
        filepath = os.path.join('exports', filename)

        with open(filepath, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['User ID', 'Trek Name', 'Location', 'Booking Status', 'Booking Date'])
            for b in bookings:
                writer.writerow([user_id, b.trek.name, b.trek.location, b.status, b.booking_date])

        return filename    # picked up by the status-check endpoint

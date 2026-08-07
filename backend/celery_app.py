# celery_app.py — sets up Celery, using Redis as both the broker (job queue)
# and the result backend (where task results/status are stored).
#
# Why Celery needs its own entry point separate from app.py: Celery workers
# run as a SEPARATE process from the Flask web server. `celery -A celery_app
# worker` starts that process; it imports this file to know how to connect
# to Redis and what tasks exist.

from celery import Celery
from celery.schedules import crontab

celery = Celery(
    'trekking_mad2',
    broker='redis://localhost:6379/0',     # where tasks are queued
    backend='redis://localhost:6379/0',    # where results/status are stored
)

# Scheduled jobs (Celery Beat) — the two "runs on its own" jobs from the spec.
celery.conf.beat_schedule = {
    'daily-trek-reminders': {
        'task': 'tasks.send_daily_reminders',
        'schedule': crontab(hour=8, minute=0),      # every day at 8:00 AM
    },
    'monthly-activity-report': {
        'task': 'tasks.generate_monthly_report',
        'schedule': crontab(day_of_month=1, hour=6, minute=0),  # 1st of month
    },
}
celery.conf.timezone = 'Asia/Kolkata'

# Needed so a Flask-side route can import `tasks` and call `.delay(...)`
# without the tasks module needing to re-create the Celery app.
celery.conf.task_routes = {}

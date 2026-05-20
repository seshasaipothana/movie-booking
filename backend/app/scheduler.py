from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.jobs.showtime_generator import generate_showtimes

scheduler = AsyncIOScheduler()

def start_scheduler():
    scheduler.add_job(
        generate_showtimes,
        CronTrigger(hour=0, minute=0),
    )
    scheduler.start()
    
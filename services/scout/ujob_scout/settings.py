import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

BOT_NAME = "ujob_scout"
SPIDER_MODULES = ["ujob_scout.spiders"]
USER_AGENT = "Mozilla/5.0 (compatible; UjobBot/1.0; +https://ujob.com.br/bot)"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"

ITEM_PIPELINES = {"ujob_scout.pipelines.PanelPipeline": 800}

ROBOTSTXT_OBEY = True
CONCURRENT_REQUESTS = 24
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_DELAY = 0.4
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_TARGET_CONCURRENCY = 4.0
DOWNLOAD_TIMEOUT = 25
DOWNLOAD_MAXSIZE = 16 * 1024 * 1024
DOWNLOAD_WARNSIZE = 8 * 1024 * 1024
RETRY_TIMES = 2
RETRY_HTTP_CODES = [500, 502, 503, 504, 522, 524, 408, 429]
DOWNLOAD_SLOTS = {
    "www.vagas.com.br": {"concurrency": 1, "delay": 7.0, "randomize_delay": True},
    "www.infojobs.com.br": {"concurrency": 1, "delay": 2.5, "randomize_delay": True},
    "www.bne.com.br": {"concurrency": 1, "delay": 2.5, "randomize_delay": True},
    "www.empregos.com.br": {"concurrency": 1, "delay": 2.5, "randomize_delay": True},
    "portal.gupy.io": {"concurrency": 2, "delay": 0.8, "randomize_delay": True},
    "api.github.com": {"concurrency": 1, "delay": 1.0},
}
COOKIES_ENABLED = False
TELNETCONSOLE_ENABLED = False
HTTPERROR_ALLOW_ALL = False

LOG_LEVEL = os.getenv("SCOUT_LOG_LEVEL", "INFO")
FEED_EXPORT_ENCODING = "utf-8"

PANEL_URL = os.getenv("PANEL_URL", "http://127.0.0.1:8090")
SCOUT_EMAIL = os.getenv("SCOUT_EMAIL")
SCOUT_PASSWORD = os.getenv("SCOUT_PASSWORD")
SCOUT_DETAIL_BUDGET = int(os.getenv("SCOUT_DETAIL_BUDGET", "400"))
SCOUT_BATCH_SIZE = 150

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID", "")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY", "")
JOOBLE_KEY = os.getenv("JOOBLE_KEY", "")
DEFAULT_DROPITEM_LOG_LEVEL = "DEBUG"

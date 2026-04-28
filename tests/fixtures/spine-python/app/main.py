from .config import settings
from .routes import router
from .services.user_service import get_user_service


def run():
    return settings, router(), get_user_service()


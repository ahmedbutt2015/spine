from .services.user_service import get_user_service


def router():
    return get_user_service()


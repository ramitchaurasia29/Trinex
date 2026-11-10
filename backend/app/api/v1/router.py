from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.brokers import router as brokers_router
from app.api.v1.positions import router as positions_router
from app.api.v1.users import router as users_router
from app.api.v1.tools import router as tools_router
from app.api.v1.instruments import router as instruments_router
from app.api.v1.activity import router as activity_router

router = APIRouter(prefix="/v1")
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(brokers_router)
router.include_router(positions_router)
router.include_router(tools_router)
router.include_router(instruments_router)
router.include_router(activity_router)

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.redis import (  # noqa: E402
    RedisConfigurationError,
    RedisOperationError,
    close_redis_client,
    get_redis_client,
)


async def main() -> int:
    key = f"trinex:healthcheck:{uuid4().hex}"
    try:
        redis = get_redis_client()
        ping = await redis.ping()
        if str(ping).upper() != "PONG":
            print("PING: FAILED")
            return 1
        print("PING: OK")

        await redis.set(key, "probe", ex=30)
        print("SET: OK")

        value = await redis.get(key)
        print("GET: OK" if value == "probe" else "GET: FAILED")

        ttl = int(await redis.ttl(key))
        print(f"TTL: OK ({ttl} seconds)" if 0 < ttl <= 30 else "TTL: FAILED")
        return 0 if value == "probe" and 0 < ttl <= 30 else 1
    except RedisConfigurationError:
        print("Redis is not configured. Set the backend-only Upstash variables in backend/.env.")
        return 2
    except RedisOperationError:
        print("Redis connectivity check failed.")
        return 1
    except Exception as exc:
        print(f"Redis connectivity check failed ({type(exc).__name__}).")
        return 1
    finally:
        try:
            client = get_redis_client()
            await client.delete(key)
        except Exception:
            pass
        await close_redis_client()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

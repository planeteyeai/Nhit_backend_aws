"""Local dev: python run.py  (from backend/fastapi; loads ../.env)"""

import uvicorn

from app.config import get_settings
from app.env_validate import is_production

if __name__ == "__main__":
    s = get_settings()
    prod = is_production(s)
    kwargs = dict(
        host=s.host,
        port=s.port,
        reload=not prod,
        proxy_headers=prod,
    )
    if prod:
        kwargs["forwarded_allow_ips"] = "*"
    uvicorn.run("app.main:app", **kwargs)

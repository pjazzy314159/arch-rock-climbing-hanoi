"""Cloudflare Python Workers ASGI entry point for the ARCH FastAPI app.

This module follows the official Cloudflare Python Workers documentation
for serving FastAPI applications. It imports the existing FastAPI ``app``
from ``app.main`` and exposes it through the Workers ASGI adapter.

The Workers runtime provides bindings (including Hyperdrive) through the
ASGI scope under the ``env`` key. The ``adapter`` callable receives the
scope and can access ``scope["env"]`` to retrieve runtime bindings.

See: https://developers.cloudflare.com/workers/languages/python/packages/fastapi/
"""

from __future__ import annotations

from app.main import app

# The official ``workers.asgi`` entrypoint creates the ASGI adapter.
# In the Cloudflare runtime ``workers.asgi`` is available; locally it is
# not installed. We import it conditionally so the entry file loads in
# both environments without raising at import time.
try:
    from workers.asgi import entrypoint as _asgi_entrypoint
except ImportError:
    # Not available in ordinary CPython environments (local development,
    # tests, non-Cloudflare builds). The adapter is only required at
    # request time inside the Workers runtime.
    def _asgi_entrypoint(app):
        # Minimal no-op adapter for local development; the real adapter
        # is produced by the installed ``workers.asgi`` package during
        # deployment and runtime.
        return app

# Create the adapter at module import time. This matches the standard
# ``workers.asgi.entrypoint(app)`` pattern.
adapter = _asgi_entrypoint(app)
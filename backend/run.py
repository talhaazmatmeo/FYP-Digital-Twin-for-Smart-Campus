import os
import sys
import atexit
import signal

from app import create_app, socketio
from app.simulation.data_generator import start_simulation, stop_simulation

app = create_app()


def _is_streamlit_run() -> bool:
    return (
        "streamlit" in sys.modules
        or "STREAMLIT_SERVER_PORT" in os.environ
        or "STREAMLIT_SERVER_HEADLESS" in os.environ
    )


def _install_shutdown_handlers() -> None:
    def _shutdown(*_args):
        stop_simulation(timeout_seconds=5.0)

    atexit.register(_shutdown)

    try:
        signal.signal(signal.SIGINT, lambda *_args: (_shutdown(), sys.exit(0)))
        signal.signal(signal.SIGTERM, lambda *_args: (_shutdown(), sys.exit(0)))
    except Exception:
        # Some environments may restrict signal handling.
        pass

if __name__ == "__main__":
    if _is_streamlit_run():
        print(
            "This module starts the backend server. "
            "Run: python backend/run.py",
            file=sys.stderr,
        )
    else:
        _install_shutdown_handlers()
        start_simulation()
        socketio.run(
            app,
            debug=True,
            use_reloader=False,
            port=5000,
            allow_unsafe_werkzeug=True,
        )
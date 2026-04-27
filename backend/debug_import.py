import sys
import traceback

print("=== Starting import diagnostic ===", flush=True)
print(f"Python: {sys.executable}", flush=True)
print(f"CWD: {__import__('os').getcwd()}", flush=True)

# Test each module individually so we know exactly which one fails
modules = [
    "app.db",
    "app.gmc_client",
    "app.gmc_oauth",
    "app.models",
    "app.oauth",
    "app.user_auth",
    "app.client_factory",
    "app.admin",
    "app.admin_oauth",
    "app.main",
]

for mod in modules:
    try:
        __import__(mod)
        print(f"OK   {mod}", flush=True)
    except BaseException as e:
        print(f"FAIL {mod}: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        sys.exit(1)

print("=== ALL IMPORTS OK ===", flush=True)
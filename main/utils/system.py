import subprocess
import psutil
import sys
import time
import platform


def launch_process(cmd):
    """Launch a process with the given command."""
    return subprocess.Popen(cmd, shell=True)


def kill_process(name):
    """Kill all processes with the given name."""
    killed = False
    for p in psutil.process_iter(['name']):
        if p.info['name'] == name:
            try:
                p.terminate()
                killed = True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    return killed


def is_process_running(name: str) -> bool:
    """Check if a process with the given name is currently running."""
    for p in psutil.process_iter(['name']):
        if p.info['name'] == name:
            return True
    return False


def get_battery_percent() -> float | None:
    """Return the current battery percentage or None if unavailable."""
    try:
        batt = psutil.sensors_battery()
        if batt is not None:
            return batt.percent
    except Exception:
        pass
    return None


def get_cpu_percent(interval: float = 0.0) -> float:
    """Return the system-wide CPU usage percentage."""
    try:
        return psutil.cpu_percent(interval=interval)
    except Exception:
        return 0.0


_last_net = None
_last_net_time = None


def get_network_bytes_per_sec() -> float:
    """Return the total network throughput in bytes per second since last call."""
    global _last_net, _last_net_time
    try:
        now = time.time()
        net = psutil.net_io_counters()
        if _last_net is None:
            _last_net = net
            _last_net_time = now
            return 0.0
        elapsed = now - _last_net_time
        sent = net.bytes_sent - _last_net.bytes_sent
        recv = net.bytes_recv - _last_net.bytes_recv
        _last_net = net
        _last_net_time = now
        if elapsed <= 0:
            return 0.0
        return (sent + recv) / elapsed
    except Exception:
        return 0.0


def send_notification(message: str) -> None:
    """Display a simple notification to the user (fallback to stdout)."""
    try:
        system = platform.system()
        if system == "Linux":
            subprocess.run(["notify-send", "AppFlow", message], check=False)
        elif system == "Darwin":  # macOS
            subprocess.run([
                "osascript", "-e", 
                f'display notification "{message}" with title "AppFlow"'
            ], check=False)
        elif system == "Windows":
            # Windows toast requires win10toast package; fallback to console
            try:
                from win10toast import ToastNotifier
                ToastNotifier().show_toast("AppFlow", message, duration=5)
            except ImportError:
                print(f"[NOTIFY] {message}")
        else:
            print(f"[NOTIFY] {message}")
    except Exception:
        print(f"[NOTIFY] {message}")


def get_system_info() -> dict:
    """Return system information for debugging."""
    return {
        "platform": platform.system(),
        "platform_release": platform.release(),
        "platform_version": platform.version(),
        "architecture": platform.machine(),
        "processor": platform.processor(),
        "ram": f"{psutil.virtual_memory().total / (1024**3):.1f} GB",
        "python_version": sys.version,
    }


def get_running_processes() -> list[dict]:
    """Return a list of currently running processes."""
    processes = []
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
        try:
            processes.append(p.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return processes

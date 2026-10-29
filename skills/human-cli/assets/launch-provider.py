"""Local human_cli SPI launcher example; Python 3 standard library only.

Targets are configured at startup. Launch success is a handoff to the user,
not evidence that the external program or requested manual task succeeded.
"""

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def load_task(filename):
    source = Path(filename).resolve()
    task = json.loads(source.read_text(encoding="utf-8-sig"))
    if not re.fullmatch(r"[a-z][a-z0-9.-]{0,127}", task.get("pluginId", "")):
        raise ValueError("pluginId must be a valid human_cli plugin ID")
    if not isinstance(task.get("name"), str) or not 1 <= len(task["name"]) <= 60:
        raise ValueError("name must contain 1 to 60 characters")
    program = task.get("program")
    if not isinstance(program, str) or not program:
        raise ValueError("program is required")
    if not isinstance(task.get("args", []), list) or not all(
        isinstance(arg, str) for arg in task.get("args", [])
    ):
        raise ValueError("args must be an array of strings")
    if not isinstance(task.get("showConsole", True), bool):
        raise ValueError("showConsole must be a boolean")
    if not isinstance(task.get("cwd", "."), str):
        raise ValueError("cwd must be a string")
    cwd = (source.parent / task.get("cwd", ".")).resolve()
    if not cwd.is_dir():
        raise ValueError("cwd must be an existing directory")
    path = Path(program)
    if path.is_absolute() or "/" in program or "\\" in program:
        executable = (source.parent / path).resolve()
    else:
        found = shutil.which(program)
        if not found:
            raise ValueError("program was not found on the provider PATH")
        executable = Path(found).resolve()
    if not executable.is_file():
        raise ValueError("program must be an existing executable file")
    return {**task, "program": str(executable), "cwd": str(cwd)}


class Launcher:
    def __init__(self, task):
        self.task = task
        self.jobs = {}
        self.lock = threading.Lock()

    def describe(self):
        return {"spiVersion": 1, "plugins": [{
            "apiVersion": 1, "id": self.task["pluginId"], "version": "1.0.0",
            "name": self.task["name"], "description": "用户点击后启动预先配置的操作程序。",
            "icon": "terminal", "side": "right",
            "configSchema": {"type": "object", "properties": {}, "additionalProperties": False},
            "configUi": {"type": "none"},
        }]}

    def launch(self, job):
        with self.lock:
            if job["state"] != "running":
                return
            try:
                options = {"cwd": self.task["cwd"], "shell": False}
                if os.name == "nt" and self.task.get("showConsole", True):
                    options["creationflags"] = subprocess.CREATE_NEW_CONSOLE
                else:
                    options.update(stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL)
                    if os.name == "nt":
                        options["creationflags"] = subprocess.CREATE_NO_WINDOW
                    else:
                        options["start_new_session"] = True
                process = subprocess.Popen(
                    [self.task["program"], *self.task.get("args", [])], **options
                )
                # Reap eventual exit without keeping the provider alive or waiting
                # for manual operation before replying to the launch button.
                threading.Thread(target=process.wait, daemon=True).start()
                job.update(state="completed", output={
                    "text": "{}已启动（PID {}）。这不表示操作已完成；请在程序中操作后回便签回复。".format(
                        self.task["name"], process.pid), "attachments": []
                })
            except Exception as error:
                job.update(state="failed", error={"code": "E_LAUNCH", "message": str(error)})

    def call(self, method, params):
        if not isinstance(params, dict):
            raise ValueError("params must be an object")
        if method == "spi.describe":
            return self.describe()
        if method not in {"spi.start", "spi.status", "spi.cancel", "spi.forget"}:
            raise ValueError("unsupported SPI method")
        run_id = params.get("runId")
        if not isinstance(run_id, str) or not re.fullmatch(r"[a-fA-F0-9-]{36}", run_id):
            raise ValueError("runId must be a UUID")
        with self.lock:
            if method == "spi.start":
                if params.get("pluginId") != self.task["pluginId"]:
                    raise ValueError("unknown pluginId")
                if params.get("config", {}) != {}:
                    raise ValueError("this launcher accepts an empty config only")
                if run_id not in self.jobs:
                    if len(self.jobs) >= 4096:
                        raise ValueError("launch receipt capacity reached; review tasks before restarting")
                    job = {"state": "running"}
                    self.jobs[run_id] = job
                    threading.Thread(target=self.launch, args=(job,), daemon=True).start()
                return {"runId": run_id, "state": self.jobs[run_id]["state"]}
            job = self.jobs.get(run_id)
            if job is None:
                raise ValueError("unknown runId")
            if method == "spi.cancel" and job["state"] == "running":
                job["state"] = "cancelled"
            if method == "spi.forget":
                if job["state"] == "running":
                    raise ValueError("running jobs cannot be forgotten")
                # Keep this small launch receipt to reject repeated side effects
                # after forget. Receipts last only until this provider exits.
                return {"forgotten": True}
            return {"runId": run_id, **job}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True, help="path to the fixed target JSON")
    parser.add_argument("--port", type=int, default=7790)
    args = parser.parse_args()
    launcher = Launcher(load_task(args.task))
    token = os.environ.get("HUMAN_CLI_SPI_TOKEN") or secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/rpc":
                self.send_error(404)
                return
            auth = self.headers.get("Authorization", "")
            if self.headers.get("Origin") is not None or not secrets.compare_digest(
                auth.encode("utf-8"), ("Bearer " + token).encode("utf-8")
            ):
                self.send_error(401)
                return
            request_id = None
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 1048576:
                    raise ValueError("body must contain 1 byte to 1 MiB")
                message = json.loads(self.rfile.read(length))
                request_id = message.get("id")
                if message.get("jsonrpc") != "2.0" or not isinstance(request_id, (str, int)):
                    raise ValueError("invalid JSON-RPC request")
                result = launcher.call(message["method"], message.get("params", {}))
                response = {"jsonrpc": "2.0", "id": request_id, "result": result}
            except Exception as error:
                response = {"jsonrpc": "2.0", "id": request_id, "error": {
                    "code": -32000, "message": str(error), "data": {"code": "E_LAUNCH_SPI"}
                }}
            data = json.dumps(response, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(json.dumps({"url": "http://127.0.0.1:{}/rpc".format(server.server_port),
                      "token": token}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

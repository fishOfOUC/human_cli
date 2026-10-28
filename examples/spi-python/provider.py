"""human_cli SPI v1 reference provider. Standard library only; no human_cli/Node import."""
import argparse
import base64
import json
import os
import platform
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CATALOG = [{
    "apiVersion": 1, "id": "example.python-note", "version": "1.0.0",
    "name": "Python 现场记录", "description": "独立 Python 服务生成文字与附件，不加载到 human_cli 进程。",
    "icon": "file-text", "side": "right",
    "configSchema": {"type": "object", "additionalProperties": False, "properties": {
        "prefix": {"type": "string", "title": "记录标题", "default": "现场记录", "maxLength": 100},
        "delaySeconds": {"type": "number", "title": "处理等待秒数", "default": 0, "minimum": 0, "maximum": 86400},
        "includeImage": {"type": "boolean", "title": "包含测试图片", "default": False}
    }}
}]
PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="


class Provider:
    def __init__(self):
        self.jobs = {}
        self.lock = threading.Lock()

    def run(self, job, params):
        try:
            config = params.get("config", {})
            delay = config.get("delaySeconds", 0)
            if not isinstance(delay, (int, float)) or not 0 <= delay <= 86400:
                raise ValueError("delaySeconds must be between 0 and 86400")
            if job["stop"].wait(delay):
                job["state"] = "cancelled"
                return
            text = "{}\n请求：{}\n服务语言：Python\n服务系统：{}\n".format(
                config.get("prefix", "现场记录"), params.get("request", {}).get("title", ""), platform.system())
            attachments = [{"name": "现场记录.txt", "mime": "text/plain", "data": base64.b64encode(text.encode("utf-8")).decode("ascii")}]
            if config.get("includeImage"):
                attachments.append({"name": "SPI测试.png", "mime": "image/png", "data": PIXEL})
            with self.lock:
                if job["state"] == "running":
                    job["output"] = {"text": text, "attachments": attachments}
                    job["state"] = "completed"
        except Exception as error:
            with self.lock:
                job["error"] = {"code": "E_PYTHON_PROVIDER", "message": str(error)}
                job["state"] = "failed"

    def call(self, method, params):
        if method == "spi.describe":
            return {"spiVersion": 1, "plugins": CATALOG}
        run_id = params.get("runId")
        if not isinstance(run_id, str) or not run_id:
            raise ValueError("runId required")
        with self.lock:
            if method == "spi.start":
                if params.get("pluginId") != "example.python-note":
                    raise ValueError("unknown pluginId")
                if run_id not in self.jobs:
                    if len(self.jobs) >= 512:
                        raise ValueError("job capacity reached")
                    self.jobs[run_id] = {"state": "running", "stop": threading.Event()}
                    threading.Thread(target=self.run, args=(self.jobs[run_id], params), daemon=True).start()
                return {"runId": run_id, "state": self.jobs[run_id]["state"]}
            job = self.jobs.get(run_id)
            if not job:
                raise ValueError("job not found")
            if method == "spi.cancel":
                if job["state"] == "running":
                    job["state"] = "cancelled"
                    job["stop"].set()
            elif method == "spi.forget":
                if job["state"] == "running":
                    raise ValueError("cancel before forget")
                del self.jobs[run_id]
                return {"forgotten": True}
            elif method != "spi.status":
                raise ValueError("unknown method")
            return {"runId": run_id, **{key: value for key, value in job.items() if key != "stop"}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=7788)
    parser.add_argument("--token", default=os.environ.get("HUMAN_CLI_SPI_TOKEN") or secrets.token_urlsafe(32))
    args = parser.parse_args()
    provider = Provider()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            request_id = None
            try:
                if self.headers.get("Origin") or self.headers.get("Authorization") != "Bearer " + args.token:
                    self.send_response(401)
                    self.end_headers()
                    return
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 1048576:
                    raise ValueError("body size invalid")
                message = json.loads(self.rfile.read(length))
                request_id = message.get("id")
                if message.get("jsonrpc") != "2.0" or request_id is None:
                    raise ValueError("invalid JSON-RPC request")
                result = provider.call(message["method"], message.get("params", {}))
                response = {"jsonrpc": "2.0", "id": request_id, "result": result}
            except Exception as error:
                response = {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": str(error), "data": {"code": "E_PYTHON_SPI"}}}
            data = json.dumps(response, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(json.dumps({"url": "http://127.0.0.1:{}/rpc".format(server.server_port), "token": args.token}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

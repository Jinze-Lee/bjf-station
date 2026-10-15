# -*- coding: utf-8 -*-
"""验收用的本地静态服务（多线程版）：python 工具/本地预览服务.py 8765
多线程是为了让浏览器那几十个并行瓦片请求不至于把单线程 http.server 堵死。"""
import functools
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = r"E:\网页制作"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print("serving %s at http://127.0.0.1:%d/ (threaded)" % (ROOT, PORT), flush=True)
        httpd.serve_forever()

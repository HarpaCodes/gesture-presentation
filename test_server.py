"""
Run this FIRST to test if Python can serve anything at all.
Just run: python test_server.py
Then open: http://localhost:8080
"""
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        self.wfile.write(b"<h1 style='color:green'>SUCCESS! Python server is working.</h1><p>Now run app.py instead.</p>")
    def log_message(self, *args): pass

print("Test server running at http://localhost:8080")
print("Press Ctrl+C to stop")
HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()

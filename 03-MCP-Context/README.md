## MCP Server: Jina Reader Markdown Fetcher

This project exposes an MCP server (via `fastmcp`) with a tool that downloads any web page as Markdown through Jina Reader (`https://r.jina.ai/...`).

### Tools
- `fetch_page_markdown(url: str) -> str`: Validates `http(s)` URLs, prefixes with `https://r.jina.ai/`, fetches via `requests`, and returns the Markdown text.
- `search_docs(query: str, k: int = 5) -> list[dict]`: Indexes markdown/mdx files inside local `*.zip` archives (first path component stripped) and returns the top `k` matches using `minsearch`.

### Setup
```bash
cd 03-MCP-Context
uv sync
```

### Run the MCP server
```bash
uv run python main.py
```
The server name is currently `Demo 🚀` as defined in `main.py`.

### Quick local test (without MCP client)
```bash
cd 03-MCP-Context
uv run python test.py https://github.com/alexeygrigorev/minsearch --limit 1200
```
Adjust the URL or `--limit` as needed; omit `--limit` to use the default 800 characters.

### Try the MCP tools from a terminal (stdio client)
In a separate terminal, you can invoke the MCP tools via `fastmcp`’s client over stdio (no running server needed in that terminal—the transport starts `main.py` for you):
```bash
cd /workspaces/AIDev_Zoomcamp/03-MCP-Context
UV_CACHE_DIR=/workspaces/AIDev_Zoomcamp/.uv_cache uv run python - <<'PY'
import asyncio
from fastmcp import Client
from fastmcp.client.transports import PythonStdioTransport

async def main():
    transport = PythonStdioTransport("main.py", cwd="/workspaces/AIDev_Zoomcamp/03-MCP-Context")
    async with Client(transport) as client:
        resp = await client.call_tool_mcp("search_docs", {"query": "demo", "k": 5})
        docs = resp.structuredContent.get("result", [])
        for i, doc in enumerate(docs, 1):
            print(f"{i}. {doc['filename']}")

asyncio.run(main())
PY
```
Change the `query` or `k` values as needed. Omit the `UV_CACHE_DIR=...` prefix if you don’t care where uv caches packages.

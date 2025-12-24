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

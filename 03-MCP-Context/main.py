import os
from pathlib import Path
from zipfile import ZipFile

from fastmcp import FastMCP
from minsearch import Index
import requests

mcp = FastMCP("Demo 🚀")
WORKDIR = Path(__file__).resolve().parent
_index_cache: Index | None = None

# Keep joblib temp files in project space to avoid permission issues.
os.environ.setdefault("JOBLIB_TEMP_FOLDER", str(WORKDIR / ".joblib_tmp"))

@mcp.tool
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b


def fetch_page_markdown(url: str) -> str:
    """
    Fetch a web page's content as Markdown via Jina Reader.

    Prefixes the provided URL with https://r.jina.ai/ and returns the markdown text.
    """
    cleaned_url = url.strip()
    if not cleaned_url.startswith(("http://", "https://")):
        raise ValueError("URL must start with http:// or https://")

    jina_url = f"https://r.jina.ai/{cleaned_url}"
    response = requests.get(jina_url, timeout=15)
    response.raise_for_status()
    return response.text


# Register fetch_page_markdown as an MCP tool while keeping the plain callable for local use.
mcp.tool(fetch_page_markdown)


def _iter_markdown_from_zips(zip_paths: list[Path]) -> list[dict]:
    """Load markdown/mdx files from zip archives, stripping the first path component."""
    docs: list[dict] = []
    for zip_path in zip_paths:
        with ZipFile(zip_path) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename
                lower = name.lower()
                if not (lower.endswith(".md") or lower.endswith(".mdx")):
                    continue
                parts = name.split("/")
                cleaned = "/".join(parts[1:]) if len(parts) > 1 else parts[0]
                with zf.open(info) as f:
                    content = f.read().decode("utf-8", errors="ignore")
                docs.append({"filename": cleaned, "content": content})
    return docs


def _load_index() -> Index:
    """Build (or reuse) the minsearch index from available zip files."""
    global _index_cache
    if _index_cache is not None:
        return _index_cache

    zip_paths = sorted(WORKDIR.glob("*.zip"))
    if not zip_paths:
        raise RuntimeError(f"No zip files found in {WORKDIR}")

    docs = _iter_markdown_from_zips(zip_paths)
    if not docs:
        raise RuntimeError("No markdown documents found in zip files.")

    index = Index(text_fields=["content", "filename"], keyword_fields=["filename"])
    index.fit(docs)
    _index_cache = index
    return index


def search_docs(query: str, k: int = 5) -> list[dict]:
    """Search indexed markdown docs inside local zip archives, returning the top k hits."""
    index = _load_index()
    return index.search(query, num_results=k)


# Register search_docs as an MCP tool while keeping the plain callable.
mcp.tool(search_docs)

if __name__ == "__main__":
    mcp.run()
    

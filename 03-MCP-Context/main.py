from fastmcp import FastMCP
import requests

mcp = FastMCP("Demo 🚀")

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

if __name__ == "__main__":
    mcp.run()
    

import argparse

from main import fetch_page_markdown


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch page content as markdown via Jina reader.")
    parser.add_argument("url", nargs="?", default="https://datatalks.club", help="Target URL (default: %(default)s)")
    parser.add_argument("--limit", type=int, default=800, help="Number of characters to print (default: %(default)s)")
    args = parser.parse_args()

    content = fetch_page_markdown(args.url)
    print(f"Fetched content for {args.url} (showing first {args.limit} chars):\n")
    print(content[: args.limit])


if __name__ == "__main__":
    main()

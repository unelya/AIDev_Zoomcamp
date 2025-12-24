from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Iterable, List, Dict, Any
from zipfile import ZipFile

from minsearch import Index


WORKDIR = Path(__file__).resolve().parent
JOBLIB_TMP = WORKDIR / ".joblib_tmp"
JOBLIB_TMP.mkdir(exist_ok=True)
os.environ.setdefault("JOBLIB_TEMP_FOLDER", str(JOBLIB_TMP))


def iter_markdown_from_zips(zip_paths: Iterable[Path]) -> Iterable[Dict[str, Any]]:
    """Yield documents from zip files, keeping only .md/.mdx entries."""
    for zip_path in zip_paths:
        with ZipFile(zip_path) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue

                lower_name = info.filename.lower()
                if not (lower_name.endswith(".md") or lower_name.endswith(".mdx")):
                    continue

                # Remove the first path component (e.g., "fastmcp-main/").
                parts = info.filename.split("/")
                cleaned_name = "/".join(parts[1:]) if len(parts) > 1 else parts[0]

                with zf.open(info) as f:
                    content = f.read().decode("utf-8", errors="ignore")

                yield {"filename": cleaned_name, "content": content}


def build_index(zip_paths: List[Path]) -> Index:
    docs = list(iter_markdown_from_zips(zip_paths))
    if not docs:
        raise RuntimeError("No markdown documents found in provided zip files.")

    index = Index(text_fields=["content", "filename"], keyword_fields=["filename"])
    index.fit(docs)
    return index


def search(index: Index, query: str, k: int = 5) -> List[Dict[str, Any]]:
    return index.search(query, num_results=k)


def main() -> None:
    parser = argparse.ArgumentParser(description="Search markdown docs inside zip archives using minsearch.")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--k", type=int, default=5, help="Number of results to return (default: 5)")
    parser.add_argument(
        "--zip-dir",
        type=Path,
        default=WORKDIR,
        help="Directory containing zip files to index (default: script directory)",
    )
    args = parser.parse_args()

    zip_paths = sorted(args.zip_dir.glob("*.zip"))
    if not zip_paths:
        raise SystemExit(f"No zip files found in {args.zip_dir}")

    index = build_index(zip_paths)
    results = search(index, args.query, k=args.k)

    if not results:
        print("No results found.")
        return

    for i, doc in enumerate(results, start=1):
        score = doc.get("_score", 0)
        preview = doc["content"].replace("\n", " ")[:200]
        print(f"{i}. {doc['filename']}  (score: {score:.4f})")
        print(f"   {preview}")


if __name__ == "__main__":
    main()

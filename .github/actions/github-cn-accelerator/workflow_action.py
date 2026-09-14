#!/usr/bin/env python3
"""GitHub Actions adapter for the local release accelerator."""

from __future__ import annotations

import fnmatch
import json
import os
import queue
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from github_accelerator import (
    AcceleratorError,
    candidate_urls,
    digest_from_release,
    download_file,
    normalize_mirrors,
    parse_repository,
    read_limited,
    request_headers,
)


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise AcceleratorError(f"missing required action input: {name}")
    return value


def write_output(name: str, value: Any) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    rendered = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    with open(output_path, "a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"{name}={rendered}\n")


def fetch_json(
    official_url: str,
    mirrors: tuple[str, ...],
    timeout: float,
    *,
    allow_official_not_found: bool = False,
) -> tuple[dict[str, Any] | None, str]:
    results: queue.Queue[tuple[str, str, Any]] = queue.Queue()
    candidates = candidate_urls(official_url, mirrors)

    for candidate in candidates:
        def worker(item: dict[str, str] = candidate) -> None:
            try:
                request = urllib.request.Request(
                    item["url"],
                    headers=request_headers(item["url"], accept="application/vnd.github+json"),
                )
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    payload = json.loads(read_limited(response, 8 * 1024 * 1024).decode("utf-8"))
                if not isinstance(payload, dict):
                    raise AcceleratorError("metadata response is not a JSON object")
                results.put(("ok", item["source"], payload))
            except urllib.error.HTTPError as exc:
                status = "not-found" if exc.code == 404 else "error"
                results.put((status, item["source"], f"HTTP {exc.code}"))
            except Exception as exc:
                results.put(("error", item["source"], f"{type(exc).__name__}: {exc}"))

        threading.Thread(target=worker, daemon=True).start()

    errors: list[str] = []
    deadline = time.monotonic() + timeout + 1
    remaining = len(candidates)
    while remaining:
        wait_for = deadline - time.monotonic()
        if wait_for <= 0:
            break
        try:
            status, source, value = results.get(timeout=wait_for)
        except queue.Empty:
            break
        remaining -= 1
        if status == "ok":
            if source != "github-direct":
                print(f"::notice::GitHub metadata check used fallback route {source}")
            return value, source
        if status == "not-found" and source == "github-direct" and allow_official_not_found:
            return None, source
        errors.append(f"{source}: {value}")
    if remaining:
        errors.append(f"{remaining} route(s) exceeded {timeout:.1f}s")
    raise AcceleratorError("; ".join(errors) or "all GitHub metadata routes failed")


def validate_asset_url(repository: str, url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    expected_prefix = f"/{repository}/releases/download/"
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        raise AcceleratorError(f"release asset must use https://github.com: {url}")
    if not urllib.parse.unquote(parsed.path).startswith(expected_prefix):
        raise AcceleratorError(f"release asset does not belong to {repository}: {url}")


def check_tag(repository: str, mirrors: tuple[str, ...], timeout: float) -> None:
    tag = required_env("ACCELERATOR_TAG")
    encoded_tag = urllib.parse.quote(tag, safe="")
    url = f"https://api.github.com/repos/{repository}/git/refs/tags/{encoded_tag}"
    payload, source = fetch_json(url, mirrors, timeout, allow_official_not_found=True)
    if payload is None:
        write_output("exists", "false")
        write_output("tag", tag)
        write_output("source", source)
        print(f"Tag {tag} is available for a new release.")
        return
    target = str((payload.get("object") or {}).get("sha") or "")
    if not target:
        raise AcceleratorError(f"tag {tag} response is missing object.sha")
    expected = os.environ.get("ACCELERATOR_EXPECTED_SHA", "").strip()
    if expected and target != expected:
        raise AcceleratorError(f"tag {tag} already points to {target}; current commit is {expected}")
    write_output("exists", "true")
    write_output("tag", tag)
    write_output("target", target)
    write_output("source", source)
    print(f"Tag {tag} already points to the current commit {target}.")


def latest_release(repository: str, mirrors: tuple[str, ...], timeout: float) -> None:
    url = f"https://api.github.com/repos/{repository}/releases/latest"
    payload, source = fetch_json(url, mirrors, timeout)
    if payload is None or not payload.get("tag_name"):
        raise AcceleratorError("latest release response is missing tag_name")
    release_path = Path(required_env("ACCELERATOR_RELEASE_JSON")).expanduser().resolve()
    release_path.parent.mkdir(parents=True, exist_ok=True)
    release_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tag = str(payload["tag_name"])
    write_output("exists", "true")
    write_output("tag", tag)
    write_output("version", tag[1:] if tag.lower().startswith("v") else tag)
    write_output("source", source)
    print(f"Resolved latest release {tag} through {source}.")


def download_assets(repository: str, mirrors: tuple[str, ...], timeout: float) -> None:
    release_path = Path(required_env("ACCELERATOR_RELEASE_JSON")).expanduser().resolve()
    payload = json.loads(release_path.read_text(encoding="utf-8"))
    pattern = os.environ.get("ACCELERATOR_ASSET_PATTERN", "*").strip() or "*"
    destination = Path(required_env("ACCELERATOR_OUTPUT_DIRECTORY")).expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    assets = [
        asset for asset in payload.get("assets") or []
        if isinstance(asset, dict) and fnmatch.fnmatchcase(str(asset.get("name") or ""), pattern)
    ]
    downloaded: list[str] = []
    for asset in assets:
        name = str(asset.get("name") or "")
        url = str(asset.get("browser_download_url") or "")
        validate_asset_url(repository, url)
        digest = digest_from_release(asset.get("digest"))
        if not digest:
            raise AcceleratorError(f"official GitHub SHA-256 digest is missing for {name}")
        result = download_file(
            url=url,
            output=destination / name,
            mirrors=mirrors,
            timeout=timeout,
            retries=2,
            direct_first=False,
            expected_sha256=digest,
            force=False,
            quiet=True,
        )
        downloaded.append(result["output"])
        print(f"Downloaded and verified {name} through {result['source']} ({result['bytes']} bytes).")
    write_output("downloaded-files", downloaded)
    print(f"Matched {len(assets)} asset(s) with pattern {pattern}.")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    operation = required_env("ACCELERATOR_OPERATION")
    repository = parse_repository(required_env("ACCELERATOR_REPOSITORY"))
    timeout = float(os.environ.get("ACCELERATOR_TIMEOUT", "15"))
    if timeout <= 0 or timeout > 300:
        raise AcceleratorError("timeout must be greater than 0 and at most 300 seconds")
    mirrors = normalize_mirrors([
        line.strip() for line in os.environ.get("ACCELERATOR_MIRRORS", "").splitlines() if line.strip()
    ] or None)
    if operation == "check-tag":
        check_tag(repository, mirrors, timeout)
    elif operation == "latest-release":
        latest_release(repository, mirrors, timeout)
    elif operation == "download-assets":
        download_assets(repository, mirrors, timeout)
    else:
        raise AcceleratorError(f"unsupported operation: {operation}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"::error::{exc}", file=sys.stderr)
        raise SystemExit(1)

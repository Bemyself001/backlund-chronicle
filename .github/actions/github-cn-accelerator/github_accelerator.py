#!/usr/bin/env python3
"""Race public GitHub routes, resume downloads, and verify SHA-256."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import queue
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable


VERSION = "0.1.0"
USER_AGENT = f"github-cn-accelerator/{VERSION}"
DEFAULT_MIRRORS = (
    "https://github.xxlab.tech/",
    "https://ghfast.top/",
)
SHA256_RE = re.compile(r"(?i)(?<![0-9a-f])([0-9a-f]{64})(?![0-9a-f])")
REPOSITORY_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
GITHUB_PUBLIC_HOSTS = {
    "github.com",
    "api.github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
}


class AcceleratorError(RuntimeError):
    pass


def require_https(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise AcceleratorError(f"only absolute HTTPS URLs are supported: {url}")
    if parsed.username or parsed.password:
        raise AcceleratorError("credentials embedded in URLs are not supported")
    return url


def safe_display_url(url: str) -> str:
    """Remove short-lived signed query parameters before emitting a URL."""
    parsed = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def normalize_mirrors(values: list[str] | None) -> tuple[str, ...]:
    mirrors = values or list(DEFAULT_MIRRORS)
    normalized: list[str] = []
    for value in mirrors:
        mirror = require_https(value.strip())
        if urllib.parse.urlsplit(mirror).query or urllib.parse.urlsplit(mirror).fragment:
            raise AcceleratorError(f"mirror prefixes cannot contain query strings or fragments: {mirror}")
        mirror = mirror.rstrip("/") + "/"
        if mirror not in normalized:
            normalized.append(mirror)
    return tuple(normalized)


def candidate_urls(url: str, mirrors: tuple[str, ...], direct_first: bool = False) -> list[dict[str, str]]:
    url = require_https(url)
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    direct = {"source": "github-direct", "url": url}
    if host not in GITHUB_PUBLIC_HOSTS:
        return [direct]
    accelerated = [
        {"source": urllib.parse.urlsplit(prefix).hostname or prefix, "url": f"{prefix}{url}"}
        for prefix in mirrors
    ]
    return ([direct] + accelerated) if direct_first else (accelerated + [direct])


def request_headers(url: str, *, accept: str | None = None, byte_range: str | None = None) -> dict[str, str]:
    headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
    if accept:
        headers["Accept"] = accept
    if byte_range:
        headers["Range"] = byte_range
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    token = os.environ.get("GH_TOKEN")
    if token and host == "api.github.com":
        headers["Authorization"] = f"Bearer {token}"
    return headers


def read_limited(response: Any, limit: int) -> bytes:
    data = response.read(limit + 1)
    if len(data) > limit:
        raise AcceleratorError(f"response exceeded {limit} bytes")
    return data


def race_first(tasks: list[tuple[str, Callable[[], Any]]], timeout: float) -> tuple[str, Any, list[dict[str, str]]]:
    results: queue.Queue[tuple[bool, str, Any]] = queue.Queue()
    for label, operation in tasks:
        def worker(name: str = label, fn: Callable[[], Any] = operation) -> None:
            try:
                results.put((True, name, fn()))
            except Exception as exc:  # each route reports its own network/parser failure
                results.put((False, name, f"{type(exc).__name__}: {exc}"))

        threading.Thread(target=worker, daemon=True).start()

    errors: list[dict[str, str]] = []
    deadline = time.monotonic() + timeout
    remaining = len(tasks)
    while remaining:
        wait_for = deadline - time.monotonic()
        if wait_for <= 0:
            break
        try:
            ok, label, value = results.get(timeout=wait_for)
        except queue.Empty:
            break
        remaining -= 1
        if ok:
            return label, value, errors
        errors.append({"source": label, "error": str(value)})
    if remaining:
        errors.append({"source": "timeout", "error": f"{remaining} route(s) exceeded {timeout:.1f}s"})
    raise AcceleratorError(json.dumps(errors, ensure_ascii=False))


def parse_repository(value: str) -> str:
    repository = value.strip().strip("/")
    if repository.endswith(".git"):
        repository = repository[:-4]
    if not REPOSITORY_RE.fullmatch(repository):
        raise AcceleratorError("repository must be OWNER/REPO")
    return repository


def release_from_api(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers=request_headers(url, accept="application/vnd.github+json"),
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(read_limited(response, 4 * 1024 * 1024).decode("utf-8"))
    if not isinstance(payload, dict) or not payload.get("tag_name"):
        raise AcceleratorError("GitHub API response does not describe a release")
    assets = []
    for asset in payload.get("assets") or []:
        if not isinstance(asset, dict) or not asset.get("browser_download_url"):
            continue
        assets.append({
            "name": asset.get("name"),
            "url": asset.get("browser_download_url"),
            "bytes": asset.get("size"),
            "digest": asset.get("digest"),
        })
    return {
        "tag": str(payload["tag_name"]),
        "name": payload.get("name"),
        "publishedAt": payload.get("published_at"),
        "releaseUrl": payload.get("html_url"),
        "assets": assets,
    }


def release_from_atom(url: str, timeout: float, repository: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=request_headers(url, accept="application/atom+xml"))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        root = ET.fromstring(read_limited(response, 4 * 1024 * 1024))
    namespace = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", namespace)
    if entry is None:
        raise AcceleratorError("release feed has no entries")
    link = entry.find("atom:link", namespace)
    href = link.attrib.get("href", "") if link is not None else ""
    match = re.search(r"/releases/tag/([^/?#]+)", href)
    if not match:
        raise AcceleratorError("release tag is missing from Atom feed")
    tag = urllib.parse.unquote(match.group(1))
    title = entry.findtext("atom:title", default=tag, namespaces=namespace).strip()
    published = entry.findtext("atom:updated", default="", namespaces=namespace)
    return {
        "tag": tag,
        "name": title,
        "publishedAt": published or None,
        "releaseUrl": f"https://github.com/{repository}/releases/tag/{urllib.parse.quote(tag, safe='')}",
        "assets": [],
    }


def check_release(repository: str, mirrors: tuple[str, ...], timeout: float) -> dict[str, Any]:
    repository = parse_repository(repository)
    api_url = f"https://api.github.com/repos/{repository}/releases/latest"
    atom_url = f"https://github.com/{repository}/releases.atom"
    tasks: list[tuple[str, Callable[[], dict[str, Any]]]] = []
    for candidate in candidate_urls(api_url, mirrors):
        tasks.append((f"api:{candidate['source']}", lambda item=candidate: release_from_api(item["url"], timeout)))
    for candidate in candidate_urls(atom_url, mirrors):
        tasks.append((f"atom:{candidate['source']}", lambda item=candidate: release_from_atom(item["url"], timeout, repository)))
    source, release, earlier_errors = race_first(tasks, timeout + 1)
    release["repository"] = repository
    release["source"] = source
    release["earlierErrors"] = earlier_errors
    return release


def probe_one(candidate: dict[str, str], timeout: float, sample_bytes: int = 64 * 1024) -> dict[str, Any]:
    started = time.monotonic()
    request = urllib.request.Request(
        candidate["url"],
        headers=request_headers(candidate["url"], byte_range=f"bytes=0-{sample_bytes - 1}"),
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = response.read(sample_bytes)
        status = getattr(response, "status", response.getcode())
        final_url = response.geturl()
        content_type = response.headers.get("Content-Type")
    elapsed = max(time.monotonic() - started, 0.000001)
    if not data:
        raise AcceleratorError("empty response")
    return {
        "source": candidate["source"],
        "url": candidate["url"],
        "finalUrl": safe_display_url(final_url),
        "status": status,
        "sampleBytes": len(data),
        "elapsedSeconds": round(elapsed, 3),
        "sampleKiBPerSecond": round(len(data) / 1024 / elapsed, 1),
        "contentType": content_type,
        "ok": True,
    }


def probe_candidates(url: str, mirrors: tuple[str, ...], timeout: float, direct_first: bool) -> list[dict[str, Any]]:
    candidates = candidate_urls(url, mirrors, direct_first)
    results: queue.Queue[tuple[bool, dict[str, str], Any]] = queue.Queue()

    for candidate in candidates:
        def worker(item: dict[str, str] = candidate) -> None:
            try:
                results.put((True, item, probe_one(item, timeout)))
            except Exception as exc:
                results.put((False, item, f"{type(exc).__name__}: {exc}"))

        threading.Thread(target=worker, daemon=True).start()

    collected: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout + 1
    remaining = len(candidates)
    while remaining:
        wait_for = deadline - time.monotonic()
        if wait_for <= 0:
            break
        try:
            ok, candidate, value = results.get(timeout=wait_for)
        except queue.Empty:
            break
        remaining -= 1
        if ok:
            collected.append(value)
        else:
            collected.append({
                "source": candidate["source"],
                "url": candidate["url"],
                "ok": False,
                "error": str(value),
            })
    completed_sources = {item["source"] for item in collected}
    for candidate in candidates:
        if candidate["source"] not in completed_sources:
            collected.append({
                "source": candidate["source"],
                "url": candidate["url"],
                "ok": False,
                "error": f"probe exceeded {timeout:.1f}s",
            })
    preference = {candidate["source"]: index for index, candidate in enumerate(candidates)}
    return sorted(
        collected,
        key=lambda item: (
            not item.get("ok", False),
            item.get("elapsedSeconds", float("inf")),
            preference.get(item["source"], len(preference)),
        ),
    )


def parse_checksum(text: str) -> str:
    match = SHA256_RE.search(text)
    if not match:
        raise AcceleratorError("no SHA-256 value found")
    return match.group(1).lower()


def fetch_checksum(url: str, mirrors: tuple[str, ...], timeout: float, direct_first: bool) -> tuple[str, str]:
    tasks: list[tuple[str, Callable[[], str]]] = []
    for candidate in candidate_urls(url, mirrors, direct_first):
        def fetch(item: dict[str, str] = candidate) -> str:
            request = urllib.request.Request(item["url"], headers=request_headers(item["url"], accept="text/plain"))
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return parse_checksum(read_limited(response, 16 * 1024).decode("utf-8", "replace"))

        tasks.append((candidate["source"], fetch))
    source, checksum, _ = race_first(tasks, timeout + 1)
    return checksum, source


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def total_size_from_headers(response: Any, offset: int) -> int | None:
    content_range = response.headers.get("Content-Range", "")
    match = re.search(r"/(\d+)$", content_range)
    if match:
        return int(match.group(1))
    content_length = response.headers.get("Content-Length")
    if content_length and content_length.isdigit():
        return int(content_length) + (offset if getattr(response, "status", 200) == 206 else 0)
    return None


def transfer_once(url: str, part_path: Path, timeout: float, quiet: bool) -> dict[str, Any]:
    offset = part_path.stat().st_size if part_path.exists() else 0
    byte_range = f"bytes={offset}-" if offset else None
    request = urllib.request.Request(url, headers=request_headers(url, byte_range=byte_range))
    started = time.monotonic()
    try:
        response = urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        if exc.code == 416 and offset:
            total_match = re.search(r"\*/(\d+)$", exc.headers.get("Content-Range", ""))
            if total_match and int(total_match.group(1)) == offset:
                return {"bytes": offset, "elapsedSeconds": 0.0, "resumed": True}
        raise

    with response:
        status = getattr(response, "status", response.getcode())
        append = bool(offset and status == 206)
        if offset and not append:
            offset = 0
        total = total_size_from_headers(response, offset)
        mode = "ab" if append else "wb"
        written = offset
        last_report = started
        with part_path.open(mode) as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                written += len(chunk)
                now = time.monotonic()
                if not quiet and now - last_report >= 1:
                    suffix = f"/{total}" if total is not None else ""
                    print(f"[{written}{suffix} bytes] {url}", file=sys.stderr)
                    last_report = now
        if total is not None and written != total:
            raise AcceleratorError(f"incomplete response: got {written} of {total} bytes")
    return {
        "bytes": written,
        "elapsedSeconds": round(time.monotonic() - started, 3),
        "resumed": append,
    }


def choose_download_order(
    url: str,
    mirrors: tuple[str, ...],
    timeout: float,
    direct_first: bool,
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    candidates = candidate_urls(url, mirrors, direct_first)
    probes = probe_candidates(url, mirrors, min(timeout, 12), direct_first)
    successful = [item["source"] for item in probes if item.get("ok")]
    rank = {source: index for index, source in enumerate(successful)}
    preference = {item["source"]: index for index, item in enumerate(candidates)}
    ordered = sorted(
        candidates,
        key=lambda item: (item["source"] not in rank, rank.get(item["source"], preference[item["source"]])),
    )
    return ordered, probes


def download_file(
    url: str,
    output: Path,
    mirrors: tuple[str, ...],
    timeout: float,
    retries: int,
    direct_first: bool,
    expected_sha256: str | None,
    force: bool,
    quiet: bool,
) -> dict[str, Any]:
    require_https(url)
    output = output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        existing_hash = file_sha256(output) if expected_sha256 else None
        if expected_sha256 and existing_hash == expected_sha256:
            return {
                "source": "existing-file",
                "output": str(output),
                "bytes": output.stat().st_size,
                "sha256": existing_hash,
                "expectedSha256": expected_sha256,
                "verified": True,
                "cached": True,
            }
        if not force:
            raise AcceleratorError(f"destination exists; pass --force only after overwrite is authorized: {output}")

    part_path = output.with_name(output.name + ".part")
    ordered, probes = choose_download_order(url, mirrors, timeout, direct_first)
    failures: list[dict[str, str]] = []
    for candidate in ordered:
        for attempt in range(1, retries + 2):
            try:
                transfer = transfer_once(candidate["url"], part_path, timeout, quiet)
                digest = file_sha256(part_path)
                if expected_sha256 and digest != expected_sha256:
                    part_path.unlink(missing_ok=True)
                    raise AcceleratorError(f"SHA-256 mismatch: expected {expected_sha256}, got {digest}")
                os.replace(part_path, output)
                return {
                    "source": candidate["source"],
                    "url": candidate["url"],
                    "output": str(output),
                    **transfer,
                    "sha256": digest,
                    "expectedSha256": expected_sha256,
                    "verified": bool(expected_sha256),
                    "cached": False,
                    "probes": probes,
                    "failures": failures,
                }
            except Exception as exc:
                failures.append({
                    "source": candidate["source"],
                    "attempt": str(attempt),
                    "error": f"{type(exc).__name__}: {exc}",
                })
    raise AcceleratorError(json.dumps({"failures": failures, "partial": str(part_path)}, ensure_ascii=False))


def release_asset(release: dict[str, Any], name: str) -> dict[str, Any]:
    for asset in release.get("assets") or []:
        if asset.get("name") == name:
            return asset
    tag = release["tag"]
    repository = release["repository"]
    return {
        "name": name,
        "url": (
            f"https://github.com/{repository}/releases/download/"
            f"{urllib.parse.quote(tag, safe='')}/{urllib.parse.quote(name)}"
        ),
        "bytes": None,
        "digest": None,
    }


def digest_from_release(value: Any) -> str | None:
    if isinstance(value, str) and value.lower().startswith("sha256:"):
        digest = value[7:].lower()
        if SHA256_RE.fullmatch(digest):
            return digest
    return None


def add_route_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--mirror", action="append", help="HTTPS mirror prefix; repeat to replace defaults")
    parser.add_argument("--direct-first", action="store_true", help="prefer GitHub direct when timings tie or probes fail")
    parser.add_argument("--timeout", type=float, default=10.0, help="per-request timeout in seconds")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", action="version", version=VERSION)
    subparsers = parser.add_subparsers(dest="command", required=True)

    check = subparsers.add_parser("check", help="check the latest public GitHub release")
    check.add_argument("--repo", required=True, help="repository as OWNER/REPO")
    check.add_argument("--asset", help="optional release asset name to construct and probe")
    add_route_arguments(check)

    probe = subparsers.add_parser("probe", help="probe official and accelerated routes")
    probe.add_argument("url", help="public HTTPS GitHub URL")
    add_route_arguments(probe)

    download = subparsers.add_parser("download", help="download with resume, fallback, and optional SHA-256 verification")
    download.add_argument("url", nargs="?", help="public HTTPS GitHub URL")
    download.add_argument("--repo", help="repository as OWNER/REPO; requires --asset")
    download.add_argument("--asset", help="release asset name")
    download.add_argument("--output", required=True, type=Path, help="destination file")
    download.add_argument("--sha256", help="official expected SHA-256")
    download.add_argument("--checksum-url", help="official public .sha256 URL")
    download.add_argument("--retries", type=int, default=1, help="retries per route after the first attempt")
    download.add_argument("--force", action="store_true", help="replace an existing destination")
    download.add_argument("--quiet", action="store_true", help="suppress progress on stderr")
    add_route_arguments(download)
    return parser


def ensure_positive_timeout(value: float) -> float:
    if value <= 0 or value > 300:
        raise AcceleratorError("timeout must be greater than 0 and at most 300 seconds")
    return value


def run(args: argparse.Namespace) -> dict[str, Any]:
    timeout = ensure_positive_timeout(args.timeout)
    mirrors = normalize_mirrors(args.mirror)
    if args.command == "check":
        release = check_release(args.repo, mirrors, timeout)
        if args.asset:
            asset = release_asset(release, args.asset)
            asset["probes"] = probe_candidates(asset["url"], mirrors, timeout, args.direct_first)
            release["asset"] = asset
        return release

    if args.command == "probe":
        return {
            "url": require_https(args.url),
            "routes": probe_candidates(args.url, mirrors, timeout, args.direct_first),
        }

    if args.retries < 0 or args.retries > 10:
        raise AcceleratorError("retries must be between 0 and 10")
    url = args.url
    release_digest = None
    if args.repo or args.asset:
        if not args.repo or not args.asset:
            raise AcceleratorError("--repo and --asset must be used together")
        release = check_release(args.repo, mirrors, timeout)
        asset = release_asset(release, args.asset)
        url = asset["url"]
        release_digest = digest_from_release(asset.get("digest"))
    if not url:
        raise AcceleratorError("provide a URL or use --repo OWNER/REPO --asset NAME")

    expected = None
    if args.sha256:
        expected = args.sha256.lower().removeprefix("sha256:")
        if not SHA256_RE.fullmatch(expected):
            raise AcceleratorError("--sha256 must contain exactly 64 hexadecimal characters")
    if release_digest:
        if expected and expected != release_digest:
            raise AcceleratorError("--sha256 conflicts with the official GitHub release digest")
        expected = release_digest
    checksum_source = None
    if args.checksum_url:
        checksum, checksum_source = fetch_checksum(args.checksum_url, mirrors, timeout, args.direct_first)
        if expected and expected != checksum:
            raise AcceleratorError("checksum URL conflicts with the supplied or release SHA-256")
        expected = checksum

    result = download_file(
        url=url,
        output=args.output,
        mirrors=mirrors,
        timeout=timeout,
        retries=args.retries,
        direct_first=args.direct_first,
        expected_sha256=expected,
        force=args.force,
        quiet=args.quiet,
    )
    if checksum_source:
        result["checksumSource"] = checksum_source
    return result


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = build_parser()
    try:
        result = run(parser.parse_args())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except KeyboardInterrupt:
        print("interrupted; partial download was preserved", file=sys.stderr)
        return 130
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

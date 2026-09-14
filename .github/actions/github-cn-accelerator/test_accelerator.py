import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import github_accelerator as accelerator
import workflow_action as action


class AcceleratorCoreTests(unittest.TestCase):
    def test_candidate_order_prefers_mirrors_without_losing_direct_url(self):
        direct = "https://github.com/acme/project/releases/download/v1.0.0/app.zip"
        candidates = accelerator.candidate_urls(direct, ("https://mirror.example/",))
        self.assertEqual(candidates[0]["url"], f"https://mirror.example/{direct}")
        self.assertEqual(candidates[-1]["url"], direct)

    def test_non_github_url_is_not_sent_to_a_mirror(self):
        direct = "https://downloads.example/app.zip"
        self.assertEqual(
            accelerator.candidate_urls(direct, ("https://mirror.example/",)),
            [{"source": "github-direct", "url": direct}],
        )

    def test_checksum_and_signed_url_sanitizing(self):
        digest = "ab" * 32
        self.assertEqual(accelerator.parse_checksum(f"{digest}  app.zip\n"), digest)
        signed = "https://release-assets.githubusercontent.com/app.zip?jwt=temporary&sig=secret"
        self.assertEqual(
            accelerator.safe_display_url(signed),
            "https://release-assets.githubusercontent.com/app.zip",
        )

    def test_credentials_and_plain_http_are_rejected(self):
        for url in ("http://github.com/a/b", "https://user:secret@github.com/a/b"):
            with self.assertRaises(accelerator.AcceleratorError):
                accelerator.require_https(url)


class WorkflowAdapterTests(unittest.TestCase):
    def test_release_assets_are_scoped_to_the_requested_repository(self):
        action.validate_asset_url(
            "acme/project",
            "https://github.com/acme/project/releases/download/v1.0.0/app.zip",
        )
        with self.assertRaises(accelerator.AcceleratorError):
            action.validate_asset_url(
                "acme/project",
                "https://github.com/attacker/project/releases/download/v1.0.0/app.zip",
            )

    def test_download_assets_requires_and_passes_the_official_digest(self):
        digest = "cd" * 32
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            release_path = root / "release.json"
            release_path.write_text(json.dumps({
                "assets": [{
                    "name": "bundle.zip",
                    "browser_download_url": "https://github.com/acme/project/releases/download/v1.0.0/bundle.zip",
                    "digest": f"sha256:{digest}",
                }],
            }), encoding="utf-8")
            output_path = root / "outputs.txt"
            environment = {
                "ACCELERATOR_RELEASE_JSON": str(release_path),
                "ACCELERATOR_ASSET_PATTERN": "*.zip",
                "ACCELERATOR_OUTPUT_DIRECTORY": str(root / "downloads"),
                "GITHUB_OUTPUT": str(output_path),
            }
            with patch.dict(os.environ, environment, clear=False), patch.object(
                action,
                "download_file",
                return_value={
                    "source": "mirror.example",
                    "bytes": 42,
                    "output": str(root / "downloads" / "bundle.zip"),
                },
            ) as download:
                action.download_assets("acme/project", ("https://mirror.example/",), 5)
            self.assertEqual(download.call_args.kwargs["expected_sha256"], digest)
            self.assertIn("downloaded-files=", output_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

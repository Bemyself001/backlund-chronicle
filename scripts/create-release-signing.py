"""Create the long-lived Android release key in the gitignored .signing folder."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import base64
import secrets

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID


ROOT = Path(__file__).resolve().parents[1]
SIGNING_DIR = ROOT / ".signing"
KEYSTORE = SIGNING_DIR / "backlund-release.p12"
CREDENTIALS = SIGNING_DIR / "release-signing.private.txt"
ALIAS = "backlund-release"

if KEYSTORE.exists() or CREDENTIALS.exists():
    raise SystemExit("Release signing material already exists; refusing to overwrite it.")

SIGNING_DIR.mkdir(parents=True, exist_ok=True)
password = secrets.token_urlsafe(36)
private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
subject = issuer = x509.Name(
    [
        x509.NameAttribute(NameOID.COMMON_NAME, "Backlund Chronicle Android Release"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Bemyself001"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "CN"),
    ]
)
now = datetime.now(timezone.utc)
certificate = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(private_key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(now - timedelta(days=1))
    .not_valid_after(now + timedelta(days=365 * 30))
    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
    .sign(private_key, hashes.SHA256())
)
keystore_bytes = pkcs12.serialize_key_and_certificates(
    ALIAS.encode(),
    private_key,
    certificate,
    None,
    serialization.BestAvailableEncryption(password.encode()),
)
KEYSTORE.write_bytes(keystore_bytes)
CREDENTIALS.write_text(
    "DO NOT COMMIT OR LOSE THIS FILE. Future updates require the same key.\n"
    f"ANDROID_KEY_ALIAS={ALIAS}\n"
    f"ANDROID_KEYSTORE_PASSWORD={password}\n"
    f"ANDROID_KEY_PASSWORD={password}\n"
    f"ANDROID_KEYSTORE_BASE64={base64.b64encode(keystore_bytes).decode()}\n",
    encoding="utf-8",
)
print(f"Created release signing backup in {SIGNING_DIR}")

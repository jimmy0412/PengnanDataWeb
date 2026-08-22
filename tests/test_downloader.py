import ssl
from unittest.mock import MagicMock, patch

from app.services.downloader import _create_ssl_context, fetch_file_links


def test_ssl_context_keeps_certificate_and_hostname_verification():
    context = _create_ssl_context()

    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    assert not context.verify_flags & getattr(ssl, "VERIFY_X509_STRICT", 0)


def test_fetch_file_links_uses_compatible_ssl_context():
    response = MagicMock()
    response.text = (
        '<a href="/userfiles/01/files/114-m31.ods">m31</a>'
        '<a href="/userfiles/01/files/114-m11.ods">m11</a>'
    )

    with patch("app.services.downloader.httpx.get", return_value=response) as get:
        links = fetch_file_links()

    context = get.call_args.kwargs["verify"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert links["114"] == {
        "m31": "https://www.penghu.gov.tw/userfiles/01/files/114-m31.ods",
        "m11": "https://www.penghu.gov.tw/userfiles/01/files/114-m11.ods",
    }

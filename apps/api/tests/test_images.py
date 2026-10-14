import httpx
import pytest

from scopeprofit.errors import DomainError, ErrorCode
from scopeprofit.services.images import ImageFetcher, ImageFetchPolicy, is_public_address, validate_image
from tests.conftest import png_bytes


async def public(_host: str) -> list[str]:
    return ["93.184.216.34"]


async def private(_host: str) -> list[str]:
    return ["10.0.0.5"]


def test_validate_image_accepts_supported_formats_and_rejects_others() -> None:
    image = validate_image(png_bytes(), "shot.final.PNG", "image/png")
    assert image.mime_type.value == "image/png"
    assert image.name == "shot.final.png"
    assert validate_image(png_bytes(image_format="JPEG"), "a.jpg").mime_type.value == "image/jpeg"
    for content, declared in (
        (b"not an image", None),
        (png_bytes(image_format="GIF"), None),
        (png_bytes(), "image/jpeg"),
    ):
        with pytest.raises(DomainError) as error:
            validate_image(content, "x", declared)
        assert error.value.code is ErrorCode.invalid_image
    with pytest.raises(DomainError):
        validate_image(b"", "x")


def test_public_address_checks() -> None:
    assert is_public_address("93.184.216.34")
    assert is_public_address("2606:4700::1111")
    for address in ("127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "::ffff:192.168.1.1", "fc00::1", "nope"):
        assert not is_public_address(address)


async def test_fetch_follows_safe_redirects_and_validates_bytes() -> None:
    image = png_bytes()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/start":
            return httpx.Response(302, headers={"location": "/final.png"})
        return httpx.Response(200, content=image, headers={"content-type": "image/png"})

    fetcher = ImageFetcher(ImageFetchPolicy(), resolver=public, transport=httpx.MockTransport(handler))
    fetched = await fetcher.fetch("https://cdn.example.com/start")
    assert fetched.content == image
    assert fetched.name == "final.png"


@pytest.mark.parametrize(
    ("url", "resolver", "code"),
    [
        ("http://cdn.example.com/a.png", public, ErrorCode.invalid_image_url),
        ("https://user:pw@cdn.example.com/a.png", public, ErrorCode.invalid_image_url),
        ("https://intranet.example.com/a.png", private, ErrorCode.invalid_image_url),
        ("https://127.0.0.1/a.png", public, ErrorCode.invalid_image_url),
    ],
)
async def test_fetch_rejects_unsafe_urls(url: str, resolver: object, code: ErrorCode) -> None:
    fetcher = ImageFetcher(
        ImageFetchPolicy(), resolver=resolver, transport=httpx.MockTransport(lambda _: httpx.Response(200))
    )  # type: ignore[arg-type]
    with pytest.raises(DomainError) as error:
        await fetcher.fetch(url)
    assert error.value.code is code


async def test_fetch_rejects_bad_responses() -> None:
    responses = iter(
        [
            httpx.Response(404),
            httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"}),
            httpx.Response(
                200, content=b"x", headers={"content-type": "image/png", "content-length": str(11 * 1024 * 1024)}
            ),
        ]
    )
    fetcher = ImageFetcher(
        ImageFetchPolicy(), resolver=public, transport=httpx.MockTransport(lambda _: next(responses))
    )
    codes = []
    for _ in range(3):
        with pytest.raises(DomainError) as error:
            await fetcher.fetch("https://cdn.example.com/a.png")
        codes.append(error.value.code)
    assert codes == [ErrorCode.image_fetch_failed, ErrorCode.invalid_image, ErrorCode.invalid_image]


async def test_fetch_stops_after_three_redirects() -> None:
    redirect = httpx.MockTransport(lambda _: httpx.Response(302, headers={"location": "/again"}))
    fetcher = ImageFetcher(ImageFetchPolicy(), resolver=public, transport=redirect)
    with pytest.raises(DomainError) as error:
        await fetcher.fetch("https://cdn.example.com/loop")
    assert error.value.code is ErrorCode.image_fetch_failed


async def test_testing_policy_allows_http_and_private_hosts() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, content=png_bytes(), headers={"content-type": "image/png"})
    )
    fetcher = ImageFetcher(ImageFetchPolicy(allow_http=True, allow_private=True), resolver=private, transport=transport)
    assert (await fetcher.fetch("http://localhost/a.png")).mime_type.value == "image/png"

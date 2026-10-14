"""Client images: byte validation and SSRF-guarded download of public image URLs."""

import asyncio
import io
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlsplit

import httpx
from PIL import Image, UnidentifiedImageError

from scopeprofit.enums import IMAGE_EXTENSIONS, ImageMimeType
from scopeprofit.errors import DomainError, ErrorCode

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_REDIRECTS = 3
_PIL_FORMATS = {"JPEG": ImageMimeType.jpeg, "PNG": ImageMimeType.png, "WEBP": ImageMimeType.webp}

Resolver = Callable[[str], Awaitable[list[str]]]


@dataclass(frozen=True)
class ImageBytes:
    content: bytes
    mime_type: ImageMimeType
    name: str


def _invalid(message: str = "Invalid JPEG, PNG or WebP image") -> DomainError:
    return DomainError(ErrorCode.invalid_image, message)


def validate_image(content: bytes, name: str, declared_mime: str | None = None) -> ImageBytes:
    """Decodes the image fully; only single-frame JPEG/PNG/WebP up to 10 MB and 40 MP pass."""
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise _invalid("Image limit is 10 MB")
    try:
        with Image.open(io.BytesIO(content)) as image:
            mime = _PIL_FORMATS.get(image.format or "")
            if mime is None or getattr(image, "n_frames", 1) > 1:
                raise _invalid()
            if image.width * image.height > MAX_PIXELS:
                raise _invalid("Image exceeds 40 megapixels")
            image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise _invalid() from error
    if declared_mime is not None and declared_mime != mime.value:
        raise _invalid("Image content does not match its declared type")
    stem = PurePosixPath(name).stem[:80] or "image"
    return ImageBytes(content, mime, f"{stem}{IMAGE_EXTENSIONS[mime]}")


def is_public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


async def system_resolver(host: str) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [str(info[4][0]) for info in infos]


@dataclass(frozen=True)
class ImageFetchPolicy:
    allow_http: bool = False
    allow_private: bool = False


class ImageFetcher:
    """Downloads client images. Only https, public addresses, ≤3 redirects and ≤10 MB."""

    def __init__(
        self,
        policy: ImageFetchPolicy,
        resolver: Resolver = system_resolver,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.policy = policy
        self.resolver = resolver
        self.transport = transport

    async def _assert_public(self, url: str) -> None:
        parts = urlsplit(url)
        allowed = {"https", "http"} if self.policy.allow_http else {"https"}
        if parts.scheme not in allowed or not parts.hostname:
            raise DomainError(ErrorCode.invalid_image_url, "Image URLs must use https")
        if parts.username or parts.password:
            raise DomainError(ErrorCode.invalid_image_url, "Image URLs cannot carry credentials")
        if self.policy.allow_private:
            return
        host = parts.hostname
        try:
            ipaddress.ip_address(host)
            addresses = [host]
        except ValueError:
            try:
                addresses = await self.resolver(host)
            except OSError as error:
                raise DomainError(ErrorCode.invalid_image_url, "Unknown host") from error
        if not addresses or not all(is_public_address(address) for address in addresses):
            raise DomainError(ErrorCode.invalid_image_url, "Image URL must resolve to a public address")

    async def fetch(self, url: str) -> ImageBytes:
        current = url
        async with httpx.AsyncClient(transport=self.transport, timeout=15.0, follow_redirects=False) as client:
            for hop in range(MAX_REDIRECTS + 1):
                await self._assert_public(current)
                try:
                    async with client.stream(
                        "GET", current, headers={"accept": "image/jpeg,image/png,image/webp"}
                    ) as response:
                        if response.is_redirect:
                            location = response.headers.get("location")
                            if not location or hop == MAX_REDIRECTS:
                                raise DomainError(
                                    ErrorCode.image_fetch_failed, "Too many redirects", HTTPStatus.BAD_GATEWAY
                                )
                            current = urljoin(current, location)
                            continue
                        if response.status_code != HTTPStatus.OK:
                            raise DomainError(
                                ErrorCode.image_fetch_failed,
                                f"Image URL answered {response.status_code}",
                                HTTPStatus.BAD_GATEWAY,
                            )
                        mime = response.headers.get("content-type", "").split(";")[0].strip()
                        if mime not in {member.value for member in ImageMimeType}:
                            raise _invalid("Only JPEG, PNG or WebP images are supported")
                        if int(response.headers.get("content-length", "0") or 0) > MAX_IMAGE_BYTES:
                            raise _invalid("Image limit is 10 MB")
                        chunks: list[bytes] = []
                        size = 0
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > MAX_IMAGE_BYTES:
                                raise _invalid("Image limit is 10 MB")
                            chunks.append(chunk)
                except httpx.HTTPError as error:
                    raise DomainError(
                        ErrorCode.image_fetch_failed, "Image download failed", HTTPStatus.BAD_GATEWAY
                    ) from error
                name = PurePosixPath(urlsplit(current).path).name or "image"
                return validate_image(b"".join(chunks), name, mime)
        raise DomainError(ErrorCode.image_fetch_failed, "Image download failed", HTTPStatus.BAD_GATEWAY)

"""Per-user document branding: the brand, tagline, colors and cover title of template 7.1 documents.

Stored in `users.branding` (JSONB). Users without a saved branding get `DEFAULT_BRANDING`, a neutral
ScopeProfit look. `examples/branding-franprzdev.json` shows a professional's own configuration.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

HexColor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$", description="#RRGGBB")]
ShortText = Annotated[str, Field(min_length=1, max_length=80)]


class Branding(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
        serialize_by_alias=True,
    )

    brand_name: ShortText = Field(description="Shown top-left on every page and in the cover's brand block")
    tagline: Annotated[str, Field(max_length=120)] = Field(description="Line under the brand name on the cover")
    primary_color: HexColor = Field(description="Titles, headers and the dark corner band")
    accent_color: HexColor = Field(description="Brand mark, document title, module headings and the light band")
    cover_title_light: ShortText = Field(description="First cover title line, light weight (e.g. 'ACUERDO DE')")
    cover_title_bold: ShortText = Field(description="Second cover title line, bold (e.g. 'DESARROLLO')")

    def to_json(self) -> dict[str, object]:
        return self.model_dump(mode="json")


DEFAULT_BRANDING = Branding(
    brand_name="ScopeProfit",
    tagline="Alcance de software claro y versionado",
    primary_color="#1F2937",
    accent_color="#4B7F73",
    cover_title_light="DOCUMENTO DE",
    cover_title_bold="ALCANCE",
)

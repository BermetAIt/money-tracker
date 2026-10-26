from pydantic import BaseModel, ConfigDict, Field


class MoneyIn(BaseModel):
    amount_minor: int = Field(ge=0)


class IdOut(BaseModel):
    id: int

    model_config = ConfigDict(from_attributes=True)

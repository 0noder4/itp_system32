from ..registry import Catalog
from .fr import FR_SHEET
from .lg import LG_SHEET
from .opiekun import OPIEKUN_SHEET
from .tr import TR_SHEET

CATALOG = Catalog([
    LG_SHEET,
    FR_SHEET,
    TR_SHEET,
    OPIEKUN_SHEET,
])

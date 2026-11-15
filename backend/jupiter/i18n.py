"""Static bilingual public labels. Producer records retain their original text."""
import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def catalog():
    return json.loads((ROOT/"data/reference/ui.en.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def patterns():
    compiled = []
    for key,value in catalog().items():
        slots = re.findall(r"\{\d+\}",key)
        if slots:
            pieces = re.split(r"(\{\d+\})",key)
            regex = "^"+"".join("(.+?)" if part in slots else re.escape(part) for part in pieces)+"$"
            compiled.append((re.compile(regex),slots,value))
    return compiled


def translate(value, language="en"):
    if language != "en" or not isinstance(value,str):
        return value
    key = " ".join(value.split())
    translated = catalog().get(key)
    if translated is None:
        for regex,slots,text in patterns():
            match = regex.fullmatch(key)
            if match:
                translated = re.sub(r"\{\d+\}",lambda m:translate(match.group(slots.index(m[0])+1),language),text)
                break
    return value if translated is None else translated


def localize(value, language="en", key="", parent=None):
    if language != "en" or key in {"field_name","producer","sample_code","cultivar","email"}:
        return value
    if key == "name" and not (parent or {}).get("code") and not (parent or {}).get("crop"):
        return value
    if key == "excluded" and isinstance(value,dict):
        return {translate(k,language):localize(item,language) for k,item in value.items()}
    if isinstance(value,str):
        return translate(value,language)
    if isinstance(value,list):
        return [localize(item,language) for item in value]
    if isinstance(value,dict):
        return {k:localize(item,language,k,value) for k,item in value.items()}
    return value

from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path

from rapidfuzz import fuzz, process

CANONICAL_REGIONS = [
    "Abruzzo",
    "Basilicata",
    "Calabria",
    "Campania",
    "Emilia-Romagna",
    "Friuli-Venezia Giulia",
    "Lazio",
    "Liguria",
    "Lombardia",
    "Marche",
    "Molise",
    "Piemonte",
    "Puglia",
    "Sardegna",
    "Sicilia",
    "Toscana",
    "Trentino-Alto Adige",
    "Umbria",
    "Valle d'Aosta",
    "Veneto",
]


def _clean(text: str) -> str:
    lowered = text.lower().strip()
    nkfd = unicodedata.normalize("NFKD", lowered)
    ascii_only = "".join(ch for ch in nkfd if not unicodedata.combining(ch))
    no_punct = re.sub(r"[^a-z0-9\s]", " ", ascii_only)
    collapsed = re.sub(r"\s+", " ", no_punct).strip()
    return collapsed


CANONICAL_BY_CLEAN = {_clean(region): region for region in CANONICAL_REGIONS}

ALIAS = {
    "er": "Emilia-Romagna",
    "fvg": "Friuli-Venezia Giulia",
    "vda": "Valle d'Aosta",
    "taa": "Trentino-Alto Adige",
}

PROVINCIA_REGIONE = {
    "agrigento": "Sicilia",
    "alessandria": "Piemonte",
    "ancona": "Marche",
    "aosta": "Valle d'Aosta",
    "arezzo": "Toscana",
    "ascoli piceno": "Marche",
    "asti": "Piemonte",
    "avellino": "Campania",
    "bari": "Puglia",
    "barletta": "Puglia",
    "andria": "Puglia",
    "trani": "Puglia",
    "belluno": "Veneto",
    "benevento": "Campania",
    "bergamo": "Lombardia",
    "biella": "Piemonte",
    "bologna": "Emilia-Romagna",
    "bolzano": "Trentino-Alto Adige",
    "brescia": "Lombardia",
    "brindisi": "Puglia",
    "cagliari": "Sardegna",
    "caltanissetta": "Sicilia",
    "campobasso": "Molise",
    "caserta": "Campania",
    "catania": "Sicilia",
    "catanzaro": "Calabria",
    "chieti": "Abruzzo",
    "como": "Lombardia",
    "cosenza": "Calabria",
    "cremona": "Lombardia",
    "crotone": "Calabria",
    "cuneo": "Piemonte",
    "enna": "Sicilia",
    "fermo": "Marche",
    "ferrara": "Emilia-Romagna",
    "firenze": "Toscana",
    "foggia": "Puglia",
    "forli": "Emilia-Romagna",
    "cesena": "Emilia-Romagna",
    "frosinone": "Lazio",
    "genova": "Liguria",
    "gorizia": "Friuli-Venezia Giulia",
    "grosseto": "Toscana",
    "imperia": "Liguria",
    "isernia": "Molise",
    "la aquila": "Abruzzo",
    "aquila": "Abruzzo",
    "la spezia": "Liguria",
    "latina": "Lazio",
    "lecce": "Puglia",
    "lecco": "Lombardia",
    "livorno": "Toscana",
    "lodi": "Lombardia",
    "lucca": "Toscana",
    "macerata": "Marche",
    "mantova": "Lombardia",
    "massa": "Toscana",
    "carrara": "Toscana",
    "massa carrara": "Toscana",
    "matera": "Basilicata",
    "messina": "Sicilia",
    "milano": "Lombardia",
    "modena": "Emilia-Romagna",
    "monza": "Lombardia",
    "napoli": "Campania",
    "novara": "Piemonte",
    "nuoro": "Sardegna",
    "oristano": "Sardegna",
    "padova": "Veneto",
    "palermo": "Sicilia",
    "parma": "Emilia-Romagna",
    "pavia": "Lombardia",
    "perugia": "Umbria",
    "pesaro": "Marche",
    "urbino": "Marche",
    "pescara": "Abruzzo",
    "piacenza": "Emilia-Romagna",
    "pisa": "Toscana",
    "pistoia": "Toscana",
    "pordenone": "Friuli-Venezia Giulia",
    "potenza": "Basilicata",
    "prato": "Toscana",
    "ragusa": "Sicilia",
    "ravenna": "Emilia-Romagna",
    "reggio calabria": "Calabria",
    "reggio emilia": "Emilia-Romagna",
    "rieti": "Lazio",
    "rimini": "Emilia-Romagna",
    "roma": "Lazio",
    "rovigo": "Veneto",
    "salerno": "Campania",
    "sassari": "Sardegna",
    "savona": "Liguria",
    "siena": "Toscana",
    "siracusa": "Sicilia",
    "sondrio": "Lombardia",
    "sud sardegna": "Sardegna",
    "carbonia": "Sardegna",
    "iglesias": "Sardegna",
    "taranto": "Puglia",
    "teramo": "Abruzzo",
    "terni": "Umbria",
    "torino": "Piemonte",
    "trapani": "Sicilia",
    "trento": "Trentino-Alto Adige",
    "treviso": "Veneto",
    "trieste": "Friuli-Venezia Giulia",
    "udine": "Friuli-Venezia Giulia",
    "varese": "Lombardia",
    "venezia": "Veneto",
    "verbania": "Piemonte",
    "vercelli": "Piemonte",
    "verona": "Veneto",
    "vibo valentia": "Calabria",
    "vicenza": "Veneto",
    "viterbo": "Lazio",
    "scafati": "Campania",
    "crema": "Lombardia",
    "legnano": "Lombardia",
    "toscolano maderno": "Lombardia",
}

ESTERO = {
    "svizzera",
    "san marino",
    "malta",
    "uk",
    "regno unito",
    "romania",
    "estero",
    "inghilterra",
    "francia",
    "germania",
    "spagna",
    "olanda",
    "paesi bassi",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _province_match(cleaned: str) -> str | None:
    for city, region in PROVINCIA_REGIONE.items():
        if " " in city and re.search(rf"\b{re.escape(city)}\b", cleaned):
            return region

    tokens = _TOKEN_RE.findall(cleaned)
    for token in tokens:
        if token in PROVINCIA_REGIONE:
            return PROVINCIA_REGIONE[token]
    return None


def _estero_match(cleaned: str) -> bool:
    if cleaned in ESTERO:
        return True
    for voce in ESTERO:
        if " " in voce and re.search(rf"\b{re.escape(voce)}\b", cleaned):
            return True
    return False


def _split_multi_region(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"\s*(?:,|/|\se\s)\s*", value) if part.strip()]


def normalizza_regione(valore: str | None, _depth: int = 0) -> tuple[str | None, str]:
    if valore is None:
        return None, "fallback"

    raw = str(valore).strip()
    if not raw:
        return None, "fallback"

    cleaned = _clean(raw)
    if not cleaned:
        return None, "fallback"

    diretto = CANONICAL_BY_CLEAN.get(cleaned)
    if diretto:
        return diretto, "diretto"

    alias = ALIAS.get(cleaned)
    if alias:
        return alias, "alias"

    provincia = _province_match(cleaned)
    if provincia:
        return provincia, "provincia_regione"

    if _estero_match(cleaned):
        return None, "estero"

    if _depth == 0:
        parts = _split_multi_region(raw)
        if len(parts) > 1:
            for part in parts:
                norm, _layer = normalizza_regione(part, _depth=1)
                if norm in CANONICAL_REGIONS:
                    return norm, "multi_regione"

    fuzzy = process.extractOne(
        cleaned,
        list(CANONICAL_BY_CLEAN.keys()),
        scorer=fuzz.ratio,
        score_cutoff=80,
    )
    if fuzzy:
        canonical_cleaned = fuzzy[0]
        return CANONICAL_BY_CLEAN[canonical_cleaned], "fuzzy"

    return None, "fallback"


def _build_output_rows(input_rows: list[str]) -> list[dict[str, str | int | None]]:
    counts = Counter(input_rows)
    rows: list[dict[str, str | int | None]] = []

    for valore_originale, count in counts.items():
        valore_normalizzato, strato = normalizza_regione(valore_originale)
        rows.append(
            {
                "valore_originale": valore_originale,
                "valore_normalizzato": valore_normalizzato,
                "strato": strato,
                "conta_occorrenze": count,
            }
        )

    rows.sort(key=lambda row: int(row["conta_occorrenze"]), reverse=True)
    return rows


def _run_csv(input_csv: Path, output_csv: Path) -> None:
    with input_csv.open("r", encoding="utf-8-sig", newline="") as fin:
        reader = csv.DictReader(fin)
        if "valore_originale" not in (reader.fieldnames or []):
            raise ValueError("Il CSV di input deve contenere la colonna 'valore_originale'.")
        values = [row.get("valore_originale", "") for row in reader]

    rows = _build_output_rows(values)

    with output_csv.open("w", encoding="utf-8", newline="") as fout:
        writer = csv.DictWriter(
            fout,
            fieldnames=[
                "valore_originale",
                "valore_normalizzato",
                "strato",
                "conta_occorrenze",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalizza il custom field regione.")
    parser.add_argument("input_csv", type=Path, help="CSV input con colonna valore_originale")
    parser.add_argument("output_csv", type=Path, help="CSV output normalizzato")
    args = parser.parse_args()
    _run_csv(args.input_csv, args.output_csv)


if __name__ == "__main__":
    main()

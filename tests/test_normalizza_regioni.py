from normalizza_regioni import normalizza_regione


def test_casi_reali_normalizzazione():
    casi = [
        ("Emila romagna", ("Emilia-Romagna", "fuzzy")),
        ("Enila romagna", ("Emilia-Romagna", "fuzzy")),
        ("Emilia-romagna", ("Emilia-Romagna", "diretto")),
        ("Emilia romagna, bologna", ("Emilia-Romagna", "provincia_regione")),
        ("Lombardi", ("Lombardia", "fuzzy")),
        ("Lomabdia", ("Lombardia", "fuzzy")),
        ("Milano - lombardia", ("Lombardia", "provincia_regione")),
        ("Lombardia e veneto", ("Lombardia", "multi_regione")),
        ("Ppiuglia", ("Puglia", "fuzzy")),
        ("Camoania", ("Campania", "fuzzy")),
        ("Toscolano maderno", ("Lombardia", "provincia_regione")),
        ("Svizzera", (None, "estero")),
        ("Cazzi miei", (None, "fallback")),
        ("Jhhh", (None, "fallback")),
        ("Fvg", ("Friuli-Venezia Giulia", "alias")),
        ("Er", ("Emilia-Romagna", "alias")),
        ("Niente in nero occasionalmente", (None, "fallback")),
        ("", (None, "fallback")),
        (None, (None, "fallback")),
    ]

    for valore, atteso in casi:
        assert normalizza_regione(valore) == atteso

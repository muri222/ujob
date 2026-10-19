"""CV em PDF gerado no PC (fpdf2), na hora do envio. Usa Arial do Windows pra ter acento."""

from pathlib import Path

from fpdf import FPDF

FONTS = Path("C:/Windows/Fonts")
TITLES = {
    "pt": ("Resumo", "Experiência", "Formação", "Habilidades", "Idiomas", "atual"),
    "en": ("Summary", "Experience", "Education", "Skills", "Languages", "present"),
    "es": ("Resumen", "Experiencia", "Formación", "Habilidades", "Idiomas", "actual"),
}


def build(cv: dict, lang: str = "pt") -> bytes:
    resumo, experiencia, formacao, habilidades, idiomas, atual = TITLES.get((lang or "pt")[:2], TITLES["pt"])
    pdf = FPDF(format="A4")
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(True, 16)
    family = "Helvetica"
    if (FONTS / "arial.ttf").exists():
        pdf.add_font("Arial", "", str(FONTS / "arial.ttf"))
        pdf.add_font("Arial", "B", str(FONTS / "arialbd.ttf"))
        family = "Arial"
    pdf.add_page()
    width = pdf.epw

    def text(size, value, bold=False, color=(31, 27, 23), gap=1.5):
        pdf.set_font(family, "B" if bold else "", size)
        pdf.set_text_color(*color)
        pdf.multi_cell(width, size * 0.5, str(value), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(gap)

    def section(title):
        pdf.ln(2)
        text(11, title.upper(), bold=True, color=(154, 122, 79), gap=0.5)
        pdf.set_draw_color(221, 213, 201)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + width, pdf.get_y())
        pdf.ln(2)

    text(20, cv.get("name") or "", bold=True, gap=1)
    if cv.get("headline"):
        text(12, cv["headline"], color=(110, 102, 94))
    contact = [cv.get("email"), cv.get("phone"), "/".join(filter(None, [cv.get("city"), cv.get("state")])), *(cv.get("links") or [])]
    text(9, "  ·  ".join(filter(None, contact)), color=(110, 102, 94), gap=2)
    if cv.get("about"):
        section(resumo)
        text(10, cv["about"])
    if cv.get("experiences"):
        section(experiencia)
        for item in cv["experiences"]:
            period = " – ".join(filter(None, [item.get("start"), item.get("end") or (atual if item.get("start") else "")]))
            text(10.5, " · ".join(filter(None, [item.get("role"), item.get("company")])) + (f"   ({period})" if period else ""), bold=True, gap=0.5)
            if item.get("text"):
                text(9.5, item["text"], color=(70, 64, 58))
    if cv.get("education"):
        section(formacao)
        for item in cv["education"]:
            text(10, " · ".join(filter(None, [item.get("course"), item.get("school"), item.get("end")])))
    if cv.get("skills"):
        section(habilidades)
        text(10, "  ·  ".join(cv["skills"]))
    if cv.get("languages"):
        section(idiomas)
        text(10, "  ·  ".join(cv["languages"]))
    return bytes(pdf.output())

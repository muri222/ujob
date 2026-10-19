from email import message_from_bytes

from brain import cvpdf, mail, tasks

ORIGINAL = {
    "name": "Maria Souza", "email": "maria@x.com", "phone": "11999", "city": "São Paulo", "state": "SP", "links": ["https://artstation.com/maria"],
    "skills": ["Blender", "ZBrush", "Substance Painter"],
    "experiences": [{"role": "Artista 3D", "company": "Studio Pixel", "start": "2021", "end": "", "text": "Modelagem de personagens"}, {"role": "Freela", "company": "", "start": "2019", "end": "2021", "text": "Props"}],
    "education": [{"course": "Design de Games", "school": "Anhembi", "end": "2020"}], "languages": ["Inglês intermediário"],
}


def test_tailor_never_adds_skill_or_experience():
    kit = tasks.TailoredCv(
        headline="3D Character Artist", about="Faz personagens.",
        skills=["zbrush", "Maya", "Blender"],  # Maya não está no CV
        experiencias=[tasks.Highlight(indice=0, destaque="Personagens para mobile"), tasks.Highlight(indice=7, destaque="inventada"), tasks.Highlight(indice=0, destaque="repetida")],
    )
    cv = tasks.tailor(ORIGINAL, kit)
    assert cv["skills"] == ["ZBrush", "Blender"]
    assert [e["company"] for e in cv["experiences"]] == ["Studio Pixel"] and cv["experiences"][0]["text"] == "Personagens para mobile"
    assert cv["email"] == "maria@x.com" and cv["education"] == ORIGINAL["education"]


def test_pdf_has_accents_and_is_pdf():
    data = cvpdf.build({**ORIGINAL, "about": "Formação em ação: animação"}, "pt")
    assert data.startswith(b"%PDF") and len(data) > 2000


class FakeSMTP:
    sent = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def send_message(self, message):
        FakeSMTP.sent.append(message)


def test_mail_send_attaches_pdf(monkeypatch):
    monkeypatch.setattr(mail, "_smtp", lambda m: FakeSMTP())
    task = {"mail": {"email": "eu@gmail.com", "name": "Maria"}, "payload": {"to": "rh@studio.com", "subject": "Artista 3D", "body": "Olá", "cv": ORIGINAL, "lang": "pt"}}
    result, _ = tasks.mail_send(task)
    msg = message_from_bytes(FakeSMTP.sent[-1].as_bytes())
    files = [part.get_filename() for part in msg.walk() if part.get_filename()]
    assert msg["To"] == "rh@studio.com" and files == ["maria-souza.pdf"] and result["pdfBytes"] > 2000


def test_friendly_auth_error():
    import smtplib

    assert "senha de app" in mail.friendly(smtplib.SMTPAuthenticationError(535, b"bad"))


def test_friendly_disconnect_points_to_password():
    import smtplib

    assert "senha de app errada" in mail.friendly(smtplib.SMTPServerDisconnected("Connection unexpectedly closed"))

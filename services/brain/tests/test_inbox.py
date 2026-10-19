from email.message import EmailMessage

from brain.inbox import label_of, parse


def test_labels():
    assert label_of("Thank you for applying to Riot Games", "") == "confirmacao"
    assert label_of("Atualização da sua candidatura", "Infelizmente optamos por seguir com outros candidatos") == "rejeicao"
    assert label_of("Next steps", "We'd love to schedule a call. Book here: calendly.com/x") == "entrevista"
    assert label_of("Art test", "Please complete the art test within 5 days") == "teste"
    assert label_of("Newsletter", "Promoção de sapatos") == "outro"


def raw(sender, subject, body):
    message = EmailMessage()
    message["From"] = sender
    message["Subject"] = subject
    message["Date"] = "Mon, 19 Oct 2026 10:00:00 -0300"
    message.set_content(body)
    return message.as_bytes()


def test_parse_keeps_only_job_mail():
    assert parse(1, raw("Loja <promo@loja.com>", "Ofertas", "Compre já"), ["Studio Kota"]) is None
    found = parse(2, raw("Studio Kota <rh@kota.com>", "Sobre a vaga de Artista 3D", "Podemos marcar uma entrevista?"), ["Studio Kota"])
    assert found["label"] == "entrevista" and found["fromEmail"] == "rh@kota.com" and found["date"].startswith("2026-10-19 13:00")
    assert parse(3, raw("no-reply@us.greenhouse-mail.io", "Hi", "Hello there"), [])["label"] == "outro"

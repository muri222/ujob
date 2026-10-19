"""SMTP/IMAP do e-mail de quem instalou. Sem IA."""

import imaplib
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid


def _smtp(mail: dict) -> smtplib.SMTP:
    context = ssl.create_default_context()
    if mail["smtpPort"] == 465:
        server = smtplib.SMTP_SSL(mail["smtpHost"], 465, timeout=30, context=context)
    else:
        server = smtplib.SMTP(mail["smtpHost"], mail["smtpPort"], timeout=30)
        server.starttls(context=context)
    # um método só: o Gmail fecha a conexão depois do primeiro 535 e o smtplib, tentando o próximo método,
    # trocaria "senha recusada" por um "desconectou" que não ajuda ninguém
    server.ehlo_or_helo_if_needed()
    if "PLAIN" in server.esmtp_features.get("auth", "").upper().split():
        server.esmtp_features["auth"] = "PLAIN"
    server.login(mail["email"], mail["password"])
    return server


def friendly(error: Exception) -> str:
    text = str(error)
    if isinstance(error, smtplib.SMTPAuthenticationError) or "authentication" in text.lower() or "AUTHENTICATIONFAILED" in text:
        return "E-mail ou senha de app recusados. Confira se é uma senha de app (não a senha normal)."
    if isinstance(error, smtplib.SMTPServerDisconnected):
        return "O servidor fechou a conexão no login. Quase sempre é senha de app errada; se tiver certeza da senha, o antivírus pode estar bloqueando o envio de e-mail."
    if isinstance(error, (TimeoutError, ConnectionRefusedError, OSError)):
        return f"Não conectou no servidor ({error.__class__.__name__}). Confira servidor e porta."
    return f"Falhou: {text}"[:400]


def test(mail: dict) -> dict:
    with _smtp(mail):
        pass
    imap = False
    if mail.get("imapHost"):
        try:
            box = imaplib.IMAP4_SSL(mail["imapHost"], mail.get("imapPort") or 993, timeout=30)
            box.login(mail["email"], mail["password"])
            box.logout()
            imap = True
        except (imaplib.IMAP4.error, OSError):
            imap = False  # envio funciona sem IMAP; a leitura de respostas (inbox) fica pra depois
    return {"smtp": True, "imap": imap}


def send(mail: dict, to: str, subject: str, body: str, attachment: bytes | None = None, filename: str = "curriculo.pdf") -> str:
    message = EmailMessage()
    message["From"] = formataddr((mail.get("name") or "", mail["email"]))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=mail["email"].split("@")[1])
    message.set_content(body)
    if attachment:
        message.add_attachment(attachment, maintype="application", subtype="pdf", filename=filename)
    with _smtp(mail) as server:
        server.send_message(message)
    return message["Message-ID"]

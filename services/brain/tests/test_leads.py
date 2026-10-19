from brain import leads, site

HTML = """
<html><head><title>Cervejaria Lúpulo</title><meta name="description" content="Cervejas artesanais de Campinas">
<script type="application/ld+json">{"@type": "Organization", "name": "Lúpulo", "telephone": "+55 19 3333-4444"}</script></head>
<body><p>Fale com a gente: contato@lupulo.com.br ou (19) 99876-5432</p>
<img src="logo@2x.png"><a href="https://instagram.com/cervejarialupulo">insta</a>
<a href="https://www.instagram.com/p/abc123">post</a><a href="/trabalhe-conosco">Trabalhe conosco</a>
<a href="https://wa.me/5519998765432">zap</a><a href="https://outro.com/contato">fora</a></body></html>
"""


def test_extract_contacts_without_ai():
    found = site.extract(HTML, "https://lupulo.com.br/")
    assert found["emails"] == ["contato@lupulo.com.br"]
    assert found["phones"] == ["19998765432"]
    assert found["socials"]["instagram"] == "cervejarialupulo" and found["socials"]["whatsapp"] == "5519998765432"
    assert found["careers"] == "https://lupulo.com.br/trabalhe-conosco"
    assert found["organization"]["telephone"] == "+55 19 3333-4444"
    assert found["next"] == ["https://lupulo.com.br/trabalhe-conosco"]  # só páginas do mesmo site
    assert found["title"] == "Cervejaria Lúpulo"


def test_overpass_query_scopes_state_and_city():
    query = leads.overpass_query(['["craft"="brewery"]'], "SP", 'Campinas "x"', 20)
    assert 'area["ISO3166-2"="BR-SP"]->.s;' in query
    assert '["name"="Campinas \\"x\\""]' in query and "map_to_area->.a" in query
    assert 'nwr["craft"="brewery"](area.a);' in query and query.endswith("out center tags 20;")
    assert ".s->.a" in leads.overpass_query(['["craft"="brewery"]'], "SP", "", 5)


def test_osm_filter_whitelist_blocks_injection():
    from brain.tasks import OSM_FILTER

    assert OSM_FILTER.match('["office"="architect"]')
    assert OSM_FILTER.match('["office"="company"]["name"~"arquitet|architect",i]')
    assert not OSM_FILTER.match('["x"="1"]);out;(')
    assert not OSM_FILTER.match("office=architect")


def test_overpass_query_world_city():
    query = leads.overpass_query(['["craft"="brewery"]'], "", "Lisboa", 10, "PT", "")
    assert 'area["ISO3166-1"="PT"]["admin_level"="2"]' in query and '"name"="Lisboa"' in query



def test_social_contact_from_bio():
    assert leads._contact("Orçamentos: contato@estudio.com.br | (11) 98888-7777") == ("contato@estudio.com.br", "11988887777")
    payload = {"searches": ["estúdio de games", "game studio"], "pack": "Estúdios de games", "city": "São Paulo"}
    assert leads._queries(payload) == ["estúdio de games", "game studio"]
    places = [
        {"name": "Paulo Dybala", "bio": "adidas football", "address": ""},
        {"name": "Kota", "bio": "Game studio em São Paulo", "address": ""},
        {"name": "Pixel Lab", "bio": "Estúdio de games indie", "address": ""},
    ]
    assert [place["name"] for place in leads._relevant(places, payload)] == ["Kota", "Pixel Lab"]


def test_hashtags_from_terms():
    assert leads._hashtags({"searches": ["estúdio de games", "game dev brasil"], "pack": "x"}) == ["estudiodegames", "gamedevbrasil"]

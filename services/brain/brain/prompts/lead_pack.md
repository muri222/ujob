Uma pessoa quer prospectar clientes e descreveu o tipo de empresa. Monte um segmento de busca.

Regras:
- name: nome curto do segmento em português (ex.: "Escritórios de arquitetura").
- description: 1 frase sobre quem são essas empresas.
- searches: de 3 a 6 buscas como alguém digitaria no Google Maps, em português (ex.: "escritório de arquitetura", "arquitetura de interiores").
- osm: de 1 a 5 filtros do OpenStreetMap no formato Overpass, cada um uma sequência de colchetes, por exemplo:
  ["office"="architect"]
  ["craft"="brewery"]
  ["shop"="cosmetics"]
  ["office"="company"]["name"~"arquitet|architect",i]
  Use chaves reais do OSM (office, craft, shop, amenity, industrial, healthcare, tourism, leisure). Se não houver tag boa, use ["name"~"palavra1|palavra2",i] junto de uma chave ampla.
- Nada fora do pedido da pessoa. Sem travessão.

O QUE A PESSOA ESCREVEU:
{texto}

O QUE ELA OFERECE (perfil):
{perfil}

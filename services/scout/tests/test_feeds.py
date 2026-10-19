import json

from scrapy.http import TextResponse

from ujob_scout.sources.apify import LinkedIn, place
from ujob_scout.sources.ats import WorkableSearch


class Spider:
    def failed(self, failure):
        pass


def response(body, meta=None):
    from scrapy import Request

    return TextResponse("https://x.test", body=json.dumps(body).encode(), encoding="utf-8", request=Request("https://x.test", meta=meta or {}))


def test_workable_search_parses_brazil_job():
    source = WorkableSearch(Spider(), {"id": "s1", "name": "Workable", "config": {}})
    item = {"url": "https://jobs.workable.com/view/1", "title": "Video Editor", "company": {"title": "Studio"}, "workplace": "remote", "location": {"city": "", "countryName": "Brazil"}}
    [job] = list(source.parse(response({"jobs": [item]}, {"term": "video editor"})))
    assert (job.title, job.company, job.workplace, job.country) == ("Video Editor", "Studio", "remoto", "Brasil")


def test_linkedin_place_and_parse():
    assert place("Porto Alegre, Rio Grande do Sul, Brazil") == {"city": "Porto Alegre", "state": "RS", "country": ""}
    source = LinkedIn(Spider(), {"id": "s2", "kind": "apify_linkedin", "name": "LinkedIn", "config": {}})
    item = {"url": "https://br.linkedin.com/jobs/view/1?x=1", "title": "Artista 3D", "companyName": "Kota", "location": "São Paulo, São Paulo, Brazil", "experienceLevel": "Mid-Senior level"}
    [job] = list(source.parse(response([item])))
    assert (job.url, job.state, job.seniority) == ("https://br.linkedin.com/jobs/view/1", "SP", "senior")

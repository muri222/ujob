import json

from scrapy.http import TextResponse

from ujob_scout.sources.artstation import ArtStation


class Spider:
    failed = None


def response(url, body):
    return TextResponse(url=url, body=body.encode(), encoding="utf-8")


def source():
    return ArtStation(Spider(), {"id": "s" * 15, "name": "ArtStation Jobs", "group": "remoto", "config": {"max": 2}})


def test_sitemap_respects_max():
    xml = "".join(f"<url><loc>https://www.artstation.com/jobs/A{i}</loc></url>" for i in range(5))
    requests = list(source().parse_sitemap(response("https://x/sitemap.xml", xml)))
    assert [r.url for r in requests] == [f"https://www.artstation.com/api/v2/jobs/public/jobs/A{i}.json" for i in range(2)]


def test_job_abroad_and_brazil():
    item = {
        "hash_id": "V6lo", "job_state": "approved", "deleted_at": None, "title": "VFX Artist II", "company_name": "Respawn",
        "level": "middle", "job_type": "contract", "work_remotely": False, "apply_link": "https://jobs.ea.com/x",
        "salary_range": {"min_salary": 92900, "max_salary": 129200, "currency": "CAD", "period": "year"},
        "classifications": [{"name": "Houdini"}],
        "recruitment_localities": [{"locality": {"country_code": "CA", "country_name": "Canada", "subdivision_1_code": "BC", "city_name": "Vancouver"}}],
    }
    job = next(source().parse_job(response("https://x/V6lo.json", json.dumps(item))))
    assert (job.country, job.state, job.salary_currency, job.salary_period, job.seniority, job.contract) == ("Canada", "", "CAD", "ano", "pleno", "pj")
    item["recruitment_localities"] = [{"locality": {"country_code": "BR", "country_name": "Brazil", "subdivision_1_code": "SP", "city_name": "São Paulo"}}]
    job = next(source().parse_job(response("https://x/V6lo.json", json.dumps(item))))
    assert (job.country, job.state) == ("", "SP")
    item["job_state"] = "draft"
    assert list(source().parse_job(response("https://x/V6lo.json", json.dumps(item)))) == []

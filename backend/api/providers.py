import json
from datetime import date

from django.conf import settings
import requests


class ProviderError(Exception):
    pass


class ProviderConfigurationError(ProviderError):
    pass


class ProviderUnavailable(ProviderError):
    pass


class ProviderQuotaExceeded(ProviderError):
    pass


class ApiFootballProvider:
    BASE_URL = "https://v3.football.api-sports.io/"
    TIMEOUT = (3.05, 10)
    MAX_RETRIES = 2
    MAX_PAGES = 25
    MAX_RESPONSE_BYTES = 2 * 1024 * 1024
    ENDPOINTS = frozenset({"fixtures", "fixtures/headtohead", "leagues", "standings", "odds", "odds/bookmakers", "odds/live"})

    def __init__(self, *, session=None):
        self._key = settings.API_FOOTBALL_KEY
        if not self._key or self._key.startswith("replace-"):
            raise ProviderConfigurationError("Server-only API-Football credentials are not configured.")
        self._session = session if session is not None else requests.Session()
        self._session.trust_env = False

    def close(self):
        self._session.close()

    @staticmethod
    def _validate(filters, allowed):
        if set(filters) - set(allowed):
            raise ProviderError("Unsupported provider filter.")
        params = {}
        for name, value in filters.items():
            if value is None:
                continue
            if name in {"league", "season", "team", "last", "next", "id", "bookmaker", "bet", "page"}:
                if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 10**12:
                    raise ProviderError("Invalid numeric provider filter.")
            elif name == "current":
                if not isinstance(value, bool):
                    raise ProviderError("Invalid current-season filter.")
                value = "true" if value else "false"
            elif not isinstance(value, str) or not value.strip() or len(value) > 200:
                raise ProviderError("Invalid text provider filter.")
            if name in {"date", "from", "to"}:
                try:
                    if date.fromisoformat(value).isoformat() != value:
                        raise ValueError
                except (ValueError, TypeError):
                    raise ProviderError("Provider dates must use YYYY-MM-DD.") from None
            params[name] = value
        if "from" in params and "to" in params and params["from"] > params["to"]:
            raise ProviderError("Invalid provider date range.")
        return params

    def _page(self, endpoint, params):
        if endpoint not in self.ENDPOINTS:
            raise ProviderError("Unsupported provider endpoint.")
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                response = self._session.get(
                    self.BASE_URL + endpoint, params=params,
                    headers={"x-apisports-key": self._key, "Accept": "application/json"},
                    timeout=self.TIMEOUT, allow_redirects=False, stream=True,
                )
                try:
                    if response.status_code == 429:
                        raise ProviderQuotaExceeded("Provider request quota reached.")
                    if 500 <= response.status_code < 600 and attempt < self.MAX_RETRIES:
                        continue
                    if response.status_code != 200:
                        raise ProviderUnavailable("Provider request was unsuccessful.")
                    chunks = []
                    size = 0
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        size += len(chunk)
                        if size > self.MAX_RESPONSE_BYTES:
                            raise ProviderError("Provider response exceeds the allowed size.")
                        chunks.append(chunk)
                    try:
                        payload = json.loads(b"".join(chunks))
                    except (ValueError, UnicodeError):
                        raise ProviderError("Provider response is not valid JSON.") from None
                    if not isinstance(payload, dict) or not isinstance(payload.get("response"), list):
                        raise ProviderError("Provider returned an invalid payload.")
                    if payload.get("errors"):
                        raise ProviderError("Provider reported a request error.")
                    return payload
                finally:
                    response.close()
            except (requests.Timeout, requests.ConnectionError):
                if attempt == self.MAX_RETRIES:
                    raise ProviderUnavailable("Provider connection unavailable.") from None
            except requests.RequestException:
                raise ProviderUnavailable("Provider connection unavailable.") from None
        raise ProviderUnavailable("Provider connection unavailable.")

    def _all_pages(self, endpoint, params):
        entries = []
        total = 1
        page = 1
        while page <= total:
            payload = self._page(endpoint, {**params, "page": page})
            paging = payload.get("paging", {"current": page, "total": 1})
            if not isinstance(paging, dict):
                raise ProviderError("Provider pagination is invalid.")
            reported_total = paging.get("total", 1)
            current = paging.get("current", page)
            if (isinstance(reported_total, bool) or not isinstance(reported_total, int)
                    or not 1 <= reported_total <= self.MAX_PAGES or current != page):
                raise ProviderError("Provider pagination is invalid or exceeds the limit.")
            if page > 1 and reported_total != total:
                raise ProviderError("Provider pagination changed during retrieval.")
            total = reported_total
            entries.extend(payload["response"])
            page += 1
        return {"response": entries, "results": len(entries), "errors": [], "paging": {"current": total, "total": total}}

    def fixtures(self, **filters):
        params = self._validate(filters, {"date", "from", "to", "league", "season", "team", "last", "next", "live"})
        return self._all_pages("fixtures", params)

    def head_to_head(self, first_team_id, second_team_id, **filters):
        team_ids = self._validate({"team": first_team_id}, {"team"})
        other = self._validate({"team": second_team_id}, {"team"})
        params = self._validate(filters, {"date", "from", "to", "league", "season", "last", "next"})
        return self._all_pages("fixtures/headtohead", {**params, "h2h": f"{team_ids['team']}-{other['team']}"})

    def leagues(self, **filters):
        params = self._validate(filters, {"id", "name", "country", "code", "season", "team", "type", "current", "search"})
        return self._all_pages("leagues", params)

    def standings(self, *, season, league=None, team=None):
        params = self._validate({"season": season, "league": league, "team": team}, {"season", "league", "team"})
        if league is None and team is None:
            raise ProviderError("Standings require a league or team.")
        return self._all_pages("standings", params)

    def odds(self, **filters):
        params = self._validate(filters, {"date", "league", "season", "bookmaker", "bet"})
        return self._all_pages("odds", params)

    def odds_by_fixture(self, fixture_id):
        params = self._validate({"id": fixture_id}, {"id"})
        return self._all_pages("odds", {"fixture": params["id"]})

    def bookmakers(self):
        return self._all_pages("odds/bookmakers", {})

    def live_odds(self):
        return self._all_pages("odds/live", {})
import json
from unittest.mock import Mock

from django.test import SimpleTestCase, override_settings
import requests

from api.providers import ApiFootballProvider, ProviderConfigurationError, ProviderError, ProviderQuotaExceeded, ProviderUnavailable


def response(entries=None, *, page=1, total=1, status=200, errors=None):
    result = requests.Response()
    result.status_code = status
    result._content = json.dumps({"response": entries or [], "paging": {"current": page, "total": total}, "errors": errors or []}).encode()
    result._content_consumed = True
    return result


@override_settings(API_FOOTBALL_KEY="synthetic-backend-test-key")
class ProviderTests(SimpleTestCase):
    def setUp(self):
        self.session = Mock()
        self.session.get.return_value = response()
        self.provider = ApiFootballProvider(session=self.session)

    def test_every_existing_endpoint_and_helper(self):
        cases = [
            (lambda: self.provider.fixtures(date="2026-10-18"), "fixtures", {"date": "2026-10-18"}),
            (lambda: self.provider.fixtures(**{"from": "2026-10-18", "to": "2026-10-19"}), "fixtures", {"from": "2026-10-18", "to": "2026-10-19"}),
            (lambda: self.provider.fixtures(league=39, season=2026, team=1, last=5), "fixtures", {"league": 39, "season": 2026, "team": 1, "last": 5}),
            (lambda: self.provider.head_to_head(1, 2, last=5), "fixtures/headtohead", {"h2h": "1-2", "last": 5}),
            (lambda: self.provider.leagues(current=True, type="League"), "leagues", {"current": "true", "type": "League"}),
            (lambda: self.provider.standings(league=39, season=2026), "standings", {"league": 39, "season": 2026}),
            (lambda: self.provider.standings(team=1, season=2026), "standings", {"team": 1, "season": 2026}),
            (lambda: self.provider.odds(date="2026-10-18"), "odds", {"date": "2026-10-18"}),
            (lambda: self.provider.odds(league=39, season=2026), "odds", {"league": 39, "season": 2026}),
            (lambda: self.provider.odds_by_fixture(123), "odds", {"fixture": 123}),
            (lambda: self.provider.bookmakers(), "odds/bookmakers", {}),
            (lambda: self.provider.live_odds(), "odds/live", {}),
        ]
        for call, endpoint, params in cases:
            with self.subTest(endpoint=endpoint, filters=list(params)):
                self.session.get.return_value = response()
                call()
                args, kwargs = self.session.get.call_args
                self.assertEqual(args[0], "https://v3.football.api-sports.io/" + endpoint)
                self.assertEqual(kwargs["params"], {**params, "page": 1})
                self.assertEqual(kwargs["timeout"], (3.05, 10))
                self.assertFalse(kwargs["allow_redirects"])
                self.assertTrue(kwargs["stream"])
                self.assertEqual(kwargs["headers"]["x-apisports-key"], "synthetic-backend-test-key")
                self.assertNotIn("x-apisports-key", kwargs["params"])
        self.assertFalse(self.session.trust_env)

    def test_collects_all_pages(self):
        self.session.get.side_effect = [response([{"id": 1}], total=2), response([{"id": 2}], page=2, total=2)]
        self.assertEqual(self.provider.odds(date="2026-10-18")["response"], [{"id": 1}, {"id": 2}])
        self.assertEqual(self.session.get.call_count, 2)

    def test_rejects_excessive_or_inconsistent_pagination(self):
        self.session.get.return_value = response(total=26)
        with self.assertRaises(ProviderError):
            self.provider.bookmakers()
        self.assertEqual(self.session.get.call_count, 1)
        self.session.get.side_effect = [response(total=2), response(page=2, total=3)]
        with self.assertRaises(ProviderError):
            self.provider.bookmakers()

    def test_transport_retries_are_bounded_and_errors_sanitized(self):
        self.session.get.side_effect = requests.Timeout("synthetic-backend-test-key private request details")
        with self.assertRaises(ProviderUnavailable) as caught:
            self.provider.fixtures(league=39, season=2026)
        self.assertEqual(self.session.get.call_count, 3)
        self.assertNotIn("synthetic-backend-test-key", str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__)

    def test_server_errors_retry_but_quota_and_redirects_do_not(self):
        self.session.get.side_effect = [response(status=503), response(status=503), response([{"id": 1}])]
        self.assertEqual(self.provider.bookmakers()["results"], 1)
        self.session.get.reset_mock(side_effect=True)
        self.session.get.return_value = response(status=429)
        with self.assertRaises(ProviderQuotaExceeded):
            self.provider.bookmakers()
        self.assertEqual(self.session.get.call_count, 1)
        self.session.get.return_value = response(status=302)
        with self.assertRaises(ProviderUnavailable):
            self.provider.bookmakers()

    def test_provider_error_payload_is_not_reproduced(self):
        self.session.get.return_value = response(errors={"token": "synthetic-backend-test-key"})
        with self.assertRaises(ProviderError) as caught:
            self.provider.bookmakers()
        self.assertNotIn("synthetic-backend-test-key", str(caught.exception))

    def test_invalid_filters_never_make_a_request(self):
        for filters in [{"api_key": "client-value"}, {"url": "https://other.invalid"}, {"league": True}, {"date": "bad"}, {"from": "2026-11-01", "to": "2026-10-01"}]:
            with self.subTest(names=list(filters)), self.assertRaises(ProviderError):
                self.provider.fixtures(**filters)
        self.session.get.assert_not_called()

    def test_invalid_json_and_oversize_responses_are_rejected(self):
        malformed = response()
        malformed._content = b"not JSON"
        self.session.get.return_value = malformed
        with self.assertRaises(ProviderError):
            self.provider.bookmakers()
        large = response()
        large._content = b"x" * (self.provider.MAX_RESPONSE_BYTES + 1)
        self.session.get.return_value = large
        with self.assertRaises(ProviderError):
            self.provider.bookmakers()

    @override_settings(API_FOOTBALL_KEY="", REACT_APP_API_KEY="frontend-value", X_API_SPORTS_KEY="frontend-value")
    def test_no_fallback_to_frontend_credentials(self):
        with self.assertRaises(ProviderConfigurationError):
            ApiFootballProvider(session=self.session)
        self.session.get.assert_not_called()
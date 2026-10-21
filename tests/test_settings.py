"""Fast API validation tests: python -m unittest discover -s tests."""
import unittest
import json

from main import app, validate_settings


class ExportValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_defaults_and_custom_width(self):
        _, settings = validate_settings({"markdown": "你好 $x^2$", "settings": {"width": 148, "mode": "single"}})
        self.assertEqual(settings["width"], 148)
        self.assertEqual(settings["mode"], "single")

    def test_invalid_settings(self):
        invalid = [None, [], {}, {"markdown": " "}, {"markdown": 42},
                   {"markdown": "x", "settings": []}]
        invalid += [{"markdown": "x", "settings": settings} for settings in [
            {"width": 0}, {"width": "abc"}, {"width": float("nan")},
            {"height": True}, {"mode": "infinite"}, {"theme": "unknown"},
            {"width": 80, "margin": 40}, {"fontSize": 99},
        ]]
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post('/api/export', data=json.dumps(payload), content_type='application/json').status_code, 400)

    def test_cross_origin_and_non_json_are_rejected(self):
        self.assertEqual(self.client.post('/api/export', json={"markdown": "x"}, headers={"Origin": "https://unrelated.example"}).status_code, 403)
        self.assertEqual(self.client.post('/api/export', data='markdown=x').status_code, 415)
        self.assertEqual(self.client.get('/', headers={"Host": "unrelated.example"}).status_code, 403)

    def test_error_language_follows_each_request(self):
        for language, expected in [("en-US", "Write something before exporting a PDF."), ("zh-CN", "先写一点内容，再导出 PDF。"), ("en-GB", "Write something before exporting a PDF.")]:
            response = self.client.post('/api/export', json={"markdown": ""}, headers={"Accept-Language": language})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json['code'], 'errorEmpty')
            self.assertEqual(response.json['error'], expected)
        response = self.client.post('/api/export', json={"markdown": "x", "settings": {"width": 10}}, headers={"Accept-Language": "en"})
        self.assertEqual(response.json['params'], {"key": "width", "low": 80, "high": 420})
        self.assertEqual(response.headers['Content-Language'], 'en')


if __name__ == '__main__':
    unittest.main()

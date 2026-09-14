"""Acceptance gates keep incomplete or changed GUI captures out of final media."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('local_demo_video', Path(__file__).with_name('build-local-demo-video.py'))
video = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(video)


class CaptureAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name)
        (self.output / 'raw').mkdir()
        (self.output / 'frames').mkdir()
        (self.output / 'raw/device.mp4').write_bytes(b'original captured media')
        (self.output / 'frames/device.png').write_bytes(b'original still')
        self.scenes = [{'id': 'device', 'kind': 'gui'}]
        self.evidence = {
            'completedAt': '2026-09-11T00:00:00Z', 'validateOnly': False,
            'checks': [{'name': 'recorded device registration', 'passed': True}],
            'blockedRequests': [], 'pageErrors': [], 'consoleErrors': [],
            'server': {'backend': False, 'wallet': False},
            'scenes': [{'name': 'device', 'file': 'raw/device.mp4', 'screenshot': 'frames/device.png',
                        'sha256': video.media.sha256(self.output / 'raw/device.mp4'), 'capturedFrames': 30,
                        'screenshotSha256': video.media.sha256(self.output / 'frames/device.png')}],
        }

    def tearDown(self):
        self.temp.cleanup()

    def validate(self):
        (self.output / 'capture-evidence.json').write_text(json.dumps(self.evidence))
        return video.validate_capture(self.output, self.scenes)

    def test_accepts_completed_unchanged_capture(self):
        self.assertEqual(self.validate()['scenes'][0]['name'], 'device')

    def test_rejects_failed_or_incomplete_capture(self):
        self.evidence.pop('completedAt')
        with self.assertRaisesRegex(ValueError, 'completed'):
            self.validate()

    def test_rejects_external_request_even_if_render_files_exist(self):
        self.evidence['blockedRequests'] = [{'url': 'https://example.invalid/api'}]
        with self.assertRaisesRegex(ValueError, 'blockedRequests'):
            self.validate()

    def test_rejects_changed_recording(self):
        (self.output / 'raw/device.mp4').write_bytes(b'replaced recording')
        with self.assertRaisesRegex(ValueError, 'hash/path mismatch'):
            self.validate()

    def test_rejects_validation_only(self):
        self.evidence['validateOnly'] = True
        with self.assertRaisesRegex(ValueError, 'completed'):
            self.validate()

    def test_rejects_modified_screenshot(self):
        (self.output / 'frames/device.png').write_bytes(b'replaced still')
        with self.assertRaisesRegex(ValueError, 'screenshot hash'):
            self.validate()

    def test_rejects_failed_uc_check(self):
        self.evidence['checks'][0]['passed'] = False
        with self.assertRaisesRegex(ValueError, 'checks must pass'):
            self.validate()


class CaptionLayoutTests(unittest.TestCase):
    def test_balances_long_sentence_without_orphan_syllable(self):
        text = '第三者画面では、日付、時間ごとの判定、適用条件と公開証拠の項目を確認します。'
        lines = video.balanced_japanese_lines(text)
        self.assertEqual(''.join(lines), text)
        self.assertTrue(all(8 <= len(line) <= 36 for line in lines))
        self.assertTrue(all(line[0] not in '、。！？' for line in lines))


if __name__ == '__main__':
    unittest.main()

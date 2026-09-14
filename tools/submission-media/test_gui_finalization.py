"""Evidence and editing regressions; these tests never contact Midnight."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('gui_media', Path(__file__).with_name('build-gui-finalization.py'))
gui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gui)


class FinalizationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='gui-media-test-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        (self.base / 'fixture.mp4').write_bytes(b'NOT REAL FOOTAGE; PROBE IS STUBBED')
        (self.base / 'verification.json').write_text('{"fixture": true}')
        self.manifest = json.loads(gui.EXAMPLE.read_text())
        evidence = self.manifest['evidence']
        evidence.update(deviceId='fixture-device', periodDate='2026-09-09', policyId='fixture-policy',
                        contractAddress='a' * 64, proofJobId='fixture-job', transactionHash='b' * 64,
                        transactionStatus='confirmed', reviewer='AUTOMATED TEST FIXTURE')
        evidence['publicVerification'] = {'checkedAt': '2026-09-10T04:00:00+09:00', 'verified': True, 'reference': 'verification.json'}
        for shot_id, shot in self.manifest['shots'].items():
            for field in list(shot):
                if field in evidence:
                    shot[field] = evidence[field]
            shot.update(file='fixture.mp4', **{'in': 2, 'out': 26, 'stillAt': 20},
                        recordedAt='2026-09-10T03:00:00+09:00', reviewed=True, containsNoSecrets=True)
            if shot_id == 'G05':
                shot['publicVerificationVisible'] = True

    @staticmethod
    def probe(_file):
        return {'format': {'duration': '30'}, 'streams': [{'codec_type': 'video', 'width': 1920, 'height': 1080}]}

    def validate(self, manifest=None, mode='final'):
        return gui.validate_manifest(manifest or self.manifest, self.base, mode, probe=self.probe)

    def test_empty_preview_has_no_recorded_evidence(self):
        self.assertEqual(self.validate(json.loads(gui.EXAMPLE.read_text()), 'preview'), {})

    def test_empty_final_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Final output requires evidence.deviceId'):
            self.validate(json.loads(gui.EXAMPLE.read_text()))

    def test_reviewed_matching_cut_retains_original_timing(self):
        shots = self.validate()
        self.assertEqual(len(shots), 5)
        self.assertEqual((shots['verify']['in'], shots['verify']['out'], shots['verify']['stillAt']), (2, 26, 20))

    def test_real_ffprobe_identifies_the_video_stream(self):
        video = self.base / 'probe.mp4'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=s=1280x720:r=1',
                        '-frames:v', '1', '-c:v', 'libx264', '-preset', 'ultrafast', str(video)], check=True)
        self.assertEqual(gui.media.probe(video)['streams'][0]['codec_type'], 'video')

    def test_different_job_cannot_be_spliced_as_confirmation(self):
        self.manifest['shots']['G04']['proofJobId'] = 'another-job'
        with self.assertRaisesRegex(ValueError, 'G04: proofJobId does not match'):
            self.validate()

    def test_different_transaction_cannot_be_used_in_verifier(self):
        self.manifest['shots']['G05']['transactionHash'] = 'c' * 64
        with self.assertRaisesRegex(ValueError, 'G05: transactionHash does not match'):
            self.validate()

    def test_pending_is_not_confirmed_evidence(self):
        self.manifest['evidence']['transactionStatus'] = 'pending'
        with self.assertRaisesRegex(ValueError, 'requires confirmed'):
            self.validate()

    def test_unreviewed_or_sensitive_footage_is_rejected_in_both_modes(self):
        for field in ['reviewed', 'containsNoSecrets']:
            for mode in ['preview', 'final']:
                manifest = copy.deepcopy(self.manifest)
                manifest['shots']['G01'][field] = False
                with self.subTest(field=field, mode=mode), self.assertRaisesRegex(ValueError, 'review the footage'):
                    self.validate(manifest, mode)

    def test_deck_still_must_come_from_the_video_cut(self):
        self.manifest['shots']['G02']['stillAt'] = 28
        with self.assertRaisesRegex(ValueError, 'still must come from the selected video cut'):
            self.validate()

    def test_cut_must_fit_source_recording(self):
        self.manifest['shots']['G02']['out'] = 31
        with self.assertRaisesRegex(ValueError, 'cut lies outside'):
            self.validate()

    def test_older_confirmation_cannot_stand_in_for_new_request(self):
        self.manifest['shots']['G04']['recordedAt'] = '2026-09-09T03:00:00+09:00'
        with self.assertRaisesRegex(ValueError, 'predates the request'):
            self.validate()

    def test_missing_review_report_is_rejected(self):
        (self.base / 'verification.json').unlink()
        with self.assertRaisesRegex(ValueError, 'report file is missing'):
            self.validate()

    def test_narration_source_cannot_silently_change_to_field_data(self):
        self.manifest['measurementSource'] = 'field-device'
        with self.assertRaisesRegex(ValueError, 'browser-synthetic'):
            self.validate()


if __name__ == '__main__':
    unittest.main()

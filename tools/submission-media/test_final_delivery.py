"""Verify that packaging cannot sweep private files into the review archive."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('delivery', Path(__file__).with_name('build-final-delivery.py'))
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / 'review.pdf').write_bytes(b'reviewed fixture')
        (self.root / '.env').write_text('PRIVATE FIXTURE MUST NOT BE PACKAGED')
        self.members = [('review.pdf', 'preview/review.pdf', 'preview')]
        self.output = self.root / 'output'

    def build(self):
        return delivery.build_package(self.root, self.members, self.output, 'test-revision', True)

    def test_only_selected_artifacts_are_packaged_and_hashed(self):
        result = self.build()
        with zipfile.ZipFile(self.output / delivery.ARCHIVE) as archive:
            self.assertEqual(set(archive.namelist()), {'preview/review.pdf', 'README.md', 'manifest.json', 'SHA256SUMS'})
            self.assertNotIn(b'PRIVATE FIXTURE', b''.join(archive.read(name) for name in archive.namelist()))
            self.assertIn('G01–G05', archive.read('README.md').decode())
            with archive.open('preview/review.pdf') as stream:
                self.assertEqual(delivery.sha256(stream), result['files'][0]['sha256'])

    def test_missing_artifact_does_not_produce_partial_package(self):
        (self.root / 'review.pdf').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required artifact'):
            self.build()
        self.assertFalse(self.output.exists())

    def test_symlink_cannot_replace_reviewed_media(self):
        (self.root / 'review.pdf').unlink()
        (self.root / 'review.pdf').symlink_to(self.root / '.env')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            self.build()

    def test_path_traversal_is_rejected(self):
        for members in [[('../private.pdf', 'preview/review.pdf', 'preview')],
                        [('review.pdf', '../review.pdf', 'preview')]]:
            self.members = members
            with self.subTest(members=members), self.assertRaisesRegex(ValueError, 'Unsafe'):
                self.build()


if __name__ == '__main__':
    unittest.main()

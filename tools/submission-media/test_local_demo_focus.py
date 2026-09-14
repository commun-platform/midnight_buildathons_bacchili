"""Verify that focus edits cannot silently point outside their scene or canvas."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('local_demo_focus', Path(__file__).with_name('build-local-demo-focus.py'))
focus = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(focus)


class FocusTimelineTests(unittest.TestCase):
    def setUp(self):
        self.edit = {'scenes': [{'id': 'device', 'start': 37, 'duration': 10, 'narration': 'Walletで認証し、取引を承認します。'}]}
        self.plan = {'scenes': {'device': [{'start': 1, 'end': 4, 'rect': [300, 250, 600, 200],
            'label': 'Walletで認証', 'phrase': 'Walletで認証', 'space': 'canvas'}]}}

    def test_scene_relative_times_become_absolute_and_preview_offsets_are_removed(self):
        cues = focus.validate_plan(self.plan, self.edit)
        self.assertEqual((cues[0]['start'], cues[0]['end']), (38, 41))
        with tempfile.TemporaryDirectory() as folder:
            script = Path(folder) / 'preview.ass'
            focus.write_annotations(script, cues, offset=37)
            events = [line for line in script.read_text().splitlines() if line.startswith('Dialogue:')]
        self.assertTrue(events)
        self.assertTrue(all(',0:00:01.00,0:00:04.00,' in line for line in events))

    def test_projects_browser_coordinates_into_letterboxed_video(self):
        x, y, w, h = focus.project_rect([0, 0, 1920, 1080], 'viewport')
        self.assertAlmostEqual(x, 236.4444444444)
        self.assertEqual(y, 132)
        self.assertAlmostEqual(w + 2 * x, 1920)
        self.assertEqual(h, 814)

    def test_rejects_overlapping_focus_and_out_of_scene_timing(self):
        second = copy.deepcopy(self.plan['scenes']['device'][0])
        second.update(start=3, end=5)
        self.plan['scenes']['device'].append(second)
        with self.assertRaisesRegex(ValueError, 'timing overlaps'):
            focus.validate_plan(self.plan, self.edit)
        second.update(start=4, end=11)
        with self.assertRaisesRegex(ValueError, 'leaves its scene'):
            focus.validate_plan(self.plan, self.edit)

    def test_rejects_target_over_subtitles_or_outside_canvas(self):
        for rect in [[300, 920, 600, 100], [1800, 300, 200, 100], [300, 100, 600, 100]]:
            self.plan['scenes']['device'][0]['rect'] = rect
            with self.assertRaisesRegex(ValueError, 'content area'):
                focus.validate_plan(self.plan, self.edit)

    def test_rejects_unrelated_phrase_and_ass_commands_in_labels(self):
        cue = self.plan['scenes']['device'][0]
        cue['phrase'] = 'unrelated commentary'
        with self.assertRaisesRegex(ValueError, 'absent from narration'):
            focus.validate_plan(self.plan, self.edit)
        cue.update(phrase='Walletで認証', label=r'{\pos(0,0)}')
        with self.assertRaisesRegex(ValueError, 'Invalid focus label'):
            focus.validate_plan(self.plan, self.edit)

    def test_rejects_missing_scene_and_nonfinite_time(self):
        self.plan['scenes']['device'][0]['start'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Non-finite'):
            focus.validate_plan(self.plan, self.edit)
        self.plan['scenes'].clear()
        with self.assertRaisesRegex(ValueError, 'Every narrative scene'):
            focus.validate_plan(self.plan, self.edit)


if __name__ == '__main__':
    unittest.main()

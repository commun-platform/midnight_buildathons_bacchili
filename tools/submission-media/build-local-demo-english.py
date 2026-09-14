#!/usr/bin/env python3
"""Render the English edition from its own recorded GUI and timed English speech."""
import argparse
import concurrent.futures
import copy
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import textwrap

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
spec = importlib.util.spec_from_file_location('english_motion', HERE / 'build-local-demo-presentation.py')
motion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(motion)
media, run, sha256 = motion.media, motion.run, motion.sha256
speech = motion.module('english_pronunciation', 'local-demo-speech.py')
CONTENT = HERE / 'local-demo-english.json'
TEXT = json.loads(CONTENT.read_text())
SPEECH_RATE = .96
# English Operations reaches its chart sooner. These holds were reviewed against
# the English recording, including the health view before its first scroll.
motion.CAMERAS['operations'] = [(.3, 2.05, [20, 310, 1270, 715]),
    (3.7, 6.1, [500, 75, 1380, 776]), (13, 17.6, [471, 202, 978, 550]),
    (17.8, 21.5, [470, 385, 978, 550])]


def normalize(value):
    return ' '.join(value.split())


def caption_lines(value, width=88):
    value = normalize(value)
    greedy = textwrap.wrap(value, width=width, break_long_words=False, break_on_hyphens=False)
    if len(greedy) < 2:
        return greedy
    # Preserve the minimum line count, then balance lengths to avoid an orphan word.
    options = [textwrap.wrap(value, width=w, break_long_words=False, break_on_hyphens=False)
               for w in range(max(1, math.ceil(len(value) / len(greedy))), width + 1)]
    return min((lines for lines in options if len(lines) == len(greedy)),
               key=lambda lines: max(map(len, lines)) - min(map(len, lines)))


def measure(value, size):
    # Conservative Latin width estimate. Full-resolution previews are reviewed too.
    return sum(.29 if c in " il.,:;'!" else .9 if c in 'MW@%' else .58 for c in value) * size


class EnglishCanvas(motion.Canvas):
    def __init__(self, duration, sid, original_duration):
        super().__init__(duration, sid in ['problem', 'verify', 'boundary'])
        self.sid = sid
        self.time_scale = duration / original_duration if sid not in motion.GUI else 1
        self.card_width = None
        self.layout_checks = []

    def event(self, start, end, layer, tags, payload):
        # Shapes follow the shorter English slide; speech cues already use final time.
        if layer < 20:
            start *= self.time_scale
            if end is not None:
                end *= self.time_scale
        super().event(start, end, layer, tags, payload)

    def card(self, x, y, w, h, tag, title, body, start=0, fill=None):
        self.card_width = w - 56
        super().card(x, y, w, h, tag, title, body, start, fill)
        self.card_width = None

    def text(self, value, x, y, size=36, fill=None, start=0, end=None, bold=False, layer=6, move=True, align=7):
        value = TEXT['translations'].get(value, value).replace('＋', '+')
        if re.search(r'[\u3040-\u30ff\u3400-\u9fff]', value):
            raise ValueError(f'Untranslated graphic: {self.sid}: {value}')
        width = self.card_width or 1840 - x
        if not self.card_width:
            if self.sid in motion.GUI and x < 520 and 260 < y < 920:
                width = (190 - x) if self.sid == 'scenarios' and x == 95 else 520 - x
            elif self.sid == 'value' and 260 < y < 920:
                width = 1190 - x if x < 1200 else 1810 - x
            elif self.sid in ['scope', 'wallet'] and 430 < y < 720:
                width = 278
            elif self.sid == 'problem' and x == 868:
                width = 224
            elif self.sid == 'architecture' and x == 464:
                width = 110
        width = max(70, width)
        original_size = size
        largest = max(measure(line, size) for line in value.split('\n'))
        if largest > width:
            size = max(16, math.floor(size * width / largest))
        self.layout_checks.append({'text': value, 'x': x, 'y': y, 'width': width, 'fontSize': size, 'originalSize': original_size})
        super().text(value, x, y, size, fill, start, end, bold, layer, move, align)


def spoken_scene(scene, output, duration, work):
    """Keep words intact and give the viewer short pauses between spoken sentences."""
    sid = scene['id']
    base = output / 'narration' / sid
    audio = base.with_suffix('.mp3')
    cache = json.loads(base.with_suffix('.json').read_text())
    if cache != speech.cache_spec(scene['narration'], TEXT['voice']):
        raise ValueError(f'Speech cache differs: {sid}')
    raw = media.read_captions(base.with_suffix('.srt'))
    if normalize(' '.join(t for s, e, t in raw)) != normalize(scene['narration']):
        raise ValueError(f'Speech subtitle text differs: {sid}')
    length = media.duration(audio)
    # Sentence pauses retain the natural voice speed while allowing GUI reading time.
    gap = min(1.3, max(0, (duration - length / SPEECH_RATE - .9) / max(1, len(raw) - 1))) if sid in motion.GUI else 0
    cues, filters, pieces = [], [], []
    split = ''.join(f'[s{i}]' for i in range(len(raw)))
    filters.append(f'[0:a]asplit={len(raw)}{split}')
    for i, (start, end, words) in enumerate(raw):
        end = min(end, raw[i + 1][0]) if i + 1 < len(raw) else min(end, length)
        if not 0 <= start < end <= length + .05:
            raise ValueError(f'Invalid speech interval: {sid}')
        lines = caption_lines(words)
        groups = ['\n'.join(lines[j:j + 2]) for j in range(0, len(lines), 2)]
        cursor = start / SPEECH_RATE + i * gap
        chars = sum(len(g) for g in groups)
        for j, group in enumerate(groups):
            until = end / SPEECH_RATE + i * gap if j == len(groups) - 1 else cursor + (end - start) / SPEECH_RATE * len(group) / chars
            cues.append((cursor, until, group))
            cursor = until
        a = 0 if i == 0 else start
        b = raw[i + 1][0] if i + 1 < len(raw) else length
        tail = f',apad=pad_dur={gap}' if i + 1 < len(raw) else ''
        filters.append(f'[s{i}]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,atempo={SPEECH_RATE}{tail}[p{i}]')
        pieces.append(f'[p{i}]')
    filters.append(''.join(pieces) + f'concat=n={len(raw)}:v=0:a=1,loudnorm=I=-17:TP=-1.5:LRA=8,aresample=48000,apad,atrim=duration={duration}[a]')
    graph = work / f'{sid}-audio.ffmpeg.txt'
    graph.write_text(';'.join(filters))
    rendered = work / f'{sid}.wav'
    run(['ffmpeg', '-v', 'error', '-y', '-i', audio, '-filter_complex_script', graph, '-map', '[a]', '-ar', '48000', '-ac', '1', rendered])
    if normalize(' '.join(t for s, e, t in cues)) != normalize(scene['narration']) or cues[-1][1] > duration:
        raise ValueError(f'Final English captions differ: {sid}')
    return rendered, cues, {'rate': SPEECH_RATE, 'sentencePauseSeconds': gap, 'sourceAudioSha256': sha256(audio)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=ROOT / '.demo-output/local-demo-english-capture-20260912')
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.demo-output/local-demo-english-20260912')
    parser.add_argument('--preview', action='append')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--audio-only', action='store_true')
    parser.add_argument('--reuse-audio', action='store_true')
    parser.add_argument('--tts-python', type=Path, default=ROOT / '.demo-output/submission-en-20260831/.venv/bin/python')
    args = parser.parse_args()
    source, output = args.source_dir.resolve(), args.output_dir.resolve()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = [pool.submit(speech.audio_for, {'id': s['id'], 'ja': {'narration': s['narration']}}, output, args.tts_python.absolute(), TEXT['voice'], args.reuse_audio, motion.baseline) for s in TEXT['scenes']]
        for result in pending:
            result.result()
    if args.audio_only:
        return
    original = json.loads((ROOT / '.demo-output/local-demo-wallet-uc-20260911/edit-manifest.json').read_text())
    original_story = json.loads((HERE / 'local-demo-story.json').read_text())
    focus = json.loads((HERE / 'local-demo-focus.json').read_text())
    for cue, interval in zip(focus['scenes']['operations'], [(.3, 2.05), (3.7, 6.1), (9, 10.5), (13, 17.6), (17.8, 21.5)]):
        cue['start'], cue['end'] = interval
    if not args.preview:
        capture = motion.baseline.validate_capture(source, original_story['scenes'])
        localization = capture.get('filmingTextLocalization', {})
        if capture['language'] != 'en' or localization.get('dictionarySha256') != sha256(HERE / 'local-demo-ui-en.json') or localization.get('scriptSha256') != sha256(HERE / 'localize-demo-recording.js'):
            raise ValueError('English recording must match current filming text')
    work = output / ('previews' if args.preview else 'segments')
    work.mkdir(parents=True, exist_ok=True)
    english = {s['id']: s for s in TEXT['scenes']}
    records, joined, cameras, layouts, offset = [], [], {}, {}, 0
    for index, old in enumerate(original['scenes']):
        sid = old['id']
        if args.preview and sid not in args.preview:
            continue
        scene = copy.deepcopy(english[sid])
        audio_seconds = media.duration(output / 'narration' / f'{sid}.mp3') / SPEECH_RATE
        duration = max(audio_seconds + .85, old['duration'] if sid in motion.GUI else 0)
        raw = source / 'raw' / f'{sid}.mp4'
        if sid in motion.GUI:
            duration = max(duration, media.duration(raw))
        duration = math.ceil(duration * 30) / 30
        scene.update({'start': offset, 'duration': duration, 'voice': TEXT['voice'], 'simulated': True, 'placeholder': False})
        if sid in motion.GUI:
            raw_duration = media.duration(raw)
            scene.update({'source': str(raw.relative_to(ROOT)), 'sourceSha256': sha256(raw), 'sourceDuration': raw_duration, 'playbackRate': 1, 'freezeSeconds': duration - raw_duration})
        audio, captions, audio_edit = spoken_scene(scene, output, duration, work)
        scene.update({'audioSha256': audio_edit['sourceAudioSha256'], 'speechEdit': audio_edit})
        c = EnglishCanvas(duration, sid, old['duration'])
        section = 0 if index < 2 else 1 if index < 11 else 2 if index < 14 else 3
        c.header(index + 1, section, motion.TITLES[sid])
        keys = motion.gui_scene(c, sid, focus['scenes'][sid], duration) if sid in motion.GUI else None
        if keys is None:
            motion.authored_scene(c, sid, old['duration'])
        else:
            for frame in range(round(duration * 30)):
                x, y, w, h = motion.at_camera(keys, frame / 30)
                if min(x, y) < -.01 or x + w > 1920.01 or y + h > 1080.01:
                    raise ValueError(f'Camera leaves captured image: {sid}')
        ass = work / f'{sid}.ass'
        # Reserve the footer at the real duration; vector event scaling is finished.
        c.time_scale = 1
        c.write(ass, captions)
        motion.render_scene(scene, c, ass, keys, source, work, args.resume)
        muxed = work / f'{sid}-with-audio.mp4'
        run(['ffmpeg', '-v', 'error', '-y', '-i', work / f'{sid}.mp4', '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1', '-t', duration, '-movflags', '+faststart', muxed])
        cameras[sid], layouts[sid] = keys, c.layout_checks
        records.append(scene)
        joined.extend((s + offset, e + offset, t) for s, e, t in captions)
        offset += duration
    (work / 'layout-checks.json').write_text(json.dumps(layouts, indent=2) + '\n')
    if args.preview:
        return
    # Concatenate the silent video and PCM speech separately to avoid one AAC priming gap per scene.
    listing = work / 'concat.txt'
    listing.write_text(''.join(f"file '{s['id']}.mp4'\n" for s in records))
    audio_listing = work / 'audio-concat.txt'
    audio_listing.write_text(''.join(f"file '{s['id']}.wav'\n" for s in records))
    destination = output / 'bacchiri-local-demo-en.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listing, '-f', 'concat', '-safe', '0', '-i', audio_listing,
         '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart', destination])
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', destination, '-f', 'null', '-'])
    info = media.probe(destination)
    v = next(s for s in info['streams'] if s['codec_type'] == 'video')
    if (v['width'], v['height'], v['r_frame_rate']) != (1920, 1080, '30/1') or abs(media.duration(destination) - offset) > .04:
        raise ValueError('Unexpected English movie format or duration')
    for folder in ['raw', 'frames']:
        shutil.copytree(source / folder, output / folder, dirs_exist_ok=True)
    shutil.copy2(source / 'capture-evidence.json', output / 'capture-evidence.json')
    shutil.copy2(CONTENT, output / 'story.json')
    media.write_captions(output / 'bacchiri-local-demo-en.srt', joined)
    (output / 'narration.md').write_text('# Bacchiri — English demo narration\n\n' + '\n\n'.join(f"## {s['id']} ({s['start']:.2f}s)\n\n{s['narration']}" for s in records) + '\n')
    manifest = {'edition': TEXT['edition'], 'language': 'en', 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'network': 'LOCAL SIMULATION',
        'captureSha256': sha256(output / 'capture-evidence.json'), 'sourceStorySha256': sha256(CONTENT), 'realProofGenerated': False, 'chainTransactionSubmitted': False,
        'video': destination.name, 'videoSha256': sha256(destination), 'seconds': media.duration(destination), 'scenes': records,
        'pronunciation': {'file': str(speech.DICTIONARY.relative_to(ROOT)), 'sha256': sha256(speech.DICTIONARY), 'names': speech.PRONUNCIATIONS, 'rendererSha256': sha256(HERE / 'local-demo-speech.py')},
        'presentation': {'rendererSha256': sha256(Path(__file__)), 'baseRendererSha256': sha256(HERE / 'build-local-demo-presentation.py'), 'cameraKeys': cameras,
            'focusPlanSha256': sha256(HERE / 'local-demo-focus.json'), 'focusCues': focus['scenes'],
            'cameraStops': sum(len(v) for v in motion.CAMERAS.values()), 'framing': 'Continuous English GUI capture at original speed, reframed with smooth camera movements.',
            'diagramDisclosure': 'Authored explanatory diagrams; no additional execution evidence.'},
        'validation': {'fullDecode': True, 'captionTextMatchesNarration': True, 'placeholderCount': 0, 'cameraBoundsValidated': True, 'englishGraphicTextValidated': True}}
    (output / 'edit-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'completed': str(destination), 'seconds': manifest['seconds']}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        if error.stderr:
            print(error.stderr.decode() if isinstance(error.stderr, bytes) else error.stderr)
        raise

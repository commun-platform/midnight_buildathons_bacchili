#!/usr/bin/env python3
"""Render the explicitly simulated local GUI edition from recorded browser clips."""
import argparse
import concurrent.futures
import datetime
import importlib.util
import json
import math
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('local_demo_media_helpers', Path(__file__).with_name('local-demo-media.py'))
media = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media)


def run(command, **kwargs):
    subprocess.run([str(item) for item in command], check=True, **kwargs)


def balanced_japanese_lines(text, width=36):
    """Keep captions readable without stranding a final syllable on its own line."""
    lines = []
    remaining = text.strip()
    while len(remaining) > width:
        line_count = math.ceil(len(remaining) / width)
        target = math.ceil(len(remaining) / line_count)
        options = range(max(1, target - 5), min(width, target + 5) + 1)
        def cost(index):
            punctuation_bonus = 3 if remaining[index - 1] in '、。！？' else 0
            starts_with_punctuation = 20 if remaining[index:index + 1] in '、。！？）」』】' else 0
            return abs(index - target) - punctuation_bonus + starts_with_punctuation
        split = min(options, key=cost)
        lines.append(remaining[:split])
        remaining = remaining[split:]
    if remaining:
        lines.append(remaining)
    return lines


def audio_for(scene, output, python, voice, reuse):
    folder = output / 'narration'
    folder.mkdir(parents=True, exist_ok=True)
    base = folder / scene['id']
    audio, srt, text, cache = [base.with_suffix(suffix) for suffix in ('.mp3', '.srt', '.txt', '.json')]
    narration = scene['ja']['narration']
    expected = {'text': narration, 'voice': voice, 'rate': '+0%'}
    cached = all(p.is_file() for p in [audio, srt, text, cache]) and json.loads(cache.read_text()) == expected and text.read_text().strip() == narration
    if reuse and not cached:
        raise ValueError(f'Matching audio missing: {scene["id"]}')
    if not cached:
        text.write_text(narration + '\n')
        for attempt in range(3):
            try:
                run([python, '-m', 'edge_tts', '--file', text, '--voice', voice, '--rate=+0%', '--write-media', audio, '--write-subtitles', srt], stdout=subprocess.DEVNULL)
                break
            except subprocess.CalledProcessError:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)
        cache.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n')
    length = media.duration(audio)
    cues = media.read_captions(srt)
    normalize = lambda value: re.sub(r'\s+', '', value)
    if normalize(''.join(cue[2] for cue in cues)) != normalize(narration):
        raise ValueError(f'Caption text differs from narration: {scene["id"]}')
    adjusted = []
    for index, (start, end, words) in enumerate(cues):
        end = min(end, cues[index + 1][0]) if index + 1 < len(cues) else end
        if not 0 <= start < end <= length + 0.3:
            raise ValueError(f'Invalid caption timing: {scene["id"]}')
        lines = balanced_japanese_lines(words)
        groups = ['\n'.join(lines[offset:offset + 2]) for offset in range(0, len(lines), 2)]
        chars = sum(len(group) for group in groups)
        pos = start
        for group_index, group in enumerate(groups):
            until = end if group_index == len(groups) - 1 else pos + (end - start) * len(group) / chars
            adjusted.append((pos, until, group))
            pos = until
    print(json.dumps({'audio': scene['id'], 'seconds': length, 'cached': cached}), flush=True)
    return {'audio': audio, 'cues': adjusted, 'duration': length}


def validate_capture(output, scenes):
    evidence = json.loads((output / 'capture-evidence.json').read_text())
    if not evidence.get('completedAt') or evidence.get('failure') or evidence.get('validateOnly') is not False:
        raise ValueError('A completed current GUI capture is required.')
    if not evidence.get('checks') or any(item.get('passed') is not True for item in evidence['checks']):
        raise ValueError('All browser acceptance checks must pass.')
    for field in ['blockedRequests', 'pageErrors', 'consoleErrors']:
        if evidence.get(field) != []:
            raise ValueError(f'Capture must have no {field}.')
    if evidence.get('server', {}).get('backend') is not False or evidence.get('server', {}).get('wallet') is not False:
        raise ValueError('Capture must use the isolated static demo server.')
    recorded = {item['name']: item for item in evidence['scenes']}
    for scene in scenes:
        if scene['kind'] != 'gui':
            continue
        source = recorded.get(scene['id'])
        if not source:
            raise ValueError(f'Missing reviewed capture: {scene["id"]}')
        clip = (output / source['file']).resolve()
        expected = output / 'raw' / f'{scene["id"]}.mp4'
        if clip != expected or media.sha256(clip) != source['sha256']:
            raise ValueError(f'Capture source hash/path mismatch: {scene["id"]}')
        still = output / source['screenshot']
        if not still.is_file():
            raise ValueError(f'Actual screenshot missing: {scene["id"]}')
        if source.get('capturedFrames', 0) <= 0 or source.get('screenshotSha256') != media.sha256(still):
            raise ValueError(f'Capture screenshot hash/frames mismatch: {scene["id"]}')
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.demo-output/local-demo-20260911')
    parser.add_argument('--story', type=Path, default=ROOT / 'tools/submission-media/local-demo-story.json')
    parser.add_argument('--tts-python', type=Path, default=ROOT / '.demo-output/submission-en-20260831/.venv/bin/python')
    parser.add_argument('--reuse-audio', action='store_true')
    parser.add_argument('--audio-only', action='store_true')
    args = parser.parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    story = json.loads(args.story.read_text())
    scenes = story['scenes']
    voice = story.get('locales', {}).get('ja', {}).get('voice', 'ja-JP-NanamiNeural')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {scene['id']: pool.submit(audio_for, scene, output, args.tts_python, voice, args.reuse_audio) for scene in scenes}
        audio = {key: value.result() for key, value in pending.items()}
    if args.audio_only:
        return
    validate_capture(output, scenes)
    slides = output / 'slides'
    deck_evidence = json.loads((slides / 'deck-manifest.json').read_text())
    if deck_evidence.get('draft') is not False or deck_evidence.get('simulation') is not True or deck_evidence.get('renderWarnings'):
        raise ValueError('The completed, reviewed local-demo deck is required; draft layouts are not final footage.')
    if deck_evidence.get('capture', {}).get('sha256') != media.sha256(output / 'capture-evidence.json'):
        raise ValueError('Deck refers to an older capture. Rebuild the deck from the current recorded GUI.')
    if deck_evidence.get('sourceStorySha256') != media.sha256(args.story):
        raise ValueError('Deck and narration stories differ. Rebuild the deck with the same story.')
    slide_records = json.loads((slides / 'slides.json').read_text())
    if isinstance(slide_records, dict):
        slide_records = slide_records['slides']
    by_id = {item['id']: item for item in slide_records}
    if len(by_id) != len(slide_records) or any(by_id.get(scene['id'], {}).get('kind') != scene['kind'] for scene in scenes):
        raise ValueError('Deck scenes do not match the narrative order and kinds.')
    work = output / 'segments'
    work.mkdir(exist_ok=True)
    joined_cues, records, offset = [], [], 0.0
    encode = ['-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart']
    for scene in scenes:
        sid = scene['id']
        slide = by_id[sid]
        spoken = audio[sid]
        clip = output / 'raw' / f'{sid}.mp4' if scene['kind'] == 'gui' else None
        if clip is not None and not clip.is_file():
            raise FileNotFoundError(f'Actual GUI recording required: {clip}')
        source_length = media.duration(clip) if clip else 0
        length = math.ceil(max(spoken['duration'] + 0.8, source_length) * 30) / 30
        ass = work / f'{sid}.ass'
        media.write_ass(ass, spoken['cues'], 'Noto Sans CJK JP')
        # Dedicated caption area at the bottom, below the GUI footage.
        ass.write_text(ass.read_text().replace(',96,96,20,1', ',96,96,30,1'))
        visual_file = slides / slide.get('videoImage', slide['image'])
        command = ['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', visual_file]
        filters = '[0:v]setsar=1[base];'
        audio_index = 1
        if clip:
            command += ['-i', clip]
            box = slide.get('videoGuiBox', {'x': 80, 'y': 188, 'w': 1760, 'h': 770})
            filters += (f'[1:v]setpts=PTS-STARTPTS,fps=30,scale={box["w"]}:{box["h"]}:force_original_aspect_ratio=decrease:flags=lanczos,'
                        f'pad={box["w"]}:{box["h"]}:(ow-iw)/2:(oh-ih)/2:color=0x06111f,setsar=1,'
                        f'tpad=stop_mode=clone:stop_duration={length}[clip];'
                        f'[base][clip]overlay={box["x"]}:{box["y"]}:shortest=1[visual];')
            audio_index = 2
        else:
            filters += '[base]null[visual];'
        command += ['-i', spoken['audio']]
        filters += (f'[visual]ass={ass.name},fade=t=in:st=0:d=0.2,fade=t=out:st={length - 0.2}:d=0.2[v];'
                    f'[{audio_index}:a]loudnorm=I=-17:TP=-1.5:LRA=8,aresample=48000,apad,atrim=duration={length},asetpts=PTS-STARTPTS[a]')
        destination = work / f'{sid}.mp4'
        run([*command, '-filter_complex', filters, '-map', '[v]', '-map', '[a]', '-t', length, *encode, destination], cwd=work)
        record = {'id': sid, 'start': offset, 'duration': length, 'narration': scene['ja']['narration'], 'voice': voice, 'audioSha256': media.sha256(spoken['audio']), 'simulated': True, 'placeholder': False}
        if clip:
            record.update({'source': str(clip.relative_to(ROOT)), 'sourceSha256': media.sha256(clip), 'sourceDuration': source_length, 'playbackRate': 1, 'freezeSeconds': max(0, length - source_length)})
        records.append(record)
        joined_cues.extend((start + offset, end + offset, words) for start, end, words in spoken['cues'])
        offset += length
        print(json.dumps({'rendered': sid, 'seconds': length}), flush=True)
    concat = work / 'concat.txt'
    concat.write_text(''.join(f"file '{record['id']}.mp4'\n" for record in records))
    destination = output / 'bacchiri-local-demo-ja.mp4'
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', destination])
    media.write_captions(output / 'bacchiri-local-demo-ja.srt', joined_cues)
    # Decode the complete video and audio, and check synchronization against the edit.
    run(['ffmpeg', '-v', 'error', '-i', destination, '-f', 'null', '-'])
    actual = media.duration(destination)
    if abs(actual - offset) > 0.25:
        raise ValueError(f'Export duration {actual} differs from timeline {offset}')
    manifest = {'edition': story['edition'], 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'network': 'LOCAL SIMULATION', 'captureSha256': media.sha256(output / 'capture-evidence.json'), 'sourceStorySha256': media.sha256(args.story), 'realProofGenerated': False, 'chainTransactionSubmitted': False, 'video': destination.name, 'seconds': actual, 'videoSha256': media.sha256(destination), 'scenes': records, 'validation': {'fullDecode': True, 'captionTextMatchesNarration': True, 'placeholderCount': 0, 'width': 1920, 'height': 1080, 'fps': 30}}
    (output / 'edit-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (output / 'narration.md').write_text('# Wallet連携ユースケースのデモ台本\n\n撮影用シミュレーション。Walletによる認証・承認を含む、実際のユースケースを説明します。\n\n' + '\n\n'.join(f"## {record['id']} ({record['start']:.1f}s)\n\n{record['narration']}" for record in records) + '\n')
    print(json.dumps({'completed': str(destination), 'seconds': actual, 'sha256': manifest['videoSha256']}), flush=True)


if __name__ == '__main__':
    main()

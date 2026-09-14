#!/usr/bin/env python3
"""Add narration-timed spotlights to the reviewed Wallet use-case movie."""
import argparse
import copy
import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
COLORS = {'cyan': '4DE0E7', 'purple': 'B895FF', 'green': '87E4B1', 'orange': 'FFB066'}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    return subprocess.run([str(arg) for arg in args], check=True, capture_output=True)


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', path]).stdout)


def project_rect(rect, space):
    """The 1920×1080 browser viewport fits the existing 1920×814 GUI box."""
    x, y, w, h = rect
    if space == 'viewport':
        scale = 814 / 1080
        return [(1920 - 1920 * scale) / 2 + x * scale, 132 + y * scale, w * scale, h * scale]
    if space != 'canvas':
        raise ValueError(f'Unknown coordinate space: {space}')
    return [x, y, w, h]


def validate_plan(plan, edit):
    scenes = {s['id']: s for s in edit['scenes']}
    if set(plan['scenes']) != set(scenes):
        raise ValueError('Every narrative scene must have its own focus cues')
    result = []
    for sid, scene in scenes.items():
        cues = plan['scenes'][sid]
        if not cues:
            raise ValueError(f'Missing focus cues: {sid}')
        previous_end = 0
        for index, cue in enumerate(cues):
            start, end = cue['start'], cue['end']
            if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in [start, end]):
                raise ValueError(f'Non-finite focus timing: {sid}')
            if not 0 <= previous_end <= start < end <= scene['duration'] or end - start < .45:
                raise ValueError(f'Focus timing overlaps or leaves its scene: {sid}')
            previous_end = end
            rect = cue['rect']
            if len(rect) != 4 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in rect):
                raise ValueError(f'Invalid focus rectangle: {sid}')
            x, y, w, h = project_rect(rect, cue.get('space', 'canvas'))
            if not (0 <= x < x + w <= 1920 and 194 <= y < y + h <= 946):
                raise ValueError(f'Focus rectangle leaves the content area: {sid}')
            label = cue['label']
            if not label or len(label) > 24 or any(c in label for c in '{}\\\n\r'):
                raise ValueError(f'Invalid focus label: {sid}')
            if cue.get('color', 'cyan') not in COLORS:
                raise ValueError(f'Unknown focus color: {sid}')
            if not cue.get('phrase') or cue['phrase'] not in scene['narration']:
                raise ValueError(f'Focus phrase is absent from narration: {sid}')
            result.append({**cue, 'scene': sid, 'number': index + 1, 'count': len(cues),
                'start': scene['start'] + start, 'end': scene['start'] + end,
                'sceneStart': start, 'sceneEnd': end, 'canvasRect': [round(v, 2) for v in [x, y, w, h]]})
    return result


def ass_time(seconds):
    ticks = round(seconds * 100)
    hours, rest = divmod(ticks, 360000)
    minutes, rest = divmod(rest, 6000)
    sec, cs = divmod(rest, 100)
    return f'{hours}:{minutes:02}:{sec:02}.{cs:02}'


def ass_color(rgb):
    return '&H' + rgb[4:6] + rgb[2:4] + rgb[0:2] + '&'


def shape(x, y, w, h):
    return f'm {x} {y} l {x+w} {y} {x+w} {y+h} {x} {y+h} l {x} {y}'


def write_annotations(path, cues, offset=0):
    lines = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080',
        'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '', '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        'Style: Focus,Noto Sans CJK JP,26,&H00FFFFFF,&H00FFFFFF,&H001F1307,&H001F1307,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
        '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
    for cue in cues:
        start, end = cue['start'] - offset, cue['end'] - offset
        x, y, w, h = [round(v) for v in cue['canvasRect']]
        color = ass_color(COLORS[cue.get('color', 'cyan')])
        total_ms = round((end - start) * 1000)
        def event(layer, tags, text):
            lines.append(f'Dialogue: {layer},{ass_time(start)},{ass_time(end)},Focus,,0,0,0,,{{{tags}}}{text}')
        vector = r'\an7\pos(0,0)\p1\shad0'
        # Mask only the content, preserving titles, subtitles, and the filming banner.
        event(1, vector + rf'\bord0\1c&H100904&\1a&H78&\iclip({x-7},{y-7},{x+w+7},{y+h+7})\fad(200,160)', shape(0, 201, 1920, 745))
        # Gentle glow, then a frame that reveals downwards rather than flashes.
        event(2, vector + rf'\1a&HFF&\3c{color}\3a&HB0&\bord10\blur5\fad(200,160)', shape(x, y, w, h))
        event(3, vector + rf'\1a&HFF&\3c{color}\3a&H00&\bord4\blur0\clip({x-5},{y-5},{x+w+5},{y+2})\t(0,320,\clip({x-5},{y-5},{x+w+5},{y+h+5}))\fad(100,160)', shape(x, y, w, h))
        # A small marker at the leading corner makes the target easy to acquire.
        event(4, vector + rf'\bord0\1c{color}\fad(160,160)', shape(x-4, y-4, min(72, w), 8))
        # Fixed header location avoids covering the target, UI controls, or subtitles.
        event(5, vector + r'\bord0\1c&H352210&\1a&H00&\fad(160,160)', shape(1260, 10, 600, 39))
        label = f'{cue["number"]:02} / {cue["count"]:02}   {cue["label"]}'
        event(6, rf'\an7\pos(1276,12)\fs25\b1\1c{color}\fad(160,160)', label)
        event(6, vector + rf'\bord0\1c{color}\clip(1260,47,1260,50)\t(0,{total_ms},\clip(1260,47,1860,50))\fad(100,160)', shape(1260, 47, 600, 3))
    path.write_text('\n'.join(lines) + '\n')


def audio_hash(path):
    return hashlib.sha256(run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0', '-c:a', 'copy', '-f', 'adts', '-']).stdout).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=ROOT / '.demo-output/local-demo-wallet-uc-20260911')
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.demo-output/local-demo-focus-20260912')
    parser.add_argument('--plan', type=Path, default=Path(__file__).with_name('local-demo-focus.json'))
    parser.add_argument('--preview', action='append', help='Render only this scene as a short review MP4; repeatable')
    args = parser.parse_args()
    source, output = args.source_dir.resolve(), args.output_dir.resolve()
    if source == output:
        raise ValueError('Preserve the reviewed source; use a separate output directory')
    plan = json.loads(args.plan.read_text())
    source_edit_path = source / 'edit-manifest.json'
    edit = json.loads(source_edit_path.read_text())
    video = source / edit['video']
    if sha256(video) != plan['sourceVideoSha256'] or sha256(source_edit_path) != plan['sourceEditSha256']:
        raise ValueError('The focus timing belongs to a different source movie')
    if edit['videoSha256'] != sha256(video) or edit['validation'].get('fullDecode') is not True:
        raise ValueError('A completed, validated baseline movie is required')
    cues = validate_plan(plan, edit)
    output.mkdir(parents=True, exist_ok=True)
    annotations = output / 'focus.ass'
    write_annotations(annotations, cues)
    encode = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart']
    if args.preview:
        folder = output / 'previews'
        folder.mkdir(exist_ok=True)
        for sid in args.preview:
            scene = next(s for s in edit['scenes'] if s['id'] == sid)
            script = folder / f'{sid}.ass'
            write_annotations(script, [c for c in cues if c['scene'] == sid], scene['start'])
            run(['ffmpeg', '-v', 'error', '-y', '-ss', scene['start'], '-i', video, '-t', scene['duration'],
                 '-vf', f'ass={script}', '-map', '0:v:0', '-map', '0:a:0', *encode, folder / f'{sid}.mp4'])
            print(json.dumps({'preview': sid, 'cues': len([c for c in cues if c['scene'] == sid])}), flush=True)
        return
    destination = output / 'bacchiri-local-demo-ja.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', f'ass={annotations}',
         '-map', '0:v:0', '-map', '0:a:0', *encode, destination])
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', destination, '-f', 'null', '-'])
    metadata = probe(destination)
    actual = float(metadata['format']['duration'])
    if abs(actual - edit['seconds']) > 1 / 30:
        raise ValueError('Focused movie has changed the narration timeline')
    stream = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    if (stream['width'], stream['height'], stream['r_frame_rate']) != (1920, 1080, '30/1'):
        raise ValueError('Focused movie must retain the 1080p/30fps canvas')
    source_audio = audio_hash(video)
    if audio_hash(destination) != source_audio:
        raise ValueError('Focused movie audio differs from the approved source')
    for directory in ['frames', 'raw', 'narration']:
        shutil.copytree(source / directory, output / directory, dirs_exist_ok=True)
    for file in ['capture-evidence.json', 'bacchiri-local-demo-ja.srt', 'narration.md', 'story.json', 'media-validation.json']:
        shutil.copy2(source / file, output / file)
    shutil.copy2(args.plan, output / 'focus-plan.json')
    shutil.copy2(source_edit_path, output / 'baseline-edit-manifest.json')
    manifest = copy.deepcopy(edit)
    manifest.update({'edition': plan['edition'], 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'video': destination.name, 'videoSha256': sha256(destination), 'seconds': actual,
        'focus': {'sourceVideo': str(video.relative_to(ROOT)), 'sourceVideoSha256': sha256(video),
            'sourceEditSha256': sha256(source_edit_path), 'planSha256': sha256(args.plan), 'annotationsSha256': sha256(annotations),
            'audioStreamSha256': source_audio, 'cueCount': len(cues), 'scenesAnnotated': len(plan['scenes']), 'cues': cues}})
    manifest['validation'].update({'fullDecode': True, 'audioStreamUnchanged': True, 'focusCuesValidated': True})
    (output / 'edit-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (output / 'focus-cues.json').write_text(json.dumps(cues, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'completed': str(destination), 'seconds': actual, 'cues': len(cues), 'audioUnchanged': True}), flush=True)


if __name__ == '__main__':
    main()

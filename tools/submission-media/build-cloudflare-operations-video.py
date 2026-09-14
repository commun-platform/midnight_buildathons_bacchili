"""Render narrated imagegen scenes and insert them into an existing demo video.

Requires FFmpeg/FFprobe; voice generation additionally requires edge-tts.
The original recording and generated diagrams are never modified.
"""
import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import subprocess
import textwrap

ROOT = Path(__file__).resolve().parents[2]
CONTENT = json.loads((Path(__file__).with_name('cloudflare-operations-content.json')).read_text())


def relative_path(file):
    return os.path.relpath(file, ROOT)


def run(args, cwd=ROOT):
    subprocess.run([str(value) for value in args], cwd=cwd, check=True)


def probe(file):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
        '-of', 'json', str(file),
    ]))


def duration(file):
    return float(probe(file)['format']['duration'])


def timestamp(value):
    total = round(value * 1000)
    hours, rest = divmod(total, 3600000)
    minutes, rest = divmod(rest, 60000)
    seconds, milliseconds = divmod(rest, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'


def seconds(value):
    h, m, s, ms = map(int, re.split('[:,]', value))
    return h * 3600 + m * 60 + s + ms / 1000


def read_captions(file):
    pattern = r'\d+\s*\n(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})\s*\n(.+?)(?=\n\s*\n|\Z)'
    return [(seconds(start), seconds(end), html.unescape(text.strip()))
            for start, end, text in re.findall(pattern, file.read_text(), re.S)]


def write_captions(file, cues):
    file.write_text('\n\n'.join(
        f'{index}\n{timestamp(start)} --> {timestamp(end)}\n{text}'
        for index, (start, end, text) in enumerate(cues, 1)
    ) + '\n', encoding='utf-8')


def caption_lines(text, locale):
    if locale == 'en':
        return textwrap.fill(text, 76)
    return '\n'.join(text[index:index + 36] for index in range(0, len(text), 36))


def write_ass(file, cues, font):
    # Set the actual 1080p canvas; SRT defaults otherwise magnify the font.
    def ass_time(value):
        centiseconds = round(value * 100)
        hours, rest = divmod(centiseconds, 360000)
        minutes, rest = divmod(rest, 6000)
        whole_seconds, fraction = divmod(rest, 100)
        return f'{hours}:{minutes:02}:{whole_seconds:02}.{fraction:02}'
    header = (
        '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n'
        '[V4+ Styles]\n'
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
        f'Style: Default,{font},40,&H00FFFFFF,&H00FFFFFF,&H001F1106,&H001F1106,0,0,0,0,100,100,0,0,3,1,0,2,96,96,20,1\n'
        '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    )
    lines = []
    for start, end, text in cues:
        escaped = text.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}').replace('\n', '\\N')
        lines.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{escaped}')
    file.write_text(header + '\n'.join(lines) + '\n')


def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('locale', choices=['en', 'ja'])
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.demo-output/cloudflare-operations-20260910')
    parser.add_argument('--tts-python', type=Path, default=ROOT / '.demo-output/submission-en-20260831/.venv/bin/python')
    parser.add_argument('--reuse-audio', action='store_true')
    parser.add_argument('--source-video', type=Path)
    parser.add_argument('--insert-at', type=float)
    args = parser.parse_args()
    locale = args.locale
    spec = CONTENT[locale]
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    narration = output / 'narration'
    narration.mkdir(exist_ok=True)
    work = output / f'render-{locale}'
    work.mkdir(exist_ok=True)
    source = args.source_video.resolve() if args.source_video else ROOT / spec['sourceVideo']
    if not source.is_file():
        raise FileNotFoundError('Supply the existing recording with --source-video')
    source_digest = sha256(source)
    original_duration = duration(source)
    insertion = args.insert_at if args.insert_at is not None else spec['insertAtSeconds']
    if insertion is None:
        # Existing Japanese recording ends with the eighth, claim-boundary segment.
        final_scene = source.parent / 'segments/08.mp4'
        if not final_scene.is_file():
            raise FileNotFoundError('Supply --insert-at when the original final segment is unavailable')
        insertion = round((original_duration - duration(final_scene)) * 30) / 30
    if not 0 < insertion < original_duration:
        raise ValueError('Insertion time must be inside the source recording')
    current_label = work / 'current-label.txt'
    historical_label = work / 'historical-label.txt'
    current_label.write_text(spec['currentLabel'])
    historical_label.write_text(spec['historicalLabel'])
    encode = ['-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
              '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
              '-ar', '48000', '-ac', '1', '-movflags', '+faststart']
    scene_records = []
    joined_cues = []
    offset = 0.0
    for index, scene in enumerate(spec['scenes'], 1):
        stem = f'{scene["id"]}-{locale}'
        text_file = narration / f'{stem}.txt'
        audio = narration / f'{stem}.mp3'
        captions = narration / f'{stem}.srt'
        if args.reuse_audio:
            if text_file.read_text().strip() != scene['narration'] or not audio.is_file() or not captions.is_file():
                raise ValueError('Reusable narration must match the current script and include captions')
        else:
            text_file.write_text(scene['narration'] + '\n')
            run([args.tts_python, '-m', 'edge_tts', '--file', text_file, '--voice', spec['voice'],
                 '--write-media', audio, '--write-subtitles', captions])
        scene_duration = math.ceil((duration(audio) + 0.8) * 30) / 30
        cues = read_captions(captions)
        normalize = lambda value: re.sub(r'\s+', '', value)
        if normalize(''.join(cue[2] for cue in cues)) != normalize(scene['narration']):
            raise ValueError(f'Captions differ from narration: {stem}')
        adjusted = []
        for cue_index, (start, end, text) in enumerate(cues):
            # Some TTS sentence timestamps overlap by 50ms; make display intervals disjoint.
            end = min(end, cues[cue_index + 1][0]) if cue_index + 1 < len(cues) else end
            if not 0 <= start < end <= scene_duration:
                raise ValueError(f'Invalid caption timing: {stem}')
            adjusted.append((start, end, caption_lines(text, locale)))
        local_captions = work / f'scene-{index}.srt'
        write_captions(local_captions, adjusted)
        joined_cues.extend((start + offset, end + offset, text) for start, end, text in adjusted)
        video = work / f'scene-{index}.mp4'
        font = 'Noto Sans CJK JP' if locale == 'ja' else 'DejaVu Sans'
        write_ass(work / f'scene-{index}.ass', adjusted, font)
        filters = (
            '[0:v]scale=1920:900:force_original_aspect_ratio=decrease:flags=lanczos,'
            'pad=1920:1080:(ow-iw)/2:32:color=0x06111f,setsar=1,'
            f'drawtext=textfile=current-label.txt:font=\'{font}\':fontcolor=0xaab7c8:fontsize=18:x=(w-tw)/2:y=5,'
            f'ass=scene-{index}.ass,'
            f'fade=t=in:st=0:d=0.2,fade=t=out:st={scene_duration - 0.2}:d=0.2[v];'
            '[1:a]loudnorm=I=-17:TP=-1.5:LRA=8,apad=pad_dur=0.8[a]'
        )
        run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', ROOT / scene['image'],
             '-i', audio, '-filter_complex', filters, '-map', '[v]', '-map', '[a]',
             '-t', f'{scene_duration:.6f}', *encode, video], cwd=work)
        measured = duration(video)
        scene_records.append({'id': scene['id'], 'video': relative_path(video), 'duration': measured,
                              'startInExtendedVideo': insertion + offset, 'voice': spec['voice']})
        # Video frames determine concatenation timing; AAC may have a small trailing packet.
        offset += scene_duration
        print(json.dumps({'rendered': stem, 'seconds': scene_duration}), flush=True)
    standalone_captions = output / f'cloudflare-operations-{locale}.srt'
    write_captions(standalone_captions, joined_cues)

    # Re-encode only to make the historical footage labeling and cuts explicit.
    font = 'Noto Sans CJK JP' if locale == 'ja' else 'DejaVu Sans'
    historical_filter = f"fps=30,scale=1920:1080,setsar=1,drawtext=textfile=historical-label.txt:font='{font}':fontcolor=white:fontsize=18:x=24:y=10:box=1:boxcolor=0x06111f@0.85:boxborderw=5"
    for name, start, length in [('before', 0, insertion), ('after', insertion, original_duration - insertion)]:
        run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{start:.6f}', '-i', source, '-t', f'{length:.6f}',
             '-vf', historical_filter, *encode, work / f'{name}.mp4'], cwd=work)

    # All media has common video/audio parameters. Concat filter uses exact decoded timestamps.
    def concatenate(files, destination):
        command = ['ffmpeg', '-y', '-v', 'error']
        for file in files:
            command += ['-i', file]
        inputs = ''.join(f'[{i}:v:0][{i}:a:0]' for i in range(len(files)))
        command += ['-filter_complex', f'{inputs}concat=n={len(files)}:v=1:a=1[v][a]',
                    '-map', '[v]', '-map', '[a]', *encode, destination]
        run(command, cwd=work)

    scene_files = [work / f'scene-{i}.mp4' for i in range(1, len(spec['scenes']) + 1)]
    standalone = output / f'cloudflare-operations-{locale}.mp4'
    extended = output / f'bacchiri-demo-pitch-{locale}-cloudflare-operations.mp4'
    concatenate(scene_files, standalone)
    concatenate([work / 'before.mp4', *scene_files, work / 'after.mp4'], extended)
    if sha256(source) != source_digest:
        raise ValueError('Original recording changed')
    for file in [standalone, extended]:
        metadata = probe(file)
        codecs = [stream['codec_name'] for stream in metadata['streams']]
        if codecs != ['h264', 'aac']:
            raise ValueError(f'Unexpected output streams: {codecs}')
        # Full decoding detects truncated packets, missing frames, and audio corruption.
        run(['ffmpeg', '-v', 'error', '-i', file, '-f', 'null', '-'])
        file.with_suffix('.mp4.sha256').write_text(f'{sha256(file)}  {file.name}\n')
    manifest = {'locale': locale, 'sourceVideo': relative_path(source), 'sourceSha256': source_digest,
                'originalPreserved': True, 'insertionSeconds': insertion, 'scenes': scene_records,
                'standalone': {'path': relative_path(standalone), **probe(standalone)},
                'extended': {'path': relative_path(extended), **probe(extended)},
                'captionValidation': 'Exact narration text; non-overlapping speech boundary intervals',
                'audioDisclosure': 'New scenes use synthetic narration; original recorded narration is retained.'}
    (output / f'media-manifest-{locale}.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(manifest, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
